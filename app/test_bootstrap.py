"""Bootstrap regressions; database checks require an isolated test deployment."""
from concurrent.futures import ThreadPoolExecutor
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import auth, bootstrap_admin, main


PASSWORD = "Bootstrap-test-password-2026!"


class BootstrapCommandTests(unittest.TestCase):
    def test_noninteractive_command_never_connects_to_database(self):
        with patch.dict(os.environ, {"ZHICAI_DEPLOYMENT": "server"}), \
                patch("sys.argv", ["bootstrap_admin", "--email", "admin@example.com"]), \
                patch("sys.stdin.isatty", return_value=False), \
                patch.object(auth, "initialize") as initialize:
            with self.assertRaises(SystemExit) as error:
                bootstrap_admin.main()
            self.assertEqual(error.exception.code, 2)
            initialize.assert_not_called()

    def test_password_mismatch_never_connects_to_database(self):
        with patch.dict(os.environ, {"ZHICAI_DEPLOYMENT": "server"}), \
                patch("sys.argv", ["bootstrap_admin", "--email", "admin@example.com"]), \
                patch("sys.stdin.isatty", return_value=True), \
                patch("getpass.getpass", side_effect=[PASSWORD, "different"]), \
                patch.object(auth, "initialize") as initialize:
            self.assertEqual(bootstrap_admin.main(), 1)
            initialize.assert_not_called()


class BootstrapDatabaseTests(unittest.TestCase):
    def setUp(self):
        if not auth.server_mode() or os.environ.get("ZHICAI_DB_NAME") != "zhicai_test" \
                or os.environ.get("ZHICAI_TEST_ISOLATED") != "1":
            self.skipTest("仅允许在隔离容器、独立数据卷和 zhicai_test 数据库运行")
        with auth.db() as conn:
            actual = conn.execute("SELECT current_database() AS name").fetchone()["name"]
            if actual != "zhicai_test":
                raise RuntimeError("拒绝清理非测试数据库")
            conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
            conn.execute("CREATE SCHEMA public")
        auth.initialize()

    def test_public_registration_never_bootstraps_and_cli_refuses_promotion(self):
        with TestClient(main.app, base_url="https://127.0.0.1:8765",
                        client=("127.0.0.1", 50000)) as client:
            payload = {"email": "admin@perform.net", "password": PASSWORD}
            self.assertEqual(client.post("/api/auth/register", json=payload).status_code, 422)
            with auth.db() as conn:
                conn.execute("INSERT INTO teams(id,name) VALUES ('test-team','Test')")
            response = client.post("/api/auth/register", json={**payload, "teamId": "test-team"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(client.post("/api/auth/login", json=payload).status_code, 403)
            with auth.db() as conn:
                row = conn.execute("SELECT role,status,team_id,requested_team_id FROM users").fetchone()
                self.assertEqual(dict(row), {"role": "member", "status": "pending",
                                            "team_id": None, "requested_team_id": "test-team"})
            with self.assertRaisesRegex(ValueError, "已有账号"):
                auth.create_initial_admin(payload["email"], PASSWORD)
            auth.create_initial_admin("operator@example.com", PASSWORD)
            logged = client.post("/api/auth/login", json={"email": "operator@example.com", "password": PASSWORD})
            self.assertEqual(logged.status_code, 200, logged.text)
            self.assertEqual(logged.json()["role"], "admin")
            with self.assertRaisesRegex(ValueError, "已有管理员"):
                auth.create_initial_admin("second@example.com", PASSWORD)
            with auth.db() as conn:
                self.assertEqual(conn.execute("SELECT count(*) AS n FROM users WHERE role='admin'").fetchone()["n"], 1)
                self.assertEqual(conn.execute("SELECT count(*) AS n FROM audit_events WHERE action='bootstrap_admin'").fetchone()["n"], 1)

    def test_concurrent_initializers_create_only_one_admin(self):
        def create(email):
            try:
                auth.create_initial_admin(email, PASSWORD)
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(create, ["first@example.com", "second@example.com"]))
        self.assertEqual(sum(results), 1)
        with auth.db() as conn:
            conn.execute("UPDATE users SET status='disabled' WHERE role='admin'")
        with self.assertRaisesRegex(ValueError, "已有管理员"):
            auth.create_initial_admin("third@example.com", PASSWORD)
