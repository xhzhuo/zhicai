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


### 首位管理员初始化（仅服务器终端）

公网注册接口始终只创建待审核的普通成员，不再按邮箱或空库状态创建管理员。已有管理员无需执行本节，也不会修改已有密码和权限。

新部署时先启动数据库及工作台，然后在服务器的交互终端执行：

```bash
cd /home/codex/zhicai
docker compose -f compose.yaml -f compose.public.yaml exec workbench python -m app.bootstrap_admin --email your-admin@example.com
```

按提示输入两次 12～128 位密码，输入不显示。密码不能放在命令参数、环境变量或管道里。需要使用未注册的邮箱；已经通过公网申请的账号不会被自动提权。

命令以事务锁保证并发初始化时最多创建一个管理员。已有任何管理员（包括已停用管理员）都会拒绝再次初始化；此命令不能用于重置密码或恢复账号。`ZHICAI_BOOTSTRAP_EMAIL` 不再生效。初始化写入 `bootstrap_admin` 审计事件。旧平台账号仍由现有启动迁移逻辑处理。

新增 `app.test_bootstrap` 回归测试。数据库部分会清理 public schema，必须只在独立测试容器、独立数据卷和 `ZHICAI_DB_NAME=zhicai_test` 下执行，并显式设置 `ZHICAI_TEST_ISOLATED=1`；不得连接正式数据库或挂载正式数据、凭据。


### 任务与资源保护（2026-10-18）

当前部署使用单个 Uvicorn 进程。所有采集入口共用有界调度：全局最多 4 个未结束任务（含执行中的任务），同时执行 1 个；每人最多 2 个未结束任务，每分钟最多成功提交 3 次。超出限制返回 HTTP 429 和重试提示，不创建新的任务文件。等待队列最长 30 分钟，取得执行槽后最多执行 15 分钟；超时记录原因并释放执行槽。账号 Cookie 导入、验证与采集共用浏览器执行槽，忙碌时返回 429，服务器上的平台浏览器在操作结束后关闭。

任务限制配置在 compose.yaml 的 ZHICAI_MAX_TASKS、ZHICAI_MAX_USER_TASKS、ZHICAI_SUBMISSIONS_PER_MINUTE、ZHICAI_TASK_TIMEOUT_SECONDS、ZHICAI_QUEUE_TIMEOUT_SECONDS。当前调度和频率记录为进程内状态，重启会按既有规则结束中断任务，不会自动续跑。不得在未引入共享队列前增加 Uvicorn worker 或横向启动多个工作台实例。

新增 POST /api/runs/{run_id}/cancel，可取消本人任务，管理员可取消任意任务；仍需正常会话和 X-CSRF-Token。取消记录为失败或部分成功并附原因，不新增前端按钮。取消排队任务无需等待当前任务完成。超时与取消属于协作式中断；正在进行的底层网络读、同步文件生成和清理可能需要额外时间，容器内存及进程限制是最后一道边界。

持久化目录剩余空间低于 1 GiB 时拒绝新任务，执行开始和封面写入前再次检查；单任务封面原图总量最多 200 MiB。对应环境变量为 ZHICAI_MIN_FREE_MB、ZHICAI_MAX_OUTPUT_MB。封面原图落盘，Excel 使用不超过 600×600 的预览图，避免把全部原图同时保留并嵌入内存；原图仍随素材包提供。超过 1600 万像素的图片保留原图但不生成 Excel 预览。历史结果不自动删除。

工作台内存上限 640 MiB、CPU 上限 1 核、进程/线程上限 256，共享内存 128 MiB；数据库上限 256 MiB / 0.5 核 / 128 进程，网关上限 64 MiB / 0.25 核 / 64 进程。三项服务日志均配置轮转，每份 10 MiB、最多 3 份。本次配置仅适用于 zhicai，不调整 vcut。

隔离回归测试包括 app.test_task_control、app.test_main、app.test_requirements；不得挂载正式数据目录执行测试。小内存盘测试时可单独下调 ZHICAI_MIN_FREE_MB，正式部署保持 1024。


## 新增聚光工具（2026-10-19）

- **聚光广告组信息导出**：在工具中心选择该工具和团队聚光账号，可填写标准投广告组页面链接。留空时尝试从首页按菜单进入；页面与接口数量均校验一致后提供 Excel，广告组 ID 保持文本。
- **合作广场笔记采集**：选择团队聚光账号，下载筛选模板，在“筛选条件”工作表填写并启用任务，上传 `.xlsx` 后开始。可以勾选采集笔记评论；结果包含笔记、采集记录，以及可选的评论明细、评论采集记录和评论词云，情感分类使用原工具的本地词典规则。

管理员可直接使用，普通成员需在用户与权限中授予两个新工具的访问权限。任务运行在服务器，可关闭工作台页面后从运行记录查看；支持取消。整项任务最多执行 15 分钟，评论每篇最多等待 90 秒，建议先用少量笔记试跑。取消或超时前尚未生成的完整结果文件不能下载，应缩小范围重新运行。真实平台取数仍需用业务账号小批验证。
