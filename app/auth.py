"""Server-side users, teams, sessions and authorization for the public workbench."""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .access import assert_loopback_request


router = APIRouter(prefix="/api/auth", tags=["auth"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])
PASSWORDS = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
COOKIE_NAME = "__Host-zhicai_session"
TOOLS = {"recommend", "combined", "bubble", "notes", "adgroups", "plaza", "content"}
EMAIL_RE = re.compile(r"^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$")


def server_mode() -> bool:
    return os.environ.get("ZHICAI_DEPLOYMENT", "local") == "server"


@contextmanager
def db():
    import psycopg
    from psycopg.rows import dict_row

    password_file = os.environ.get("ZHICAI_DB_PASSWORD_FILE", "")
    if not password_file:
        raise RuntimeError("缺少数据库密码文件配置")
    password = Path(password_file).read_text(encoding="utf-8").strip()
    with psycopg.connect(host=os.environ.get("ZHICAI_DB_HOST", "127.0.0.1"),
                         port=int(os.environ.get("ZHICAI_DB_PORT", "5432")),
                         dbname=os.environ.get("ZHICAI_DB_NAME", "zhicai"),
                         user=os.environ.get("ZHICAI_DB_USER", "zhicai"),
                         password=password, row_factory=dict_row, connect_timeout=5) as conn:
        yield conn


