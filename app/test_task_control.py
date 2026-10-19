import asyncio
import io
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi import UploadFile
from openpyxl import load_workbook
from PIL import Image

from app import main
from app.task_control import TaskControl
from app.xhs_notes import NoteMetadata


class TaskControlTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.control = TaskControl()
        self.reasons = []
        self.persisted = []

    async def asyncTearDown(self):
        await self.control.shutdown()

    def submit(self, run_id, owner, execute):
        self.control.submit(run_id, owner, lambda: self.persisted.append(run_id), execute,
                            lambda reason: self.reasons.append((run_id, reason)))

    async def settle(self, condition):
        for _ in range(100):
            if condition():
                return
            await asyncio.sleep(0)
        self.fail("任务未按预期完成")

    async def test_global_and_user_limits_reject_without_persisting(self):
        event = asyncio.Event()
        self.submit("a", "one", event.wait)
        self.submit("b", "one", event.wait)
        with self.assertRaises(HTTPException) as error:
            self.submit("rejected-user", "one", event.wait)
        self.assertEqual(error.exception.status_code, 429)
        self.submit("c", "two", event.wait)
        self.submit("d", "two", event.wait)
        with self.assertRaises(HTTPException):
            self.submit("rejected-global", "three", event.wait)
        self.assertEqual(self.persisted, ["a", "b", "c", "d"])

    async def test_only_one_executor_runs_and_capacity_recovers(self):
        first = asyncio.Event()
        started = []
        async def execute_a():
            started.append("a")
            await first.wait()
        async def execute_b():
            started.append("b")
        self.submit("a", "one", execute_a)
        self.submit("b", "two", execute_b)
        await self.settle(lambda: started == ["a"])
        self.assertEqual(started, ["a"])
        first.set()
        await self.settle(lambda: not self.control.tasks)
        self.assertEqual(started, ["a", "b"])
        self.assertEqual(self.control.owners, {})

    async def test_running_and_queued_cancellation_release_capacity(self):
        event = asyncio.Event()
        self.submit("running", "one", event.wait)
        await self.settle(self.control.run_lock.locked)
        self.submit("queued", "two", event.wait)
        await self.control.cancel("queued")
        await self.control.cancel("running")
        await self.settle(lambda: not self.control.tasks)
        self.assertFalse(self.control.run_lock.locked())
        self.assertEqual(len(self.reasons), 2)
        self.assertTrue(all("取消" in reason for _, reason in self.reasons))

    async def test_execution_and_queue_timeouts(self):
        self.control.timeout = 0.01
        self.control.queue_timeout = 0.005
        event = asyncio.Event()
        self.submit("running", "one", event.wait)
        await self.settle(self.control.run_lock.locked)
        self.submit("queued", "two", event.wait)
        await asyncio.gather(*list(self.control.tasks.values()))
        await self.settle(lambda: not self.control.tasks)
        self.assertIn(("running", "任务执行超时"), self.reasons)
        self.assertIn(("queued", "排队等待超时，请重新提交"), self.reasons)
        self.assertFalse(self.control.run_lock.locked())

    async def test_rate_limit_and_expiration(self):
        now = [100.0]
        self.control.clock = lambda: now[0]
        async def done():
            pass
        for number in range(3):
            self.submit(str(number), "one", done)
            await self.settle(lambda: not self.control.tasks)
        with self.assertRaises(HTTPException):
            self.submit("rejected", "one", done)
        now[0] += 61
        self.submit("accepted", "one", done)
        await self.settle(lambda: not self.control.tasks)
        self.assertNotIn("rejected", self.persisted)

    async def test_exception_and_shutdown_finalize_and_release(self):
        async def broken():
            raise RuntimeError("sensitive details")
        self.submit("broken", "one", broken)
        await self.settle(lambda: not self.control.tasks)
        self.assertEqual(self.reasons, [("broken", "任务执行异常，请联系管理员")])
        self.submit("queued", "two", asyncio.Event().wait)
        await self.control.shutdown()
        await self.settle(lambda: not self.control.tasks)
        self.assertIn(("queued", "服务停止，任务已中断"), self.reasons)
        with self.assertRaises(HTTPException):
            self.submit("late", "three", broken)


class WorkbenchResourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_both_submission_routes_reject_full_queue_without_writes(self):
        control = TaskControl(capacity=1)
        gate = asyncio.Event()
        control.submit("existing", "other", lambda: None, gate.wait, lambda reason: None)
        try:
            with TemporaryDirectory() as directory, patch.object(main, "RUNS", Path(directory)), \
                    patch.object(main, "task_control", control), patch.object(main, "assert_local"), \
                    patch.object(main, "check_disk_space"), \
                    patch.object(main.auth, "require_tool", return_value={"id": "one", "team_id": "team"}):
                with self.assertRaises(HTTPException) as json_error:
                    await main.create_run(main.RunInput(tool="notes", params={"mode": "validate", "items": [
                        {"id": "note", "url": "https://www.xiaohongshu.com/explore/test"}]}), None)
                self.assertEqual(json_error.exception.status_code, 429)
                upload = UploadFile(filename="notes.xlsx", file=io.BytesIO(b"not parsed"))
                with self.assertRaises(HTTPException) as upload_error:
                    await main.create_notes_run(None, upload, "Sheet", "validate", None)
                self.assertEqual(upload_error.exception.status_code, 429)
                self.assertEqual(list(Path(directory).iterdir()), [])
                await upload.close()
        finally:
            await control.shutdown()

    async def test_disk_guard_does_not_write_or_schedule(self):
        with patch.object(main.shutil, "disk_usage", return_value=SimpleNamespace(free=0)), \
                patch.object(main, "save_run") as save:
            with self.assertRaises(HTTPException) as error:
                main.submit_run({"id": "a" * 32, "ownerUserId": "one"})
            self.assertEqual(error.exception.status_code, 503)
            save.assert_not_called()

    async def test_other_users_cannot_cancel_tasks(self):
        with patch.object(main, "assert_local"), patch.object(main, "read_run", return_value={"ownerUserId": "one"}), \
                patch.object(main.auth, "user_from_request", return_value={"id": "two", "role": "member"}), \
                patch.object(main.auth, "server_mode", return_value=True), \
                patch.object(main.task_control, "cancel", new=AsyncMock()) as cancel:
            with self.assertRaises(HTTPException) as error:
                await main.cancel_run("a" * 32, None)
            self.assertEqual(error.exception.status_code, 404)
            cancel.assert_not_called()

    async def test_notes_export_keeps_original_and_embeds_small_preview(self):
        stream = io.BytesIO()
        Image.new("RGB", (1200, 800), "blue").save(stream, format="PNG")
        original = stream.getvalue()
        metadata = NoteMetadata("Title", "Author", "Content", ("https://example.invalid/cover.png",))
        run_id = "a" * 32
        run = {"id": run_id, "tool": "notes", "params": {"mode": "all", "items": [
            {"id": "note", "url": "https://www.xiaohongshu.com/explore/test"}]},
            "rows": [], "failures": [], "processed": 0}
        with TemporaryDirectory() as directory, patch.object(main, "RUNS", Path(directory)), \
                patch.object(main, "check_disk_space"), \
                patch.object(main, "fetch_note_http", return_value=metadata), \
                patch.object(main, "download_image", return_value=(original, ".png")), \
                patch.object(main, "VisibleBrowserFallback") as browser:
            await main.execute_notes(run)
            self.assertEqual(run["status"], "complete", run.get("failures"))
            browser.assert_not_called()
            self.assertEqual(next((Path(directory) / run_id / "封面").iterdir()).read_bytes(), original)
            workbook = load_workbook(run["outputFile"])
            self.assertEqual(len(workbook.active._images), 1)
            self.assertLessEqual(workbook.active._images[0].width, 600)
            workbook.close()

    async def test_cover_budget_failure_is_not_reported_as_success(self):
        run_id = "b" * 32
        run = {"id": run_id, "tool": "notes", "params": {"mode": "all", "items": [
            {"id": "note", "url": "https://www.xiaohongshu.com/explore/test"}]},
            "rows": [], "failures": [], "processed": 0}
        metadata = NoteMetadata("Title", "Author", "Content", ("https://example.invalid/cover.png",))
        with TemporaryDirectory() as directory, patch.object(main, "RUNS", Path(directory)), \
                patch.object(main, "check_disk_space"), patch.object(main, "MAX_OUTPUT_BYTES", 1), \
                patch.object(main, "fetch_note_http", return_value=metadata), \
                patch.object(main, "download_image", return_value=(b"too-large", ".png")):
            await main.execute_notes(run)
            self.assertEqual(run.get("coverCount"), 0, run.get("failures"))
            self.assertEqual(run["status"], "partial")
            self.assertIn("总量超过限制", run["failures"][0]["error"])
