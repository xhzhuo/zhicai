"""Integration checks against a dedicated PostgreSQL test database only."""
from __future__ import annotations

import os
import unittest

from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app import auth, main, requirements


PASSWORD = "A-long-test-password-2026!"


class MultiuserFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not auth.server_mode() or os.environ.get("ZHICAI_DB_NAME") != "zhicai_test":
            raise unittest.SkipTest("只允许使用隔离的 zhicai_test 数据库")
        with auth.db() as conn:
            actual = conn.execute("SELECT current_database() AS name").fetchone()["name"]
            if actual != "zhicai_test":
                raise RuntimeError("拒绝清理非测试数据库")
            conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
            conn.execute("CREATE SCHEMA public")
        if not requirements.DB_PATH.resolve().is_relative_to(main.DATA.resolve()) or \
                not requirements.DB_PATH.name.startswith("test-"):
            raise RuntimeError("拒绝清理非测试需求数据库")
        for suffix in ("", "-wal", "-shm"):
            requirements.DB_PATH.with_name(requirements.DB_PATH.name + suffix).unlink(missing_ok=True)

    def client(self):
        return TestClient(main.app, base_url="https://127.0.0.1:8765",
                          client=("127.0.0.1", 50000))

    def test_registration_teams_owner_and_requirement_isolation(self):
        with self.client() as admin, self.client() as first, self.client() as colleague, self.client() as outsider:
            response = admin.get("/")
            self.assertEqual(response.status_code, 200)
            self.assertIn("register-form", response.text)
            self.assertEqual(admin.get("/api/accounts").status_code, 401)
            created = admin.post("/api/auth/register", json={"email": "admin@perform.net", "password": PASSWORD})
            self.assertEqual(created.status_code, 200, created.text)
            logged = admin.post("/api/auth/login", json={"email": "admin@perform.net", "password": PASSWORD})
            self.assertEqual(logged.status_code, 200, logged.text)
            csrf = logged.json()["csrfToken"]
            self.assertIn("/static/multiuser.js", admin.get("/").text)
            self.assertEqual(admin.get("/static/multiuser.js").status_code, 200)
            self.assertEqual(first.get("/static/multiuser.js").status_code, 401)
            self.assertEqual(admin.post("/api/admin/teams", json={"name": "未授权"}).status_code, 403)
            team = admin.post("/api/admin/teams", headers={"X-CSRF-Token": csrf},
                              json={"name": "数据团队"})
            self.assertEqual(team.status_code, 200, team.text)
            team_id = team.json()["id"]
            other = admin.post("/api/admin/teams", headers={"X-CSRF-Token": csrf},
                               json={"name": "其他团队"}).json()["id"]

            for email, requested in (("one@perform.net", team_id), ("two@perform.net", team_id),
                                     ("three@perform.net", other)):
                result = first.post("/api/auth/register", json={"email": email, "password": PASSWORD,
                                                                  "teamId": requested})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(first.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code, 403)
            users = {item["email"]: item for item in admin.get("/api/admin/users").json()}
            for email, requested in (("one@perform.net", team_id), ("two@perform.net", team_id),
                                     ("three@perform.net", other)):
                approved = admin.patch(f"/api/admin/users/{users[email]['id']}",
                                       headers={"X-CSRF-Token": csrf},
                                       json={"status": "active", "teamId": requested,
                                             "tools": ["recommend"]})
                self.assertEqual(approved.status_code, 200, approved.text)

            first_csrf = first.post("/api/auth/login", json={"email": "one@perform.net",
                                                               "password": PASSWORD}).json()["csrfToken"]
            second_csrf = colleague.post("/api/auth/login", json={"email": "two@perform.net",
                                                                      "password": PASSWORD}).json()["csrfToken"]
            outsider_csrf = outsider.post("/api/auth/login", json={"email": "three@perform.net",
                                                                        "password": PASSWORD}).json()["csrfToken"]
            account = first.post("/api/accounts", headers={"X-CSRF-Token": first_csrf},
                                 json={"service": "jug", "alias": "团队聚光"})
            self.assertEqual(account.status_code, 200, account.text)
            account_id = account.json()["id"]
            self.assertEqual(account.json()["teamId"], team_id)
            self.assertEqual([x["id"] for x in colleague.get("/api/accounts").json()], [account_id])
            self.assertEqual(outsider.get("/api/accounts").json(), [])
            self.assertEqual(colleague.patch(f"/api/accounts/{account_id}",
                                             headers={"X-CSRF-Token": second_csrf},
                                             json={"alias": "越权修改"}).status_code, 403)
            self.assertEqual(colleague.post(f"/api/accounts/{account_id}/cookie/reveal",
                                            headers={"X-CSRF-Token": second_csrf}, json={}).status_code, 403)
            self.assertEqual(colleague.delete(f"/api/accounts/{account_id}",
                                               headers={"X-CSRF-Token": second_csrf}).status_code, 403)
            changed = first.patch(f"/api/accounts/{account_id}", headers={"X-CSRF-Token": first_csrf},
                                  json={"alias": "团队聚光更新"})
            self.assertEqual(changed.status_code, 200, changed.text)
            admin_changed = admin.patch(f"/api/accounts/{account_id}", headers={"X-CSRF-Token": csrf},
                                        json={"alias": "管理员更新"})
            self.assertEqual(admin_changed.status_code, 200, admin_changed.text)
            revealed = admin.post(f"/api/accounts/{account_id}/cookie/reveal",
                                  headers={"X-CSRF-Token": csrf}, json={})
            self.assertEqual(revealed.status_code, 200, revealed.text)
            with patch.object(main, "execute", new=AsyncMock()):
                admin_run = admin.post("/api/runs", headers={"X-CSRF-Token": csrf},
                                       json={"tool": "recommend", "accountId": account_id,
                                             "params": {"roots": "测试"}})
            self.assertEqual(admin_run.status_code, 200, admin_run.text)
            main.jobs.pop(admin_run.json()["id"], None)
            self.assertEqual(first.post("/api/runs", headers={"X-CSRF-Token": first_csrf},
                                        json={"tool": "combined", "accountId": account_id,
                                              "params": {}}).status_code, 403)
            self.assertEqual(outsider.post(f"/api/accounts/{account_id}/cookie/reveal",
                                           headers={"X-CSRF-Token": outsider_csrf}, json={}).status_code, 403)
            self.assertEqual(outsider.post("/api/runs", headers={"X-CSRF-Token": outsider_csrf},
                                           json={"tool": "recommend", "accountId": account_id,
                                                 "params": {"roots": "测试"}}).status_code, 403)

            demand = first.post("/api/requirements", headers={"X-CSRF-Token": first_csrf}, data={
                "kind": "enhancement", "title": "增加字段", "contact": "one@perform.net",
                "description": "现有导出缺少字段", "expected_result": "增加字段后导出",
                "tool_id": "keywords"})
            self.assertEqual(demand.status_code, 200, demand.text)
            self.assertEqual(first.get("/api/requirements").status_code, 403)
            self.assertEqual(colleague.get("/api/requirements").status_code, 403)
            self.assertEqual(first.get(f"/api/requirements/{demand.json()['id']}").status_code, 403)
            self.assertEqual(len(admin.get("/api/requirements").json()), 1)
            self.assertEqual(admin.post("/api/requirements", headers={"X-CSRF-Token": csrf}, data={
                "kind": "enhancement", "title": "管理员提交", "contact": "admin@perform.net",
                "description": "测试角色隔离", "expected_result": "不应保存", "tool_id": "keywords"
            }).status_code, 403)
            self.assertEqual(first.post(f"/api/requirements/{demand.json()['id']}/comments",
                                        headers={"X-CSRF-Token": first_csrf},
                                        json={"content": "普通用户不得处理"}).status_code, 403)

            removed = admin.delete(f"/api/accounts/{account_id}", headers={"X-CSRF-Token": csrf})
            self.assertEqual(removed.status_code, 200, removed.text)
            self.assertEqual(colleague.get("/api/accounts").json(), [])
            updated_password = colleague.post("/api/auth/change-password",
                                             headers={"X-CSRF-Token": second_csrf},
                                             json={"currentPassword": PASSWORD,
                                                   "newPassword": "Another-long-password-2026!"})
            self.assertEqual(updated_password.status_code, 200, updated_password.text)
            self.assertEqual(colleague.get("/api/meta").status_code, 401)
            self.assertEqual(colleague.post("/api/auth/login", json={"email": "two@perform.net",
                                                                        "password": "Another-long-password-2026!"}).status_code, 200)