def initialize() -> None:
    if not server_mode():
        return
    with db() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS teams (
          id text PRIMARY KEY, name text NOT NULL UNIQUE, selectable boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
          team_id text REFERENCES teams(id), requested_team_id text REFERENCES teams(id),
          role text NOT NULL CHECK (role IN ('admin','member')),
          status text NOT NULL CHECK (status IN ('pending','active','disabled','rejected')),
          created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz);
        CREATE TABLE IF NOT EXISTS tool_permissions (
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tool_id text NOT NULL, PRIMARY KEY(user_id,tool_id));
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf_token text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          last_seen timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS auth_throttle (
          key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL);
        CREATE TABLE IF NOT EXISTS platform_accounts (
          id text PRIMARY KEY, team_id text NOT NULL REFERENCES teams(id),
          owner_user_id text NOT NULL REFERENCES users(id), data jsonb NOT NULL,
          deleted_at timestamptz);
        CREATE INDEX IF NOT EXISTS idx_accounts_team ON platform_accounts(team_id) WHERE deleted_at IS NULL;
        CREATE TABLE IF NOT EXISTS industry_presets (
          id text PRIMARY KEY, team_id text NOT NULL REFERENCES teams(id),
          owner_user_id text NOT NULL REFERENCES users(id),
          name text NOT NULL, code text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(team_id,name), UNIQUE(team_id,code));
        CREATE TABLE IF NOT EXISTS audit_events (
          id bigserial PRIMARY KEY, actor_user_id text REFERENCES users(id),
          action text NOT NULL, object_type text NOT NULL, object_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now());
        """)
        conn.execute("INSERT INTO teams(id,name,selectable) VALUES ('bootstrap','管理员团队',false) ON CONFLICT DO NOTHING")
        first_admin = conn.execute("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").fetchone()
    if first_admin and os.environ.get("ZHICAI_IMPORT_LEGACY", "1") == "1":
        import_legacy_accounts(first_admin["id"])


def audit(conn, user_id: str | None, action: str, kind: str, object_id: str) -> None:
    conn.execute("INSERT INTO audit_events(actor_user_id,action,object_type,object_id) VALUES (%s,%s,%s,%s)",
                 (user_id, action, kind, object_id))


def user_from_request(request: Request) -> dict:
    if not server_mode():
        return {"id": "local", "email": "local", "team_id": "local", "role": "admin", "status": "active"}
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "请先登录")
    return user


def admin_from_request(request: Request) -> dict:
    user = user_from_request(request)
    if user["role"] != "admin":
        raise HTTPException(403, "仅管理员可操作")
    return user


def allowed_tool(user: dict, tool: str) -> bool:
    if not server_mode():
        return True
    if user["role"] == "admin":
        return True
    with db() as conn:
        return conn.execute("SELECT 1 FROM tool_permissions WHERE user_id=%s AND tool_id=%s",
                            (user["id"], tool)).fetchone() is not None


def require_tool(request: Request, tool: str) -> dict:
    user = user_from_request(request)
    if not allowed_tool(user, tool):
        raise HTTPException(403, "没有此工具的访问权限")
    return user


def account_visible(user: dict, account: dict) -> bool:
    return not server_mode() or user["role"] == "admin" or account.get("teamId") == user["team_id"] or account.get("ownerUserId") == user["id"]


def require_account(request: Request, account: dict, edit: bool = False) -> dict:
    user = user_from_request(request)
    if edit:
        if server_mode() and (account.get("ownerUserId") != user["id"] or
                              (account.get("teamId") != user["team_id"] and user["role"] != "admin")):
            raise HTTPException(403, "只有账号配置人可以修改此账号")
    elif not account_visible(user, account):
        raise HTTPException(404, "平台账号不存在")
    return user


def account_rows() -> list[dict]:
    with db() as conn:
        rows = conn.execute("""SELECT a.id,a.data,a.team_id,a.owner_user_id,
            t.name AS team_name,u.email AS owner_email FROM platform_accounts a
            JOIN teams t ON t.id=a.team_id JOIN users u ON u.id=a.owner_user_id
            WHERE a.deleted_at IS NULL ORDER BY a.id""").fetchall()
    return [{**row["data"], "teamId": row["team_id"], "teamName": row["team_name"],
             "ownerUserId": row["owner_user_id"], "ownerEmail": row["owner_email"]} for row in rows]


def save_account(account: dict) -> None:
    from psycopg.types.json import Jsonb
    data = {k: v for k, v in account.items() if k not in ("teamId", "teamName", "ownerUserId", "ownerEmail")}
    with db() as conn:
        conn.execute("""UPDATE platform_accounts SET data=%s WHERE id=%s AND deleted_at IS NULL""",
                     (Jsonb(data), account["id"]))


def add_account(account: dict, user: dict) -> None:
    from psycopg.types.json import Jsonb
    with db() as conn:
        conn.execute("INSERT INTO platform_accounts(id,team_id,owner_user_id,data) VALUES (%s,%s,%s,%s)",
                     (account["id"], user["team_id"], user["id"], Jsonb(account)))
        audit(conn, user["id"], "create", "account", account["id"])


def update_account(account_id: str, changes: dict, actor_id: str | None = None) -> dict:
    from psycopg.types.json import Jsonb
    with db() as conn:
        row = conn.execute("SELECT data FROM platform_accounts WHERE id=%s AND deleted_at IS NULL FOR UPDATE",
                           (account_id,)).fetchone()
        if not row:
            raise HTTPException(404, "平台账号不存在")
        data = dict(row["data"])
        data.update(changes)
        conn.execute("UPDATE platform_accounts SET data=%s WHERE id=%s", (Jsonb(data), account_id))
        if actor_id:
            audit(conn, actor_id, "update", "account", account_id)
    return next(a for a in account_rows() if a["id"] == account_id)


def delete_account(account_id: str, actor_id: str) -> None:
    with db() as conn:
        row = conn.execute("UPDATE platform_accounts SET deleted_at=now() WHERE id=%s AND deleted_at IS NULL RETURNING id",
                           (account_id,)).fetchone()
        if not row:
            raise HTTPException(404, "平台账号不存在")
        audit(conn, actor_id, "delete", "account", account_id)


def move_account_team(account_id: str, team_id: str, actor_id: str) -> None:
    with db() as conn:
        if not conn.execute("SELECT 1 FROM teams WHERE id=%s AND selectable=true", (team_id,)).fetchone():
            raise HTTPException(422, "请选择有效团队")
        row = conn.execute("UPDATE platform_accounts SET team_id=%s WHERE id=%s AND deleted_at IS NULL RETURNING id",
                           (team_id, account_id)).fetchone()
        if not row:
            raise HTTPException(404, "平台账号不存在")
        audit(conn, actor_id, "move_team", "account", account_id)


def import_legacy_accounts(admin_id: str) -> int:
    import json
    from psycopg.types.json import Jsonb
    path = Path(__file__).resolve().parent / "data" / "accounts.json"
    if not path.exists() or os.environ.get("ZHICAI_IMPORT_LEGACY", "1") != "1":
        return 0
    accounts = json.loads(path.read_text(encoding="utf-8"))
    with db() as conn:
        if conn.execute("SELECT 1 FROM platform_accounts LIMIT 1").fetchone():
            return 0
        for account in accounts:
            conn.execute("INSERT INTO platform_accounts(id,team_id,owner_user_id,data) VALUES (%s,'bootstrap',%s,%s)",
                         (account["id"], admin_id, Jsonb(account)))
        audit(conn, admin_id, "import", "accounts", str(len(accounts)))
    return len(accounts)


def session_from_cookie(raw: str | None) -> tuple[dict | None, str | None]:
    if not raw:
        return None, None
    digest = hashlib.sha256(raw.encode("ascii", errors="ignore")).hexdigest()
    with db() as conn:
        row = conn.execute("""SELECT s.csrf_token,u.id,u.email,u.team_id,u.role,u.status
            FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=%s AND s.expires_at>now()
              AND s.last_seen>now()-interval '30 minutes' AND u.status='active'""",
                           (digest,)).fetchone()
        if row:
            conn.execute("UPDATE sessions SET last_seen=now() WHERE token_hash=%s AND last_seen<now()-interval '1 minute'",
                         (digest,))
    if not row:
        return None, None
    csrf = row.pop("csrf_token")
    return row, csrf


def check_csrf(request: Request) -> bool:
    expected = getattr(request.state, "csrf", None)
    supplied = request.headers.get("x-csrf-token", "")
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


class Registration(BaseModel):
    email: str
    password: str
    teamId: str = ""


class Login(BaseModel):
    email: str
    password: str


def throttle(key: str, limit: int = 8) -> None:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    with db() as conn:
        row = conn.execute("""INSERT INTO auth_throttle(key,attempts,window_start) VALUES (%s,1,now())
            ON CONFLICT(key) DO UPDATE SET
              attempts=CASE WHEN auth_throttle.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_throttle.attempts+1 END,
              window_start=CASE WHEN auth_throttle.window_start<now()-interval '15 minutes' THEN now() ELSE auth_throttle.window_start END
            RETURNING attempts""", (digest,)).fetchone()
    if row["attempts"] > limit:
        raise HTTPException(429, "尝试次数过多，请稍后重试")


@router.get("/teams")
def public_teams() -> list[dict]:
    if not server_mode():
        return []
    with db() as conn:
        return conn.execute("SELECT id,name FROM teams WHERE selectable=true ORDER BY name").fetchall()


@router.post("/register")
def register(payload: Registration, request: Request) -> dict:
    assert_loopback_request(request, "注册请求来源无效")
    if not server_mode():
        raise HTTPException(404, "本机模式无需注册")
    throttle("register:" + (request.client.host if request.client else ""), 15)
    email = payload.email.strip().lower()
    if not EMAIL_RE.fullmatch(email) or len(payload.password) < 12 or len(payload.password) > 128:
        raise HTTPException(422, "请填写有效邮箱和 12～128 位密码")
    with db() as conn:
        team = conn.execute("SELECT id FROM teams WHERE id=%s AND selectable=true FOR SHARE", (payload.teamId,)).fetchone()
        if not team:
            raise HTTPException(422, "请选择有效团队")
        if conn.execute("SELECT 1 FROM users WHERE email=%s", (email,)).fetchone():
            return {"message": "申请已提交；如需开通，请联系管理员。"}
        user_id = uuid.uuid4().hex
        conn.execute("""INSERT INTO users(id,email,password_hash,team_id,requested_team_id,role,status)
            VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                     (user_id, email, PASSWORDS.hash(payload.password), None,
                      payload.teamId, "member", "pending"))
        audit(conn, user_id, "register", "user", user_id)
    return {"message": "申请已提交；审核通过后即可登录。"}


