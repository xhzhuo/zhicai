"""Bounded admission and cooperative execution for the single-process workbench."""
from __future__ import annotations

import asyncio
from collections import deque
import time

from fastapi import HTTPException


class TaskControl:
    def __init__(self, *, capacity=4, per_user=2, submissions=3,
                 timeout=900, queue_timeout=1800, clock=time.monotonic):
        self.capacity = capacity
        self.per_user = per_user
        self.submissions = submissions
        self.timeout = timeout
        self.queue_timeout = queue_timeout
        self.clock = clock
        if min(capacity, per_user, submissions, timeout, queue_timeout) <= 0:
            raise ValueError("任务限制必须大于零")
        self.tasks = {}
        self.owners = {}
        self.recent = {}
        self.run_lock = asyncio.Lock()
        self.stopping = False

    def check(self, owner):
        if self.stopping:
            raise HTTPException(503, "服务正在停止，请稍后提交")
        if len(self.tasks) >= self.capacity:
            raise HTTPException(429, "任务队列已满，请等待已有任务完成", headers={"Retry-After": "30"})
        if sum(value == owner for value in self.owners.values()) >= self.per_user:
            raise HTTPException(429, "你已有运行或排队任务，请完成或取消后再提交", headers={"Retry-After": "30"})
        cutoff = self.clock() - 60
        self.recent = {key: deque(stamp for stamp in values if stamp > cutoff)
                       for key, values in self.recent.items() if values and values[-1] > cutoff}
        if len(self.recent.get(owner, ())) >= self.submissions:
            raise HTTPException(429, f"提交过于频繁，每分钟最多提交 {self.submissions} 个任务", headers={"Retry-After": "60"})

    def submit(self, run_id, owner, persist, execute, finish):
        # Called synchronously on the one application event loop: no admission gap.
        self.check(owner)
        loop = asyncio.get_running_loop()
        persist()
        self.owners[run_id] = owner
        self.recent.setdefault(owner, deque()).append(self.clock())
        finished = False

        def finish_once(reason):
            nonlocal finished
            if not finished:
                finished = True
                finish(reason)

        async def run():
            acquired = False
            try:
                async with asyncio.timeout(self.queue_timeout):
                    await self.run_lock.acquire()
                acquired = True
                async with asyncio.timeout(self.timeout):
                    await execute()
            except TimeoutError:
                finish_once("任务执行超时" if acquired else "排队等待超时，请重新提交")
            except asyncio.CancelledError:
                finish_once("服务停止，任务已中断" if self.stopping else "任务已取消")
                raise
            except Exception:
                finish_once("任务执行异常，请联系管理员")
            finally:
                if acquired:
                    self.run_lock.release()

        task = loop.create_task(run())
        self.tasks[run_id] = task

        def completed(done):
            try:
                # Includes cancellation before the coroutine has started.
                if done.cancelled():
                    finish_once("服务停止，任务已中断" if self.stopping else "任务已取消")
                else:
                    done.result()
            finally:
                self.tasks.pop(run_id, None)
                self.owners.pop(run_id, None)
        task.add_done_callback(completed)

    async def cancel(self, run_id):
        task = self.tasks.get(run_id)
        if task is None:
            return False
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        return True

    async def shutdown(self):
        self.stopping = True
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
