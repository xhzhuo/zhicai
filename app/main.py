"""Local, real-data workbench for the two supplied Xiaohongshu tools."""
from __future__ import annotations

import asyncio
import csv
from contextvars import ContextVar
import getpass
import io
import json
import os
import re
import secrets
import shutil
import uuid
import time
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, parse_qs
import urllib.request
import urllib.error
from zipfile import ZipFile

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook, load_workbook
from openpyxl.drawing.image import Image as ExcelImage
from PIL import Image as PILImage
from playwright.async_api import Browser, BrowserContext, Page, async_playwright
from pydantic import BaseModel, Field

from .credentials import CredentialStore, CredentialStorageError
from .access import assert_loopback_request
from .requirements import router as requirements_router, init_db as init_requirements_db
from .xhs_notes import NoteMetadata, VisibleBrowserFallback, build_session, download_image, fetch_note_http
from .industry_presets import router as industry_presets_router
from . import auth
from .task_control import TaskControl
from . import platform_collectors
from . import adgroups_api


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RUNS = DATA / "runs"
PROFILES = DATA / "browser-profiles"
ACCOUNTS_FILE = DATA / "accounts.json"
CREDENTIALS = CredentialStore(DATA / "credentials")
for folder in (RUNS, PROFILES):
    folder.mkdir(parents=True, exist_ok=True)

SERVICES = {
    "jug": {"name": "聚光", "url": "https://ad.xiaohongshu.com/"},
    "lingxi": {"name": "灵犀", "url": "https://idea.xiaohongshu.com/"},
}
TOOLS = {
    "adgroups": {"name": "广告组信息导出", "service": "jug", "format": "xlsx"},
    "plaza": {"name": "合作广场笔记采集", "service": "jug", "format": "xlsx"},
    "recommend": {"name": "关键词推荐", "service": "jug", "format": "csv"},
    "combined": {"name": "推荐词每日搜索量", "service": "jug", "format": "csv"},
    "bubble": {"name": "行业气泡图数据", "service": "lingxi", "format": "xlsx"},
    "notes": {"name": "笔记封面与内容", "service": "xhs_notes", "format": "xlsx"},
}
# Temporary availability switch. Keep tool definitions, grants, assets and data.
DISABLED_TOOLS = {"plaza"}


def require_tool_available(tool: str) -> None:
    if tool in DISABLED_TOOLS:
        raise HTTPException(503, "该工具尚未接入，暂不可用")


Y_LABEL = {
    "readNum": "阅读量",
    "readYOYIncreaseRate": "阅读同比增长率",
    "readRGIncreaseRate": "阅读环比增长率",
}
SIZE_LABEL = {"noteNum": "平均有曝光笔记数", "noteIncreaseNum": "新增笔记数"}


class AuthenticationError(RuntimeError):
    """The platform explicitly reported an unauthorized session."""