def create_initial_admin(email: str, password: str) -> str:
    """Server-side provisioning only; never promote an existing public applicant."""
    if not server_mode():
        raise ValueError("管理员初始化仅支持服务器模式")
    email = email.strip().lower()
    if not EMAIL_RE.fullmatch(email) or not 12 <= len(password) <= 128:
        raise ValueError("请填写有效邮箱和 12～128 位密码")
    password_hash = PASSWORDS.hash(password)
    with db() as conn:
        # Serialize initializers and public registrations in the same transaction.
        conn.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE")
        if conn.execute("SELECT 1 FROM users WHERE role='admin' LIMIT 1").fetchone():
            raise ValueError("已有管理员，拒绝重复初始化")
        if conn.execute("SELECT 1 FROM users WHERE email=%s", (email,)).fetchone():
            raise ValueError("此邮箱已有账号，请使用未注册的管理员邮箱；不会自动提升现有账号权限")
        user_id = uuid.uuid4().hex
        conn.execute("""INSERT INTO users(id,email,password_hash,team_id,role,status,approved_at)
            VALUES (%s,%s,%s,'bootstrap','admin','active',now())""",
                     (user_id, email, password_hash))
        audit(conn, user_id, "bootstrap_admin", "user", user_id)
    return user_id


@router.post("/login")
def login(payload: Login, request: Request, response: Response) -> dict:
    assert_loopback_request(request, "登录请求来源无效")
    if not server_mode():
        raise HTTPException(404, "本机模式无需登录")
    email = payload.email.strip().lower()
    throttle_key = "login:" + email + ":" + (request.client.host if request.client else "")
    throttle(throttle_key)
    with db() as conn:
        user = conn.execute("SELECT id,email,password_hash,team_id,role,status FROM users WHERE email=%s", (email,)).fetchone()
    try:
        valid = bool(user and PASSWORDS.verify(user["password_hash"], payload.password))
    except (VerifyMismatchError, VerificationError):
        valid = False
    if not valid:
        raise HTTPException(401, "邮箱或密码不正确")
    if user["status"] != "active":
        raise HTTPException(403, "账号待审核或已停用")
    raw = secrets.token_urlsafe(40)
    csrf = secrets.token_urlsafe(32)
    with db() as conn:
        conn.execute("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES (%s,%s,%s,now()+interval '12 hours')",
                     (hashlib.sha256(raw.encode()).hexdigest(), user["id"], csrf))
        conn.execute("DELETE FROM auth_throttle WHERE key=%s", (hashlib.sha256(throttle_key.encode()).hexdigest(),))
        audit(conn, user["id"], "login", "user", user["id"])
    response.set_cookie(COOKIE_NAME, raw, max_age=43200, secure=True, httponly=True,
                        samesite="strict", path="/")
    return {"email": user["email"], "role": user["role"], "csrfToken": csrf}


