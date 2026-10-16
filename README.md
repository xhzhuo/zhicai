# 智采 · 数据获取工作台

沿用 `demo/zhicai-workbench-v4.html` 的界面骨架、配色、导航、工具卡片、左右分栏和结果表格。当前接入参考目录中的两项实际平台能力：聚光关键词工具（推荐词、推荐词每日搜索量）和灵犀行业气泡图数据。其余工具卡片保留原位置并标明“尚未接入”，不会生成模拟结果。

每个已接入的工具页在工具切换栏下方有“平台取数位置”说明卡。未提供截图时显示待补充区域；对应截图放入 `app/static/tool-locations/` 后，刷新网页即可看到缩略图，点击可放大。文件名对应关系见该目录的 `README.md`。

左侧“需求中心”支持新增取数工具、改进现有工具和反馈运行问题。工具页的“对此工具提需求”会带入平台和工具；从运行记录反馈问题会带入工具与任务编号。用户填写需求后获得编号，可在“我的需求”查看状态和附件。需求与附件写入服务端 SQLite 数据库 `app/data/requirements.sqlite3`，不依赖浏览器本地存储；部署单台服务器时可用 `ZHICAI_REQUIREMENTS_DB` 指定持久化卷上的数据库路径。附件随数据库保存，单个最多 10 MB，每单最多 3 个。

## 启动

在本目录打开 PowerShell，运行：

```powershell
python -m pip install -r .\app\requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

浏览器打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。首次使用时进入“平台账号”，打开聚光或灵犀的登录窗口，在该窗口登录平台，再返回工作台验证连接。同一服务可以新增多个账号，各自使用独立的本机浏览器会话；工具页选择本次账号后配置参数、运行、预览和下载。请保持服务运行，关闭命令窗口会停止正在执行的任务。

平台账号也支持直接粘贴当前服务的 Cookie。此方式在后台使用无界面的 Edge，不弹出登录窗口；导入后仍需实际请求接口验证。账号列表只显示是否已配置；再次打开配置面板时，服务端会解密原文并回填 Cookie 输入框，可直接修改并保存。

本机需要已安装的 Microsoft Edge、Python 3.12，以及 Playwright、FastAPI、Uvicorn、openpyxl、cryptography。Playwright 使用本机 Edge，不需下载或制作新的浏览器程序。

## 实际工具与参数

| 页面 | 参考脚本 | 参数 | 输出 |
| --- | --- | --- | --- |
| 关键词推荐 | `启赋 by word.js` | 词根、推荐词包含词根 | 日期、词根、关键词、月搜索指数、词根内排名 CSV |
| 推荐词每日搜索量 | `启赋 combined.js` | 词根、开始/结束日期、包含词根筛选 | 去重后的关键词、日期、搜索量 CSV |
| 行业气泡图数据 | `fetch_bubble.js` | 行业名称和 code、日期、时间粒度、分析主体、X/Y/气泡大小指标、地域及对象 ID | 每个行业和 Y 轴指标一个工作表的 XLSX |

行业 code 来自灵犀“市场机会”页面请求中的 `taxonomyCodes`；没有 code 时不能运行该工具。日期和指标校验在服务端执行。采集请求使用登录窗口的浏览器会话，与参考脚本一样请求实际聚光/灵犀接口。平台返回错误、登录失效或部分请求失败时，会记录具体失败项；不会填充模拟值。

“验证连接”会用当前账号向对应平台发起一条固定的真实查询：聚光查询“品牌”的推荐词，灵犀查询“母婴奶粉”当月阅读量。只有接口返回预期结构才显示“已验证”；明确的 HTTP 401 才标为“登录失效”。网络、限频、无权访问该固定查询或响应格式变化会保留为“未验证”并显示错误，不能单凭它们判断 Cookie 过期。验证仅证明该次接口调用可用，不证明账号可访问所有行业或未来一直有效。

## 凭据存储与服务器准备

- Cookie 原文以每账号一份的加密文件放在 `app/data/credentials/`，不写入 `accounts.json`、网页本地存储或运行记录。配置页通过本机接口读取并回填；响应禁止缓存。
- 当前 Windows 本机模式用 Windows 用户级 DPAPI 保护密文。部署到服务器时设置 `ZHICAI_DEPLOYMENT=server`，并通过服务器密钥管理服务向进程注入 `ZHICAI_CREDENTIAL_KEYS`。密钥不能放进仓库或与密文一起部署。支持用逗号分隔的多把 Fernet 密钥：首把用于新加密，旧密钥用于解密和轮换。
- 从当前 Windows 本机迁移到服务器前，在原电脑注入服务器密钥，运行 `python -m app.credentials migrate`，把 DPAPI 文件重新加密。服务器模式使用临时的无界面浏览器上下文，从加密凭据加载 Cookie，不依赖 Windows 浏览器资料目录。
- 旧版只存入浏览器资料目录的 Cookie 会在首次打开配置页时尝试恢复为加密凭据；恢复的是当前浏览器会话里的 Cookie，未必与最初粘贴的文本完全相同。之后重新保存的 Cookie 会保留原文供回填。
- Windows 本机模式只允许本机访问；服务器模式已接入个人登录、团队授权和 Caddy HTTPS。

## 本地数据与边界

- 本机浏览器登录状态保存在 `app/data/browser-profiles/`；账号别名与连接状态保存在 `app/data/accounts.json`；运行参数与结果保存在 `app/data/runs/`。这些目录可能含敏感业务信息，请只放在有权限的本机目录，不要共享或提交到代码仓库。
- 服务只监听 `127.0.0.1:8765`。原版“权限配置”的布局和团队筛选入口保留，用来说明当前本机用户与已接入工具；本机模式不建立虚构成员或可绕过的授权开关。若之后需要多人使用，应先接入企业身份和服务端权限控制。
- 已完成静态检查、本地接口/文件测试，以及在正常本机权限下打开 Edge 登录窗口的验证。当前尚无已登录的小红书会话，因此还未验证在线接口返回和真实结果文件；首次运行请先用少量词根或一个行业检查接口是否仍与参考脚本一致。

运行本地测试：

```powershell
python -m pip install -r .\app\requirements-test.txt
python -m unittest app.test_main app.test_requirements -v
```

## Linux Docker 部署

`Dockerfile` 从 AWS Public ECR 的 Docker 官方 Python 镜像安装 Python 3.12、项目依赖和与 Playwright 包匹配的 Chromium；`compose.yaml` 使用 Linux 主机网络，让应用继续只监听服务器的 `127.0.0.1:8765`。请先在服务器安装 Docker Engine 与 Compose 插件，再准备以下位于镜像外的文件：

- 持久化业务目录：包含历史 `accounts.json`、`runs/` 和 `credentials/`。新用户、账号与需求存 PostgreSQL；旧 `requirements.sqlite3` 仅保留迁移前备份。不要把 Windows 的 `browser-profiles/` 当作 Linux 登录会话使用。
- 凭据密钥文件：内容是 `ZHICAI_CREDENTIAL_KEYS` 所用的 Fernet 密钥，放在只有部署用户能进入的目录中。Compose 把它作为 secret 挂载到容器的 `/run/secrets/credential_keys`；密钥文件不能提交到 Git。
- 项目根目录的 `.env`：只写主机上的绝对路径，例如 `ZHICAI_DATA_DIR`、`ZHICAI_DB_DIR`、`ZHICAI_CREDENTIAL_KEYS_PATH` 和 `ZHICAI_DB_PASSWORD_PATH`。不要在这个文件中写密码或密钥本身。
- 如服务器到 PyPI 官方文件站下载超时，可在 `.env` 设置 `ZHICAI_PIP_INDEX_URL` 为组织认可的 PyPI 镜像地址；该值只用于构建镜像。
- 如容器内部到 Debian 官方软件源下载超时，可在 `.env` 设置 `ZHICAI_DEBIAN_MIRROR` 和 `ZHICAI_DEBIAN_SECURITY_MIRROR` 为可达的 Debian 镜像地址；APT 仍使用镜像内的 Debian 签名密钥校验软件包。

Windows DPAPI 加密的旧凭据不能直接在 Linux 解密。应先在原 Windows 用户下用服务器密钥运行 `python -m app.credentials migrate`，然后迁移新生成的 `fernet1:` 凭据文件；保留原始备份直到服务器验证成功。

在服务器项目根目录运行 `docker compose -f compose.yaml -f compose.public.yaml up -d --build database workbench public_gateway`，再用 `docker compose -f compose.yaml -f compose.public.yaml ps` 和日志检查状态。未启用公网代理时，可使用 `ssh -N -L 8765:127.0.0.1:8765 codex-zhicai-server` 建立隧道，然后访问 `http://127.0.0.1:8765`。

