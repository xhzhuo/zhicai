"""Team-scoped saved industry name/code pairs for the Lingxi tool."""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from . import auth
from .access import assert_loopback_request

router = APIRouter(prefix="/api/industry-presets", tags=["industry-presets"])
CODE_RE = re.compile(r"[a-zA-Z0-9_-]{8,80}")


class IndustryPresetInput(BaseModel):
    name: str
    code: str


def scope(request: Request) -> dict:
    assert_loopback_request(request, "当前只允许本机访问行业配置")
    user = auth.require_tool(request, "bubble")
    if not auth.server_mode():
        raise HTTPException(409, "行业配置需要服务器模式")
    return user


def validated(payload: IndustryPresetInput) -> tuple[str, str]:
    name, code = payload.name.strip(), payload.code.strip()
    if not 1 <= len(name) <= 40:
        raise HTTPException(422, "行业名称需要 1～40 字")
    if not CODE_RE.fullmatch(code):
        raise HTTPException(422, "行业 code 需为 8～80 位字母、数字、下划线或连字符")
    return name, code


def row_out(row: dict, user: dict) -> dict:
    return {"id": row["id"], "name": row["name"], "code": row["code"],
            "editable": user["role"] == "admin" or row["owner_user_id"] == user["id"]}


@router.get("")
def list_presets(request: Request) -> list[dict]:
    user = scope(request)
    with auth.db() as db:
        rows = db.execute("""SELECT id,name,code,owner_user_id FROM industry_presets
            WHERE team_id=%s ORDER BY name,code""", (user["team_id"],)).fetchall()
    return [row_out(row, user) for row in rows]


@router.post("", status_code=201)
def create_preset(payload: IndustryPresetInput, request: Request) -> dict:
    user = scope(request)
    name, code = validated(payload)
    preset_id = uuid.uuid4().hex
    with auth.db() as db:
        row = db.execute("""INSERT INTO industry_presets(id,team_id,owner_user_id,name,code)
            VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING
            RETURNING id,name,code,owner_user_id""",
            (preset_id, user["team_id"], user["id"], name, code)).fetchone()
        if row is None:
            raise HTTPException(409, "该行业名称或 code 已保存")
        auth.audit(db, user["id"], "create", "industry_preset", preset_id)
    return row_out(row, user)


@router.patch("/{preset_id}")
def update_preset(preset_id: str, payload: IndustryPresetInput, request: Request) -> dict:
    user = scope(request)
    name, code = validated(payload)
    with auth.db() as db:
        current = db.execute("""SELECT owner_user_id FROM industry_presets
            WHERE id=%s AND team_id=%s FOR UPDATE""",
            (preset_id, user["team_id"])).fetchone()
        if current is None:
            raise HTTPException(404, "行业配置不存在")
        if user["role"] != "admin" and current["owner_user_id"] != user["id"]:
            raise HTTPException(403, "只有配置人或管理员可以修改")
        duplicate = db.execute("""SELECT 1 FROM industry_presets WHERE team_id=%s
            AND id<>%s AND (name=%s OR code=%s)""",
            (user["team_id"], preset_id, name, code)).fetchone()
        if duplicate:
            raise HTTPException(409, "该行业名称或 code 已保存")
        row = db.execute("""UPDATE industry_presets SET name=%s,code=%s WHERE id=%s
            RETURNING id,name,code,owner_user_id""", (name, code, preset_id)).fetchone()
        auth.audit(db, user["id"], "update", "industry_preset", preset_id)
    return row_out(row, user)


@router.delete("/{preset_id}")
def delete_preset(preset_id: str, request: Request) -> dict:
    user = scope(request)
    with auth.db() as db:
        current = db.execute("""SELECT owner_user_id FROM industry_presets
            WHERE id=%s AND team_id=%s FOR UPDATE""",
            (preset_id, user["team_id"])).fetchone()
        if current is None:
            raise HTTPException(404, "行业配置不存在")
        if user["role"] != "admin" and current["owner_user_id"] != user["id"]:
            raise HTTPException(403, "只有配置人或管理员可以删除")
        db.execute("DELETE FROM industry_presets WHERE id=%s", (preset_id,))
        auth.audit(db, user["id"], "delete", "industry_preset", preset_id)
    return {"id": preset_id}
