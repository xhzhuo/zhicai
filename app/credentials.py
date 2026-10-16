"""Encrypted, per-account credential storage.

Server deployments inject ZHICAI_CREDENTIAL_KEYS from a secret manager. The
Windows-only local fallback uses DPAPI and is never selected in server mode.
"""
from __future__ import annotations

import os
import re
import sys
import uuid
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken, MultiFernet


class CredentialStorageError(RuntimeError):
    pass


class CredentialStore:
    def __init__(self, directory: Path):
        self.directory = directory

    def _path(self, account_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9-]{1,80}", account_id):
            raise CredentialStorageError("账号编号无效")
        return self.directory / f"{account_id}.enc"

    @staticmethod
    def _fernet() -> MultiFernet | None:
        key_file = os.environ.get("ZHICAI_CREDENTIAL_KEYS_FILE", "").strip()
        if key_file:
            try:
                raw_keys = Path(key_file).read_text(encoding="ascii").strip()
            except (OSError, UnicodeError) as exc:
                raise CredentialStorageError("无法读取服务器凭据密钥文件") from exc
        else:
            raw_keys = os.environ.get("ZHICAI_CREDENTIAL_KEYS", "").strip()
        if not raw_keys:
            return None
        try:
            keys = [Fernet(item.strip().encode("ascii")) for item in raw_keys.split(",") if item.strip()]
            if not keys:
                raise ValueError("empty key list")
            return MultiFernet(keys)
        except (ValueError, UnicodeError) as exc:
            raise CredentialStorageError("ZHICAI_CREDENTIAL_KEYS 格式无效") from exc

    def check_ready(self) -> None:
        if self._fernet():
            return
        if os.name == "nt" and os.environ.get("ZHICAI_DEPLOYMENT", "local") == "local":
            return
        raise CredentialStorageError("服务器部署需要配置 ZHICAI_CREDENTIAL_KEYS 或 ZHICAI_CREDENTIAL_KEYS_FILE")

    def save(self, account_id: str, content: str) -> None:
        if not content:
            raise CredentialStorageError("Cookie 内容为空")
        payload = content.encode("utf-8")
        self.check_ready()
        fernet = self._fernet()
        if fernet:
            encrypted = b"fernet1:" + fernet.encrypt(payload)
        elif os.name == "nt" and os.environ.get("ZHICAI_DEPLOYMENT", "local") == "local":
            import win32crypt

            encrypted = b"dpapi1:" + win32crypt.CryptProtectData(
                payload, "智采平台 Cookie", None, None, None, 0
            )
        else:
            raise CredentialStorageError("未配置可用的凭据加密方式")
        self.directory.mkdir(parents=True, exist_ok=True)
        if os.name != "nt":
            os.chmod(self.directory, 0o700)
        target = self._path(account_id)
        temporary = target.with_name(f"{account_id}.{uuid.uuid4().hex}.tmp")
        temporary.write_bytes(encrypted)
        if os.name != "nt":
            os.chmod(temporary, 0o600)
        temporary.replace(target)

    def load(self, account_id: str) -> str | None:
        target = self._path(account_id)
        if not target.exists():
            return None
        encrypted = target.read_bytes()
        try:
            if encrypted.startswith(b"fernet1:"):
                fernet = self._fernet()
                if not fernet:
                    raise CredentialStorageError("缺少服务器凭据解密密钥")
                payload = fernet.decrypt(encrypted.removeprefix(b"fernet1:"))
            elif encrypted.startswith(b"dpapi1:"):
                if os.environ.get("ZHICAI_DEPLOYMENT", "local") == "server":
                    raise CredentialStorageError("请先在原 Windows 电脑把 DPAPI 凭据迁移为服务器密钥加密")
                if os.name != "nt":
                    raise CredentialStorageError("此凭据由 Windows 本机保护，迁移前需要在原电脑重新加密")
                import win32crypt

                payload = win32crypt.CryptUnprotectData(
                    encrypted.removeprefix(b"dpapi1:"), None, None, None, 0
                )[1]
            else:
                raise CredentialStorageError("凭据文件格式不受支持")
            return payload.decode("utf-8")
        except CredentialStorageError:
            raise
        except (InvalidToken, UnicodeError, OSError) as exc:
            raise CredentialStorageError("凭据解密失败，请检查部署密钥") from exc

    def delete(self, account_id: str) -> None:
        self._path(account_id).unlink(missing_ok=True)

    def migrate_to_environment_key(self) -> int:
        """Re-encrypt local DPAPI files with the first injected server key."""
        fernet = self._fernet()
        if not fernet:
            raise CredentialStorageError("迁移需要先配置服务器凭据密钥")
        count = 0
        for target in self.directory.glob("*.enc"):
            if target.read_bytes().startswith(b"dpapi1:"):
                content = self.load(target.stem)
                if content is not None:
                    self.save(target.stem, content)
                    count += 1
        return count


if __name__ == "__main__":
    if sys.argv[1:] != ["migrate"]:
        raise SystemExit("用法：python -m app.credentials migrate")
    store = CredentialStore(Path(__file__).resolve().parent / "data" / "credentials")
    print(f"已迁移 {store.migrate_to_environment_key()} 个凭据文件")
