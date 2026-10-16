"""Limit stateful endpoints to the local process and approved browser origins."""

from __future__ import annotations

import os

from fastapi import HTTPException, Request


LOCAL_ORIGINS = {"http://127.0.0.1:8765", "http://localhost:8765"}


def assert_loopback_request(request: Request, message: str) -> None:
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, message)

    allowed_origins = set(LOCAL_ORIGINS)
    if os.environ.get("ZHICAI_DEPLOYMENT") == "server":
        public_origin = os.environ.get("ZHICAI_PUBLIC_ORIGIN", "").strip().rstrip("/")
        if public_origin:
            allowed_origins.add(public_origin)
    origin = request.headers.get("origin")
    if origin and origin not in allowed_origins:
        raise HTTPException(403, "请求来源无效")