### 公网 IP 多用户访问

当前入口为 `https://119.3.124.39/`。Caddy 提供有效 HTTPS 和 HTTP 跳转，应用使用个人邮箱与密码登录；旧共享 Basic Auth 已撤下。首位管理员 `admin@perform.net` 已注册。管理员先在“用户与权限”创建团队，成员注册时选择团队，审核通过后再配置其工具访问。新增平台账号按平台、服务名称和账号别名填写；服务名称可自定义，未接入采集的服务会明确标记。平台账号默认属于配置人的团队，同团队成员可使用，配置人及管理员均可维护 Cookie、验证、停用或删除；管理员可操作所有团队账号。已迁入的 4 个账号仍归管理员团队，需逐一分配。

行业竞争数据支持将行业名称与行业code保存为“常用行业”，同团队成员可复用；配置人或管理员可维护，数据保存在 PostgreSQL。工具页顶部与侧栏列出相同的平台工具目录。

服务器用户、团队、平台账号及新需求保存在 PostgreSQL 17.6；数据库只监听服务器 `127.0.0.1:5432`，持久化目录由 `ZHICAI_DB_DIR` 设置，密码由 `ZHICAI_DB_PASSWORD_PATH` 指向的受限文件提供。任务结果与加密平台凭据仍在 `ZHICAI_DATA_DIR`。登录密码采用 Argon2id 哈希；服务端会话最长 12 小时，闲置 30 分钟失效，修改类请求校验 CSRF。旧账号与凭据文件保留原编号，历史运行记录仍可由管理员查看。

正式界面顶部显示团队名称和邮箱；普通成员可看到全部工具卡片；未授权或未接入的工具不能运行。需求中心由管理员查看和处理，普通成员可提交需求，并在“我的需求”查看本人需求的状态和详情。成员所属团队在权限页只读展示；工具授权按平台列出全部八个工具。

隔离集成测试在专用 `zhicai_test` 数据库执行；`app/test_auth.py` 会清理该测试库的 public schema，**不得指向正式库运行**。当前没有自动备份，需定期备份 PostgreSQL、加密凭据、结果文件及 Caddy 状态并验证恢复。忘记密码自助恢复尚未接入邮件，已登录用户可在右上角“改密”。
