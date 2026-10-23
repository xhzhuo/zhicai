"""Tool permission request workflow; isolated PostgreSQL only."""
import os
import unittest
from fastapi.testclient import TestClient
from app import auth, main

PASSWORD = "Request-test-password-2026!"


class ToolAccessRequestTests(unittest.TestCase):
    def setUp(self):
        if os.environ.get("ZHICAI_DB_NAME") != "zhicai_test" or os.environ.get("ZHICAI_TEST_ISOLATED") != "1":
            self.skipTest("Isolated database required")
        with auth.db() as db:
            if db.execute("SELECT current_database() AS db").fetchone()["db"] != "zhicai_test":
                raise RuntimeError("Refusing production database")
            db.execute("DROP SCHEMA public CASCADE")
            db.execute("CREATE SCHEMA public")
        auth.initialize()
        auth.create_initial_admin("admin@example.com", PASSWORD)
        with auth.db() as db:
            db.execute("INSERT INTO teams(id,name) VALUES ('team','Test team')")
            db.execute("""INSERT INTO users(id,email,password_hash,team_id,role,status)
                VALUES ('member','member@example.com',%s,'team','member','active')""",
                (auth.PASSWORDS.hash(PASSWORD),))
        self.admin = TestClient(main.app,base_url="https://127.0.0.1:8765",client=("127.0.0.1",50000))
        self.member = TestClient(main.app,base_url="https://127.0.0.1:8765",client=("127.0.0.1",50001))
        self.admin.__enter__();self.member.__enter__()
        self.addCleanup(self.admin.__exit__,None,None,None)
        self.addCleanup(self.member.__exit__,None,None,None)
        a=self.admin.post("/api/auth/login",json={"email":"admin@example.com","password":PASSWORD})
        m=self.member.post("/api/auth/login",json={"email":"member@example.com","password":PASSWORD})
        self.assertEqual(a.status_code,200,a.text);self.assertEqual(m.status_code,200,m.text)
        self.ah={"X-CSRF-Token":a.json()["csrfToken"]}
        self.mh={"X-CSRF-Token":m.json()["csrfToken"]}

    def submit(self,kind="tool_access",tool="keywords",**extra):
        return self.member.post("/api/requirements",headers=self.mh,data={
            "kind":kind,"title":"申请使用关键词推荐工具","tool_id":tool,**extra})

    def decision(self,identifier,approve,headers=None):
        return self.admin.post("/api/requirements/"+identifier+"/permission-decision",
            headers=self.ah if headers is None else headers,json={"approve":approve})

    def test_approve_creates_grant_and_tracks_status(self):
        submitted=self.submit(platform="baidu",service="untrusted")
        self.assertEqual(submitted.status_code,200,submitted.text)
        identifier=submitted.json()["id"]
        record=self.member.get("/api/requirements/"+identifier).json()
        self.assertEqual(record["platform"],"xhs")
        self.assertEqual(record["service"],"聚光")
        self.assertEqual(record["expected_result"],"")
        self.assertEqual(record["usage_frequency"],"")
        self.assertEqual(self.member.post("/api/requirements/"+identifier+"/permission-decision",
            headers=self.mh,json={"approve":True}).status_code,403)
        self.assertEqual(self.decision(identifier,True,{}).status_code,403)
        approved=self.decision(identifier,True)
        self.assertEqual(approved.status_code,200,approved.text)
        self.assertEqual(approved.json()["status"],"done")
        self.assertIn("recommend",self.member.get("/api/auth/me").json()["tools"])
        self.assertEqual(self.decision(identifier,True).status_code,409)
        self.assertEqual(self.submit().status_code,409)
        with auth.db() as db:
            self.assertEqual(db.execute("SELECT count(*) AS n FROM tool_permissions WHERE user_id='member' AND tool_id='recommend'").fetchone()["n"],1)
            self.assertIsNotNone(db.execute("SELECT 1 FROM audit_events WHERE action='approve_tool_access'").fetchone())
        self.assertEqual(len(self.member.get("/api/requirements/"+identifier).json()["events"]),2)

    def test_reject_does_not_grant_and_can_reapply(self):
        result=self.submit();self.assertEqual(result.status_code,200,result.text)
        identifier=result.json()["id"]
        self.assertEqual(self.submit().status_code,409)
        rejected=self.decision(identifier,False)
        self.assertEqual(rejected.status_code,200,rejected.text)
        self.assertNotIn("recommend",self.member.get("/api/auth/me").json()["tools"])
        self.assertEqual(self.submit().status_code,200)

    def test_disabled_and_nonexistent_tools_are_rejected(self):
        self.assertEqual(self.submit(tool="plaza").status_code,422)
        self.assertEqual(self.submit(tool="baidu").status_code,422)
        self.assertEqual(self.submit(tool="invalid").status_code,422)
        self.assertEqual(self.admin.post("/api/requirements",headers=self.ah,data={
            "kind":"tool_access","title":"admin","tool_id":"keywords"}).status_code,403)

    def test_approval_rechecks_member_and_tool_availability(self):
        from unittest.mock import patch
        member_request=self.submit(tool="notes")
        self.assertEqual(member_request.status_code,200,member_request.text)
        identifier=member_request.json()["id"]
        with auth.db() as db:
            db.execute("UPDATE users SET status='disabled' WHERE id='member'")
        self.assertEqual(self.decision(identifier,True).status_code,409)
        with auth.db() as db:
            db.execute("UPDATE users SET status='active' WHERE id='member'")
        with patch.object(main,"DISABLED_TOOLS",{"notes","plaza"}):
            self.assertEqual(self.decision(identifier,True).status_code,422)
        self.assertEqual(self.admin.get("/api/requirements/"+identifier).json()["status"],"submitted")
        self.assertNotIn("notes",self.member.get("/api/auth/me").json()["tools"])

    def test_other_request_types_derive_source_and_ignore_removed_fields(self):
        for kind,payload in (
            ("enhancement",{"contact":"member@example.com","description":"缺少字段","expected_result":"增加字段"}),
            ("problem",{"contact":"member@example.com","description":"运行后显示失败"})):
            with self.subTest(kind=kind):
                created=self.submit(kind=kind,tool="industry",platform="baidu",service="fake",
                    usage_frequency="每天",**payload)
                self.assertEqual(created.status_code,200,created.text)
                record=self.member.get("/api/requirements/"+created.json()["id"]).json()
                self.assertEqual(record["platform"],"xhs")
                self.assertEqual(record["service"],"灵犀")
                self.assertEqual(record["usage_frequency"],"")
                if kind=="problem":self.assertEqual(record["expected_result"],"")