@router.get("/me")
def me(request: Request) -> dict:
    user = user_from_request(request)
    with db() as conn:
        team = conn.execute("SELECT name FROM teams WHERE id=%s", (user["team_id"],)).fetchone()
        grants = [r["tool_id"] for r in conn.execute("SELECT tool_id FROM tool_permissions WHERE user_id=%s", (user["id"],)).fetchall()]
    return {"id": user["id"], "email": user["email"], "teamId": user["team_id"],
            "teamName": team["name"] if team else "", "role": user["role"],
            "tools": list(TOOLS) if user["role"] == "admin" else grants,
            "csrfToken": getattr(request.state, "csrf", "")}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    user = user_from_request(request)
    raw = request.cookies.get(COOKIE_NAME, "")
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash=%s", (hashlib.sha256(raw.encode()).hexdigest(),))
        audit(conn, user["id"], "logout", "user", user["id"])
    response.delete_cookie(COOKIE_NAME, path="/", secure=True, httponly=True, samesite="strict")
    return {"message": "已退出登录"}


class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: str


@router.post("/change-password")
def change_password(payload: PasswordChange, request: Request, response: Response) -> dict:
    user = user_from_request(request)
    if len(payload.newPassword) < 12 or len(payload.newPassword) > 128:
        raise HTTPException(422, "新密码需要 12～128 位")
    with db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id=%s FOR UPDATE", (user["id"],)).fetchone()
        try:
            valid = PASSWORDS.verify(row["password_hash"], payload.currentPassword)
        except (VerifyMismatchError, VerificationError):
            valid = False
        if not valid:
            raise HTTPException(403, "当前密码不正确")
        conn.execute("UPDATE users SET password_hash=%s WHERE id=%s",
                     (PASSWORDS.hash(payload.newPassword), user["id"]))
        conn.execute("DELETE FROM sessions WHERE user_id=%s", (user["id"],))
        audit(conn, user["id"], "change_password", "user", user["id"])
    response.delete_cookie(COOKIE_NAME, path="/", secure=True, httponly=True, samesite="strict")
    return {"message": "密码已更新，请重新登录"}


class TeamInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    selectable: bool | None = None


def team_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise HTTPException(422, "请填写团队名称")
    return name


@admin_router.get("/teams")
def admin_teams(request: Request) -> list[dict]:
    admin_from_request(request)
    with db() as conn:
        return conn.execute("""
            SELECT t.id,t.name,t.selectable,
              (t.id='bootstrap') AS protected,
              (SELECT count(*) FROM users u WHERE u.team_id=t.id) AS member_count,
              (SELECT count(*) FROM users u WHERE u.requested_team_id=t.id
                 AND u.status='pending') AS pending_count,
              (SELECT count(*) FROM platform_accounts a WHERE a.team_id=t.id
                 AND a.deleted_at IS NULL) AS account_count,
              (NOT EXISTS(SELECT 1 FROM users u WHERE u.team_id=t.id OR u.requested_team_id=t.id)
               AND NOT EXISTS(SELECT 1 FROM platform_accounts a WHERE a.team_id=t.id)
               AND NOT EXISTS(SELECT 1 FROM industry_presets i WHERE i.team_id=t.id)
               AND t.id<>'bootstrap') AS deletable
            FROM teams t ORDER BY t.created_at
        """).fetchall()


@admin_router.post("/teams")
def create_team(payload: TeamInput, request: Request) -> dict:
    admin = admin_from_request(request)
    name = team_name(payload.name)
    team_id = uuid.uuid4().hex
    with db() as conn:
        conn.execute("LOCK TABLE teams IN SHARE ROW EXCLUSIVE MODE")
        if conn.execute("SELECT 1 FROM teams WHERE lower(name)=lower(%s)", (name,)).fetchone():
            raise HTTPException(409, "团队名称已存在")
        conn.execute("INSERT INTO teams(id,name) VALUES (%s,%s)", (team_id, name))
        audit(conn, admin["id"], "create", "team", team_id)
    return {"id": team_id, "name": name}


@admin_router.patch("/teams/{team_id}")
def update_team(team_id: str, payload: TeamUpdate, request: Request) -> dict:
    admin = admin_from_request(request)
    if not payload.model_fields_set or any(getattr(payload, field) is None for field in payload.model_fields_set):
        raise HTTPException(422, "请提供团队名称或状态")
    name = team_name(payload.name) if payload.name is not None else None
    with db() as conn:
        conn.execute("LOCK TABLE teams IN SHARE ROW EXCLUSIVE MODE")
        row = conn.execute("SELECT id,name,selectable FROM teams WHERE id=%s FOR UPDATE", (team_id,)).fetchone()
        if not row:
            raise HTTPException(404, "团队不存在")
        if team_id == "bootstrap":
            raise HTTPException(409, "管理员团队为系统内置团队，不可修改")
        if name and conn.execute("SELECT 1 FROM teams WHERE id<>%s AND lower(name)=lower(%s)",
                                 (team_id, name)).fetchone():
            raise HTTPException(409, "团队名称已存在")
        updated = conn.execute("""UPDATE teams SET name=COALESCE(%s,name),
            selectable=COALESCE(%s,selectable) WHERE id=%s RETURNING id,name,selectable""",
            (name, payload.selectable, team_id)).fetchone()
        audit(conn, admin["id"], "update", "team", team_id)
    return updated


