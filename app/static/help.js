/* Shared workbench instructions and tool-specific reading surfaces. */
(() => {
  'use strict';
  const helpContent = {
  "common-start": {
    "title": "首次使用",
    "summary": "第一次使用，从注册、选工具到下载结果，按顺序完成即可。",
    "icon": "spark",
    "chapters": [
      {
        "title": "先弄清楚要准备什么",
        "html": "<p>智采帮你从小红书等平台整理数据，再下载到电脑。你不用编写代码，按工具页面填写条件或上传文件即可。</p>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>准备项</th>\n<th>你需要做什么</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>智采登录账号</td>\n<td>用自己的邮箱注册并登录，不是小红书或广告平台账号。</td>\n</tr>\n<tr>\n<td>团队与工具权限</td>\n<td>注册时选择自己的团队，等待管理员审核并开通需要的工具。</td>\n</tr>\n<tr>\n<td>取数资料</td>\n<td>看工具要求准备词根、查询日期或 Excel 文件；先阅读对应工具的“开始前准备”和“每个选项怎么填”，需要查找编号时再看资料获取步骤。</td>\n</tr>\n<tr>\n<td>平台连接（部分工具需要）</td>\n<td>聚光、灵犀工具需要团队已有的可用连接。笔记封面与内容不需要这两类账号。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "注册后怎么进入工作台",
        "html": "<ol>\n<li>打开智采登录页，已有账号选“登录”，用注册邮箱和密码进入。第一次使用选“注册”，按页面填写邮箱、密码并选择正确的团队。</li>\n<li>提交注册后联系管理员审核，并说明自己需要哪些工具。如果没有可选团队，先联系管理员创建团队。</li>\n<li>审核并获得工具权限后重新登录，进入“工具中心”。标记“可用”代表功能已接入；你的账号是否能打开，还取决于个人权限。</li>\n<li>找到工具后先打开“使用说明”，按“开始前准备”和“每个选项怎么填”整理资料；行业编号等另有资料获取步骤，按需查看。</li>\n</ol>\n"
      },
      {
        "title": "照着做完第一次取数",
        "html": "<ol>\n<li>在“工具中心”找到目标工具，点击“配置采集”。</li>\n<li>需要账号时，在“使用账号”中选择对应客户；需要文件时，上传工具要求的 Excel。核对查询日期和必填项。</li>\n<li>第一次先用少量数据。只有工具提供试跑或文件检查时才选择这些方式，其他工具可先减少词根或缩短日期范围。</li>\n<li>点击“开始采集”，看到“等待运行”或“运行中”后，不要重复提交。</li>\n<li>结束后先看状态与失败明细，再下载文件。以后从“运行记录”点击“查看”，可以回到这次任务。</li>\n</ol>\n<p>例如：用笔记封面与内容工具时，可以先准备 3 条笔记清单，选择试跑前 3 条；这不代表所有工具都有“试跑”选项。</p>\n"
      },
      {
        "title": "卡住时先看这里",
        "html": "<h4>注册了但不能登录？</h4>\n<p>看页面是否提示智采个人登录账号待审核或已停用；请管理员核对该登录账号的状态。忘记密码时联系管理员，当前没有自助找回入口。</p>\n<h4>工具写着可用，但按钮显示未授权？</h4>\n<p>“可用”是功能状态，“未授权”是你的访问权限。请管理员开通该工具。</p>\n<h4>能打开工具但不能开始？</h4>\n<p>先看页面提示：可能缺少账号、文件或必填项。需要连接的工具可到“平台账号”核对，文件问题按提示修正后重新上传。</p>\n"
      }
    ]
  },
  "common-access": {
    "title": "账号、团队与工具权限",
    "summary": "分清自己的智采登录账号、所属团队和可以使用的工具。",
    "icon": "shield",
    "chapters": [
      {
        "title": "先分清两种账号",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>名称</th>\n<th>是什么</th>\n<th>什么时候用</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>智采登录账号</td>\n<td>你自己的邮箱和密码</td>\n<td>进入智采、找回自己的任务与需求。</td>\n</tr>\n<tr>\n<td>平台账号</td>\n<td>团队在智采中保存的聚光或灵犀连接，通常以别名显示</td>\n<td>工具中的“使用账号”下拉，用它决定去哪个客户或平台取数。</td>\n</tr>\n</tbody>\n</table></div>\n<p>“团队”是你在智采中的分组，不是广告平台里的客户。登录智采不等于已经登录聚光；同团队能共享平台连接，也不等于每个人都能用所有工具。</p>\n"
      },
      {
        "title": "普通成员需要做什么",
        "html": "<ol>\n<li>注册时选择自己的团队。不确定选哪个时，先向管理员确认，不要随意选其他团队。</li>\n<li>告诉管理员需要使用的工具名称，等待审核和授权。</li>\n<li>登录后进入工具，检查“使用账号”下拉中是否有正确的平台连接；没有时可进入“平台账号”自行新增并完成配置。</li>\n<li>改密码时点右上角“改密”，填写当前密码和至少 12 位的新密码，保存后重新登录。共用电脑使用完毕点“退出”。</li>\n</ol>\n<p>你可以在“平台账号”中自行新增聚光或灵犀账号，填写页面链接、保存 Cookie 并验证。自己新增的账号由自己维护；已有账号若没有“配置”按钮，不能直接修改，可按需新增自己有权使用的账号。</p>\n"
      },
      {
        "title": "遇到权限问题找谁",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>你看到的现象</th>\n<th>怎么处理</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>同事能用，我不能用</td>\n<td>联系管理员核对个人工具权限，不要借用同事的登录账号。</td>\n</tr>\n<tr>\n<td>工具尚未接入</td>\n<td>等待功能开放。</td>\n</tr>\n<tr>\n<td>智采个人登录账号待审核、被拒绝或已停用</td>\n<td>这是用邮箱登录智采的个人账号状态，请联系管理员核对。它与聚光、灵犀的平台连接不同，更新平台 Cookie 不能解决这类登录问题。</td>\n</tr>\n</tbody>\n</table></div>\n"
      }
    ]
  },
  "common-connections": {
    "title": "平台账号与连接状态",
    "summary": "先选对客户，再保存连接并验证；已有可用连接时，不必重复配置。",
    "icon": "link",
    "chapters": [
      {
        "title": "先看需不需要自己配置",
        "html": "<p>打开“平台账号”，查看团队已有的账号别名、所属团队、配置人和状态。如果已有正确客户的可用连接，直接在工具里选择即可，不必每人新增一份。</p>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>情况</th>\n<th>你的下一步</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>不需要聚光/灵犀账号的工具</td>\n<td>按工具要求上传资料，不必配置 Cookie。</td>\n</tr>\n<tr>\n<td>已有正确客户的已验证连接</td>\n<td>回到工具，在“使用账号”中选它。</td>\n</tr>\n<tr>\n<td>没有所需客户或平台连接</td>\n<td>点击“新增账号”，自行填写平台、服务、账号别名和所需连接信息，按下一节完成配置与验证。</td>\n</tr>\n<tr>\n<td>看到已有平台账号但没有配置按钮</td>\n<td>不能直接修改别人新增的账号。需要配置自己的连接时，可点击“新增账号”另行添加；已有连接仍可按当前权限使用。</td>\n</tr>\n</tbody>\n</table></div>\n<p>Cookie 可以理解为平台登录后识别你身份的一段文字。它不是登录密码，也不是行业 code；只能填在对应平台账号的 Cookie 框中。</p>\n"
      },
      {
        "title": "新增账号到验证成功",
        "html": "<ol>\n<li>点击“新增账号”，选择平台并填写具体服务，例如小红书下的聚光或灵犀。</li>\n<li>填写便于识别的“账号别名”。</li>\n<li>聚光账号还需填写目标客户内的完整“页面链接”。具体复制方法见下方“获取客户链接与 Cookie”。</li>\n<li>先保存账号，再打开“配置”，粘贴对应平台的 Cookie 并保存。</li>\n<li>点击“验证”，阅读返回提示。只有验证通过才说明本次连接检查成功；保存成功不代表验证通过。</li>\n<li>回到需要的工具，选择该账号，再进行小范围取数确认。</li>\n</ol>\n"
      },
      {
        "title": "获取客户链接与 Cookie",
        "html": "<p>Cookie 是平台登录后用于识别会话的一段文字，不是登录密码。请在自己有权使用的平台账号中获取，只粘贴到智采的账号配置框。</p>\n<ol>\n<li>\n<p>使用电脑上的 Chrome 或 Edge 登录对应平台：聚光为 ad.xiaohongshu.com，灵犀为 idea.xiaohongshu.com。聚光还需先跳转到要取数的客户账号。</p>\n</li>\n<li>\n<p>聚光的“页面链接”：确认页面客户名称正确后，复制地址栏完整网址；需要含 vSellerId=。如果没有，先进入客户内的工具或广告管理页面，再查看地址。不要复制合作伙伴的客户列表页。</p>\n<p><a href=\"/static/help-images/customer-page-link.png?v=078111b117be\" rel=\"noopener\" target=\"_blank\" title=\"点击查看原图\"><img alt=\"聚光客户页面链接：复制地址栏中包含 vSellerId 的完整网址\" loading=\"lazy\" src=\"/static/help-images/customer-page-link.png?v=078111b117be\"/></a></p>\n</li>\n<li>\n<p>在平台页面按 F12（或右键“检查”），进入 Network / 网络，选择 Fetch/XHR，再刷新页面或进行一次查询。</p>\n</li>\n<li>\n<p>点击刚产生、发往当前平台域名的业务请求，打开 Headers / 标头，在 Request Headers / 请求标头中找到 Cookie。不要复制 Response Headers / 响应标头里的 Set-Cookie。</p>\n<p><a href=\"/static/help-images/cookie-headers.png?v=9c051638ed19\" rel=\"noopener\" target=\"_blank\" title=\"点击查看原图\"><img alt=\"Cookie 获取位置：在 Network 请求的 Headers 中查找 Cookie 字段\" loading=\"lazy\" src=\"/static/help-images/cookie-headers.png?v=9c051638ed19\"/></a></p>\n</li>\n<li>\n<p>复制 Cookie 字段的完整值，也就是 name=value; name2=value2 这样的内容；不要带上“Cookie:”字段名，不要复制整段请求标头。</p>\n</li>\n<li>\n<p>回到智采“平台账号”，打开对应账号的“配置”，将内容粘贴到 Cookie 框并保存，再点击“验证”。确认没有贴错聚光与灵犀的账号。</p>\n</li>\n</ol>\n<h4>没有看到 Cookie 怎么办？</h4>\n<p>确认请求发往当前平台域名、打开的是请求标头，且平台已登录。可换一条刚完成的业务请求；如果仍找不到，请熟悉该平台的同事协助定位，不要复制其他字段凑数。</p>\n<h4>验证报错该怎么做？</h4>\n<p>先记录提示，核对平台、客户页面链接及 Cookie 是否来自同一账号。服务忙碌时稍后再试；不要把所有失败都判断成 Cookie 过期。</p>\n<p>不同浏览器的中文名称及平台页面位置可能不同；本节给出通用查看路径，当前尚未对每个平台逐屏截图验证。</p>\n"
      },
      {
        "title": "状态和提示分别怎么处理",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>状态或提示</th>\n<th>含义</th>\n<th>建议操作</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>未验证</td>\n<td>信息尚未验证，或配置变更后需要重验</td>\n<td>自己新增的平台账号，保存连接后点“验证”；他人新增的账号需联系该账号维护人更新。</td>\n</tr>\n<tr>\n<td>已验证</td>\n<td>连接已通过检查，但以后仍可能失效</td>\n<td>在工具中选用；运行时仍以实际提示为准。</td>\n</tr>\n<tr>\n<td>登录失效</td>\n<td>平台登录信息不能继续使用</td>\n<td>如果是自己新增的平台账号，在对应平台重新登录，获取新 Cookie，保存后再次验证。</td>\n</tr>\n<tr>\n<td>已停用</td>\n<td>该连接被停用，不能用于新任务</td>\n<td>自己新增的平台账号可确认是否需要启用；无法操作他人账号时，选择其他正确账号或新增自己的连接。</td>\n</tr>\n<tr>\n<td>尚未接入</td>\n<td>自定义服务暂无对应取数功能</td>\n<td>只能维护基本信息，暂时不能验证或采集。</td>\n</tr>\n<tr>\n<td>验证失败 / 服务忙碌</td>\n<td>不一定是 Cookie 过期，也可能是客户不匹配或暂时忙碌</td>\n<td>先看具体提示，核对平台和客户；忙碌时稍后再试。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "更新或删除前先确认",
        "html": "<h4>为什么打开配置框看不到已保存的 Cookie？</h4>\n<p>这是正常情况。Cookie 包含平台的登录凭据，直接显示原文可能被旁人看到、被截图记录或被复制，带来账号被他人使用的风险，因此已保存内容不回显。留空保存会保留原值；需要更新时，填写新 Cookie 并保存即可替换。</p>\n<h4>换了聚光客户链接后为什么要重验？</h4>\n<p>目标客户可能发生变化。确认链接和 Cookie 对应本次需要的客户，再重新验证，不能沿用旧验证结论。</p>\n<h4>删除平台账号会影响什么？</h4>\n<p>删除会清除该平台账号保存的登录凭据，后续不能再选择它发起新任务；已经产生的历史任务仍保留。删除前请确认这个平台账号已不再需要。</p>\n"
      }
    ]
  },
  "common-tasks": {
    "title": "运行任务与查看进度",
    "summary": "点开始后先看状态，结束后再下载；不需要一直停留在运行页面。",
    "icon": "play",
    "chapters": [
      {
        "title": "怎样确认已经提交",
        "html": "<ol>\n<li>填写好账号、文件和查询条件，点击“开始采集”。</li>\n<li>看到任务编号及“等待运行”或“运行中”，说明任务已创建，不要再点一次开始。任务编号是定位这次取数的标识，不是广告平台账号编号。</li>\n<li>如果页面只显示输入错误或队列提示，没有新任务，先按提示处理；“按钮点过了”不等于提交成功。</li>\n<li>记下工具名称和任务创建时间；离开后可到“运行记录”查找。</li>\n</ol>\n"
      },
      {
        "title": "每个状态下一步做什么",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>状态</th>\n<th>你可以怎么做</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>等待运行</td>\n<td>任务在排队，等待即可；不需要重新提交。</td>\n</tr>\n<tr>\n<td>运行中</td>\n<td>看当前阶段和已处理数量。扩词后总数增加可能是正常过程；不要仅因进度变化就重复开始。</td>\n</tr>\n<tr>\n<td>全部完成</td>\n<td>先核对结果范围和需要的字段，再下载文件。</td>\n</tr>\n<tr>\n<td>部分完成</td>\n<td>展开失败明细或查看逐条状态；已成功部分可按页面入口下载，缺失部分再决定是否重跑。</td>\n</tr>\n<tr>\n<td>运行失败 / 已停止</td>\n<td>看错误或结束原因。只有页面提供文件下载时才有可交付文件，不要当成完整成功。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "离开页面、取消或重跑",
        "html": "<ol>\n<li>只想切换页面时，直接去其他页面；刷新或离开运行页不等于取消任务。之后从“运行记录”点击“查看”返回。</li>\n<li>确实不需要继续时，在任务详情进度区点“取消任务”；等待状态变为结束，正在执行的操作可能需要收尾。</li>\n<li>需要重跑时，先确认原任务已结束，检查失败原因，再修正账号或输入条件。建议只重跑需要补充的部分，避免重复工作。</li>\n</ol>\n<p>不要用关闭浏览器的方式判断任务是否停止，也不要看到等待就再提交一份。</p>\n"
      },
      {
        "title": "等待或报错时怎么办",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>提示或现象</th>\n<th>先做什么</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>队列已满 / 已有排队或运行任务</td>\n<td>先等现有任务结束；不需要的任务可在详情中取消。</td>\n</tr>\n<tr>\n<td>提交过于频繁</td>\n<td>按页面提示稍后再试，不要连续点击。</td>\n</tr>\n<tr>\n<td>进度暂时不变</td>\n<td>先看当前阶段，平台响应和文件生成可能需要时间；持续异常时保留任务编号反馈。</td>\n</tr>\n<tr>\n<td>任务超时</td>\n<td>看结束原因，减少输入数量或日期范围后再试；不要直接把原任务连续提交多遍。</td>\n</tr>\n<tr>\n<td>存储空间不足 / 服务正在停止</td>\n<td>暂缓提交，联系管理员，不需要反复修改业务文件。</td>\n</tr>\n</tbody>\n</table></div>\n"
      }
    ]
  },
  "common-downloads": {
    "title": "下载结果与历史记录",
    "summary": "页面只是预览；完整文件要下载，历史任务要按创建时间查找。",
    "icon": "download",
    "chapters": [
      {
        "title": "下载按钮在哪里",
        "html": "<ol>\n<li>任务结束后，在右侧结果区查看状态及失败明细。</li>\n<li>点击页面实际出现的下载按钮：例如“下载结果 Excel”“下载完整结果”或“导出已采集数据”。不同工具按钮文字可能不同。</li>\n<li>笔记工具如果有成功保存的封面，还会提供“下载封面素材包”。需要原图时另外下载这份 ZIP。</li>\n<li>下载保存位置由浏览器决定。找不到文件时可在 Chrome 或 Edge 按 Ctrl+J 打开下载列表，再查看文件所在文件夹。</li>\n</ol>\n<p>CSV 可以用 Excel 打开；.xlsx 是 Excel 工作簿；ZIP 是打包文件，解压后再查看里面的表格和素材。任务未结束、没有数据或文件未生成时，下载按钮可能不可用。</p>\n"
      },
      {
        "title": "下载后先核对这四项",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>检查项</th>\n<th>怎么看</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>是不是这次查询</td>\n<td>核对工具、平台账号、输入内容和查询日期，避免打开旧文件。</td>\n</tr>\n<tr>\n<td>是不是完整文件</td>\n<td>页面通常仅预览前 30 行。下载文件的行数可以更多，不能只保存页面预览。</td>\n</tr>\n<tr>\n<td>有没有未完成项</td>\n<td>看任务是否部分完成，展开失败明细；笔记表还要看每行“下载状态”和“错误信息”。</td>\n</tr>\n<tr>\n<td>字段和工作表是否符合需要</td>\n<td>多工作表的 Excel 要逐张看；关键词推荐与每日搜索量不是同一种数据，素材包也不同于 Excel 内嵌预览。</td>\n</tr>\n</tbody>\n</table></div>\n<p>输入条数和结果行数不一定相等：一个词根可以扩出很多关键词，一条输入也可能没有数据或处理失败。应结合该工具的“下载后怎么看”判断。</p>\n"
      },
      {
        "title": "隔天怎么找回文件",
        "html": "<ol>\n<li>进入“运行记录”，先按平台和工具缩小范围，再按“创建时间”选择今天、近 7 天或其他范围。</li>\n<li>这里筛选的是你点击开始、创建任务的日期，不是你要查询的数据日期。例如今天查询上个月的数据，应先按今天的任务查找。</li>\n<li>通过账号、创建时间和任务编号找到记录，点击“查看”，核对详情后再下载。</li>\n<li>找不到时先重置筛选，并确认登录的是当时创建任务的智采账号。</li>\n</ol>\n"
      },
      {
        "title": "结果和文件常见问题",
        "html": "<h4>为什么下载后只有表头或没有想要的记录？</h4>\n<p>先核对工具、账号和查询范围，再看平台是否确实返回 0 条或存在失败。只有表头不代表找到了业务记录。</p>\n<h4>同团队同事能直接下载我的结果吗？</h4>\n<p>同团队共同使用平台连接，不代表个人任务也会共享。你使用自己的智采登录账号查看和下载自己创建的任务；同团队的其他普通成员不能直接下载你的个人任务结果。</p>\n<h4>结果文件找不到或无法下载怎么办？</h4>\n<p>先确认任务已结束和页面有下载入口，再看浏览器下载提示。若提示结果文件不存在，记录任务编号反馈，不要把重复采集当成唯一处理方式。</p>\n"
      }
    ]
  },
  "common-questions": {
    "title": "常见问题与问题反馈",
    "summary": "先判断卡在哪一步，再提供别人能够复现的问题信息。",
    "icon": "info",
    "chapters": [
      {
        "title": "先判断应该找谁",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>卡在哪里</th>\n<th>先检查</th>\n<th>找谁协助</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>智采登录不了</td>\n<td>邮箱密码、审核状态，以及页面提示</td>\n<td>管理员。</td>\n</tr>\n<tr>\n<td>工具显示未授权</td>\n<td>是否已开通该工具</td>\n<td>管理员。</td>\n</tr>\n<tr>\n<td>没有平台账号或验证失败</td>\n<td>平台、客户链接、连接状态及具体错误</td>\n<td>没有账号可自行新增；自己的账号按连接说明更新，他人账号需联系该账号维护人。</td>\n</tr>\n<tr>\n<td>文件或输入被拒绝</td>\n<td>必需列、日期、工作表及错误提示中的行号</td>\n<td>先按工具说明修正，仍有问题再反馈。</td>\n</tr>\n<tr>\n<td>任务失败或结果不符合预期</td>\n<td>任务编号、查询条件、失败明细</td>\n<td>通过需求中心提交运行问题。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "在页面里怎么反馈",
        "html": "<ol>\n<li>普通成员打开“需求中心”：想增加新功能选“新增取数工具”，已有工具想调整选“改进现有工具”，本次任务报错选“运行问题”。</li>\n<li>工具页面的“对此工具提需求”可带上关联工具；运行记录中的“反馈问题”可关联对应任务。</li>\n<li>写清做了什么、原本想得到什么、实际发生了什么。工具名、任务编号和报错文字尽量完整。</li>\n<li>需要截图或样例文件时，最多上传 3 个，每个小于 10 MB。支持 PNG、JPG/JPEG、WebP、PDF、CSV 和 XLSX；先去掉密码、Cookie 和无关敏感内容。</li>\n<li>提交后进入“我的需求”查看状态和补充说明。</li>\n</ol>\n"
      },
      {
        "title": "一份能定位问题的填写例子",
        "html": "<p>以下是虚构示例，可照着结构填写，但请替换成你的实际情况：</p>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>信息</th>\n<th>填写示例</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>标题</td>\n<td>笔记封面与内容：试跑 3 条，其中 1 条封面未下载。</td>\n</tr>\n<tr>\n<td>操作步骤</td>\n<td>上传 .xlsx → 选择 Sheet1 → 试跑前 3 条 → 开始采集。</td>\n</tr>\n<tr>\n<td>希望得到什么</td>\n<td>3 条笔记的正文与封面。</td>\n</tr>\n<tr>\n<td>实际发生什么</td>\n<td>任务部分完成，第 2 条有正文但没有封面，错误文字为“请填写实际报错”。</td>\n</tr>\n<tr>\n<td>定位信息</td>\n<td>发生时间、任务编号、对应工具；附去除敏感内容后的截图或最小样例。</td>\n</tr>\n</tbody>\n</table></div>\n<p>任务编号可在结果区“任务”后或运行记录中找到；请从你自己的任务复制，不要用客户 ID、笔记 ID 代替。新增工具需求还应提供数据在哪个平台、哪个页面和需要哪些字段。</p>\n"
      },
      {
        "title": "无法进入页面或迟迟没有结果",
        "html": "<h4>登录后一直转圈怎么办？</h4>\n<p>先不要连续提交登录。观察是否已跳到工具中心，若持续等待，可刷新一次并记下发生时间；仍无响应时联系管理员，说明浏览器、提示和大致等待时长。此前出现过登录成功但页面加载较慢的情况，原因尚未确定，不能一概当成密码错误。</p>\n<h4>登录不了，进不去需求中心怎么办？</h4>\n<p>通过现有联系渠道找管理员，提供注册邮箱、发生时间和提示截图；不发送密码或 Cookie。</p>\n<h4>提交需求后会马上上线吗？</h4>\n<p>以需求详情中的状态和处理说明为准。需要补充时在详情中追加，同一问题不要重复建多条；提交不代表已承诺完成时间。</p>\n"
      }
    ]
  },
  "tool-keywords": {
    "title": "关键词推荐",
    "summary": "按词根获取聚光推荐关键词，查看月搜索指数及词根内排名。",
    "icon": "spark",
    "chapters": [
      {
        "title": "能帮你做什么",
        "html": "<p>从聚光获取推荐关键词，并按月搜索指数从高到低排列，适合扩词及整理关键词清单。只获取包含你输入词根的推荐词；“词根”就是用来查找相关词的基础词。</p>\n"
      },
      {
        "title": "开始前准备",
        "html": "<ul>\n<li>需要“关键词推荐”工具权限，以及本团队可用的聚光账号。</li>\n<li>确认账号 Cookie、目标客户页面链接已配置；连接问题请先到“平台账号”核对。</li>\n<li>当前工具每次支持 1～30 个词根，每行一个，可直接从 Excel 单列复制。超过 30 个时分批运行：第 1 批填前 30 个，第 2 批填剩余词根。</li>\n</ul>\n"
      },
      {
        "title": "输入资料怎么获取",
        "html": "<p>“词根”就是你希望围绕它寻找相关关键词的基础词，不需要到浏览器后台找。比如想了解防晒相关词，可以先填“防晒”；这只是填写示例。</p>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>你准备的内容</th>\n<th>怎么放进工具</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>手头只有几个词</td>\n<td>在词根列表逐行填写，一个词根占一行。</td>\n</tr>\n<tr>\n<td>已有 Excel 清单</td>\n<td>选中一列词根单元格，复制后粘贴到词根列表；不要一起复制表头。</td>\n</tr>\n<tr>\n<td>需要文件导入</td>\n<td>先用“下载单列模板”查看格式，保持单列词根，保存为 CSV 或 TXT 后导入。</td>\n</tr>\n</tbody>\n</table></div>\n<p>输入示例：“防晒”占第一行，“敏感肌防晒”占第二行。工具会分别返回包含相应词根的推荐词；是否包含词根本身，以平台返回为准。CSV 是可以用 Excel 打开的表格文件。</p>\n<p>账号怎么准备：请阅读“平台通用说明 → 平台账号与连接状态”，其中包含客户页面链接和 Cookie 获取步骤。</p>\n"
      },
      {
        "title": "每个选项怎么填",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>参数</th>\n<th>填写方式</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>使用账号</td>\n<td>选择本次查询对应的聚光客户账号。</td>\n</tr>\n<tr>\n<td>词根列表</td>\n<td>填写 1～30 个词根；工具会去除词根前后的空格，并将重复词根合并为一个。换行、中英文逗号均会分隔词根。</td>\n</tr>\n<tr>\n<td>导入与模板</td>\n<td>可导入 CSV / TXT，或下载单列模板后填写。请将词根按单列逐行整理。</td>\n</tr>\n</tbody>\n</table></div>\n<p>例如可分别输入“防晒”“敏感肌防晒”。这是格式示例，不代表推荐投放词。此工具没有查询日期或推荐数量配置项。</p>\n"
      },
      {
        "title": "开始操作",
        "html": "<ol>\n<li>打开工具并确认使用账号。</li>\n<li>粘贴词根，或导入 CSV / TXT；检查有效输入及重复项提示。</li>\n<li>点击“开始采集”，等待各词根处理结束。</li>\n<li>检查失败明细，并下载完整 CSV（可用 Excel 打开的表格文件）；需要每日数据时另用“推荐词每日搜索量”。</li>\n</ol>\n"
      },
      {
        "title": "下载后怎么看",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>CSV 字段</th>\n<th>含义</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>日期</td>\n<td>本次处理时生成的日期，不是用户指定的统计周期。</td>\n</tr>\n<tr>\n<td>词根 / 关键词</td>\n<td>本次输入及平台返回的推荐词。</td>\n</tr>\n<tr>\n<td>月搜索指数</td>\n<td>聚光返回的月搜索指数，数值含义以聚光页面说明为准。</td>\n</tr>\n<tr>\n<td>词根内排名</td>\n<td>按该词根结果的月搜索指数降序编号，从 1 开始。</td>\n</tr>\n</tbody>\n</table></div>\n<p>排名由工具按指数排序生成，不代表平台的广告排名。同一关键词可能出现在不同词根的结果里。</p>\n"
      },
      {
        "title": "常见问题",
        "html": "<h4>某个词根失败，其他结果还能用吗？</h4>\n<p>可下载已成功返回的结果，并在失败明细查看对应词根及原因。</p>\n<h4>为什么与平台页面看到的数量或顺序不同？</h4>\n<p>结果以本次账号和平台接口返回为准，工具按月搜索指数重新排序；请核对客户账号及查询时间。</p>\n"
      },
      {
        "title": "使用限制",
        "html": "<p>30 个来自智采当前程序设置的单次提交上限，不代表平台官方公布的限制。需要处理更多词根时，请拆分为多批提交。</p>\n<ul>\n<li>一次最多 30 个有效词根；扩词量以平台返回为准，没有完整覆盖所有相关词的保证。</li>\n<li>月搜索指数不等于每日搜索量，不能将它直接拆分成各日数据。</li>\n<li>本工具只获取数据，不执行广告创建或投放。</li>\n</ul>\n"
      }
    ]
  },
  "tool-trend": {
    "title": "推荐词每日搜索量",
    "summary": "先按词根获取推荐词，再查询去重后关键词在指定日期内的每日搜索量。",
    "icon": "file",
    "chapters": [
      {
        "title": "能帮你做什么",
        "html": "<p>该工具包含扩词和每日查询两个阶段。输入的是词根，最终查询对象是平台返回的推荐关键词，不能将它理解为只查输入词根自身的搜索量。</p>\n"
      },
      {
        "title": "开始前准备",
        "html": "<ul>\n<li>需要“推荐词每日搜索量”权限及本团队的聚光账号。</li>\n<li>准备词根和查询起止日期。当前工具每次支持 1～30 个词根，超过时拆成多批；各批使用同一日期范围，方便后续核对。</li>\n<li>推荐词越多，请求越多，首次使用建议先用少量词根与较短日期范围。</li>\n</ul>\n"
      },
      {
        "title": "输入资料怎么获取",
        "html": "<p>输入的词根准备方法与“关键词推荐”相同：直接填写基础词，或从 Excel 单列复制，不需要查找编号。</p>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>需求</th>\n<th>应该使用的工具</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>想拿到推荐词、月搜索指数和词根内排名</td>\n<td>使用“关键词推荐”。</td>\n</tr>\n<tr>\n<td>想知道推荐词每天有多少搜索量</td>\n<td>使用本工具，输入词根并选择查询日期。</td>\n</tr>\n<tr>\n<td>只想查某个指定词自身的每日搜索量</td>\n<td>当前流程会先扩词，不能保证只查询这个指定词。</td>\n</tr>\n</tbody>\n</table></div>\n<p>流程示例（虚构）：输入“防晒” → 平台返回“通勤防晒”“户外防晒”等推荐词 → 工具查询这些推荐词在所选日期内的每日搜索量。示例不保证实际返回这些词。</p>\n<p>第一次建议填 1 个词根、选近 7 天。下载后先看 keyword（关键词）、date（日期）和 searchNum（搜索量）三列，确认实际查询对象及日期。账号配置方法见“平台账号与连接状态”。</p>\n"
      },
      {
        "title": "每个选项怎么填",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>参数</th>\n<th>填写方式</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>使用账号</td>\n<td>选择对应客户的聚光账号。</td>\n</tr>\n<tr>\n<td>词根列表</td>\n<td>每行一个，可导入 CSV / TXT；重复词根会合并；每次最多 30 个，超过时分批填写。</td>\n</tr>\n<tr>\n<td>查询日期</td>\n<td>填写开始和结束日期，包含两端；开始不得晚于结束，单次最多 91 天。</td>\n</tr>\n<tr>\n<td>快捷日期</td>\n<td>可选择近 7 天、近 14 天或近 30 天，提交前检查实际显示的起止日期。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "开始操作",
        "html": "<ol>\n<li>确认账号，填写或导入词根列表。</li>\n<li>设置起止日期，检查日期范围。</li>\n<li>点击“开始采集”；先获取各词根的推荐词，再将推荐关键词合并去重。</li>\n<li>等待每日数据查询完成，检查失败明细，下载结果 CSV。</li>\n</ol>\n"
      },
      {
        "title": "下载后怎么看",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>CSV 字段</th>\n<th>含义</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>keyword</td>\n<td>实际查询的推荐关键词。</td>\n</tr>\n<tr>\n<td>date</td>\n<td>平台返回的统计日期。</td>\n</tr>\n<tr>\n<td>searchNum</td>\n<td>该关键词在对应日期的搜索量，沿用平台返回口径。</td>\n</tr>\n</tbody>\n</table></div>\n<p>同一个推荐词来自多个词根时，只查询一次。输出不包含原词根映射，也不保留推荐词的月搜索指数和排名；需要这些信息请另用“关键词推荐”。</p>\n"
      },
      {
        "title": "常见问题",
        "html": "<h4>为什么结果中有我没有逐行输入的关键词？</h4>\n<p>工具会先扩词，结果展示的是推荐词的每日数据。</p>\n<h4>为什么进度总数会增加？</h4>\n<p>扩词完成后，去重后的关键词加入处理总数，属于正常流程。</p>\n<h4>为什么部分日期没有行？</h4>\n<p>工具保留接口实际返回的行，不为未返回的日期补零。请核对日期范围及失败明细。</p>\n"
      },
      {
        "title": "使用限制",
        "html": "<p>30 个来自智采当前程序设置的单次提交上限，不代表平台官方公布的限制。多个词根可能扩出同一个关键词；分批下载的结果若需要合并，应按 keyword 和 date 核对重复记录。</p>\n<ul>\n<li>一次 1～30 个词根，日期跨度最多 91 天。扩词数量越多，耗时越长。</li>\n<li>关键词阶段失败会记录关键词；扩词阶段失败会记录词根。两类失败都可能影响最终覆盖。</li>\n<li>查询结果仅反映当前平台返回，空缺不自动等于搜索量为 0。</li>\n</ul>\n"
      }
    ]
  },
  "tool-industry": {
    "title": "行业竞争数据",
    "summary": "按行业、时间粒度和指标获取灵犀竞争气泡图数据，导出分指标工作表。",
    "icon": "table",
    "chapters": [
      {
        "title": "能帮你做什么",
        "html": "<p>获取灵犀“行业 → 市场机会 → 市场分析 → 市场竞争分析”中的竞争气泡图原始数据。可选择品牌、SPU 或系列，以及 X 轴、Y 轴和气泡大小指标。</p>\n"
      },
      {
        "title": "开始前准备",
        "html": "<ul>\n<li>需要智采中的“行业竞争数据”工具访问权限，以及本团队可用的灵犀平台账号。</li>\n<li>先从“选择常用行业”中找需要的行业；找不到时再获取行业编号并新增，步骤见下方“输入资料怎么获取”。</li>\n<li>地域、品牌、商品和系列筛选均可先留空。确实需要限定范围时，再按“输入资料怎么获取”查找编号；中文名称不能代替编号。</li>\n</ul>\n"
      },
      {
        "title": "输入资料怎么获取",
        "html": "<p>先看常用行业下拉：已有需要的行业时，直接选择，不用获取 code。code 可以理解为平台给行业分配的编号；只有新增行业或限定地域、品牌、商品时才需要查看编号。</p>\n<p>第一次建议：选择一个已有行业，查询一小段时间，高级筛选全部留空，先确认能得到所需结果。SPU 可理解为平台中的商品条目，系列指产品系列。</p>\n<ol>\n<li>在电脑浏览器登录灵犀（idea.xiaohongshu.com），进入“行业 → 市场机会 → 市场分析 → 市场竞争分析”。</li>\n<li>按 F12 打开“开发者工具”（也可右键页面，选择“检查”），点击 Network / 网络。若标签被折叠，在右侧“»”中查找。</li>\n<li>选择 Fetch/XHR，清空筛选框。在保持网络面板打开的情况下，回到灵犀，选择目标行业及需要限定的品牌、商品或地域，触发一次查询；若没有新请求，可刷新后重新选择条件。</li>\n<li>在网络面板的筛选框输入 compete，点击路径包含 /industry/brand/compete 的请求。应选择刚才查询后产生的那条请求。</li>\n<li>打开 Payload / 载荷，再展开 Request Payload / 请求载荷，按下表查找字段。这里看的是本次查询“提交了哪些条件”，不是 Response / 响应中的结果。</li>\n<li>只复制需要的编号，回到智采填写。新增行业时填行业名称和行业 code；高级筛选中多个编号用英文逗号分隔。</li>\n</ol>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>智采输入项</th>\n<th>Payload 字段</th>\n<th>复制什么</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>行业 code</td>\n<td>taxonomyCodes</td>\n<td>当前行业对应的值；新增行业一次填写一个 code。</td>\n</tr>\n<tr>\n<td>地域 code</td>\n<td>regionCodes</td>\n<td>选定地域对应的编号；不限定地域时留空。</td>\n</tr>\n<tr>\n<td>品牌 ID</td>\n<td>brandIdList</td>\n<td>选定品牌对应的编号。</td>\n</tr>\n<tr>\n<td>SPU ID</td>\n<td>spuIdList</td>\n<td>选定商品对应的编号。</td>\n</tr>\n<tr>\n<td>系列 ID</td>\n<td>seriesIdList</td>\n<td>选定系列对应的编号。</td>\n</tr>\n</tbody>\n</table></div>\n<p>格式示例（虚构，不能直接使用）：若 Payload 显示 brandIdList: [\"12345\", \"67890\"]，智采品牌 ID 栏填写 12345,67890；不要复制字段名、方括号或引号。行业名称按灵犀平台显示的名称原样填写，行业 code 则必须保留平台原值。</p>\n<h4>字段是 []，或者找不到对应字段怎么办？</h4>\n<p>[] 表示这条请求没有提交该项筛选。先在灵犀选定对应条件，再查看新产生的请求；不要拿其他字段的编号代填。非必填筛选可先留空。</p>\n<h4>列表里没有 compete 请求怎么办？</h4>\n<p>清空网络筛选后重新操作；确认打开的是市场竞争分析页面，网络记录没有暂停。页面位置或请求名称若与说明不同，请联系配置人协助定位，不要猜编号。</p>\n<h4>怎么确认复制对了？</h4>\n<p>回到灵犀确认该次查询选中的名称，再核对 Payload 的对应字段；第一次只选择一个行业或一个对象。复制回来先做小范围查询，检查结果对象是否匹配。</p>\n<p>字段对应关系已按智采当前请求代码核对；以上浏览器菜单和灵犀点击流程尚未在当前平台页面逐步点验，具体位置可能变化。</p>\n<p><a href=\"/static/help-images/industry-payload.png?v=bbace0defb50\" rel=\"noopener\" target=\"_blank\" title=\"点击查看原图\"><img alt=\"行业竞争数据：在 Network 中选择 compete 请求，打开 Payload 查看行业 code 和筛选 ID\" loading=\"lazy\" src=\"/static/help-images/industry-payload.png?v=bbace0defb50\"/></a></p>\n"
      },
      {
        "title": "每个选项怎么填",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>参数</th>\n<th>填写方式</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>行业</td>\n<td>从常用行业下拉选择即加入列表，可移除；一次 1～20 个。缺少行业时点“新增行业”，填写名称和 code 后“保存并选用”。</td>\n</tr>\n<tr>\n<td>查询日期 / 时间粒度</td>\n<td>按日、按周或按月；按月填写年/月，其他粒度填写日期，开始不能晚于结束。</td>\n</tr>\n<tr>\n<td>分析主体</td>\n<td>品牌、SPU、系列，按所需分析对象选择。</td>\n</tr>\n<tr>\n<td>X 轴</td>\n<td>搜索量、曝光量或阅读量，单选。</td>\n</tr>\n<tr>\n<td>Y 轴</td>\n<td>阅读量、阅读同比增长率、阅读环比增长率，可选 1～3 项。</td>\n</tr>\n<tr>\n<td>气泡大小</td>\n<td>平均有曝光笔记数或新增笔记数。</td>\n</tr>\n<tr>\n<td>高级筛选</td>\n<td>可留空；地域 code 留空为全国，最多 20 项；品牌/SPU/系列 ID 各最多 30 项，多个值用逗号分隔。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "开始操作",
        "html": "<ol>\n<li>选择灵犀账号，从常用行业中添加本次需要的行业。</li>\n<li>需要补充行业时点“新增行业”；“管理常用行业”用于维护已有配置，有权限的条目可编辑或删除。</li>\n<li>设置时间粒度和日期，再选分析主体、X 轴、Y 轴及气泡大小。</li>\n<li>按需填写高级筛选，开始采集后检查各行业/指标的成功与失败状态。</li>\n<li>下载 Excel，逐张检查行业及 Y 轴指标对应的工作表。</li>\n</ol>\n"
      },
      {
        "title": "下载后怎么看",
        "html": "<p>每个成功返回的“行业 × Y 轴指标”组合单独生成工作表，工作表名基于行业名称和指标名称，过长或重复时会调整。</p>\n<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>字段</th>\n<th>含义</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>行业 / 品牌/SPU</td>\n<td>查询行业及平台返回的分析对象名称；字段标题保留“品牌/SPU”，请结合所选分析主体理解。</td>\n</tr>\n<tr>\n<td>X 轴 / Y 轴指标</td>\n<td>所选指标对应的数值，X 轴列名优先使用平台返回名称。</td>\n</tr>\n<tr>\n<td>气泡大小指标</td>\n<td>当前选择的笔记数指标值。</td>\n</tr>\n<tr>\n<td>X / Y 轴均值</td>\n<td>平台返回的均值，工具随每条对象记录保留，未重新计算。</td>\n</tr>\n</tbody>\n</table></div>\n<p>页面只预览第一张结果工作表；多张表的行数合计不代表唯一品牌或商品数。</p>\n"
      },
      {
        "title": "常见问题",
        "html": "<h4>为什么同一行业有多张工作表？</h4>\n<p>每个所选 Y 轴指标独立查询和导出，避免将不同指标口径混在同一张表。</p>\n<h4>新增行业提示 code 格式不正确怎么办？</h4>\n<p>确认使用平台对应的行业 code；格式须为 8～80 位字母、数字、下划线或连字符，不要用行业中文名代替。</p>\n<h4>为什么增长率或均值与预期不同？</h4>\n<p>先核对日期、粒度、主体与筛选范围；数值及单位沿用平台返回，请结合灵犀页面口径解读。</p>\n"
      },
      {
        "title": "使用限制",
        "html": "<ul>\n<li>一次最多 20 个行业、3 个 Y 轴指标，组合越多耗时越长。</li>\n<li>有工作表生成不代表所有组合成功，需检查失败明细。</li>\n<li>工具导出原始数据，不额外生成气泡图，也不推导未返回的指标。</li>\n</ul>\n"
      }
    ]
  },
  "tool-notes": {
    "title": "笔记封面与内容",
    "summary": "上传笔记清单，整理标题、作者、正文与首张封面，并保留逐条处理状态。",
    "icon": "note",
    "chapters": [
      {
        "title": "能帮你做什么",
        "html": "<p>根据上传清单读取小红书笔记公开页面，输出笔记信息、封面预览及可下载的原图素材。无需配置聚光或灵犀账号。</p>\n"
      },
      {
        "title": "开始前准备",
        "html": "<ul>\n<li>需要“笔记封面与内容”工具权限。</li>\n<li>准备不超过 20 MB 的 .xlsx 文件，第一行为表头，目标工作表须各有且仅有一列“笔记id”和“笔记链接”。</li>\n<li>每条记录同时填写 ID 与链接；两列都空的行会跳过，只缺一项会拒绝文件。单次须为 1～200 条记录。</li>\n<li>尽量保留完整分享链接及其参数；仅有笔记 ID 或不完整链接可能无法取得内容。</li>\n</ul>\n"
      },
      {
        "title": "每个选项怎么填",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>参数</th>\n<th>填写方式</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>上传笔记文件</td>\n<td>仅支持 .xlsx，不支持直接上传 CSV、旧版 .xls 或粘贴链接清单。</td>\n</tr>\n<tr>\n<td>数据工作表</td>\n<td>上传后选择同时包含两列必需字段的工作表；缺列的工作表不可选。</td>\n</tr>\n<tr>\n<td>正式处理全部链接</td>\n<td>处理所选工作表中的全部有效记录。</td>\n</tr>\n<tr>\n<td>试跑前几条</td>\n<td>按文件顺序处理前 N 条，N 为 1～200，默认 3；整个文件仍须先通过结构及记录校验。</td>\n</tr>\n<tr>\n<td>仅检查文件，不联网</td>\n<td>检查输入，不抓取笔记内容或封面；不用于验证链接在平台上是否可访问。</td>\n</tr>\n</tbody>\n</table></div>\n"
      },
      {
        "title": "开始操作",
        "html": "<ol>\n<li>整理 Excel 表头和记录，上传文件，确认文件检查提示。</li>\n<li>选择目标工作表及运行方式；初次建议先试跑少量记录。</li>\n<li>开始处理，在结果区查看当前阶段与成功、部分成功、失败数量。</li>\n<li>任务结束后下载结果 Excel，检查“下载状态”和“错误信息”。</li>\n<li>如有成功下载的封面，另点“下载封面素材包”，获得结果表和封面原图 ZIP。</li>\n</ol>\n"
      },
      {
        "title": "下载后怎么看",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>工作表 / 字段</th>\n<th>含义</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>笔记数据</td>\n<td>结果 Excel 的工作表，每条笔记保留一行处理结果。</td>\n</tr>\n<tr>\n<td>笔记id / 笔记链接</td>\n<td>原始输入记录，便于回查。</td>\n</tr>\n<tr>\n<td>笔记标题 / KOL名称 / 笔记内容</td>\n<td>实际获取的标题、作者昵称与正文。</td>\n</tr>\n<tr>\n<td>封面链接 / 下载文件 / 封面图片</td>\n<td>封面地址、保存文件名和 Excel 内嵌预览；素材包保留原图。</td>\n</tr>\n<tr>\n<td>下载状态 / 错误信息</td>\n<td>逐条处理结果及未完成原因，不能只看是否有标题。</td>\n</tr>\n</tbody>\n</table></div>\n<p>仅检查文件模式不生成真实抓取内容；素材包只在至少有封面成功保存时提供。</p>\n"
      },
      {
        "title": "常见问题",
        "html": "<h4>表头明明有两列，为什么仍报错？</h4>\n<p>确认它们在所选工作表的第一行，名称与“笔记id”“笔记链接”一致且各出现一次；不要重复放置同名列。</p>\n<h4>有正文却没有封面怎么办？</h4>\n<p>查看该行状态与错误信息。页面内容和图片下载分别可能失败，不应将部分成功当作全部成功。</p>\n<h4>笔记在 App 中能看，为什么工具失败？</h4>\n<p>工具读取公开页面，App 登录状态不代表服务器能访问。私密、失效、要求登录或受平台限制的页面仍可能失败。</p>\n"
      },
      {
        "title": "使用限制",
        "html": "<ul>\n<li>链接须为 HTTPS，当前接受 www.xiaohongshu.com、xiaohongshu.com 和 xhslink.com 域名；通过格式校验不保证可抓取。</li>\n<li>仅获取首张封面，不批量下载整篇笔记的所有图片或视频。</li>\n<li>单条有处理时限；大图可能保留原图但不嵌入 Excel 预览。平台限制、图片异常或资源配额均可能影响结果。</li>\n<li>不承诺每条链接都成功；失败或部分成功应按逐条原因处理。</li>\n</ul>\n"
      }
    ]
  },
  "tool-adgroups": {
    "title": "广告组信息导出",
    "summary": "自动读取所选聚光账号的全部广告组分页，导出固定字段的 Excel。",
    "icon": "table",
    "chapters": [
      {
        "title": "能帮你做什么",
        "html": "<p>用于整理聚光广告组名称、ID 和状态。工具通过平台接口自动读取全部分页，无需手动翻页，也无需上传广告组清单。</p>\n"
      },
      {
        "title": "开始前准备",
        "html": "<ul>\n<li>需要“广告组信息导出”权限及本团队的聚光账号。</li>\n<li>确认账号配置中的页面链接对应目标客户，并已保存适用的 Cookie。</li>\n<li>需要指定统计日期时提前确认起止日期；不填则使用今天。</li>\n</ul>\n"
      },
      {
        "title": "输入资料怎么获取",
        "html": "<p>此工具不需要你查找或填写广告组 ID。只需先确认智采里的聚光账号对应哪个客户，工具会获取它能访问的广告组。</p>\n<ol>\n<li>在电脑浏览器登录聚光（ad.xiaohongshu.com），先进入需要取数的客户账号；如果看到客户列表，先点击目标客户，不要停留在列表页。</li>\n<li>检查聚光页面当前显示的客户名称，再点击浏览器地址栏，复制完整网址。网址应属于 ad.xiaohongshu.com 且含 vSellerId= 后的一段客户标识。</li>\n<li>在智采“平台账号”新增或配置对应账号，将完整网址粘贴到“页面链接”；这里不用单独提取或手输 vSellerId。</li>\n<li>按“平台账号与连接状态”中的 Cookie 获取步骤完成连接，保存后验证。然后回到工具选择该账号。</li>\n</ol>\n<p>第一次可以日期留空，先看广告组数量提示，再开始导出。文件中的“账号”是智采账号别名；广告组 ID 是输出内容，不是开始前要准备的输入。</p>\n"
      },
      {
        "title": "每个选项怎么填",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>参数</th>\n<th>填写方式</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>使用账号</td>\n<td>选择需要导出广告组的聚光客户账号。</td>\n</tr>\n<tr>\n<td>开始日期 / 结束日期</td>\n<td>可同时留空，默认北京时间当天；指定时必须两项都填，开始不能晚于结束。</td>\n</tr>\n<tr>\n<td>广告组数量提示</td>\n<td>选择账号或修改日期后会自动查询数量；出错时检查提示。提示是当前预查询结果，实际导出仍会重新读取。</td>\n</tr>\n</tbody>\n</table></div>\n<p>日期会传给广告组查询，但导出文件不包含花费、曝光、点击或转化等效果指标；当前没有按广告组状态或名称过滤的选项。</p>\n"
      },
      {
        "title": "开始操作",
        "html": "<ol>\n<li>选择聚光账号，确认客户范围。</li>\n<li>按需填写起止日期，等待广告组数量提示。</li>\n<li>点击“开始采集”，等待工具读取全部分页并生成文件。</li>\n<li>确认任务结束和导出状态，点击“导出已采集数据”下载 Excel。</li>\n<li>打开“广告组信息”工作表，核对账号、数量及 ID。</li>\n</ol>\n"
      },
      {
        "title": "下载后怎么看",
        "html": "<div class=\"help-content-table\"><table>\n<thead>\n<tr>\n<th>Excel 字段</th>\n<th>含义</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>账号</td>\n<td>智采中选择的平台账号别名，不是平台登录名或客户 ID。</td>\n</tr>\n<tr>\n<td>广告组</td>\n<td>平台返回的广告组名称。</td>\n</tr>\n<tr>\n<td>广告组ID</td>\n<td>广告组唯一标识，按文本导出以保留完整数字。</td>\n</tr>\n<tr>\n<td>广告组状态</td>\n<td>平台提供的状态名称，或依据启用值显示“有效 / 暂停”。</td>\n</tr>\n<tr>\n<td>导出时间</td>\n<td>北京时间的文件生成时间。</td>\n</tr>\n</tbody>\n</table></div>\n<p>工作表名为“广告组信息”。平台返回 0 个广告组时，可生成仅含表头的文件。</p>\n"
      },
      {
        "title": "常见问题",
        "html": "<h4>为什么界面数量提示与导出数量不一样？</h4>\n<p>数量提示和正式导出发生在不同时间。先核对客户与日期；若采集期间平台总数发生变化，工具会报错，需待列表稳定后重试。</p>\n<h4>提示重复 ID、分页提前结束或未知状态怎么办？</h4>\n<p>工具在核对数据完整性时发现异常，会停止生成正常结果。检查错误提示，确认平台列表稳定后重试；持续出现时附任务编号反馈。</p>\n<h4>能直接导出广告组效果指标吗？</h4>\n<p>当前只导出固定 5 列信息，统计日期不会让文件增加效果指标。</p>\n"
      },
      {
        "title": "使用限制",
        "html": "<ul>\n<li>单次广告组上限为 100000 条，受平台响应与任务时限约束。</li>\n<li>采集中总数变化、重复 ID、缺少名称/ID或未知状态会导致失败，不能把失败结果当作完整清单。</li>\n<li>只读取所选账号当前可访问的广告组，不修改广告组或投放状态。</li>\n</ul>\n"
      }
    ]
  },
  "tool-content": {
    "title": "灵犀内容管理导出",
    "summary": "按产品获取笔记及统计表现，自动翻页、核对数量并导出 Excel。",
    "icon": "table",
    "chapters": [
      {
        "title": "这个工具用来做什么",
        "html": "<p>按产品和查询日期，从小红书灵犀“内容管理”获取笔记表现，自动读取全部分页并导出 Excel。适合查看某个产品关联的笔记、种草消耗、曝光和阅读表现。</p>"
      },
      {
        "title": "开始前准备",
        "html": "<p>准备一个已配置 Cookie 的灵犀账号，该账号需有对应品牌和产品的访问权限。确定要导出的产品与查询日期。</p>"
      },
      {
        "title": "输入资料怎么获取",
        "html": "<p>登录小红书灵犀，进入“洞察 → 内容 → 内容管理”。在智采选择对应客户的灵犀账号，点击“读取授权产品”，自动关联当前品牌并展示授权产品列表，再搜索、勾选本次要采集的产品。</p><p>读取使用智采所选账号保存的 Cookie，与你电脑浏览器的登录状态相互独立。读取失败时，请检查所选灵犀账号的连接和产品权限，再重试。</p>"
      },
      {
        "title": "每个选项怎么填",
        "html": "<ul><li>使用账号：选择对应客户的灵犀连接。</li><li>选择产品：点击“读取授权产品”后，按名称或 SPU ID 搜索并勾选 1～20 个产品。搜索不会清除已选产品；达到 20 个后，先取消一个再选其他产品。“清空已选”会取消全部勾选。</li><li>查询日期：选择开始和结束日期。这是灵犀接口的统计查询范围，结果可包含更早发布的笔记。</li></ul><p>品牌由读取结果自动关联，无需填写品牌编号或产品编号。切换账号后需要重新读取并选择产品。</p>"
      },
      {
        "title": "从开始到下载",
        "html": "<ol><li>选账号，读取授权产品，勾选需要的产品（最多 20 个）。</li><li>核对日期和产品，点击“开始采集”。</li><li>进度会显示当前产品、页码和已读取条数。可以取消任务。</li><li>完成后查看状态、数据预览和失败原因，再下载 Excel；以后可在运行记录中找回。</li></ol>"
      },
      {
        "title": "下载结果怎么读",
        "html": "<p>“内容数据”包含产品名称、SPU ID、查询日期、笔记及作者信息、种草消耗、CTR（全部流量）、曝光量、阅读量（全部流量）、笔记链接和封面链接。“采集记录”列出每个产品的接口总数、导出条数、状态与失败原因。</p>\n<p>同一笔记关联不同产品时分别保留。标题等平台缺失字段保持空白，不补造数据。封面只导出链接，不下载或内嵌图片。</p><p>明细末尾新增“记录提示”“同产品笔记ID出现次数”“来源页码”“页内序号”。同一笔记在不同产品下分别计数；同一产品中的重复行全部保留，不去重、不合并指标。采集记录增加唯一笔记数、重复笔记ID数、涉及重复的记录行数和数据提示。</p>"
      },
      {
        "title": "遇到问题怎么处理",
        "html": "<p>同一产品内笔记 ID 重复时，不再使整个产品失败。工具保留平台返回的每一行及其原始指标，在所有重复行添加“记录提示”，并在采集记录中列出唯一笔记数、重复 ID 数和涉及重复的记录行数。不要直接把重复行的指标相加；请核对原始记录。</p><p>缺少笔记 ID、分页提前结束、总数变化或整页内容完全重复时，该产品仍判定失败，不导出不完整的产品明细；其他成功产品保留。成功的空结果会导出表头与采集记录。</p><p>读取失败时检查所选灵犀账号的连接和产品权限。开始按钮不可用时查看按钮上方的具体原因；未勾选时提示“请至少选择 1 个产品”。</p>"
      },
      {
        "title": "使用限制",
        "html": "<p>每次最多 20 个产品、100000 条结果，单个产品最多 100000 条，实际还受平台权限、响应和任务时限影响。每页最多请求 100 条，按接口实际返回的每页条数继续翻页。任务串行取数，不修改笔记或投放状态。</p>"
      }
    ]
  }
};
  const common = Object.entries(helpContent).filter(([id])=>id.startsWith('common-')).map(([id,item])=>({id,title:item.title,icon:item.icon,group:'平台通用说明'}));
  const toolArticles = Object.values(fromRealTool).filter(id=>helpContent[`tool-${id}`]).map(id=>({id:`tool-${id}`,tool:id,platform:tools[id].platform,title:helpContent[`tool-${id}`].title,icon:tools[id].icon,group:'各工具说明'}));
  const articles = [...common,...toolArticles];
  let selected = common[0].id, query = '', helpPlatform = 'all', returnTool = null, savedToolView = null;
  const platformTools = () => toolArticles.filter(item=>realTools[item.tool]&&(helpPlatform==='all'||item.platform===helpPlatform));
  const readingList = () => [...common,...platformTools()];
  const article = () => articles.find(item=>item.id===selected)||common[0];
  const chapterNames = item => helpContent[item.id].chapters.map(chapter=>chapter.title);
  const helpSummary = item => helpContent[item.id].summary;
  const chapterBody = (item,index) => helpContent[item.id].chapters[index].html;
  function navGroup(label,items,heading=true){
    const matches=items.filter(item=>(item.title+item.group).includes(query.trim()));
    if(!matches.length)return '';
    return `<section class="help-nav-group">${heading?`<h3>${label}</h3>`:''}${matches.map(item=>`<button class="help-topic ${selected===item.id?'active':''}" data-help-topic="${item.id}" ${selected===item.id?'aria-current="page"':''}>${I(item.icon,'i16')}<span>${esc(item.title)}</span>${I('chevron','i14')}</button>`).join('')}</section>`;
  }
  function paintDirectory(){
    const directory=$('#help-directory');if(!directory)return;
    const candidates=platformTools(),list=navGroup('各工具说明',candidates,false);
    directory.innerHTML=navGroup('平台通用说明',common)+`<section class="help-tool-directory" aria-labelledby="help-tools-title"><h3 id="help-tools-title">各工具说明</h3><div class="help-platform-field"><label for="help-platform">按平台查看</label><select id="help-platform"><option value="all" ${helpPlatform==='all'?'selected':''}>全部平台</option>${Object.entries(platforms).map(([id,p])=>`<option value="${esc(id)}" ${helpPlatform===id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><p class="help-tool-count" role="status">${helpPlatform==='all'?'全部平台':esc(platforms[helpPlatform].name)} · ${candidates.length} 篇工具说明</p>${list||`<div class="help-no-match" role="status">${candidates.length?'没有匹配的工具说明':'该平台暂无工具说明'}<button class="text-btn" ${query.trim()?'data-help-clear':'data-help-all-platforms'}>${query.trim()?'清空搜索':'查看全部平台'}</button></div>`}</section>`;
  }
  function paintHelp(){
    const directoryScroll=$('.help-directory-panel')?.scrollTop||0;
    const item=article(),chapters=chapterNames(item),visible=readingList(),index=visible.indexOf(item);
    $('#main').innerHTML=`<div class="heading help-heading"><div><div class="eyebrow">HELP CENTER</div><h1>使用说明</h1><p>平台使用指引与各工具的操作说明。</p></div>${returnTool?'<div class="heading-actions"><button class="btn" data-help-return>'+I('left','i16')+'返回工具</button></div>':''}</div>
      <div class="help-layout"><aside class="panel help-directory-panel" aria-label="说明目录"><div class="help-directory-title"><h2>说明目录</h2><span class="pill">${readingList().length}</span></div><label class="search help-search">${I('search','i16')}<input id="help-search" type="search" value="${esc(query)}" placeholder="搜索说明标题" aria-label="搜索说明标题"></label><nav id="help-directory" aria-label="使用说明分类"></nav></aside>
      <article class="panel help-reader" aria-labelledby="help-article-title"><header class="help-article-header"><div class="help-article-meta"><span>${esc(item.group)}</span><span class="help-draft">${item.tool?(!realTools[item.tool]?'暂不可用':'工具操作指引'):'平台操作指引'}</span></div><div class="help-title-row"><h2 id="help-article-title" tabindex="-1">${esc(item.title)}</h2>${item.tool?`<button class="btn sm" data-help-launch="${item.tool}" ${!realTools[item.tool]||(window.ZHICAI_SERVER_MODE&&!can(item.tool))?'disabled title="该工具暂不可用或当前账号尚未授权"':''}>前往工具${I('chevron','i14')}</button>`:''}</div><p>${esc(helpSummary(item))}</p></header>
      <nav class="help-chapter-bar" aria-label="章节快捷导航">${chapters.map((name,i)=>`<button data-help-section="${i}">${esc(name)}</button>`).join('')}</nav><div class="help-article-body">${chapters.map((name,i)=>`<section class="help-chapter" id="help-section-${i}" aria-labelledby="help-chapter-${i}"><h3 id="help-chapter-${i}"><span>${String(i+1).padStart(2,'0')}</span>${esc(name)}</h3><div class="help-prose">${chapterBody(item,i)}</div></section>`).join('')}</div>
      <footer class="help-reader-footer">${index>0?`<button data-help-topic="${visible[index-1].id}"><small>上一篇</small><span>${I('left','i14')}${esc(visible[index-1].title)}</span></button>`:'<span></span>'}${index<visible.length-1?`<button data-help-topic="${visible[index+1].id}"><small>下一篇</small><span>${esc(visible[index+1].title)}${I('chevron','i14')}</span></button>`:'<span></span>'}</footer></article>
      <aside class="help-on-this-page" aria-label="本文目录"><h2>本文目录</h2>${chapters.map((name,i)=>`<button data-help-section="${i}">${esc(name)}</button>`).join('')}<div class="help-outline-note">${I('info','i16')}<span>页面操作和提示如有更新，请以当前界面为准。</span></div></aside></div>${realFooter()}`;
    paintDirectory();
    $('.help-directory-panel').scrollTop=directoryScroll;
  }
  const previousChrome=renderChrome;
  renderChrome=function(){
    previousChrome();
    const active=page==='help';
    $('#main-nav')?.insertAdjacentHTML('beforeend',`<button class="nav-btn ${active?'active':''}" data-page="help" ${active?'aria-current="page"':''} title="使用说明">${I('file')}<span>使用说明</span></button>`);
    $('#mobile-nav')?.insertAdjacentHTML('beforeend',`<button data-page="help" class="${active?'active':''}" ${active?'aria-current="page"':''}>${I('file')}<span>使用说明</span></button>`);
    if(active){$('#breadcrumb b').textContent='使用说明';document.title='使用说明 · 智采';}
  };
  const previousRender=render;
  render=function(){if(page==='help'){renderChrome();paintHelp();return;}previousRender();};
  const previousTool=renderTool;
  renderTool=function(){
    if(savedToolView?.tool===currentTool&&realTools[currentTool]&&(!window.ZHICAI_SERVER_MODE||can(currentTool))){
      const saved=savedToolView;savedToolView=null;
      $('#main').replaceChildren(...saved.nodes);
      renderResult();
      return;
    }
    savedToolView=null;
    previousTool();
    if(realTools[currentTool])$('#main .heading-actions')?.insertAdjacentHTML('afterbegin',`<button class="btn" data-help-preview="${currentTool}">${I('file','i16')}使用说明</button>`);
  };
  const drawer=document.createElement('dialog');
  drawer.className='help-drawer';drawer.id='help-drawer';drawer.setAttribute('aria-labelledby','help-drawer-title');
  document.body.append(drawer);
  function preview(id){
    const item=toolArticles.find(item=>item.tool===id);if(!item)return;
    drawer.innerHTML=`<header class="help-drawer-header"><div><span class="help-kicker">工具使用说明</span><h2 id="help-drawer-title">${esc(item.title)}</h2></div><button class="icon-btn" data-help-close aria-label="关闭使用说明">${I('close')}</button></header><div class="help-drawer-body"><div class="help-drawer-notice">${I('info','i16')}<span>${esc(helpSummary(item))}</span></div>${chapterNames(item).map((name,i)=>`<details class="help-preview-section" ${i===0?'open':''}><summary>${name}${I('chevron','i14')}</summary><div class="help-prose">${chapterBody(item,i)}</div></details>`).join('')}</div><footer class="help-drawer-footer"><button class="btn" data-help-close>返回配置</button><button class="btn primary" data-help-full="${id}">查看完整说明${I('chevron','i14')}</button></footer>`;
    drawer.showModal();
  }
  document.addEventListener('input',event=>{if(event.target.id==='help-search'){query=event.target.value;paintDirectory();}});
  function changePlatform(value){
    if(value!=='all'&&!Object.hasOwn(platforms,value))return;
    helpPlatform=value;
    const current=article(),candidates=platformTools();
    if(current.tool&&!candidates.some(item=>item.id===selected))selected=candidates[0]?.id||common[0].id;
    paintHelp();
    $('#help-platform')?.focus({preventScroll:true});
  }
  document.addEventListener('change',event=>{if(event.target.id==='help-platform')changePlatform(event.target.value);});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.page==='help'){returnTool=null;if(page==='help')paintHelp();return;}
    if(button.dataset.helpPreview){preview(button.dataset.helpPreview);return;}
    if(button.hasAttribute('data-help-close')){drawer.close();return;}
    if(button.dataset.helpFull){
      selected=`tool-${button.dataset.helpFull}`;returnTool=button.dataset.helpFull;
      if(helpPlatform!=='all'&&helpPlatform!==tools[returnTool].platform)helpPlatform=tools[returnTool].platform;
      // Retain the original controls, including file inputs and DOM-only options.
      savedToolView={tool:currentTool,nodes:Array.from($('#main').childNodes)};
      drawer.close();go('help');return;
    }
    if(button.hasAttribute('data-help-return')){go('tool');return;}
    if(button.hasAttribute('data-help-all-platforms')){changePlatform('all');return;}
    if(button.dataset.helpLaunch){openTool(button.dataset.helpLaunch);return;}
    if(button.dataset.helpTopic){selected=button.dataset.helpTopic;paintHelp();$('#help-article-title')?.focus({preventScroll:true});window.scrollTo(0,0);return;}
    if(button.hasAttribute('data-help-clear')){query='';$('#help-search').value='';paintDirectory();$('#help-search').focus();return;}
    if(button.dataset.helpSection!==undefined)$(`#help-section-${button.dataset.helpSection}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  drawer.addEventListener('click',event=>{if(event.target===drawer){const rect=drawer.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)drawer.close();}});
  render();
})();