app = FastAPI(title="智采 · 数据获取工作台", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
app.include_router(requirements_router)
app.include_router(industry_presets_router)
app.include_router(auth.router)
app.include_router(auth.admin_router)


@app.middleware("http")
async def server_session_guard(request: Request, call_next):
    if not auth.server_mode():
        return await call_next(request)
    path = request.url.path
    public = path in {"/", "/api/auth/teams", "/api/auth/register", "/api/auth/login"}
    public = public or path in {"/static/auth.css", "/static/auth.js"}
    user, csrf = auth.session_from_cookie(request.cookies.get(auth.COOKIE_NAME))
    request.state.user, request.state.csrf = user, csrf
    if not public and not user:
        return JSONResponse({"detail": "请先登录"}, status_code=401)
    if path.startswith("/api/") and request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        if path not in {"/api/auth/register", "/api/auth/login"} and not auth.check_csrf(request):
            return JSONResponse({"detail": "页面会话已过期，请刷新后重试"}, status_code=403)
    return await call_next(request)
playwright_instance = None
active_account: ContextVar[str | None] = ContextVar("active_account", default=None)
contexts: dict[str, BrowserContext] = {}
pages: dict[str, Page] = {}
context_headless: dict[str, bool] = {}
browsers: dict[str, Browser] = {}
locks = {key: asyncio.Lock() for key in SERVICES}
notes_lock = asyncio.Lock()
task_control = TaskControl(
    capacity=int(os.environ.get("ZHICAI_MAX_TASKS", "4")),
    per_user=int(os.environ.get("ZHICAI_MAX_USER_TASKS", "2")),
    submissions=int(os.environ.get("ZHICAI_SUBMISSIONS_PER_MINUTE", "3")),
    timeout=int(os.environ.get("ZHICAI_TASK_TIMEOUT_SECONDS", "900")),
    queue_timeout=int(os.environ.get("ZHICAI_QUEUE_TIMEOUT_SECONDS", "1800")),
)
jobs = task_control.tasks
MIN_FREE_BYTES = int(os.environ.get("ZHICAI_MIN_FREE_MB", "1024")) * 1024 * 1024
MAX_OUTPUT_BYTES = int(os.environ.get("ZHICAI_MAX_OUTPUT_MB", "200")) * 1024 * 1024


def check_disk_space() -> None:
    if shutil.disk_usage(DATA).free < MIN_FREE_BYTES:
        raise HTTPException(503, "存储空间不足，暂不接受新任务，请联系管理员")


def finish_interrupted_run(run_id: str, reason: str) -> None:
    run = read_run(run_id)
    if any(failure.get("error") == reason for failure in run.get("failures", [])):
        return
    run["status"] = "partial" if run.get("rows") and run["tool"] != "notes" else "failed"
    run.setdefault("failures", []).append({"item": "任务", "error": reason})
    run["ended"] = now()
    save_run(run)


def submit_run(run: dict[str, Any]) -> None:
    check_disk_space()
    task_control.submit(run["id"], run["ownerUserId"], lambda: save_run(run),
                        lambda: execute(run["id"]),
                        lambda reason: finish_interrupted_run(run["id"], reason))


class RunInput(BaseModel):
    tool: str
    params: dict[str, Any] = Field(default_factory=dict)
    accountId: str = ""


class AdgroupInspectInput(BaseModel):
    model_config = {"extra": "forbid"}
    accountId: str = ""
    start: str = Field(default="", max_length=10)
    end: str = Field(default="", max_length=10)


class AccountInput(BaseModel):
    platform: str = ""
    serviceName: str = ""
    service: str = ""
    alias: str
    pageLink: str = ""


class AccountUpdate(BaseModel):
    pageLink: str | None = None
    alias: str | None = None
    disabled: bool | None = None
    teamId: str | None = None


class CookieImport(BaseModel):
    content: str


def accounts_read() -> list[dict[str, Any]]:
    if auth.server_mode():
        return auth.account_rows()
    if not ACCOUNTS_FILE.exists():
        initial = [
            {"id": "jug", "service": "jug", "alias": "聚光本机连接", "method": "login", "disabled": False, "status": "unverified", "statusReason": None, "cookieConfigured": False, "verifiedAt": None},
            {"id": "lingxi", "service": "lingxi", "alias": "灵犀本机连接", "method": "login", "disabled": False, "status": "unverified", "statusReason": None, "cookieConfigured": False, "verifiedAt": None},
        ]
        accounts_save(initial)
        return initial
    items = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    # Earlier versions labeled every failed verification as expired. Reclassify
    # those unproven states once; only an explicit HTTP 401 earns that label now.
    changed = False
    for account in items:
        if account.get("status") == "expired" and "statusReason" not in account:
            account["status"] = "unverified"
            account["statusReason"] = "legacy_unconfirmed"
            changed = True
        if "cookieConfigured" not in account:
            account["cookieConfigured"] = account.get("method") == "cookie"
            changed = True
    if changed:
        accounts_save(items)
    return items


def accounts_save(items: list[dict[str, Any]]) -> None:
    if auth.server_mode():
        raise RuntimeError("服务器账号必须通过数据库单条写入")
    temp = ACCOUNTS_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(ACCOUNTS_FILE)


def account_get(account_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9-]{1,80}", account_id):
        raise HTTPException(404, "平台账号不存在")
    account = next((a for a in accounts_read() if a["id"] == account_id), None)
    if not account:
        raise HTTPException(404, "平台账号不存在")
    return account


def account_modify(account_id: str, **changes: Any) -> dict[str, Any]:
    if auth.server_mode():
        return auth.update_account(account_id, changes)
    accounts = accounts_read()
    account = next((a for a in accounts if a["id"] == account_id), None)
    if not account:
        raise HTTPException(404, "平台账号不存在")
    account.update(changes)
    accounts_save(accounts)
    return account


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def run_path(run_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise HTTPException(404, "找不到运行记录")
    return RUNS / f"{run_id}.json"


def read_run(run_id: str) -> dict[str, Any]:
    path = run_path(run_id)
    if not path.exists():
        raise HTTPException(404, "找不到运行记录")
    return json.loads(path.read_text(encoding="utf-8"))


def save_run(run: dict[str, Any]) -> None:
    target = run_path(run["id"])
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(target)


def parse_lines(value: Any, label: str, limit: int = 30) -> list[str]:
    if not isinstance(value, str):
        raise ValueError(f"请填写{label}")
    items = list(dict.fromkeys(x.strip() for x in re.split(r"[\n,，]+", value) if x.strip()))
    if not items or len(items) > limit:
        raise ValueError(f"{label}需要填写 1～{limit} 项")
    return items


def validate_params(tool: str, raw: dict[str, Any]) -> dict[str, Any]:
    if tool not in TOOLS:
        raise ValueError("未知工具")
    if tool == "adgroups":
        return adgroups_api.validate_dates(raw)
    if tool == "plaza":
        raise ValueError("合作广场工具请通过筛选文件上传提交")
    if tool == "notes":
        items = raw.get("items")
        if not isinstance(items, list) or not 1 <= len(items) <= 200:
            raise ValueError("文件中需要有 1～200 条有效笔记记录")
        cleaned_items = []
        for item in items:
            if not isinstance(item, dict):
                raise ValueError("文件中的笔记记录格式不正确")
            note_id = str(item.get("id", "")).strip()
            link = str(item.get("url", "")).strip()
            if not note_id or len(note_id) > 200:
                raise ValueError("每条笔记链接都必须有笔记id，且最多 200 字")
            parsed = urlparse(link)
            if parsed.scheme != "https" or parsed.hostname not in {"www.xiaohongshu.com", "xiaohongshu.com", "xhslink.com"}:
                raise ValueError("请填写小红书 https://www.xiaohongshu.com/explore/... 笔记链接")
            cleaned_items.append({"id": note_id, "url": link})
        mode = str(raw.get("mode", "all"))
        if mode not in {"all", "trial", "validate"}:
            raise ValueError("运行方式无效")
        limit = int(raw.get("limit", 3)) if mode == "trial" else None
        if mode == "trial" and not 1 <= limit <= 200:
            raise ValueError("试跑条数需要在 1～200 之间")
        return {"items": cleaned_items, "mode": mode, "limit": limit}
    if tool in ("recommend", "combined"):
        roots = parse_lines(raw.get("roots"), "词根")
        result: dict[str, Any] = {"roots": roots, "onlyContainRoot": True}
        if tool == "combined":
            start, end = date.fromisoformat(str(raw.get("start"))), date.fromisoformat(str(raw.get("end")))
            if start > end:
                raise ValueError("开始日期不能晚于结束日期")
            if (end - start).days > 90:
                raise ValueError("一次最多查询 91 天")
            result.update(start=start.isoformat(), end=end.isoformat())
        return result
    taxonomies = raw.get("taxonomies")
    if not isinstance(taxonomies, list) or not 1 <= len(taxonomies) <= 20:
        raise ValueError("请填写 1～20 个行业")
    cleaned = []
    for item in taxonomies:
        if not isinstance(item, dict) or not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", str(item.get("code", ""))):
            raise ValueError("行业 code 格式不正确")
        name = str(item.get("name", "")).strip()
        if not name or len(name) > 40:
            raise ValueError("行业名称需要填写，最多 40 字")
        cleaned.append({"code": item["code"], "name": name})
    partition = int(raw.get("timePartition", 1))
    if partition not in (1, 2, 4):
        raise ValueError("时间粒度无效")
    start, end = str(raw.get("start", "")), str(raw.get("end", ""))
    if partition == 2:
        if not re.fullmatch(r"\d{4}-\d{2}", start) or not re.fullmatch(r"\d{4}-\d{2}", end):
            raise ValueError("按月查询时请输入 YYYY-MM")
        date.fromisoformat(start + "-01"); date.fromisoformat(end + "-01")
    else:
        date.fromisoformat(start); date.fromisoformat(end)
    if start > end:
        raise ValueError("开始日期不能晚于结束日期")
    y = raw.get("yindexList")
    if not isinstance(y, list) or not y or len(y) > 3 or any(v not in Y_LABEL for v in y):
        raise ValueError("请选择至少一个 Y 轴指标")
    dimension = str(raw.get("dimensionType", "1"))
    xindex = str(raw.get("xindex", "1"))
    size = str(raw.get("sizeIndex", "noteNum"))
    if dimension not in ("1", "2", "3") or xindex not in ("1", "impNum", "readNum") or size not in SIZE_LABEL:
        raise ValueError("分析维度或指标无效")
    regions = parse_lines(raw["regionCodes"], "地域 code", 20) if str(raw.get("regionCodes", "")).strip() else []
    ids = {}
    for key in ("brandIdList", "spuIdList", "seriesIdList"):
        ids[key] = parse_lines(raw[key], key, 30) if str(raw.get(key, "")).strip() else []
    return {"taxonomies": cleaned, "start": start, "end": end, "timePartition": partition,
            "dimensionType": dimension, "xindex": xindex, "yindexList": list(dict.fromkeys(y)),
            "sizeIndex": size, "regionCodes": regions, **ids}


async def close_account_context(account_id: str) -> None:
    pages.pop(account_id, None)
    context = contexts.pop(account_id, None)
    context_headless.pop(account_id, None)
    if context:
        try:
            await context.close()
        except Exception:
            pass
    browser = browsers.pop(account_id, None)
    if browser:
        try:
            await browser.close()
        except Exception:
            pass


async def ensure_page(service: str, show_login: bool = False, headless: bool | None = None,
                      navigate: bool = True) -> Page:
    global playwright_instance
    if service not in SERVICES:
        raise HTTPException(404, "未知平台服务")
    if playwright_instance is None:
        playwright_instance = await async_playwright().start()
    account_id = active_account.get() or service
    use_headless = (account_get(account_id).get("method") == "cookie") if headless is None else headless
    if show_login:
        use_headless = False
    context = contexts.get(account_id)
    if context and context_headless.get(account_id) != use_headless:
        await close_account_context(account_id)
    page = pages.get(account_id)
    if page and not page.is_closed():
        if show_login:
            if not page.url.startswith(SERVICES[service]["url"].rstrip("/")):
                await page.goto(SERVICES[service]["url"], wait_until="domcontentloaded", timeout=30000)
            await page.bring_to_front()
        return page
    context = contexts.get(account_id)
    if context:
        try:
            page = context.pages[0] if context.pages else await context.new_page()
        except Exception:
            await close_account_context(account_id)
            context = None
    if not context:
        if os.environ.get("ZHICAI_DEPLOYMENT", "local") == "server":
            if not use_headless:
                raise RuntimeError("服务器模式只能使用 Cookie 后台连接")
            channel = os.environ.get("ZHICAI_BROWSER_CHANNEL") or None
            browser = await playwright_instance.chromium.launch(headless=True, channel=channel)
            browsers[account_id] = browser
            context = await browser.new_context(accept_downloads=False)
        else:
            context = await playwright_instance.chromium.launch_persistent_context(
                str(PROFILES / account_id), headless=use_headless, channel="msedge", accept_downloads=False
            )
        if use_headless and account_get(account_id).get("method") == "cookie":
            saved_cookie = CREDENTIALS.load(account_id)
            if saved_cookie:
                saved_items, _ = parse_cookie_import(saved_cookie, service)
                await context.add_cookies(saved_items)
        contexts[account_id] = context
        context_headless[account_id] = use_headless
        page = context.pages[0] if context.pages else await context.new_page()
    pages[account_id] = page
    if navigate:
        await page.goto(SERVICES[service]["url"], wait_until="domcontentloaded", timeout=30000)
    return page


async def platform_post(service: str, path: str, body: dict[str, Any], *, direct: bool = False) -> Any:
    if service == "jug" and (auth.server_mode() or direct):
        account = account_get(active_account.get() or service)
        context = jug_page_link(account.get("pageLink", ""))
        content = CREDENTIALS.load(account["id"])
        if not content:
            raise HTTPException(422, "请先配置 Cookie")
        cookies, _ = parse_cookie_import(content, service)
        def request_data():
            headers = {"Cookie": "; ".join(c["name"] + "=" + c["value"] for c in cookies),
                       "Content-Type": "application/json", "Origin": "https://ad.xiaohongshu.com",
                       "Referer": context["pageLink"], "V-Seller-Id": context["vSellerId"],
                       "User-Agent": "Mozilla/5.0"}
            if path == adgroups_api.PATH:
                headers["Referer"] = "https://ad.xiaohongshu.com/aurora/ad/manage/campaigngroup?vSellerId=" + context["vSellerId"]
            req = urllib.request.Request(SERVICES["jug"]["url"].rstrip("/") + path,
                data=json.dumps(body).encode("utf-8"), headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    return json.loads(response.read())
            except urllib.error.HTTPError as exc:
                if exc.code == 401:
                    raise AuthenticationError("平台返回 HTTP 401，当前登录未获授权") from exc
                raise RuntimeError(f"聚光接口请求失败：HTTP {exc.code}") from exc
        return await asyncio.to_thread(request_data)
    page = await ensure_page(service)
    expected = SERVICES[service]["url"].rstrip("/")
    if not page.url.startswith(expected):
        await page.goto(expected, wait_until="domcontentloaded", timeout=30000)
    result = await page.evaluate("""async ({path, body}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(path, {method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal});
        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { throw new Error(`接口未返回 JSON (HTTP ${res.status})，请检查登录状态`); }
        return {status:res.status, json};
      } finally { clearTimeout(timeout); }
    }""", {"path": path, "body": body})
    if result["status"] == 401:
        account_modify(active_account.get() or service, status="expired", statusReason="http_401")
        raise AuthenticationError("平台返回 HTTP 401，当前登录未获授权")
    if result["status"] == 403:
        raise RuntimeError("平台返回 HTTP 403，当前账号可能没有访问该接口的权限")
    if result["status"] >= 400:
        raise RuntimeError(f"平台请求失败：HTTP {result['status']}")
    return result["json"]


async def recommend(root: str, only_contain: bool) -> list[dict[str, Any]]:
    body = {"requestType": "search", "priceUplift": 0, "keywordSearchList": [root],
            "trackId": str(uuid.uuid4()), "filterPurchasedWord": 0, "platform": 11}
    if only_contain:
        body["keywordContainsFilter"] = root
    data = await platform_post("jug", "/api/leona/rtb/tool/keyword/common/recommend", body)
    if data.get("code") != 0 or not isinstance(data.get("data", {}).get("wordList"), list):
        raise RuntimeError(f"聚光未返回推荐词：{data.get('msg') or data.get('message') or '响应格式变化'}")
    return data["data"]["wordList"]


async def chart(keyword: str, start: str, end: str) -> list[dict[str, Any]]:
    data = await platform_post("jug", "/api/idea/edith/traffic/chartview/22004",
                               {"startTime": start, "endTime": end, "trafficSearchWordList": [keyword]})
    table = data.get("data", {}).get("default", {}).get("tableResult")
    if data.get("code") != 0 or not isinstance(table, list):
        raise RuntimeError(f"聚光未返回每日数据：{data.get('msg') or data.get('message') or '响应格式变化'}")
    return table


async def bubble(taxonomy: dict[str, str], yindex: str, params: dict[str, Any]) -> dict[str, Any]:
    body = {"taxonomyCodes": [taxonomy["code"]], "startTime": params["start"], "endTime": params["end"],
            "timePartition": params["timePartition"], "regionCodes": params["regionCodes"],
            "brandDimensionType": params["dimensionType"], "dimensionType": params["dimensionType"],
            "xindex": params["xindex"], "yindex": yindex, "sizeIndex": params["sizeIndex"],
            "brandIdList": params["brandIdList"], "spuIdList": params["spuIdList"],
            "seriesIdList": params["seriesIdList"]}
    for attempt in range(4):
        data = await platform_post("lingxi", "/api/idea/track/v2/industry/brand/compete", body)
        if data.get("success") and isinstance(data.get("data", {}).get(yindex), dict):
            return data["data"][yindex]
        message = str(data.get("msg") or "接口响应格式变化")
        if attempt < 3 and ("频繁" in message or "稍后" in message or data.get("code") == 429):
            await asyncio.sleep(3)
            continue
        raise RuntimeError(f"灵犀请求失败：{message}")
    raise RuntimeError("灵犀请求失败")


def bubble_rows(data: dict[str, Any], yindex: str, tax: dict[str, str], size: str) -> tuple[list[str], list[list[Any]]]:
    x_label = data.get("nameX") or "搜索量"
    y_label = Y_LABEL[yindex]
    heading = ["行业", "品牌/SPU", x_label, y_label, SIZE_LABEL[size], f"{x_label}均值", f"{y_label}均值"]
    rows = [[tax["name"], item.get("name"), item.get("valueX"), item.get("valueY"),
             item.get("value"), data.get("valueX"), data.get("valueY")]
            for item in data.get("dataList", [])]
    return heading, rows


async def execute(run_id: str) -> None:
    check_disk_space()
    run = read_run(run_id)
    tool, params = run["tool"], run["params"]
    if tool in DISABLED_TOOLS:
        run["status"]="failed"
        run.setdefault("failures",[]).append({"item":"任务","error":"该工具尚未接入，暂不可用"})
        run["ended"]=now();save_run(run)
        return
    if tool in {"adgroups", "plaza"}:
        await execute_platform_collection(run)
        return
    if tool == "notes":
        async with notes_lock:
            await execute_notes(run)
        return
    service = TOOLS[tool]["service"]
    context_token = active_account.set(run.get("accountId") or service)
    try:
        async with locks[service]:
            run["status"] = "running"; save_run(run)
            if tool in ("recommend", "combined"):
                keywords: set[str] = set()
                for root in params["roots"]:
                    try:
                        found = await recommend(root, params["onlyContainRoot"])
                        if tool == "recommend":
                            values = sorted(((x.get("keyword"), x.get("monthpv")) for x in found if x.get("keyword")),
                                            key=lambda x: float(x[1] or 0), reverse=True)
                            for rank, (keyword, monthpv) in enumerate(values, 1):
                                run["rows"].append([date.today().isoformat(), root, keyword, monthpv, rank])
                        else:
                            keywords.update(x["keyword"] for x in found if x.get("keyword"))
                    except Exception as exc:
                        run["failures"].append({"item": root, "error": str(exc)})
                    run["processed"] += 1; save_run(run)
                    await asyncio.sleep(.5)
                if tool == "combined":
                    run["total"] += len(keywords)
                    save_run(run)
                    for keyword in sorted(keywords):
                        try:
                            for item in await chart(keyword, params["start"], params["end"]):
                                run["rows"].append([keyword, item.get("dtm"), item.get("searchNum")])
                        except Exception as exc:
                            run["failures"].append({"item": keyword, "error": str(exc)})
                        run["processed"] += 1; save_run(run)
                        await asyncio.sleep(.5)
            else:
                count = 0
                for tax in params["taxonomies"]:
                    for y in params["yindexList"]:
                        try:
                            data = await bubble(tax, y, params)
                            heading, rows = bubble_rows(data, y, tax, params["sizeIndex"])
                            run["sheets"].append({"name": f"{tax['name']}-{Y_LABEL[y]}", "columns": heading, "rows": rows})
                            run["rows"].extend(rows)
                            if not run["columns"]: run["columns"] = heading
                        except Exception as exc:
                            run["failures"].append({"item": f"{tax['name']} / {Y_LABEL[y]}", "error": str(exc)})
                        run["processed"] += 1; count += 1; save_run(run)
                        if count < run["total"]: await asyncio.sleep(1.5)
            run["status"] = "partial" if run["rows"] and run["failures"] else "complete" if run["rows"] else "failed"
            if not run["rows"] and not run["failures"]:
                run["failures"].append({"item": "任务", "error": "平台未返回任何结果行"})
    except Exception as exc:
        run["status"] = "failed"
        run["failures"].append({"item": "任务", "error": str(exc)})
    finally:
        active_account.reset(context_token)
        run["ended"] = now(); save_run(run)
        if auth.server_mode():
            await close_account_context(run.get("accountId") or service)


async def execute_platform_collection(run: dict[str, Any]) -> None:
    account_id = run["accountId"]
    token = active_account.set(account_id)
    folder = RUNS / run["id"]
    folder.mkdir(exist_ok=True)
    try:
        async with locks["jug"]:
            run["status"] = "running"
            run["stage"] = "准备聚光连接"
            save_run(run)
            if run['tool'] == 'adgroups':
                async def post(path, body):
                    return await platform_post('jug', path, body, direct=True)
                await adgroups_api.collect(run, post, folder / '结果.xlsx', save_run, MAX_OUTPUT_BYTES)
                return
            page = await ensure_page("jug", headless=True, navigate=False)
            cookies = await page.context.cookies()
            # Release the old browser before creating the one collection browser.
            await close_account_context(account_id)
            await platform_collectors.collect(run, cookies, folder, save_run, MAX_OUTPUT_BYTES)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        run["status"] = "failed"
        run["failures"].append({"item": "任务", "error": str(exc)})
    finally:
        active_account.reset(token)
        await close_account_context(account_id)
        run["ended"] = now()
        save_run(run)


def enqueue_platform_collection(user, account_id, tool, params, content=None):
    require_tool_available(tool)
    account = account_get(account_id or "jug")
    if auth.server_mode() and account.get("teamId") != user["team_id"]:
        raise HTTPException(403, "只能使用本团队的平台账号")
    if account["service"] != "jug" or account["disabled"]:
        raise HTTPException(422, "请选择启用的聚光账号")
    if tool == 'adgroups':
        jug_page_link(account.get('pageLink', ''))
    if tool == "plaza" and (auth.server_mode() or account.get("pageLink")):
        context = jug_page_link(account.get("pageLink", ""))
        params = {**params, "pageUrl":"https://ad.xiaohongshu.com/microapp/creativity/ugc?vSellerId=" + context["vSellerId"]}
    check_disk_space()
    task_control.check(user["id"])
    run_id = uuid.uuid4().hex
    folder = RUNS / run_id
    folder.mkdir()
    if content is not None:
        (folder / "筛选条件.xlsx").write_bytes(content)
    run = {"id":run_id, "tool":tool, "params":params, "created":now(), "ended":None,
           "status":"queued", "processed":0, "total":len(params.get("tasks", [])) or 1,
           "columns":[], "rows":[], "sheets":[], "failures":[], "accountId":account["id"],
           "accountAlias":account["alias"], "ownerUserId":user["id"], "teamId":user["team_id"]}
    try:
        submit_run(run)
    except BaseException:
        (folder / "筛选条件.xlsx").unlink(missing_ok=True)
        folder.rmdir()
        raise
    return run_id


async def read_adgroup_page_summary(account_id: str, params: dict[str, Any]) -> dict[str, Any]:
    token = active_account.set(account_id)
    try:
        async def post(path, body):
            return await platform_post('jug', path, body, direct=True)
        data = await adgroups_api.fetch_page(post, params, 1)
        return {'websiteTotal': data['totalCount'], 'currentPageCount': len(data['dataList'])}
    finally:
        active_account.reset(token)


@app.post("/api/adgroups/inspect")
async def inspect_adgroup_page(payload: AdgroupInspectInput, request: Request) -> dict[str, Any]:
    assert_local(request)
    user = auth.require_tool(request, "adgroups")
    try:
        params = adgroups_api.validate_dates({'start':payload.start, 'end':payload.end})
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    account = account_get(payload.accountId or "jug")
    if auth.server_mode() and account.get("teamId") != user["team_id"]:
        raise HTTPException(403, "只能使用本团队的平台账号")
    if account["service"] != "jug" or account["disabled"]:
        raise HTTPException(422, "请选择启用的聚光账号")
    check_disk_space()
    # Read-only UI check: no persisted run, no submission quota, same browser slot.
    if task_control.tasks or task_control.run_lock.locked() or locks["jug"].locked():
        raise HTTPException(409, "已有任务正在运行，请稍后重新查询广告组数量")
    async with task_control.run_lock, locks["jug"]:
        try:
            async with asyncio.timeout(60):
                result = await read_adgroup_page_summary(account["id"], params)
        except TimeoutError as exc:
            raise HTTPException(504, "广告组数量查询超时，请稍后重试") from exc
        except Exception as exc:
            raise HTTPException(422, str(exc)) from exc
    return {"websiteTotal":result["websiteTotal"], "currentPageCount":result["currentPageCount"]}


@app.get("/api/plaza/template")
def plaza_template(request: Request):
    auth.require_tool(request, "plaza")
    require_tool_available("plaza")
    return FileResponse(platform_collectors.ASSETS / "plaza-template.xlsx",
                        filename="zhicai_plaza_template.xlsx")


async def read_plaza_upload(file):
    if not str(file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(422, "仅支持 .xlsx 筛选条件文件")
    content = await file.read(20 * 1024 * 1024 + 1)
    try:
        tasks = platform_collectors.read_tasks(content)
    except (ValueError, TypeError, OverflowError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return content, tasks


@app.post("/api/plaza/inspect")
async def inspect_plaza(request: Request, file: UploadFile = File(...)):
    assert_local(request)
    auth.require_tool(request, "plaza")
    require_tool_available("plaza")
    _, tasks = await read_plaza_upload(file)
    return {"taskCount":len(tasks), "tasks":tasks}


@app.post("/api/plaza/runs")
async def create_plaza_run(request: Request, file: UploadFile = File(...),
                           account_id: str = Form(...), collect_comments: bool = Form(False)):
    assert_local(request)
    user = auth.require_tool(request, "plaza")
    require_tool_available("plaza")
    content, tasks = await read_plaza_upload(file)
    params = {"tasks":tasks, "collectComments":collect_comments,
              "pageUrl":"https://ad.xiaohongshu.com/microapp/creativity/ugc"}
    return {"id":enqueue_platform_collection(user, account_id, "plaza", params, content)}


def assert_local(request: Request) -> None:
    assert_loopback_request(request, "只允许本机访问")


async def execute_notes(run: dict[str, Any]) -> None:
    run["status"] = "running"; save_run(run)
    params = run["params"]
    items = params["items"][:params["limit"]] if params["mode"] == "trial" else params["items"]
    run["total"] = len(items)
    run["columns"] = ["笔记id", "笔记标题", "KOL名称", "笔记内容", "封面链接", "笔记链接",
                      "下载状态", "下载文件", "错误信息", "封面图片"]
    covers: list[tuple[int, Path]] = []
    output_bytes = 0
    folder = RUNS / run["id"]
    cover_folder = folder / "封面"
    browser: VisibleBrowserFallback | None = None
    session = build_session()
    prefer_browser = False
    pending: list[asyncio.Task] = []
    image_slots = asyncio.Semaphore(2)
    run["counts"] = {"success": 0, "partial": 0, "failed": 0}

    def progress(stage: str) -> None:
        run["stage"] = stage
        save_run(run)

    async def finish_item(index, item, metadata, page_error, deadline):
        nonlocal output_bytes
        image_data = None
        cover_url = download_file = image_error = ""
        try:
            async with image_slots:
                progress("下载封面")
                for candidate in metadata.image_urls[:3]:
                    for attempt in range(2):
                        if time.monotonic() >= deadline:
                            image_error = "单条处理超过 45 秒"
                            break
                        try:
                            def download():
                                with build_session() as image_session:
                                    return download_image(image_session, candidate, item["url"], deadline)
                            image_data, extension = await asyncio.wait_for(
                                asyncio.to_thread(download), timeout=max(.01, deadline-time.monotonic()))
                            stem = re.sub(r'[^\w.-]+', '_', item["id"]).strip(' ._')[:90] or f"note_{index:03d}"
                            filename = f"{index:03d}_{stem}{extension}"
                            check_disk_space()
                            if output_bytes + len(image_data) > MAX_OUTPUT_BYTES:
                                raise ValueError("本次任务封面总量超过限制")
                            image_path = cover_folder / filename
                            image_path.write_bytes(image_data)
                            output_bytes += len(image_data)
                            download_file = f"封面/{filename}"
                            cover_url = candidate
                            covers.append((index + 1, image_path))
                            break
                        except asyncio.TimeoutError:
                            image_error = "单条处理超过 45 秒"
                        except Exception as exc:
                            image_data = None
                            image_error = str(exc)
                    if image_data:
                        break
        finally:
            missing = [label for label, value in (("标题", metadata.title), ("作者", metadata.author),
                       ("正文", metadata.content), ("封面图片", image_data)) if not value]
            if not missing:
                status, error = "成功", ""
                run["counts"]["success"] += 1
            else:
                status = "部分成功" if metadata.score() or image_data else "失败"
                reason = image_error or page_error or "页面未提供相关字段"
                for sensitive_url in (item["url"], *metadata.image_urls):
                    parsed = urlparse(sensitive_url)
                    reason = reason.replace(sensitive_url, parsed._replace(query="", fragment="").geturl())
                error = f"缺少{'、'.join(missing)}；{reason}"[:500]
                run["failures"].append({"item": item["id"], "error": error})
                run["counts"]["partial" if status == "部分成功" else "failed"] += 1
            run["rows"][index-1] = [item["id"], metadata.title, metadata.author, metadata.content,
                                   cover_url, item["url"], status, download_file, error, ""]
            run["processed"] += 1
            save_run(run)

    try:
        if params["mode"] != "validate":
            cover_folder.mkdir(parents=True, exist_ok=True)
            run["rows"] = [[item["id"], "", "", "", "", item["url"], "等待处理", "", "", ""] for item in items]
            for index, item in enumerate(items, 1):
                # Backpressure keeps at most two image downloads in flight.
                while len([task for task in pending if not task.done()]) >= 2:
                    await asyncio.wait([task for task in pending if not task.done()],
                                       return_when=asyncio.FIRST_COMPLETED)
                deadline = time.monotonic() + 45
                metadata = NoteMetadata()
                page_error = ""
                try:
                    async with asyncio.timeout( max(.01, deadline-time.monotonic()) ):
                        if not prefer_browser:
                            progress(f"加载页面 · {index}/{len(items)}")
                            try:
                                metadata = await asyncio.wait_for(
                                    asyncio.to_thread(fetch_note_http, session, item["url"], time.monotonic() + 8), timeout=10)
                            except Exception as exc:
                                page_error = str(exc)
                        if prefer_browser or metadata.score() < 4:
                            if browser is None:
                                browser = VisibleBrowserFallback()
                            progress(f"提取内容 · {index}/{len(items)}")
                            try:
                                rendered = await browser.fetch(item["url"])
                                if rendered.score() >= metadata.score():
                                    metadata = rendered
                                if rendered.image_urls:
                                    prefer_browser = True
                            except Exception as exc:
                                page_error = str(exc)
                except TimeoutError:
                    page_error = "单条处理超过 45 秒"
                pending.append(asyncio.create_task(finish_item(index, item, metadata, page_error, deadline)))
            progress("下载封面")
            await asyncio.gather(*pending)
        else:
            for item in items:
                run["rows"].append([item["id"], "", "", "", "", item["url"],
                                    "格式有效（未联网）", "", "", ""])
            run["processed"] = len(items)
        if browser is not None:
            await browser.close()
            browser = None
        progress("生成文件")
        run["coverCount"] = len(covers)
        run["status"] = ("complete" if not run["failures"] else
                         "partial" if any(row[6] != "失败" for row in run["rows"]) else "failed")
        folder.mkdir(parents=True, exist_ok=True)
        book = Workbook(); sheet = book.active; sheet.title = "笔记数据"
        sheet.append(run["columns"])
        for row in run["rows"]:
            sheet.append([("'" + value if value.startswith(("=", "+", "-", "@")) else value)[:32767]
                          if isinstance(value, str) else value for value in row])
        sheet.column_dimensions["A"].width = 22; sheet.column_dimensions["B"].width = 30
        sheet.column_dimensions["C"].width = 20; sheet.column_dimensions["D"].width = 55
        sheet.column_dimensions["E"].width = 48; sheet.column_dimensions["F"].width = 48
        sheet.column_dimensions["H"].width = 32; sheet.column_dimensions["I"].width = 48
        preview_folder = folder / "previews"
        preview_folder.mkdir(exist_ok=True)
        for row_index, image_path in covers:
            try:
                preview_path = preview_folder / f"{row_index}.png"
                with PILImage.open(image_path) as source:
                    if source.width * source.height > 16_000_000:
                        raise ValueError("图片像素过大，封面原图保留但不嵌入预览")
                    source.thumbnail((600, 600))
                    mode = "RGBA" if source.mode in {"RGBA", "LA"} or "transparency" in source.info else "RGB"
                    source.convert(mode).save(preview_path, format="PNG")
                picture = ExcelImage(str(preview_path))
                original_width, original_height = picture.width, picture.height
                picture.width = 150
                picture.height = min(220, int(original_height * 150 / original_width))
                sheet.add_image(picture, f"J{row_index}")
            except Exception as exc:
                row = run["rows"][row_index - 2]
                error = f"封面已下载但无法嵌入 Excel：{exc}"[:500]
                row[6] = "部分成功"
                row[8] = f"{row[8]}；{error}".strip("；")[:500]
                sheet.cell(row_index, 7, row[6])
                sheet.cell(row_index, 9, row[8])
                run["failures"].append({"item": row[0], "error": error})
                run["status"] = "partial"
        for index, _ in covers: sheet.row_dimensions[index].height = 90
        sheet.column_dimensions["J"].width = 24
        output = folder / "笔记封面与内容.xlsx"
        book.save(output)
        run["outputFile"] = str(output)
        if covers:
            archive = folder / "笔记封面与内容_含封面素材.zip"
            with ZipFile(archive, "w") as package:
                package.write(output, output.name)
                for image_path in sorted(cover_folder.iterdir()):
                    package.write(image_path, f"封面/{image_path.name}")
            run["assetsFile"] = str(archive)
    except Exception as exc:
        run["status"] = "failed"; run["failures"].append({"item": "任务", "error": str(exc)[:500]})
    finally:
        if pending:
            for task in pending:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        session.close()
        if browser is not None:
            try:
                await browser.close()
            except Exception as exc:
                run["failures"].append({"item": "浏览器", "error": f"关闭浏览器失败：{exc}"[:500]})
                if run["status"] == "complete":
                    run["status"] = "partial"
        run["stage"] = "已结束"
        run["ended"] = run.get("ended") or now(); save_run(run)


def inspect_note_workbook(content: bytes) -> list[dict[str, Any]]:
    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError("无法读取该 Excel 文件，请确认文件未损坏且为 .xlsx 格式") from exc
    summaries = []
    try:
        for sheet in workbook.worksheets:
            first = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), ())
            headers = [str(value).strip() if value is not None else "" for value in first]
            summaries.append({"name": sheet.title,
                              "hasRequiredColumns": headers.count("笔记id") == 1 and headers.count("笔记链接") == 1})
    finally:
        workbook.close()
    return summaries


def read_note_items(content: bytes, sheet_name: str) -> list[dict[str, str]]:
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    try:
        if sheet_name not in workbook.sheetnames:
            raise ValueError("所选工作表不存在，请重新上传文件")
        sheet = workbook[sheet_name]
        rows = sheet.iter_rows(values_only=True)
        headers = [str(value).strip() if value is not None else "" for value in next(rows, ())]
        if headers.count("笔记id") != 1 or headers.count("笔记链接") != 1:
            raise ValueError("所选工作表必须且只能包含一列“笔记id”和一列“笔记链接”")
        id_column, url_column = headers.index("笔记id"), headers.index("笔记链接")
        items = []
        for row_number, row in enumerate(rows, 2):
            note_id = row[id_column] if id_column < len(row) else None
            url = row[url_column] if url_column < len(row) else None
            if note_id is None and url is None:
                continue
            note_id = str(note_id).strip() if note_id is not None else ""
            url = str(url).strip() if url is not None else ""
            if not note_id or not url:
                raise ValueError(f"第 {row_number} 行需要同时填写“笔记id”和“笔记链接”")
            items.append({"id": note_id, "url": url})
            if len(items) > 200:
                raise ValueError("单次最多处理 200 条笔记")
        if not items:
            raise ValueError("所选工作表没有有效笔记记录")
        return items
    finally:
        workbook.close()


def enqueue_note_run(user: dict[str, Any], params: dict[str, Any]) -> str:
    run_id = uuid.uuid4().hex
    total = len(params["items"][:params["limit"]] if params["mode"] == "trial" else params["items"])
    run = {"id": run_id, "tool": "notes", "params": params, "created": now(), "ended": None,
           "status": "queued", "processed": 0, "total": total,
           "columns": [], "rows": [], "sheets": [], "failures": [], "accountId": "", "accountAlias": "无需账号",
           "ownerUserId": user["id"], "teamId": user["team_id"]}
    submit_run(run)
    return run_id


@app.get("/")
def index(request: Request) -> Response:
    """Reuse the v0.4 shell, styling and icons while replacing its demo runtime."""
    if auth.server_mode() and not getattr(request.state, "user", None):
        return FileResponse(ROOT / "static" / "auth.html", media_type="text/html",
                            headers={"Cache-Control": "no-store"})
    source = (ROOT.parent / "demo" / "zhicai-workbench-v4.html").read_text(encoding="utf-8")
    style_version = (ROOT / "static" / "integration.css").stat().st_mtime_ns
    script_version = (ROOT / "static" / "integration.js").stat().st_mtime_ns
    requirements_style_version = (ROOT / "static" / "requirements.css").stat().st_mtime_ns
    requirements_script_version = (ROOT / "static" / "requirements.js").stat().st_mtime_ns
    multiuser_script_version = (ROOT / "static" / "multiuser.js").stat().st_mtime_ns if auth.server_mode() else 0
    multiuser_style_version = (ROOT / "static" / "multiuser.css").stat().st_mtime_ns if auth.server_mode() else 0
    source = source.replace("script-src 'unsafe-inline'", "script-src 'self' 'unsafe-inline'")
    source = source.replace("style-src 'unsafe-inline'", "style-src 'self' 'unsafe-inline'")
    source = source.replace("connect-src 'none'", "connect-src 'self'")
    source = source.replace("</style>", f"</style>\n<link rel=\"stylesheet\" href=\"/static/integration.css?v={style_version}\">\n<link rel=\"stylesheet\" href=\"/static/requirements.css?v={requirements_style_version}\">")
    if auth.server_mode():
        source = source.replace("</style>", f"</style>\n<link rel=\"stylesheet\" href=\"/static/multiuser.css?v={multiuser_style_version}\">")
    source = source.replace("<span class=\"demo-badge\">交互原型 · 模拟数据</span>",
                            "<span class=\"demo-badge\">本机运行 · 真实采集</span>")
    source = source.replace("本地交互原型 v0.4", "本机数据获取工作台")
    source = source.replace("账号连接与权限均为模拟<br>不保存密码或 Cookie", "连接在本机浏览器中完成<br>结果保存在当前电脑")
    source = source.replace("<label class=\"identity-label\" for=\"identity\">演示身份</label>",
                            "<label class=\"identity-label\" for=\"identity\">当前身份</label>")
    source = source.replace("render();\n</script>", f"</script>\n<script src=\"/static/integration.js?v={script_version}\"></script>\n<script src=\"/static/requirements.js?v={requirements_script_version}\"></script>")
    if auth.server_mode():
        source = source.replace("</body>", f'<script src="/static/multiuser.js?v={multiuser_script_version}"></script>\n</body>')
    if auth.server_mode():
        version = (ROOT / "static" / "industry-presets.js").stat().st_mtime_ns
        source = source.replace("</body>", f'<script src="/static/industry-presets.js?v={version}"></script></body>')
    help_style_version = (ROOT / "static" / "help.css").stat().st_mtime_ns
    help_script_version = (ROOT / "static" / "help.js").stat().st_mtime_ns
    source = source.replace("</head>", f'<link rel="stylesheet" href="/static/help.css?v={help_style_version}">\n</head>')
    source = source.replace("</body>", f'<script src="/static/help.js?v={help_script_version}"></script>\n</body>')
    return Response(source, media_type="text/html; charset=utf-8")


@app.get("/api/meta")
def meta(request: Request) -> dict[str, Any]:
    images = {}
    folder = ROOT / "static" / "tool-locations"
    for tool in TOOLS:
        for extension in ("png", "jpg", "jpeg", "webp"):
            path = folder / f"{tool}.{extension}"
            if path.is_file():
                images[tool] = f"/static/tool-locations/{tool}.{extension}?v={path.stat().st_mtime_ns}"
                break
    user = auth.user_from_request(request)
    return {"tools": TOOLS, "services": SERVICES, "disabledTools":sorted(DISABLED_TOOLS),
            "localUser": user["email"] if auth.server_mode() else getpass.getuser(),
            "serverMode": auth.server_mode(),
            "toolLocationImages": images,
            "requirementManageEnabled": user["role"] == "admin"}


@app.get("/api/accounts")
def list_accounts(request: Request) -> list[dict[str, Any]]:
    user = auth.user_from_request(request)
    return [a for a in accounts_read() if auth.account_visible(user, a)]


def jug_page_link(value: str) -> dict[str, str]:
    value = value.strip()
    parsed = urlparse(value)
    ids = parse_qs(parsed.query).get("vSellerId", [])
    if (len(value) > 2048 or parsed.scheme != "https" or parsed.hostname != "ad.xiaohongshu.com"
            or parsed.username or parsed.password or parsed.netloc not in ("ad.xiaohongshu.com", "ad.xiaohongshu.com:443")
            or len(ids) != 1 or not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", ids[0])):
        raise HTTPException(422, "聚光账号必须填写包含 vSellerId 的聚光 HTTPS 页面链接")
    seller_id = ids[0]
    return {"pageLink": "https://ad.xiaohongshu.com/aurora/ad/tools/newKeywordTool?vSellerId=" + seller_id,
            "vSellerId": seller_id}


@app.post("/api/accounts")
def create_account(payload: AccountInput, request: Request) -> dict[str, Any]:
    assert_local(request)
    user = auth.user_from_request(request)
    alias = payload.alias.strip()
    platform, service_name = payload.platform.strip(), payload.serviceName.strip()
    if platform or service_name:
        if platform not in {"xhs","baidu","douyin","tmall"} or not 1 <= len(service_name) <= 80:
            raise HTTPException(422, "请选择平台并填写服务名称（最多80字）")
        service = next((key for key,item in SERVICES.items()
                        if platform == "xhs" and item["name"] == service_name), "custom")
    elif payload.service in SERVICES:
        platform, service_name, service = "xhs", SERVICES[payload.service]["name"], payload.service
    else:
        raise HTTPException(422, "请选择平台并填写服务名称")
    if not 1 <= len(alias) <= 40:
        raise HTTPException(422, "账号别名需要1～40字")
    account = {"id": uuid.uuid4().hex, "service": service, "platform": platform,
               "serviceName": service_name, "alias": alias,
               "method": "cookie" if auth.server_mode() else "login", "disabled": False, "status": "unverified", "statusReason": None,
               "cookieConfigured": False, "verifiedAt": None}
    if service == "jug":
        account.update(jug_page_link(payload.pageLink))
    if auth.server_mode():
        auth.add_account(account, user)
        return account_get(account["id"])
    items = accounts_read(); items.append(account); accounts_save(items)
    return account


@app.patch("/api/accounts/{account_id}")
def update_account(account_id: str, payload: AccountUpdate, request: Request) -> dict[str, Any]:
    assert_local(request)
    account = account_get(account_id)
    user = auth.require_account(request, account, edit=True)
    changes = {}
    if account["service"] == "jug" and (payload.pageLink is not None or payload.alias is not None):
        changes.update(jug_page_link(payload.pageLink if payload.pageLink is not None else account.get("pageLink", "")))
        if changes["vSellerId"] != account.get("vSellerId"):
            changes.update(status="unverified", verifiedAt=None, statusReason=None)
    if payload.alias is not None:
        alias = payload.alias.strip()
        if not 1 <= len(alias) <= 40: raise HTTPException(422, "账号别名需要 1～40 字")
        changes["alias"] = alias
    if payload.disabled is not None:
        changes["disabled"] = payload.disabled
        changes["status"] = "disabled" if payload.disabled else "unverified"
        changes["statusReason"] = None
    if payload.teamId is not None:
        if not auth.server_mode() or user["role"] != "admin":
            raise HTTPException(403, "仅管理员可调整账号所属团队")
        auth.move_account_team(account_id, payload.teamId, user["id"])
    return account_modify(account_id, **changes)


@app.delete("/api/accounts/{account_id}")
async def remove_account(account_id: str, request: Request) -> dict[str, str]:
    assert_local(request)
    account = account_get(account_id)
    user = auth.require_account(request, account, edit=True)
    if any(read_run(run_id).get("accountId") == account_id for run_id in list(jobs)):
        raise HTTPException(409, "此账号有正在运行的任务，请等待完成后删除")
    if auth.server_mode():
        auth.delete_account(account_id, user["id"])
    else:
        accounts_save([a for a in accounts_read() if a["id"] != account_id])
    CREDENTIALS.delete(account_id)
    await close_account_context(account_id)
    return {"message": "账号已删除，历史运行记录保留"}


@app.post("/api/accounts/{account_id}/login")
async def login_account(account_id: str, request: Request) -> dict[str, str]:
    assert_local(request)
    account = account_get(account_id)
    auth.require_account(request, account, edit=True)
    if account["disabled"]: raise HTTPException(409, "账号已停用")
    if account["service"] not in SERVICES:
        raise HTTPException(409, "该服务尚未接入连接验证或采集")
    token = active_account.set(account_id)
    try:
        await ensure_page(account["service"], show_login=True)
    except Exception as exc:
        raise HTTPException(503, f"无法打开登录浏览器：{exc}") from exc
    finally:
        active_account.reset(token)
    account_modify(account_id, method="login", cookieConfigured=False, cookieSavedAt=None,
                   status="unverified", statusReason=None, verifiedAt=None)
    return {"message": "登录窗口已打开。登录完成后请返回工作台验证连接。"}


def parse_cookie_import(content: str, service: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not 1 <= len(content) <= 200000:
        raise ValueError("Cookie／会话内容需要填写，且不能超过 200 KB")
    host = SERVICES[service]["url"].split("/")[2]
    cookies: list[dict[str, Any]] = []
    origins: list[dict[str, Any]] = []
    if content.lstrip().startswith("{"):
        state = json.loads(content)
        if not isinstance(state, dict) or not isinstance(state.get("cookies"), list):
            raise ValueError("会话 JSON 需要包含 cookies 数组")
        for item in state["cookies"]:
            if not isinstance(item, dict) or not item.get("name") or not item.get("value"):
                raise ValueError("会话 JSON 中有无效 Cookie")
            domain = str(item.get("domain", "")).lstrip(".")
            if domain not in (host, "xiaohongshu.com"):
                raise ValueError("会话中包含其他网站的 Cookie，已拒绝导入")
            cookies.append(item)
        origins = state.get("origins", [])
        if not isinstance(origins, list) or any(not isinstance(o, dict) or o.get("origin") != SERVICES[service]["url"].rstrip("/") for o in origins):
            raise ValueError("会话中包含其他网站的本地状态，已拒绝导入")
    else:
        for part in content.strip().split(";"):
            if not part.strip(): continue
            if "=" not in part: raise ValueError("Cookie 文本应为 name=value; name2=value2 格式")
            name, value = part.strip().split("=", 1)
            if not name or not value: raise ValueError("Cookie 名称或值为空")
            cookies.append({"name": name.strip(), "value": value.strip(), "url": SERVICES[service]["url"]})
    if not cookies: raise ValueError("未识别到 Cookie")
    return cookies, origins


@app.post("/api/accounts/{account_id}/cookie")
async def import_cookie(account_id: str, payload: CookieImport, request: Request) -> dict[str, str]:
    if task_control.run_lock.locked():
        raise HTTPException(429, "当前有采集或账号连接操作，请稍后再试", headers={"Retry-After": "30"})
    async with task_control.run_lock:
        assert_local(request)
        account = account_get(account_id)
        auth.require_account(request, account, edit=True)
        if account["disabled"]: raise HTTPException(409, "账号已停用")
        if account["service"] not in SERVICES:
            raise HTTPException(409, "该服务尚未接入连接验证或采集")
        try:
            cookies, origins = parse_cookie_import(payload.content, account["service"])
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        if os.environ.get("ZHICAI_DEPLOYMENT", "local") == "server" and origins:
            raise HTTPException(422, "服务器模式当前只支持 Cookie 文本")
        try:
            CREDENTIALS.check_ready()
        except CredentialStorageError as exc:
            raise HTTPException(503, str(exc)) from exc
        token = active_account.set(account_id)
        try:
            page = await ensure_page(account["service"], headless=True, navigate=False)
            context = contexts[account_id]
            await context.add_cookies(cookies)
            if origins:
                await page.goto(SERVICES[account["service"]]["url"], wait_until="domcontentloaded", timeout=30000)
                if not page.url.startswith(SERVICES[account["service"]]["url"].rstrip("/")):
                    raise ValueError("导入 Cookie 后仍未进入目标服务，无法写入该服务的本地状态")
                for origin in origins:
                    values = origin.get("localStorage", [])
                    if not isinstance(values, list): raise ValueError("localStorage 格式无效")
                    await page.evaluate("items => { for (const item of items) localStorage.setItem(item.name, item.value); }", values)
                await page.reload(wait_until="domcontentloaded", timeout=30000)
        except Exception as exc:
            raise HTTPException(503, f"会话导入失败：{exc}") from exc
        finally:
            active_account.reset(token)
            if auth.server_mode():
                await close_account_context(account_id)
        try:
            CREDENTIALS.save(account_id, payload.content)
        except CredentialStorageError as exc:
            raise HTTPException(503, f"Cookie 未能安全保存：{exc}") from exc
        saved_at = now()
        account_modify(account_id, method="cookie", cookieConfigured=True, cookieSavedAt=saved_at,
                       status="unverified", statusReason=None, verifiedAt=None)
        return {"message": "Cookie 已保存到该账号的后台连接；请验证连接。", "cookieSavedAt": saved_at}


@app.post("/api/accounts/{account_id}/verify")
async def verify_account(account_id: str, request: Request) -> dict[str, str]:
    if task_control.run_lock.locked():
        raise HTTPException(429, "当前有采集或账号连接操作，请稍后再试", headers={"Retry-After": "30"})
    async with task_control.run_lock:
        assert_local(request)
        account = account_get(account_id)
        auth.require_account(request, account, edit=True)
        if account["disabled"]: raise HTTPException(409, "账号已停用")
        if account["service"] not in SERVICES:
            raise HTTPException(409, "该服务尚未接入连接验证或采集")
        service = account["service"]
        if service == "jug":
            jug_page_link(account.get("pageLink", ""))
        token = active_account.set(account_id)
        try:
            async with locks[service]:
                if service == "jug":
                    await recommend("品牌", False)
                else:
                    await bubble({"code": "dd9c407f69b3470ea2bed33c7c007fa6", "name": "母婴奶粉"}, "readNum",
                                 {"start": date.today().replace(day=1).isoformat(), "end": date.today().isoformat(),
                                  "timePartition": 1, "regionCodes": [], "dimensionType": "1", "xindex": "1",
                                  "sizeIndex": "noteNum", "brandIdList": [], "spuIdList": [], "seriesIdList": []})
        except AuthenticationError as exc:
            account_modify(account_id, status="expired", statusReason="http_401")
            raise HTTPException(503, f"连接验证失败：{exc}") from exc
        except Exception as exc:
            account_modify(account_id, status="unverified", statusReason="verification_inconclusive")
            raise HTTPException(503, f"连接未能验证：{exc}；不能据此判断 Cookie 已过期") from exc
        finally:
            active_account.reset(token)
            if auth.server_mode():
                await close_account_context(account_id)
        verified = now()
        account_modify(account_id, status="verified", statusReason=None, verifiedAt=verified)
        return {"message": "平台接口返回有效数据，连接可用", "verifiedAt": verified}


@app.post("/api/services/{service}/login")
async def login(service: str, request: Request) -> dict[str, str]:
    if auth.server_mode():
        raise HTTPException(404, "服务器模式请使用具体平台账号")
    assert_local(request)
    if service not in SERVICES: raise HTTPException(404, "未知服务")
    try:
        await ensure_page(service, show_login=True)
    except Exception as exc:
        raise HTTPException(503, f"无法打开登录浏览器：{exc}") from exc
    return {"message": "登录窗口已打开。请在窗口中完成登录，然后返回工作台验证连接。"}


@app.post("/api/services/{service}/verify")
async def verify(service: str, request: Request) -> dict[str, str]:
    if auth.server_mode():
        raise HTTPException(404, "服务器模式请使用具体平台账号")
    assert_local(request)
    if service not in SERVICES: raise HTTPException(404, "未知服务")
    try:
        async with locks[service]:
            if service == "jug":
                await recommend("品牌", False)
            else:
                await bubble({"code": "dd9c407f69b3470ea2bed33c7c007fa6", "name": "母婴奶粉"}, "readNum",
                             {"start": date.today().replace(day=1).isoformat(), "end": date.today().isoformat(),
                              "timePartition": 1, "regionCodes": [], "dimensionType": "1", "xindex": "1",
                              "sizeIndex": "noteNum", "brandIdList": [], "spuIdList": [], "seriesIdList": []})
    except Exception as exc:
        raise HTTPException(503, f"连接验证失败：{exc}") from exc
    return {"message": "平台接口返回有效数据，连接可用", "verifiedAt": now()}


@app.post("/api/notes/inspect")
async def inspect_notes_file(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    assert_local(request)
    user = auth.require_tool(request, "notes")
    task_control.check(user["id"])
    check_disk_space()
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(422, "笔记数据仅支持上传 .xlsx 文件")
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "Excel 文件不能超过 20 MB")
    try:
        sheets = inspect_note_workbook(content)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not sheets:
        raise HTTPException(422, "Excel 文件中没有工作表")
    if not any(sheet["hasRequiredColumns"] for sheet in sheets):
        raise HTTPException(422, "至少一个工作表必须包含“笔记id”和“笔记链接”两列")
    return {"sheets": sheets, "fileName": Path(file.filename).name, "maxRows": 200}


@app.post("/api/notes/runs")
async def create_notes_run(request: Request, file: UploadFile = File(...),
                           sheet_name: str = Form(...), mode: str = Form("all"),
                           limit: int | None = Form(None)) -> dict[str, str]:
    assert_local(request)
    user = auth.require_tool(request, "notes")
    task_control.check(user["id"])
    check_disk_space()
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise HTTPException(422, "笔记数据仅支持上传 .xlsx 文件")
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "Excel 文件不能超过 20 MB")
    try:
        items = read_note_items(content, sheet_name)
        params = validate_params("notes", {"items": items, "mode": mode, "limit": limit})
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"id": enqueue_note_run(user, params)}


@app.post("/api/runs")
async def create_run(payload: RunInput, request: Request) -> dict[str, str]:
    assert_local(request)
    user = auth.require_tool(request, payload.tool)
    require_tool_available(payload.tool)
    try:
        params = validate_params(payload.tool, payload.params)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    tool = payload.tool
    if tool == "adgroups":
        return {"id":enqueue_platform_collection(user, payload.accountId, tool, params)}
    if tool == "notes":
        return {"id": enqueue_note_run(user, params)}
    service = TOOLS[tool]["service"]
    account = account_get(payload.accountId or service)
    if auth.server_mode() and account.get("teamId") != user["team_id"]:
        raise HTTPException(403, "只能使用本团队的平台账号")
    if account["service"] != service or account["disabled"]:
        raise HTTPException(422, "所选账号不适用于此工具或已停用")
    run_id = uuid.uuid4().hex
    columns = {"recommend": ["日期", "词根", "关键词", "月搜索指数", "词根内排名"],
               "combined": ["keyword", "date", "searchNum"], "bubble": []}[tool]
    total = len(params.get("roots", [])) if tool != "bubble" else len(params["taxonomies"]) * len(params["yindexList"])
    run = {"id": run_id, "tool": tool, "params": params, "created": now(), "ended": None,
           "status": "queued", "processed": 0, "total": total, "columns": columns,
           "rows": [], "sheets": [], "failures": [], "accountId": account["id"], "accountAlias": account["alias"],
           "ownerUserId": user["id"], "teamId": user["team_id"]}
    submit_run(run)
    return {"id": run_id}


@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str, request: Request) -> dict[str, str]:
    assert_local(request)
    run = read_run(run_id)
    user = auth.user_from_request(request)
    if auth.server_mode() and run.get("ownerUserId") != user["id"] and user["role"] != "admin":
        raise HTTPException(404, "找不到运行记录")
    if not await task_control.cancel(run_id):
        raise HTTPException(409, "任务已结束，无法取消")
    return {"message": "任务已取消"}


@app.get("/api/runs")
def list_runs(request: Request) -> list[dict[str, Any]]:
    user = auth.user_from_request(request)
    items = []
    for path in RUNS.glob("*.json"):
        try:
            run = json.loads(path.read_text(encoding="utf-8"))
            if auth.server_mode() and run.get("ownerUserId") != user["id"] and user["role"] != "admin":
                continue
            items.append({key: run[key] for key in ("id", "tool", "created", "ended", "status", "processed", "total")}
                         | {"rowCount": run.get("rowCount", len(run["rows"])), "failureCount": len(run["failures"]),
                            "accountAlias": run.get("accountAlias", ""),
                            "coverCount": run.get("coverCount", 0), "outputReady": bool(run.get("outputFile"))})
        except (OSError, ValueError, KeyError):
            continue
    return sorted(items, key=lambda x: x["created"], reverse=True)[:200]


@app.get("/api/runs/{run_id}")
def get_run(run_id: str, request: Request) -> dict[str, Any]:
    run = read_run(run_id)
    user = auth.user_from_request(request)
    if auth.server_mode() and run.get("ownerUserId") != user["id"] and user["role"] != "admin":
        raise HTTPException(404, "找不到运行记录")
    # Bubble sheets have different Y-axis headers; preview one sheet without mixing meanings.
    preview = run["sheets"][0] if run["tool"] == "bubble" and run["sheets"] else None
    return {**run, "outputReady": bool(run.get("outputFile")) and run["status"] not in ("queued", "running"), "columns": preview["columns"] if preview else run["columns"],
            "rows": (preview["rows"] if preview else run["rows"])[:30],
            "sheets": [{"name": s["name"], "count": s.get("count", len(s["rows"]))} for s in run["sheets"]],
            "rowCount": run.get("rowCount", len(run["rows"]))}


@app.get("/api/runs/{run_id}/download")
def download(run_id: str, request: Request) -> Response:
    assert_local(request)
    run = read_run(run_id)
    user = auth.user_from_request(request)
    if auth.server_mode() and run.get("ownerUserId") != user["id"] and user["role"] != "admin":
        raise HTTPException(404, "找不到运行记录")
    if run["status"] in ("queued", "running"):
        raise HTTPException(409, "任务仍在运行，完成后可下载结果")
    if run["tool"] in {"notes", "adgroups", "plaza"}:
        output = Path(run.get("outputFile", ""))
        if not output.is_file() or output.parent.resolve() != (RUNS / run_id).resolve():
            raise HTTPException(404, "结果文件不存在")
        return FileResponse(output, filename=f"zhicai_{run['tool']}_{run_id[:8]}.xlsx",
                            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    if not run["rows"]:
        raise HTTPException(404, "当前没有可下载的数据")
    if run["tool"] == "bubble":
        wb = Workbook(); wb.remove(wb.active)
        for sheet in run["sheets"]:
            name = re.sub(r"[\\/*?:\[\]]", "_", sheet["name"])[:31] or "数据"
            original = name; n = 2
            while name in wb.sheetnames:
                name = f"{original[:28]}-{n}"; n += 1
            ws = wb.create_sheet(name)
            ws.append(sheet["columns"])
            for row in sheet["rows"]: ws.append(row)
        stream = io.BytesIO(); wb.save(stream)
        content, media, ext = stream.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    else:
        stream = io.StringIO(); writer = csv.writer(stream); writer.writerow(run["columns"]); writer.writerows(run["rows"])
        content, media, ext = ("\ufeff" + stream.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", "csv"
    filename = f"zhicai_{run['tool']}_{run['created'][:10]}_{run_id[:8]}.{ext}"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/runs/{run_id}/diagnostics")
def download_adgroup_diagnostics(run_id: str, request: Request) -> Response:
    assert_local(request)
    run = get_run(run_id, request)
    if run["tool"] != "adgroups" or not run.get("diagnostics"):
        raise HTTPException(404, "当前没有分页诊断信息")
    return Response(json.dumps(run["diagnostics"], ensure_ascii=False, indent=2),
                    media_type="application/json",
                    headers={"Content-Disposition":f'attachment; filename="zhicai_adgroups_{run_id[:8]}_diagnostics.json"'})


@app.get("/api/runs/{run_id}/assets")
def download_note_assets(run_id: str, request: Request) -> Response:
    assert_local(request)
    run = read_run(run_id)
    user = auth.user_from_request(request)
    if auth.server_mode() and run.get("ownerUserId") != user["id"] and user["role"] != "admin":
        raise HTTPException(404, "找不到运行记录")
    if run["tool"] != "notes" or run["status"] in ("queued", "running"):
        raise HTTPException(404, "当前没有可下载的封面素材")
    archive = Path(run.get("assetsFile", ""))
    if not archive.is_file() or archive.parent.resolve() != (RUNS / run_id).resolve():
        raise HTTPException(404, "封面素材文件不存在")
    return FileResponse(archive, filename=f"zhicai_notes_{run_id[:8]}_assets.zip",
                        media_type="application/zip")


@app.on_event("shutdown")
async def close_browser() -> None:
    await task_control.shutdown()
    for context in list(contexts.values()):
        try: await context.close()
        except Exception: pass
    if playwright_instance: await playwright_instance.stop()


@app.on_event("startup")
def mark_interrupted_runs() -> None:
    task_control.stopping = False
    task_control.run_lock = asyncio.Lock()
    for path in RUNS.glob("*.json"):
        try:
            run = json.loads(path.read_text(encoding="utf-8"))
            if run.get("status") in ("queued", "running"):
                run["status"] = "partial" if run.get("rows") else "failed"
                run.setdefault("failures", []).append({"item": "任务", "error": "服务曾停止，任务已中断"})
                run["ended"] = now()
                save_run(run)
        except (OSError, ValueError, KeyError):
            continue


@app.on_event("startup")
def initialize_requirements() -> None:
    auth.initialize()
    init_requirements_db()
