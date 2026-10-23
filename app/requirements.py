"""Durable requirement intake for the local workbench and a single server."""
from __future__ import annotations

import getpass
import io
import os
import re
import sqlite3
import uuid
import zipfile
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from .access import assert_loopback_request
from . import auth


DEFAULT_DB = Path(__file__).resolve().parent / "data" / "requirements.sqlite3"
DB_PATH = Path(os.environ.get("ZHICAI_REQUIREMENTS_DB", str(DEFAULT_DB))).resolve()
KINDS = {"new_tool", "enhancement", "problem", "tool_access"}
STATUSES = {"submitted", "needs_info", "evaluating", "scheduled", "in_progress", "done", "declined"}
TOOL_IDS = {"trend", "keywords", "notes", "industry", "baidu", "douyin", "product", "shop", "adgroups", "plaza", "content"}
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".csv", ".xlsx"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 3
router = APIRouter(prefix="/api/requirements", tags=["requirements"])


class PostgresConnection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql: str, parameters=()):
        # All callers use fixed SQL; translate the legacy SQLite bind syntax.
        sql = sql.replace("?", "%s")
        sql = re.sub(r"(?<!:):([a-z_]+)", r"%(\1)s", sql)
        return self.connection.execute(sql, parameters)


def local_only(request: Request) -> None:
    assert_loopback_request(request, "当前只允许本机访问需求中心")


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


