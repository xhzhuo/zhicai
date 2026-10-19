"""Fetch Xiaohongshu public note details using the standalone cover tool's strategy.

The original Windows tool first parses page metadata, then opens an ordinary
Chromium window when the static response contains no note images. On Linux the
window is backed by the installed Xvfb display.
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import re
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image
from playwright.async_api import async_playwright
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/152.0.0.0 Safari/537.36"
)
NOTE_HOSTS = {"www.xiaohongshu.com", "xiaohongshu.com", "xhslink.com"}
MAX_PAGE_BYTES = 20 * 1024 * 1024
MAX_IMAGE_BYTES = 12 * 1024 * 1024


class NoteFetchError(RuntimeError):
    """The page did not provide usable note data."""


@dataclass(frozen=True)
class NoteMetadata:
    title: str = ""
    author: str = ""
    content: str = ""
    image_urls: tuple[str, ...] = ()

    def score(self) -> int:
        return sum(bool(value) for value in (self.title, self.author, self.content, self.image_urls))


class PageMetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.page_title_parts: list[str] = []
        self.meta: list[tuple[str, str]] = []
        self.json_ld_blocks: list[str] = []
        self._in_title = False
        self._in_json_ld = False
        self._json_ld_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs}
        if tag.lower() == "title":
            self._in_title = True
        elif tag.lower() == "meta":
            key = values.get("property") or values.get("name")
            content = values.get("content")
            if key and content:
                self.meta.append((key, content))
        elif tag.lower() == "script" and (values.get("type") or "").lower() == "application/ld+json":
            self._in_json_ld = True
            self._json_ld_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False
        elif tag.lower() == "script" and self._in_json_ld:
            block = "".join(self._json_ld_parts).strip()
            if block:
                self.json_ld_blocks.append(block)
            self._in_json_ld = False
            self._json_ld_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.page_title_parts.append(data)
        if self._in_json_ld:
            self._json_ld_parts.append(data)


def iter_dicts(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_dicts(child)


def image_values(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        candidate = value.get("url") or value.get("contentUrl")
        return [candidate] if isinstance(candidate, str) else []
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(image_values(item))
        return result
    return []


def clean_title(title: str) -> str:
    title = re.sub(r"\s*[-|｜_]\s*小红书\s*$", "", title.strip())
    return "" if title in {"小红书", "小红书网页版"} else title


def clean_content(content: str) -> str:
    content = content.replace("\r\n", "\n").replace("\r", "\n").replace("\t", "\n")
    lines = [re.sub(r"[ \u3000]+", " ", line).strip() for line in content.splitlines()]
    return "\n".join(line for line in lines if line)


def author_name(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        name = value.get("name")
        return name.strip() if isinstance(name, str) else ""
    if isinstance(value, list):
        return "、".join(name for item in value if (name := author_name(item)))
    return ""


def embedded_nickname(page_html: str) -> str:
    patterns = (
        re.compile(r'"(?:nickname|nickName)"\s*:\s*"((?:\\.|[^"\\])*)"'),
        re.compile(r'\\"(?:nickname|nickName)\\"\s*:\s*\\"(.+?)(?<!\\)\\"'),
    )
    for pattern in patterns:
        match = pattern.search(page_html)
        if not match:
            continue
        raw_name = match.group(1)
        try:
            name = json.loads(f'"{raw_name}"')
        except json.JSONDecodeError:
            name = raw_name.replace('\\"', '"').replace("\\/", "/")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return ""


def trusted_image_url(value: str, page_url: str) -> str | None:
    candidate = urljoin(page_url, value.strip())
    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    if parsed.scheme == "http" and (host == "xhscdn.com" or host.endswith(".xhscdn.com")):
        candidate = "https://" + candidate.removeprefix("http://")
        parsed = urlparse(candidate)
    if parsed.scheme != "https" or not (
        host == "xhscdn.com" or host.endswith(".xhscdn.com")
        or host == "xiaohongshu.com" or host.endswith(".xiaohongshu.com")
    ):
        return None
    lowered = candidate.lower()
    if any(marker in lowered for marker in ("picasso-static", "favicon", "/logo")):
        return None
    return candidate


def parse_note_page(page_html: str, page_url: str) -> NoteMetadata:
    parser = PageMetadataParser()
    parser.feed(page_html)
    title = author = content = ""
    images: list[str] = []
    for block in parser.json_ld_blocks:
        try:
            payload = json.loads(block)
        except json.JSONDecodeError:
            continue
        for item in iter_dicts(payload):
            item_type = item.get("@type")
            types = item_type if isinstance(item_type, list) else [item_type]
            if any(kind in {"Article", "SocialMediaPosting", "NewsArticle"} for kind in types):
                if not title and isinstance(item.get("headline"), str):
                    title = item["headline"]
                if not author:
                    author = author_name(item.get("author"))
                if not content and isinstance(item.get("description"), str):
                    content = item["description"]
                images.extend(image_values(item.get("image")))

    og_titles: list[str] = []
    og_images: list[str] = []
    descriptions: list[str] = []
    authors: list[str] = []
    for key, value in parser.meta:
        lowered = key.lower()
        if lowered in {"og:title", "twitter:title"}:
            og_titles.append(value)
        elif lowered in {"og:image", "og:image:url", "twitter:image"}:
            og_images.append(value)
        elif lowered in {"description", "og:description", "twitter:description"}:
            descriptions.append(value)
        elif lowered in {"author", "article:author"}:
            authors.append(value)
    title = title or (og_titles[0] if og_titles else "") or "".join(parser.page_title_parts).strip()
    author = author or (authors[0].strip() if authors else "") or embedded_nickname(page_html)
    content = content or (descriptions[0] if descriptions else "")
    if not images:
        images = og_images

    normalized: list[str] = []
    seen: set[str] = set()
    for image_url in images + og_images:
        if not isinstance(image_url, str) or not image_url.strip():
            continue
        candidate = trusted_image_url(image_url, page_url)
        if candidate and candidate not in seen:
            normalized.append(candidate)
            seen.add(candidate)
    return NoteMetadata(clean_title(title), author, clean_content(content), tuple(normalized))


def build_session(retries: int = 0) -> requests.Session:
    session = requests.Session()
    retry = Retry(total=retries, connect=retries, read=retries, backoff_factor=0.8,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset({"GET"}))
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7"})
    return session


def fetch_note_http(session: requests.Session, page_url: str, deadline: float | None = None) -> NoteMetadata:
    deadline = deadline if deadline is not None else time.monotonic() + 10
    current_url = page_url
    for _ in range(6):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise NoteFetchError("笔记页面加载超时")
        with session.get(current_url, timeout=(min(5, remaining), min(5, remaining)), allow_redirects=False, stream=True) as response:
            if response.is_redirect or response.is_permanent_redirect:
                target = urljoin(current_url, response.headers.get("Location", ""))
                parsed = urlparse(target)
                if parsed.scheme != "https" or parsed.hostname not in NOTE_HOSTS:
                    raise NoteFetchError("笔记链接跳转到了非小红书页面")
                current_url = target
                continue
            response.raise_for_status()
            expected_size = int(response.headers.get("Content-Length", "0") or 0)
            if expected_size > MAX_PAGE_BYTES:
                raise NoteFetchError("笔记页面超过 20 MB")
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_content(64 * 1024):
                if time.monotonic() >= deadline:
                    raise NoteFetchError("笔记页面加载超时")
                size += len(chunk)
                if size > MAX_PAGE_BYTES:
                    raise NoteFetchError("笔记页面超过 20 MB")
                chunks.append(chunk)
            encoding = response.encoding or "utf-8"
            return parse_note_page(b"".join(chunks).decode(encoding, errors="replace"), current_url)
    raise NoteFetchError("笔记链接跳转次数过多")


def download_image(session: requests.Session, image_url: str, note_url: str, deadline: float | None = None) -> tuple[bytes, str]:
    candidate = trusted_image_url(image_url, note_url)
    if not candidate:
        raise NoteFetchError("页面返回的图片不是可用的小红书笔记封面")
    headers = {"Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "Referer": note_url}
    current_url = candidate
    for _ in range(6):
        remaining = deadline - time.monotonic() if deadline is not None else 20
        if remaining <= 0:
            raise NoteFetchError("封面下载超过单条时间上限")
        with session.get(current_url, headers=headers, timeout=(min(5, remaining), min(15, remaining)), allow_redirects=False, stream=True) as response:
            if response.is_redirect or response.is_permanent_redirect:
                redirected = trusted_image_url(response.headers.get("Location", ""), current_url)
                if not redirected:
                    raise NoteFetchError("封面图片跳转到了非小红书图片地址")
                current_url = redirected
                continue
            response.raise_for_status()
            if int(response.headers.get("Content-Length", "0") or 0) > MAX_IMAGE_BYTES:
                raise NoteFetchError("封面图片超过 12 MB")
            chunks: list[bytes] = []
            total = 0
            for chunk in response.iter_content(64 * 1024):
                if deadline is not None and time.monotonic() >= deadline:
                    raise NoteFetchError("封面下载超过单条时间上限")
                total += len(chunk)
                if total > MAX_IMAGE_BYTES:
                    raise NoteFetchError("封面图片超过 12 MB")
                chunks.append(chunk)
            data = b"".join(chunks)
            if not data:
                raise NoteFetchError("封面图片响应为空")
            try:
                with Image.open(io.BytesIO(data)) as image:
                    image.verify()
                    image_format = (image.format or "").upper()
            except Exception as exc:
                raise NoteFetchError("封面下载结果不是有效图片") from exc
            extension = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp",
                         "GIF": ".gif", "BMP": ".bmp"}.get(image_format, ".img")
            return data, extension
    raise NoteFetchError("封面图片跳转次数过多")


class VisibleBrowserFallback:
    """Run normal Chromium in the installed local Xvfb display for JS pages."""

    def __init__(self) -> None:
        self.display: str | None = None
        self.display_process: asyncio.subprocess.Process | None = None
        self.playwright = None
        self.browser = None
        self.page = None

    async def start(self) -> None:
        if self.page is not None:
            return
        if os.name != "nt":
            for number in range(100, 150):
                if not Path(f"/tmp/.X11-unix/X{number}").exists():
                    self.display = f":{number}"
                    break
            if self.display is None:
                raise NoteFetchError("服务器没有可用的浏览器显示端口")
            self.display_process = await asyncio.create_subprocess_exec(
                "/usr/bin/Xvfb", self.display, "-screen", "0", "1280x720x24", "-nolisten", "tcp",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            socket = Path(f"/tmp/.X11-unix/X{self.display[1:]}")
            for _ in range(30):
                if socket.exists():
                    break
                if self.display_process.returncode is not None:
                    raise NoteFetchError("服务器浏览器显示进程启动失败")
                await asyncio.sleep(0.2)
            else:
                raise NoteFetchError("服务器浏览器显示进程未就绪")
        self.playwright = await async_playwright().start()
        launch_options: dict[str, Any] = {"headless": False}
        if self.display:
            launch_options["env"] = {**os.environ, "DISPLAY": self.display}
        self.browser = await self.playwright.chromium.launch(**launch_options)
        context = await self.browser.new_context()
        self.page = await context.new_page()
        self.page.set_default_timeout(30000)

    async def _dismiss_login_overlay(self) -> None:
        for selector in ("button.close-icon", ".login-container .close-button", ".login-container [class*='close']"):
            locator = self.page.locator(selector)
            for index in range(min(await locator.count(), 5)):
                candidate = locator.nth(index)
                try:
                    if await candidate.is_visible():
                        await candidate.click(timeout=3000)
                        await self.page.wait_for_timeout(500)
                        return
                except Exception:
                    continue

    async def fetch(self, page_url: str) -> NoteMetadata:
        await self.start()
        best = NoteMetadata()
        for attempt in range(2):
            try:
                await self.page.goto(page_url, wait_until="domcontentloaded", timeout=8000)
            except Exception:
                if attempt:
                    break
            if urlparse(self.page.url).hostname not in NOTE_HOSTS:
                raise NoteFetchError("浏览器跳转到了非小红书页面")
            await self._dismiss_login_overlay()
            deadline = asyncio.get_running_loop().time() + 12
            while asyncio.get_running_loop().time() < deadline:
                found = parse_note_page(await self.page.content(), page_url)
                if found.score() > best.score():
                    best = found
                if found.score() == 4:
                    return found
                await self.page.wait_for_timeout(500)
        if best.score():
            return best
        raise NoteFetchError("未登录浏览器没有返回笔记详情或封面")

    async def close(self) -> None:
        try:
            if self.browser is not None:
                await self.browser.close()
            if self.playwright is not None:
                await self.playwright.stop()
        finally:
            if self.display_process is not None and self.display_process.returncode is None:
                self.display_process.terminate()
                try:
                    await asyncio.wait_for(self.display_process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    self.display_process.kill()
                    await self.display_process.wait()
            self.page = None
            self.browser = None
            self.playwright = None
            self.display_process = None
