"""Provision the first administrator from an authenticated server terminal."""
from __future__ import annotations

import argparse
import getpass
import sys

from . import auth


def main() -> int:
    parser = argparse.ArgumentParser(description="一次性初始化管理员；已有管理员时拒绝执行")
    parser.add_argument("--email", required=True, help="使用未注册的管理员邮箱")
    args = parser.parse_args()
    if not auth.server_mode():
        parser.error("管理员初始化仅支持服务器模式")
    if not sys.stdin.isatty():
        parser.error("需要交互终端；密码不接受命令参数、环境变量或管道输入")
    try:
        password = getpass.getpass("管理员密码（12～128 位）：")
        confirmation = getpass.getpass("再次输入密码：")
        if password != confirmation:
            raise ValueError("两次输入的密码不一致")
        auth.initialize()
        auth.create_initial_admin(args.email, password)
    except (ValueError, EOFError, KeyboardInterrupt) as exc:
        print(str(exc) or "初始化已取消", file=sys.stderr)
        return 1
    print("管理员已创建，请通过网页登录。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