@contextmanager
def connection():
    if auth.server_mode():
        with auth.db() as pg:
            yield PostgresConnection(pg)
        return
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    if auth.server_mode():
        with auth.db() as db:
            db.execute("""
            CREATE TABLE IF NOT EXISTS requirements (
                id text PRIMARY KEY, kind text NOT NULL, title text NOT NULL,
                platform text NOT NULL, service text NOT NULL, tool_id text NOT NULL,
                run_id text NOT NULL, contact text NOT NULL, requester text NOT NULL,
                requester_user_id text REFERENCES users(id), description text NOT NULL,
                source_location text NOT NULL, desired_data text NOT NULL,
                expected_result text NOT NULL, input_conditions text NOT NULL,
                usage_frequency text NOT NULL, needed_by text NOT NULL, status text NOT NULL,
                status_note text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
            CREATE TABLE IF NOT EXISTS requirement_attachments (
                id text PRIMARY KEY, requirement_id text NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
                filename text NOT NULL, media_type text NOT NULL,
                size_bytes bigint NOT NULL, content bytea NOT NULL);
            CREATE TABLE IF NOT EXISTS requirement_events (
                seq bigserial UNIQUE, id text PRIMARY KEY,
                requirement_id text NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
                status text NOT NULL, note text NOT NULL, created_at text NOT NULL);
            CREATE TABLE IF NOT EXISTS requirement_comments (
                seq bigserial UNIQUE, id text PRIMARY KEY,
                requirement_id text NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
                author text NOT NULL, content text NOT NULL, created_at text NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_requirements_created ON requirements(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status);
            """)
        return
    with connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS requirements (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            platform TEXT NOT NULL,
            service TEXT NOT NULL,
            tool_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            contact TEXT NOT NULL,
            requester TEXT NOT NULL,
            description TEXT NOT NULL,
            source_location TEXT NOT NULL,
            desired_data TEXT NOT NULL,
            expected_result TEXT NOT NULL,
            input_conditions TEXT NOT NULL,
            usage_frequency TEXT NOT NULL,
            needed_by TEXT NOT NULL,
            status TEXT NOT NULL,
            status_note TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requirement_attachments (
            id TEXT PRIMARY KEY,
            requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            media_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            content BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requirement_events (
            id TEXT PRIMARY KEY,
            requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            note TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requirement_comments (
            id TEXT PRIMARY KEY,
            requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_requirements_created ON requirements(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status);
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(requirements)")}
        if "requester_user_id" not in columns:
            db.execute("ALTER TABLE requirements ADD COLUMN requester_user_id TEXT")


def clean(value: str | None, label: str, limit: int, required: bool = False) -> str:
    result = (value or "").strip()
    if required and not result:
        raise HTTPException(422, f"请填写{label}")
    if len(result) > limit:
        raise HTTPException(422, f"{label}最多 {limit} 字")
    return result


def safe_filename(filename: str | None) -> str:
    name = (filename or "").replace("\\", "/").split("/")[-1].strip()
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    if not name or len(name) > 150 or Path(name).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(422, "附件仅支持 PNG、JPG、WebP、PDF、CSV、XLSX，文件名不能超过 150 字")
    return name


def validate_attachment_content(filename: str, content: bytes) -> None:
    extension = Path(filename).suffix.lower()
    valid = {
        ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": content.startswith(b"\xff\xd8\xff"),
        ".jpeg": content.startswith(b"\xff\xd8\xff"),
        ".webp": content[:4] == b"RIFF" and content[8:12] == b"WEBP",
        ".pdf": content.startswith(b"%PDF-"),
    }.get(extension)
    if extension == ".xlsx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as workbook:
                names = set(workbook.namelist())
                valid = "[Content_Types].xml" in names and "xl/workbook.xml" in names
        except (zipfile.BadZipFile, OSError):
            valid = False
    if extension == ".csv":
        try:
            content.decode("utf-8-sig")
            valid = True
        except UnicodeDecodeError:
            valid = False
    if not valid:
        raise HTTPException(422, f"附件 {filename} 的内容与文件格式不符")


def row_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def get_requirement(db: sqlite3.Connection, request_id: str) -> dict:
    if not re.fullmatch(r"[a-f0-9]{32}", request_id):
        raise HTTPException(404, "找不到需求")
    row = db.execute("SELECT * FROM requirements WHERE id=?", (request_id,)).fetchone()
    if not row:
        raise HTTPException(404, "找不到需求")
    return row_dict(row)


def require_requirement(request: Request, record: dict) -> None:
    user = auth.user_from_request(request)
    if auth.server_mode() and user["role"] != "admin" and record["requester_user_id"] != user["id"]:
        raise HTTPException(404, "找不到需求")


def tool_source(tool_id: str, require_available: bool = False) -> tuple[str, str, str]:
    from .main import TOOLS, SERVICES, DISABLED_TOOLS
    api_id = {"trend": "combined", "keywords": "recommend", "industry": "bubble"}.get(tool_id, tool_id)
    if tool_id not in TOOL_IDS:
        raise HTTPException(422, "所选工具不存在")
    if require_available and (api_id not in TOOLS or api_id in DISABLED_TOOLS):
        raise HTTPException(422, "该工具暂未开放权限申请")
    if api_id in TOOLS:
        service = TOOLS[api_id]["service"]
        return "xhs", SERVICES.get(service, {"name": "小红书内容端"})["name"], api_id
    platform, service = {"baidu": ("baidu", "百度指数"), "douyin": ("douyin", "抖音算数"),
                         "product": ("tmall", "生意参谋"), "shop": ("tmall", "生意参谋")}[tool_id]
    return platform, service, api_id


@router.post("")
async def create_requirement(
    request: Request,
    kind: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    expected_result: str = Form(""),
    platform: str = Form(""),
    service: str = Form(""),
    tool_id: str = Form(""),
    run_id: str = Form(""),
    source_location: str = Form(""),
    desired_data: str = Form(""),
    input_conditions: str = Form(""),
    usage_frequency: str = Form(""),
    needed_by: str = Form(""),
    attachments: list[UploadFile] | None = File(None),
) -> dict:
    local_only(request)
    user = auth.user_from_request(request)
    if auth.server_mode() and user["role"] == "admin":
        raise HTTPException(403, "管理员不能提交需求")
    if kind not in KINDS:
        raise HTTPException(422, "需求类型无效")
    values = {
        "kind": kind,
        "title": clean(title, "需求标题", 120, True),
        "platform": clean(platform, "平台", 50),
        "service": clean(service, "具体服务", 80),
        "tool_id": clean(tool_id, "工具", 30),
        "run_id": clean(run_id, "任务编号", 32),
        "contact": "",
        "description": clean(description, "发生了什么" if kind == "problem" else "需求描述", 4000, kind in {"enhancement", "problem"}),
        "source_location": clean(source_location, "数据位置", 1000),
        "desired_data": clean(desired_data, "需要的数据", 4000),
        "expected_result": clean(expected_result, "期望结果", 4000, kind in {"new_tool", "enhancement"}) if kind in {"new_tool", "enhancement"} else "",
        "input_conditions": clean(input_conditions, "输入条件", 2000),
        "usage_frequency": clean(usage_frequency, "使用频率", 80) if kind == "new_tool" else "",
        "needed_by": clean(needed_by, "期望完成日期", 10),
    }
    if values["tool_id"] and values["tool_id"] not in TOOL_IDS:
        raise HTTPException(422, "所选工具不存在")
    if values["run_id"] and not re.fullmatch(r"[a-f0-9]{32}", values["run_id"]):
        raise HTTPException(422, "任务编号格式无效")
    if values["needed_by"]:
        try:
            date.fromisoformat(values["needed_by"])
        except ValueError as exc:
            raise HTTPException(422, "期望完成日期格式无效") from exc
    if kind != "new_tool":
        if not values["tool_id"]:
            raise HTTPException(422, "请选择问题工具" if kind == "problem" else "请选择工具")
        values["platform"], values["service"], api_tool = tool_source(values["tool_id"], kind == "tool_access")
    if kind == "tool_access" and not auth.server_mode():
        raise HTTPException(409, "工具权限申请需要服务器模式")
    if kind != "problem":
        values["run_id"] = ""
    files = attachments or []
    if len(files) > MAX_FILES:
        raise HTTPException(422, f"最多上传 {MAX_FILES} 个附件")
    stored_files = []
    for upload in files:
        filename = safe_filename(upload.filename)
        content = await upload.read(MAX_FILE_BYTES + 1)
        if not content or len(content) > MAX_FILE_BYTES:
            raise HTTPException(422, "每个附件需小于 10 MB 且不能为空")
        validate_attachment_content(filename, content)
        stored_files.append((uuid.uuid4().hex, filename, "application/octet-stream", len(content), content))
    if kind == "new_tool":
        if not values["platform"] or not values["service"]:
            raise HTTPException(422, "请填写平台与具体服务")
        if not values["source_location"] and not any(Path(item[1]).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} for item in stored_files):
            raise HTTPException(422, "请填写页面路径／链接，或上传取数位置截图")
        if not values["desired_data"]:
            raise HTTPException(422, "请填写想获取的数据")
    request_id = uuid.uuid4().hex
    stamp = now()
    values.update(id=request_id, requester=user["email"] if auth.server_mode() else getpass.getuser(),
                  requester_user_id=user["id"] if auth.server_mode() else None,
                  status="submitted", status_note="", created_at=stamp, updated_at=stamp)
    init_db()
    with connection() as db:
        if kind == "tool_access":
            member = db.execute("SELECT status FROM users WHERE id=? FOR UPDATE", (user["id"],)).fetchone()
            if not member or member["status"] != "active":
                raise HTTPException(403, "当前用户不可申请权限")
            if db.execute("SELECT 1 FROM tool_permissions WHERE user_id=? AND tool_id=?", (user["id"], api_tool)).fetchone():
                raise HTTPException(409, "你已拥有该工具权限")
            if db.execute("""SELECT 1 FROM requirements WHERE requester_user_id=? AND kind='tool_access'
                AND tool_id=? AND status NOT IN ('done','declined')""", (user["id"], values["tool_id"])).fetchone():
                raise HTTPException(409, "该工具已有待处理的权限申请")
        db.execute("""INSERT INTO requirements
        (id,kind,title,platform,service,tool_id,run_id,contact,requester,requester_user_id,description,source_location,
        desired_data,expected_result,input_conditions,usage_frequency,needed_by,status,status_note,created_at,updated_at)
        VALUES (:id,:kind,:title,:platform,:service,:tool_id,:run_id,:contact,:requester,:requester_user_id,:description,:source_location,
        :desired_data,:expected_result,:input_conditions,:usage_frequency,:needed_by,:status,:status_note,:created_at,:updated_at)""", values)
        for attachment_id, filename, media_type, size, content in stored_files:
            db.execute("""INSERT INTO requirement_attachments
            (id,requirement_id,filename,media_type,size_bytes,content) VALUES (?,?,?,?,?,?)""",
            (attachment_id, request_id, filename, media_type, size, content))
        db.execute("INSERT INTO requirement_events(id,requirement_id,status,note,created_at) VALUES (?,?,?,?,?)",
                   (uuid.uuid4().hex, request_id, "submitted", "需求已提交", stamp))
    return {"id": request_id, "status": "submitted", "attachmentCount": len(stored_files)}


@router.get("")
def list_requirements(request: Request, kind: str = "", status: str = "") -> list[dict]:
    local_only(request)
    user = auth.user_from_request(request)
    init_db()
    clauses = []
    parameters: list[str] = []
    if auth.server_mode() and user["role"] != "admin":
        clauses.append("r.requester_user_id=?"); parameters.append(user["id"])
    if kind:
        if kind not in KINDS: raise HTTPException(422, "需求类型无效")
        clauses.append("r.kind=?"); parameters.append(kind)
    if status:
        if status not in STATUSES: raise HTTPException(422, "需求状态无效")
        clauses.append("r.status=?"); parameters.append(status)
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    order = "r.created_at DESC,r.id DESC" if auth.server_mode() else "r.created_at DESC,r.rowid DESC"
    with connection() as db:
        rows = db.execute(f"""SELECT r.id,r.kind,r.title,r.platform,r.service,r.tool_id,r.run_id,
            r.contact,r.requester,r.status,r.created_at,r.updated_at,
            (SELECT COUNT(*) FROM requirement_attachments a WHERE a.requirement_id=r.id) AS attachmentCount
            FROM requirements r {where} ORDER BY {order} LIMIT 200""", parameters).fetchall()
    return [row_dict(row) for row in rows]


@router.get("/{request_id}")
def requirement_detail(request_id: str, request: Request) -> dict:
    local_only(request)
    init_db()
    with connection() as db:
        result = get_requirement(db, request_id)
        require_requirement(request, result)
        result["attachments"] = [row_dict(row) for row in db.execute(
            "SELECT id,filename,size_bytes FROM requirement_attachments WHERE requirement_id=?", (request_id,)).fetchall()]
        event_order = "seq" if auth.server_mode() else "rowid"
        result["events"] = [row_dict(row) for row in db.execute(
            f"SELECT status,note,created_at FROM requirement_events WHERE requirement_id=? ORDER BY {event_order}", (request_id,)).fetchall()]
        result["comments"] = [row_dict(row) for row in db.execute(
            f"SELECT author,content,created_at FROM requirement_comments WHERE requirement_id=? ORDER BY {event_order}", (request_id,)).fetchall()]
    return result


@router.get("/{request_id}/attachments/{attachment_id}")
def download_attachment(request_id: str, attachment_id: str, request: Request) -> Response:
    local_only(request)
    if not re.fullmatch(r"[a-f0-9]{32}", attachment_id):
        raise HTTPException(404, "找不到附件")
    init_db()
    with connection() as db:
        require_requirement(request, get_requirement(db, request_id))
        row = db.execute("SELECT filename,content FROM requirement_attachments WHERE id=? AND requirement_id=?",
                         (attachment_id, request_id)).fetchone()
    if not row: raise HTTPException(404, "找不到附件")
    return Response(row["content"], media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(row['filename'])}",
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


class StatusUpdate(BaseModel):
    status: str
    note: str = Field(default="", max_length=1000)


@router.patch("/{request_id}/status")
def change_status(request_id: str, payload: StatusUpdate, request: Request) -> dict:
    local_only(request)
    auth.admin_from_request(request)
    if payload.status not in STATUSES:
        raise HTTPException(422, "需求状态无效")
    init_db()
    stamp = now()
    note = payload.note.strip()
    with connection() as db:
        record = get_requirement(db, request_id)
        if record["kind"] == "tool_access" and payload.status in {"done", "declined"}:
            raise HTTPException(409, "请使用批准或拒绝操作处理权限申请")
        if record["kind"] == "tool_access" and record["status"] in {"done", "declined"}:
            raise HTTPException(409, "该权限申请已处理")
        db.execute("UPDATE requirements SET status=?,status_note=?,updated_at=? WHERE id=?",
                   (payload.status, note, stamp, request_id))
        db.execute("INSERT INTO requirement_events(id,requirement_id,status,note,created_at) VALUES (?,?,?,?,?)",
                   (uuid.uuid4().hex, request_id, payload.status, note, stamp))
    return {"id": request_id, "status": payload.status, "updated_at": stamp}


class PermissionDecision(BaseModel):
    approve: bool
    note: str = Field(default="", max_length=1000)


@router.post("/{request_id}/permission-decision")
def decide_permission(request_id: str, payload: PermissionDecision, request: Request) -> dict:
    local_only(request)
    actor = auth.admin_from_request(request)
    if not auth.server_mode():
        raise HTTPException(409, "工具权限申请需要服务器模式")
    stamp = now()
    with auth.db() as db:
        record = db.execute("SELECT * FROM requirements WHERE id=%s FOR UPDATE", (request_id,)).fetchone()
        if not record or record["kind"] != "tool_access":
            raise HTTPException(404, "找不到权限申请")
        if record["status"] in {"done", "declined"}:
            raise HTTPException(409, "该权限申请已处理")
        member = db.execute("SELECT id,status,role FROM users WHERE id=%s FOR UPDATE",
                            (record["requester_user_id"],)).fetchone()
        if payload.approve:
            _, _, api_tool = tool_source(record["tool_id"], True)
            if not member or member["status"] != "active" or member["role"] != "member":
                raise HTTPException(409, "申请人不是已启用的普通成员，不能开通权限")
            db.execute("INSERT INTO tool_permissions(user_id,tool_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                       (member["id"], api_tool))
            auth.audit(db, actor["id"], "approve_tool_access", "user", member["id"])
        status = "done" if payload.approve else "declined"
        note = ("已批准并开通工具权限" if payload.approve else "权限申请已拒绝")
        if payload.note.strip():
            note += "：" + payload.note.strip()
        db.execute("UPDATE requirements SET status=%s,status_note=%s,updated_at=%s WHERE id=%s",
                   (status, note, stamp, request_id))
        db.execute("INSERT INTO requirement_events(id,requirement_id,status,note,created_at) VALUES (%s,%s,%s,%s,%s)",
                   (uuid.uuid4().hex, request_id, status, note, stamp))
        auth.audit(db, actor["id"], "approve" if payload.approve else "decline", "tool_access_request", request_id)
    return {"id": request_id, "status": status, "updated_at": stamp}


class CommentInput(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


@router.post("/{request_id}/comments")
def add_comment(request_id: str, payload: CommentInput, request: Request) -> dict:
    local_only(request)
    user = auth.user_from_request(request)
    if auth.server_mode() and user["role"] != "admin":
        raise HTTPException(403, "仅管理员可处理需求")
    content = payload.content.strip()
    if not content: raise HTTPException(422, "请填写补充说明")
    init_db()
    stamp = now()
    with connection() as db:
        require_requirement(request, get_requirement(db, request_id))
        db.execute("INSERT INTO requirement_comments(id,requirement_id,author,content,created_at) VALUES (?,?,?,?,?)",
                   (uuid.uuid4().hex, request_id, user["email"] if auth.server_mode() else getpass.getuser(), content, stamp))
        db.execute("UPDATE requirements SET updated_at=? WHERE id=?", (stamp, request_id))
    return {"id": request_id, "created_at": stamp}
