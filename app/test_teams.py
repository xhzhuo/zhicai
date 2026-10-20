"""Team administration integration checks; isolated PostgreSQL only."""
import os
import unittest
from fastapi.testclient import TestClient
from app import auth, main

PASSWORD = "Team-tests-only-password-2026!"


class TeamManagementTests(unittest.TestCase):
    def setUp(self):
        if os.environ.get("ZHICAI_DB_NAME") != "zhicai_test" or os.environ.get("ZHICAI_TEST_ISOLATED") != "1":
            self.skipTest("Requires isolated zhicai_test database")
        with auth.db() as db:
            if db.execute("SELECT current_database() AS name").fetchone()["name"] != "zhicai_test":
                raise RuntimeError("Refusing non-test database")
            db.execute("DROP SCHEMA public CASCADE")
            db.execute("CREATE SCHEMA public")
        auth.initialize()
        auth.create_initial_admin("team-admin@example.com", PASSWORD)
        self.client = TestClient(main.app, base_url="https://127.0.0.1:8765", client=("127.0.0.1", 50000))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        logged = self.client.post("/api/auth/login", json={"email": "team-admin@example.com", "password": PASSWORD})
        self.assertEqual(logged.status_code, 200, logged.text)
        self.headers = {"X-CSRF-Token": logged.json()["csrfToken"]}
        with auth.db() as db:
            self.admin_id = db.execute("SELECT id FROM users WHERE role='admin'").fetchone()["id"]

    def team(self, name="Team"):
        response = self.client.post("/api/admin/teams", headers=self.headers, json={"name": name})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["id"]

    def patch(self, team_id, payload):
        return self.client.patch("/api/admin/teams/"+team_id, headers=self.headers, json=payload)

    def delete(self, team_id):
        return self.client.delete("/api/admin/teams/"+team_id, headers=self.headers)

    def test_rename_keeps_identity_and_linked_data(self):
        team = self.team()
        with auth.db() as db:
            db.execute("INSERT INTO platform_accounts(id,team_id,owner_user_id,data) VALUES ('account',%s,%s,'{}')", (team, self.admin_id))
        result = self.patch(team, {"name": " Renamed "})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["id"], team)
        self.assertEqual(result.json()["name"], "Renamed")
        listed = next(t for t in self.client.get("/api/admin/teams").json() if t["id"] == team)
        self.assertEqual(listed["account_count"], 1)
        self.assertFalse(listed["deletable"])
        with auth.db() as db:
            self.assertEqual(db.execute("SELECT team_id FROM platform_accounts").fetchone()["team_id"], team)

    def test_name_validation_and_duplicates(self):
        team = self.team("Alpha")
        other = self.team("Beta")
        self.assertEqual(self.patch(other, {"name": " alpha "}).status_code, 409)
        self.assertEqual(self.client.post("/api/admin/teams", headers=self.headers, json={"name": "ALPHA"}).status_code, 409)
        for payload in ({"name": "   "}, {"name": "x"*61}, {"name": None}, {"selectable": None}, {}):
            self.assertEqual(self.patch(team, payload).status_code, 422, payload)
        self.assertEqual(self.patch("missing", {"name": "Missing"}).status_code, 404)

    def test_disable_blocks_joining_but_preserves_existing_members(self):
        team = self.team()
        with auth.db() as db:
            db.execute("""INSERT INTO users(id,email,password_hash,team_id,role,status)
                VALUES ('member','member@example.com',%s,%s,'member','active')""", (auth.PASSWORDS.hash(PASSWORD), team))
            db.execute("""INSERT INTO users(id,email,password_hash,requested_team_id,role,status)
                VALUES ('pending','pending@example.com',%s,%s,'member','pending')""", (auth.PASSWORDS.hash(PASSWORD), team))
        self.assertEqual(self.patch(team, {"selectable": False}).status_code, 200)
        self.assertNotIn(team, [t["id"] for t in self.client.get("/api/auth/teams").json()])
        signup = self.client.post("/api/auth/register", json={"email":"new@example.com","password":PASSWORD,"teamId":team})
        self.assertEqual(signup.status_code, 422)
        approve = self.client.patch("/api/admin/users/pending", headers=self.headers, json={"status":"active"})
        self.assertEqual(approve.status_code, 422)
        update = self.client.patch("/api/admin/users/member", headers=self.headers, json={"tools":["recommend"]})
        self.assertEqual(update.status_code, 200, update.text)
        with TestClient(main.app, base_url="https://127.0.0.1:8765", client=("127.0.0.1",50001)) as member:
            logged = member.post("/api/auth/login", json={"email":"member@example.com","password":PASSWORD})
            self.assertEqual(logged.status_code, 200, logged.text)
        self.assertEqual(self.patch(team, {"selectable": True}).status_code, 200)
        self.assertIn(team, [t["id"] for t in self.client.get("/api/auth/teams").json()])

    def test_empty_delete_and_audit(self):
        team = self.team()
        self.assertEqual(self.delete(team).status_code, 200)
        self.assertNotIn(team, [t["id"] for t in self.client.get("/api/admin/teams").json()])
        self.assertEqual(self.delete(team).status_code, 404)
        with auth.db() as db:
            self.assertIsNotNone(db.execute("SELECT 1 FROM audit_events WHERE object_id=%s AND action='delete'", (team,)).fetchone())

    def test_delete_rejects_all_references_including_soft_deleted(self):
        for kind in ("member", "pending", "rejected", "account", "deleted_account", "industry"):
            with self.subTest(kind=kind):
                team = self.team(kind)
                with auth.db() as db:
                    if kind in ("member", "pending", "rejected"):
                        db.execute("""INSERT INTO users(id,email,password_hash,team_id,requested_team_id,role,status)
                            VALUES (%s,%s,'unused',%s,%s,'member',%s)""",
                            (kind,kind+"@example.com",team if kind=="member" else None,team,"active" if kind=="member" else kind))
                    elif "account" in kind:
                        db.execute("""INSERT INTO platform_accounts(id,team_id,owner_user_id,data,deleted_at)
                            VALUES (%s,%s,%s,'{}',CASE WHEN %s THEN now() ELSE NULL END)""",
                            (kind,team,self.admin_id,kind=="deleted_account"))
                    else:
                        db.execute("INSERT INTO industry_presets(id,team_id,owner_user_id,name,code) VALUES ('preset',%s,%s,'Industry','12345678')",(team,self.admin_id))
                self.assertEqual(self.delete(team).status_code, 409)
                listed = next(t for t in self.client.get("/api/admin/teams").json() if t["id"] == team)
                self.assertFalse(listed["deletable"])

    def test_system_team_and_csrf_protection(self):
        self.assertEqual(self.patch("bootstrap", {"name":"Changed"}).status_code, 409)
        self.assertEqual(self.patch("bootstrap", {"selectable":True}).status_code, 409)
        self.assertEqual(self.delete("bootstrap").status_code, 409)
        team = self.team()
        self.assertEqual(self.client.patch("/api/admin/teams/"+team, json={"name":"Changed"}).status_code, 403)
        self.assertEqual(self.client.delete("/api/admin/teams/"+team).status_code, 403)

    def test_non_admin_cannot_manage_teams(self):
        team = self.team()
        with auth.db() as db:
            db.execute("""INSERT INTO users(id,email,password_hash,team_id,role,status)
                VALUES ('member','member@example.com',%s,%s,'member','active')""",(auth.PASSWORDS.hash(PASSWORD),team))
        with TestClient(main.app, base_url="https://127.0.0.1:8765", client=("127.0.0.1",50001)) as member:
            self.assertEqual(member.get("/api/admin/teams").status_code,401)
            logged = member.post("/api/auth/login", json={"email":"member@example.com","password":PASSWORD})
            headers={"X-CSRF-Token":logged.json()["csrfToken"]}
            self.assertEqual(member.get("/api/admin/teams").status_code,403)
            self.assertEqual(member.post("/api/admin/teams",headers=headers,json={"name":"No"}).status_code,403)
            self.assertEqual(member.patch("/api/admin/teams/"+team,headers=headers,json={"name":"No"}).status_code,403)
            self.assertEqual(member.delete("/api/admin/teams/"+team,headers=headers).status_code,403)