@admin_router.delete("/teams/{team_id}")
def delete_team(team_id: str, request: Request) -> dict:
    admin = admin_from_request(request)
    with db() as conn:
        row = conn.execute("SELECT id FROM teams WHERE id=%s FOR UPDATE", (team_id,)).fetchone()
        if not row:
            raise HTTPException(404, "团队不存在")
        if team_id == "bootstrap":
            raise HTTPException(409, "管理员团队不可删除")
        refs = conn.execute("""SELECT
            (SELECT count(*) FROM users WHERE team_id=%s OR requested_team_id=%s) AS members,
            (SELECT count(*) FROM platform_accounts WHERE team_id=%s) AS accounts,
            (SELECT count(*) FROM industry_presets WHERE team_id=%s) AS presets""",
            (team_id, team_id, team_id, team_id)).fetchone()
        if any(refs.values()):
            raise HTTPException(409, "团队存在成员、注册申请、平台账号或常用行业，不能删除")
        conn.execute("DELETE FROM teams WHERE id=%s", (team_id,))
        audit(conn, admin["id"], "delete", "team", team_id)
    return {"id": team_id}


@admin_router.get("/users")
def admin_users(request: Request) -> list[dict]:
    admin_from_request(request)
    with db() as conn:
        rows = conn.execute("""SELECT u.id,u.email,u.team_id,u.requested_team_id,u.role,u.status,
            t.name AS team_name,rt.name AS requested_team_name
            FROM users u LEFT JOIN teams t ON t.id=u.team_id
            LEFT JOIN teams rt ON rt.id=u.requested_team_id ORDER BY u.created_at DESC""").fetchall()
        for row in rows:
            row["tools"] = [r["tool_id"] for r in conn.execute(
                "SELECT tool_id FROM tool_permissions WHERE user_id=%s", (row["id"],)).fetchall()]
    return rows


class UserUpdate(BaseModel):
    status: str | None = None
    teamId: str | None = None
    tools: list[str] | None = None


@admin_router.patch("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, request: Request) -> dict:
    admin = admin_from_request(request)
    if payload.status is not None and payload.status not in {"active", "disabled", "rejected"}:
        raise HTTPException(422, "用户状态无效")
    if payload.tools is not None and any(tool not in TOOLS for tool in payload.tools):
        raise HTTPException(422, "工具编号无效")
    with db() as conn:
        row = conn.execute("SELECT id,role,status,team_id,requested_team_id FROM users WHERE id=%s FOR UPDATE", (user_id,)).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        if user_id == admin["id"] and payload.status in {"disabled", "rejected"}:
            raise HTTPException(409, "不能停用当前管理员")
        team_id = payload.teamId or row["team_id"] or row["requested_team_id"]
        if payload.status == "active" and not team_id:
            raise HTTPException(422, "批准前请指定团队")
        if team_id:
            team = conn.execute("SELECT selectable FROM teams WHERE id=%s FOR SHARE", (team_id,)).fetchone()
            joining = team_id != row["team_id"] or (row["status"] == "pending" and payload.status == "active")
            if not team or (joining and row["role"] != "admin" and not team["selectable"]):
                raise HTTPException(422, "团队不存在或已停用")
        if row["role"] == "admin" and payload.teamId and payload.teamId != row["team_id"]:
            raise HTTPException(409, "管理员团队不能在此修改")
        conn.execute("""UPDATE users SET status=COALESCE(%s,status),team_id=COALESCE(%s,team_id),
            approved_at=CASE WHEN %s='active' THEN now() ELSE approved_at END WHERE id=%s""",
                     (payload.status, payload.teamId or (team_id if payload.status == "active" else None), payload.status, user_id))
        if payload.status == "disabled" or (payload.teamId and payload.teamId != row["team_id"]):
            conn.execute("DELETE FROM sessions WHERE user_id=%s", (user_id,))
            conn.execute("""UPDATE platform_accounts SET data=jsonb_set(jsonb_set(data,'{disabled}','true'::jsonb),
                '{status}','\"disabled\"'::jsonb) WHERE owner_user_id=%s AND deleted_at IS NULL""", (user_id,))
        if payload.tools is not None:
            conn.execute("DELETE FROM tool_permissions WHERE user_id=%s", (user_id,))
            for tool in set(payload.tools):
                conn.execute("INSERT INTO tool_permissions(user_id,tool_id) VALUES (%s,%s)", (user_id, tool))
        audit(conn, admin["id"], "update", "user", user_id)
    return {"id": user_id, "status": payload.status or "unchanged"}
