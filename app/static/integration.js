/* The v0.4 visual shell remains intact. This runtime replaces its demo data flow. */
'use strict';

const realTools = {keywords: 'recommend', trend: 'combined', industry: 'bubble', notes: 'notes', adgroups:'adgroups', plaza:'plaza'};
const fromRealTool = {recommend: 'keywords', combined: 'trend', bubble: 'industry', notes: 'notes', adgroups:'adgroups', plaza:'plaza'};
let toolLocationImages = {};
const toolLocationPaths = {
  keywords: '小红书 · 聚光｜具体页面路径待截图确认',
  trend: '小红书 · 聚光｜具体页面路径待截图确认',
  industry: '小红书灵犀 → 行业 → 市场机会 → 市场分析 → 市场竞争分析'
};
const realRuns = new Map();
const realSelected = {};
let plazaUploadFile = null, plazaTaskCount = 0;
let notesUploadFile = null;
let notesSheets = [];
let notesSheetName = '';
let realHistory = [];
const pollTimers = new Map();
let bubbleDraft = {
  taxonomies: [{name:'', code:''}], timePartition:1, dimensionType:'1', xindex:'1',
  yindexList:['readNum'], sizeIndex:'noteNum', regionCodes:'',
  brandIdList:'', spuIdList:'', seriesIdList:''
};
const realFooter = () => `<footer class="page-foot"><span>${I('shield')} ${window.ZHICAI_SERVER_MODE?'服务器运行 · 结果按个人权限保存':'本机运行 · 任务与结果保存在当前电脑'}</span><span>统一输入 · 数据交付 · 按需授权 / ZHICAI CLOUD</span></footer>`;
connectionMethods.cookie='Cookie 导入';
statusMap.queued=['blue','等待运行'];
connectionPill=function(a){const item=accountStatuses[a.status]||accountStatuses.unverified;return `<span class="pill ${item[0]}"><span class="dot"></span>${item[1]}</span>`;};

async function realApi(path, options={}) {
  const response = await fetch(path, {...options, headers:{'Content-Type':'application/json', ...(window.ZHICAI_CSRF?{'X-CSRF-Token':window.ZHICAI_CSRF}:{}), ...(options.headers||{})}});
  let data;
  try { data = await response.json(); } catch { throw new Error(`服务响应异常（HTTP ${response.status}）`); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `请求失败（HTTP ${response.status}）`);
  return data;
}

async function realUploadApi(path, formData) {
  const headers=window.ZHICAI_CSRF?{'X-CSRF-Token':window.ZHICAI_CSRF}:{};
  const response=await fetch(path,{method:'POST',body:formData,headers});
  let data;
  try{data=await response.json();}catch{throw new Error(`服务响应异常（HTTP ${response.status}）`);}
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:`请求失败（HTTP ${response.status}）`);
  return data;
}

async function inspectNotesUpload(file) {
  notesUploadFile=file;notesSheets=[];notesSheetName='';
  const state=$('#note-file-state');
  if(!file){if(state)state.textContent='请选择 Excel 文件。';refreshConfigMeta();return;}
  if(!/\.xlsx$/i.test(file.name)){notesUploadFile=null;if(state)state.textContent='文件格式不支持，请选择 .xlsx 文件。';refreshConfigMeta();return;}
  if(file.size>20*1024*1024){notesUploadFile=null;if(state)state.textContent='文件超过 20 MB，请选择较小的文件。';refreshConfigMeta();return;}
  if(state)state.textContent='正在检查工作表和必需字段…';refreshConfigMeta();
  try{
    const form=new FormData();form.append('file',file,file.name);
    const result=await realUploadApi('/api/notes/inspect',form);
    notesSheets=result.sheets||[];
    notesSheetName=notesSheets.find(sheet=>sheet.hasRequiredColumns)?.name||'';
    const select=$('#note-sheet');
    if(select){
      select.innerHTML=notesSheets.map(sheet=>`<option value="${esc(sheet.name)}" ${sheet.name===notesSheetName?'selected':''} ${sheet.hasRequiredColumns?'':'disabled'}>${esc(sheet.name)}${sheet.hasRequiredColumns?'':'（缺少必需字段）'}</option>`).join('');
      select.disabled=!notesSheetName;
    }
    if(state)state.textContent=notesSheetName?`已读取：${file.name}；找到 ${notesSheets.filter(sheet=>sheet.hasRequiredColumns).length} 个包含必需字段的工作表。`:'至少需要一张同时包含“笔记id”和“笔记链接”的工作表。';
    refreshConfigMeta();
  }catch(error){notesSheets=[];notesSheetName='';if(state)state.textContent=error.message;refreshConfigMeta();}
}

tools.trend.title = '推荐词每日搜索量';
tools.trend.kind = 'keywords';
tools.trend.label = '输入词根';
tools.trend.desc = '先按词根获取推荐词，再查询指定日期内每个关键词的每日搜索量。';
tools.trend.input = '词根 + 日期';
tools.trend.output = '关键词、日期、搜索量';
tools.trend.sample = '';
tools.keywords.sample = '';
tools.keywords.desc = '批量查询词根的推荐关键词、月搜索指数与词根内排名。';
tools.industry.desc = '按行业、时间粒度及指标获取灵犀气泡图原始数据，导出多工作表 Excel。';
tools.industry.input = '行业 code + 日期 + 指标';
tools.industry.output = '品牌/SPU、X/Y 轴指标、气泡大小、均值';
tools.industry.sample = '';
tools.notes.title='笔记封面与内容';
tools.notes.source='小红书内容端';
tools.notes.desc='读取笔记标题、作者、正文和首张封面，逐条记录抓取状态。';
tools.notes.input='上传包含笔记id、笔记链接两列的 Excel';
tools.notes.output='笔记数据 Excel + 封面素材包';
tools.notes.sample='';

for(const [id,definition] of Object.entries({
  adgroups:{title:'聚光广告组信息导出',desc:'采集标准投广告组信息，去重数量与页面总数一致后导出。',input:'聚光账号 + 广告组页面',output:'账号、广告组、广告组ID、状态、导出时间'},
  plaza:{title:'合作广场笔记采集',desc:'按 Excel 筛选条件采集笔记，可选补采评论、情感分析与关键词词云。',input:'聚光账号 + 筛选条件 Excel',output:'笔记数据、采集记录及可选评论结果'}
})){
  tools[id]={...definition,platform:'xhs',source:'聚光',icon:'table',kind:'platform',unit:'任务',sample:'',columns:[]};
  allTools.push(id);configs[id]=defaultConfig(id);services.jug.tools.push(id);
}
toolLocationPaths.adgroups='小红书聚光 → 竞价推广 → 标准投 → 广告组';
toolLocationPaths.plaza='小红书聚光 → 合作广场';

const oldRenderChrome = renderChrome;
renderChrome = function () {
  oldRenderChrome();
  $('#side-user small').textContent = `${user().team} · ${window.ZHICAI_SERVER_MODE?'已登录':'本机使用'}`;
  $('#identity').innerHTML = `<option value="${esc(currentUser)}">${esc(user().name)} · 当前用户</option>`;
  $('#identity').disabled=!!window.ZHICAI_SERVER_MODE;
  $('#identity').setAttribute('aria-label','当前身份');
  const workspaceSmall=$('.workspace small');if(workspaceSmall)workspaceSmall.textContent=window.ZHICAI_SERVER_MODE?'团队数据工具':'本机数据工具';
  if(window.ZHICAI_SERVER_MODE&&!$('#real-logout'))$('#identity').insertAdjacentHTML('afterend','<button id="real-password-change" class="text-btn" data-password-change>改密</button><button id="real-logout" class="text-btn" data-real-logout>退出</button>');
};

openTool = function (id, record=null) {
  if (!realTools[id]) return toast('尚未接入该工具的实际采集脚本。', 'info');
  if (window.ZHICAI_SERVER_MODE&&!can(id)) return toast('当前用户没有此工具的访问权限。','alert');
  currentTool = id;
  page = 'tool';
  configErrors = [];
  if (record) realSelected[id] = record.id;
  render();
  window.scrollTo(0,0);
};

renderCatalog = function () {
  const list = allTools.filter(id => (platform==='all'||tools[id].platform===platform)
    && (!catalogQuery||(tools[id].title+tools[id].source+tools[id].desc).includes(catalogQuery)));
  $('#main').innerHTML = `<div class="heading"><div><div class="eyebrow">DATA ACQUISITION</div><h1>工具中心</h1><p>选择平台与工具，填写参数，获取可下载的数据。</p></div><div class="heading-actions"><button class="btn" data-page="history">${I('clock','i16')}<span>运行记录</span></button></div></div>
    <section class="filter-bar" aria-label="按平台筛选工具"><div class="flex"><span class="filter-title">平台</span><div class="platforms">${platformChips()}</div></div><div class="search">${I('search','i14')}<input id="tool-search" type="search" aria-label="搜索工具" placeholder="搜索工具名称" value="${esc(catalogQuery)}"></div></section>
    <div class="between catalog-meta"><span>共 ${list.length} 个工具 <span class="muted">· ${platform==='all'?'所有平台':platforms[platform].name}</span></span><span>已接入 ${Object.keys(realTools).length} 个采集流程</span></div>
    <section class="catalog-grid">${list.map(id => { const t=tools[id],ready=!!realTools[id],allowed=ready&&(!window.ZHICAI_SERVER_MODE||can(id)); return `<article class="tool-card"><div class="between">${platformBadge(t.platform)}<span class="pill">${platforms[t.platform].name} · ${t.source}</span></div><h2>${t.title}</h2><p class="desc">${t.desc}</p><div class="tool-spec"><span>输入</span><span>${t.input}</span><span>输出</span><span title="${t.output}">${t.output}</span></div><div class="tool-card-foot"><span class="pill ${allowed?'green':'amber'}">${allowed?'实际工具':ready?'未授权':'尚未接入'}</span><button class="text-btn" data-open-tool="${id}" ${allowed?'':'disabled'}>${allowed?'配置采集':ready?'无访问权限':'暂无实际工具'}${I('chevron','i14')}</button></div></article>`; }).join('')}</section>
    ${!list.length?emptyView('没有匹配的工具','试试切换平台或清空搜索条件。','search'):''}
    <div class="catalog-note">${I('info','i16')}<span>已接入关键词、搜索量、行业气泡图、笔记封面与内容、广告组导出和合作广场笔记采集。</span></div>${realFooter()}`;
};

function accountListFor(id) { return accounts.filter(a => a.service === (id==='industry'?'lingxi':'jug')&&(!window.ZHICAI_SERVER_MODE||a.teamId===window.ZHICAI_ME?.teamId)); }
function connectionFor(id) {
  const list=accountListFor(id), selected=configs[id]?.accountId;
  return list.find(a=>a.id===selected)||list.find(a=>a.status!=='disabled')||list[0];
}
function renderToolLocation(id) {
  if(id==='notes')return '';
  const image=toolLocationImages[realTools[id]];
  return `<section class="panel tool-location-card" aria-label="平台取数位置"><div class="tool-location-copy"><span class="tool-location-eyebrow">PLATFORM LOCATION</span><h2>平台取数位置</h2><p class="tool-location-path">${esc(toolLocationPaths[id])}</p><p class="tool-location-help">对照截图确认平台中的取数区域。</p></div><div class="tool-location-media">${image?`<button type="button" class="tool-location-preview" data-location-image="${id}" aria-label="放大查看${esc(tools[id].title)}的取数位置"><img src="${esc(image)}" alt="${esc(tools[id].title)}在平台中的取数位置" loading="lazy"><span>点击放大</span></button>`:`<div class="tool-location-placeholder">${I('image')}<strong>位置截图待补充</strong><span>收到该工具截图后显示在这里</span></div>`}</div></section>`;
}
renderTool = function () {
  if (!realTools[currentTool]) { page='catalog'; render(); return; }
  if (window.ZHICAI_SERVER_MODE&&!can(currentTool)) { page='catalog'; render(); return; }
  const t=tools[currentTool], supported=allTools.filter(id=>realTools[id]&&(platform==='all'||tools[id].platform===platform));
  if (!supported.includes(currentTool)) platform=t.platform;
  const items=allTools.filter(id=>realTools[id]&&(platform==='all'||tools[id].platform===platform));
  $('#main').innerHTML = `<div class="heading"><div><div class="flex" style="gap:11px"><span class="heading-icon">${I(t.icon)}</span><h1>${t.title}</h1><span class="pill green">实际工具</span></div><p>${t.desc}</p></div><div class="heading-actions"><button class="btn" data-page="catalog">${I('left','i16')}<span class="desktop-only">工具中心</span></button></div></div>
    <div class="tool-switchbar"><label class="small muted" for="tool-platform">平台</label><select id="tool-platform"><option value="all" ${platform==='all'?'selected':''}>全部平台</option><option value="xhs" ${platform==='xhs'?'selected':''}>小红书</option></select><span class="separator"></span><label class="small muted" for="tool-picker">工具</label><select id="tool-picker">${items.map(id=>`<option value="${id}" ${id===currentTool?'selected':''}>${esc(tools[id].title)}</option>`).join('')}</select><span class="hint">填写参数 → 开始采集 → 下载结果</span></div>
    ${renderToolLocation(currentTool)}<div class="workbench"><section class="panel config-panel"><div class="panel-head"><h2><span class="step">1</span>运行配置</h2><button class="text-btn" data-action="reset-config">重置</button></div><div id="config-body" class="config-body"></div><div class="config-footer"><div id="run-summary" class="run-summary"></div><button class="btn primary" id="run-button" data-action="start">${I('play','i16')}开始采集</button><div class="run-caption">${I('lock','i14')} 实际请求平台接口；结果保存在本机</div></div></section><section class="panel results" id="result-panel" aria-label="采集结果"></section></div>${realFooter()}`;
  renderConfig(); renderResult();
};

function realField(id, label, inner, hint='') {
  return `<div class="field"><div class="field-label"><label for="${id}">${label}</label></div>${inner}${hint?`<div class="field-hint">${hint}</div>`:''}</div>`;
}
function realSelect(id, entries, value) {
  return `<select id="${id}">${entries.map(([key,label])=>`<option value="${esc(key)}" ${String(key)===String(value)?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
}
function realAccountBox(id) {
  if(id==='notes')return `<div class="notice"><span>此工具按笔记公开页面抓取，无需配置聚光或灵犀账号。</span></div>`;
  const account=connectionFor(id), list=accountListFor(id);
  const canEdit=!window.ZHICAI_SERVER_MODE||account?.ownerUserId===currentUser;
  if(account)configs[id].accountId=account.id;
  return `<div class="tool-account"><div class="source">${platformBadge('xhs')}<div><b>小红书 · ${esc(tools[id].source)}</b><small>${window.ZHICAI_SERVER_MODE?'使用当前团队的平台账号':'按具体服务使用本机登录会话'}</small></div><button class="icon-btn" data-page="accounts" title="平台账号管理" aria-label="平台账号管理">${I('sliders','i16')}</button></div>
    <div class="field"><div class="field-label"><label for="run-account">使用账号<span class="required">*</span></label>${account?connectionPill(account):''}</div><select id="run-account" ${!list.length?'disabled':''}>${list.length?list.map(a=>`<option value="${esc(a.id)}" ${a.id===account?.id?'selected':''}>${esc(a.alias)}${a.status==='disabled'?' · 已停用':''}</option>`).join(''):'<option value="">暂无账号</option>'}</select>
    ${account?`<div class="account-context"><span>配置人 · ${esc(account.ownerEmail||user().name)}</span><span>${esc(connectionMethods[account.method]||'账号登录')}</span></div>`:''}</div>
    ${account?.status!=='verified'?`<div class="notice amber">${I('alert')}<span>${account?.status==='disabled'?'该连接已停用。':'尚未通过实际平台接口验证。'}${canEdit?`<br><button class="text-btn" data-edit-account="${esc(account?.id||'')}">配置连接</button> ${account?.status!=='disabled'?`<button class="text-btn" data-verify-account="${esc(account?.id||'')}">验证连接</button>`:''}`:'请联系配置人处理。'}</span></div>`:''}
    <div class="account-bound-note">${I('lock','i14')}账号凭据仅配置人可查看和修改</div></div>`;
}
function realTaxRows() {
  return `<div class="tax-head"><span>行业名称</span><span>行业 code</span><span></span></div><div id="real-tax-list">${bubbleDraft.taxonomies.map((row,i)=>`<div class="real-tax-row" data-index="${i}" style="display:grid;grid-template-columns:1fr 1.2fr 28px;gap:5px;margin-bottom:7px"><input data-tax-name="${i}" value="${esc(row.name)}" placeholder="如：母婴奶粉" aria-label="行业名称"><input data-tax-code="${i}" value="${esc(row.code)}" placeholder="taxonomyCodes" aria-label="行业 code"><button class="btn sm" data-real-remove-tax="${i}" aria-label="删除行业">×</button></div>`).join('')}</div><button class="text-btn" data-real-add-tax>${I('plus','i14')}添加行业</button>`;
}
renderConfig = function () {
  if (!$('#config-body')) return;
  const id=currentTool, c=configs[id], account=connectionFor(id), busy=realRuns.get(realSelected[id])?.status==='running';
  let html=realAccountBox(id);
  if(id==='adgroups'){
    html+=realField('adgroups-url','广告组页面链接（可选）',`<input id="adgroups-url" type="url" value="${esc(c.pageUrl||'')}" placeholder="https://ad.xiaohongshu.com/...">`,'留空时尝试从聚光首页进入竞价推广 → 标准投 → 广告组；也可粘贴对应页面链接。数量校验通过后才生成 Excel。');
  }else if(id==='plaza'){
    html+=realField('plaza-file','筛选条件文件<span class="required">*</span>',`<a class="text-btn" href="/api/plaza/template">下载筛选条件模板</a><input id="plaza-file" type="file" accept=".xlsx"><div id="plaza-file-state" class="field-hint" role="status">${plazaTaskCount?`已读取 ${plazaTaskCount} 个启用任务`:'请按模板填写并上传 .xlsx 文件（不超过 20 MB）。'}</div>`);
    html+=`<label class="flex"><input id="plaza-comments" type="checkbox" ${c.collectComments?'checked':''}>采集笔记评论</label><p class="field-hint">勾选后逐篇补采评论，并导出情感分析和关键词词云。单篇最多等待 90 秒，整项任务受服务器 15 分钟上限约束。建议先用少量笔记试跑；失败及未完成原因保留在采集记录中。</p>`;
  }else if(id==='notes'){
    html+=realField('note-file','上传笔记文件<span class="required">*</span>',`<input id="note-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-describedby="note-file-help"><div id="note-file-help" class="field-hint">仅支持 .xlsx，文件不超过 20 MB；表头必须包含“笔记id”和“笔记链接”。每次最多处理 200 条有效记录。</div><div id="note-file-state" class="field-hint" role="status">${notesUploadFile?`已选择：${esc(notesUploadFile.name)}`:'请选择 Excel 文件。'}</div>`);
    const sheetOptions=notesSheets.map(sheet=>`<option value="${esc(sheet.name)}" ${sheet.name===notesSheetName?'selected':''} ${sheet.hasRequiredColumns?'':'disabled'}>${esc(sheet.name)}${sheet.hasRequiredColumns?'':'（缺少必需字段）'}</option>`);
    html+=realField('note-sheet','数据工作表',`<select id="note-sheet" ${!notesSheets.length?'disabled':''}>${sheetOptions.length?sheetOptions.join(''):'<option value="">上传文件后选择</option>'}</select>`,'选择包含“笔记id”和“笔记链接”两列的工作表。');
    html+=realField('note-mode','运行方式',realSelect('note-mode',[['all','正式处理全部链接'],['trial','试跑前几条'],['validate','仅检查文件，不联网']], 'all'));
    html+=`<div id="note-limit-field" class="${$('#note-mode')?.value==='trial'?'':'hidden'}">${realField('note-limit','试跑条数',`<input id="note-limit" type="number" min="1" max="200" value="3">`)}</div>`;
  }
  else if (id!=='industry') {
    html+=realField('input-list','词根列表<span class="required">*</span>',`<textarea id="input-list" data-config="input" maxlength="30000" spellcheck="false" placeholder="每行一个词根，可从 Excel 复制" ${busy?'disabled':''}>${esc(c.input)}</textarea><div id="input-meta" class="field-hint"></div>`);
    html+=`<div class="input-actions"><button class="text-btn" data-action="import">${I('upload','i14')}导入 CSV / TXT</button><button class="text-btn" data-action="template">下载单列模板</button></div><input id="file-input" type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden" aria-label="选择词根文件">`;
    if(id==='trend') html+=realField('date-start','查询日期<span class="required">*</span>',`<div class="dates"><input type="date" id="date-start" data-config="start" value="${esc(c.start)}" aria-label="开始日期"><span>至</span><input type="date" id="date-end" data-config="end" value="${esc(c.end)}" aria-label="结束日期"></div><div class="presets">${[7,14,30].map(n=>`<button data-days="${n}" class="${c.preset===n?'active':''}">近 ${n} 天</button>`).join('')}</div>`,'包含起止日期；先扩词，再查询每个推荐词的每日搜索量。');
    html+=`<div class="field"><label class="flex" style="font-size:11px;color:#53637c"><input id="only-contain" type="checkbox" ${c.onlyContainRoot?'checked':''}>推荐词必须包含对应词根</label></div>`;
  } else {
    html+=realField('real-tax-list','行业名称与行业code<span class="required">*</span>',realTaxRows());
    html+=realField('date-start','查询日期<span class="required">*</span>',`<div class="dates"><input type="${bubbleDraft.timePartition===2?'month':'date'}" id="date-start" data-config="start" value="${esc(c.start.slice(0,bubbleDraft.timePartition===2?7:10))}" aria-label="开始日期"><span>至</span><input type="${bubbleDraft.timePartition===2?'month':'date'}" id="date-end" data-config="end" value="${esc(c.end.slice(0,bubbleDraft.timePartition===2?7:10))}" aria-label="结束日期"></div>`);
    html+=realField('partition','时间粒度',realSelect('partition',[[1,'按日'],[4,'按周'],[2,'按月']],bubbleDraft.timePartition));
    html+=realField('dimension','分析主体',realSelect('dimension',[['1','品牌'],['2','SPU'],['3','系列']],bubbleDraft.dimensionType));
    html+=realField('x-axis','X 轴',realSelect('x-axis',[['1','搜索量'],['impNum','曝光量'],['readNum','阅读量']],bubbleDraft.xindex));
    html+=`<div class="field"><div class="field-label"><span>Y 轴<span class="required">*</span> · 可多选</span></div>${[['readNum','阅读量'],['readYOYIncreaseRate','阅读同比增长率'],['readRGIncreaseRate','阅读环比增长率']].map(([key,label])=>`<label class="flex" style="margin:6px 0;font-size:11px;color:#53637c"><input type="checkbox" data-y-axis="${key}" ${bubbleDraft.yindexList.includes(key)?'checked':''}>${label}</label>`).join('')}</div>`;
    html+=realField('size-axis','气泡大小',realSelect('size-axis',[['noteNum','平均有曝光笔记数'],['noteIncreaseNum','新增笔记数']],bubbleDraft.sizeIndex));
    html+=`<details class="run-details"><summary>高级筛选（可留空）</summary>${[['regionCodes','地域 code，空白为全国'],['brandIdList','品牌 ID'],['spuIdList','SPU ID'],['seriesIdList','系列 ID']].map(([key,label])=>realField(key,label,`<input id="${key}" value="${esc(bubbleDraft[key])}" placeholder="多个值用逗号分隔">`)).join('')}</details>`;
  }
  html+=`<div class="field"><div class="field-label"><span>交付内容</span><span class="pill">${id==='notes'?'Excel + ZIP':['industry','adgroups','plaza'].includes(id)?'Excel':'CSV'}</span></div><div class="field-hint" style="border:1px solid var(--line);border-radius:6px;padding:9px 10px;background:#fafcff">${esc(tools[id].output)}<br>失败项保留原因，不填充模拟值。</div></div><div id="config-errors" class="form-errors hidden" role="alert"></div>`;
  $('#config-body').innerHTML=html;
  refreshConfigMeta();
};

refreshConfigMeta = function () {
  const button=$('#run-button'); if(!button)return;
  const id=currentTool, run=realRuns.get(realSelected[id]), account=id==='notes'?true:connectionFor(id);
  const count=id==='notes'?(notesUploadFile&&notesSheetName?1:0):id==='industry'?bubbleDraft.taxonomies.filter(x=>x.name&&x.code).length:inputItems(configs[id],id).valid.length;
  if($('#input-meta')) $('#input-meta').textContent=`已识别 ${count} 个词根`;
  $('#run-summary').textContent=id==='notes'?(count?'已读取 1 个 Excel 文件':'等待上传 .xlsx 文件'):id==='industry'?`${count} 个行业 · ${bubbleDraft.yindexList.length} 个 Y 轴指标 · Excel 文件`:`${count} 个词根 · CSV 文件`;
  const blocked=!account||account.status==='disabled'||(id==='notes'&&(!notesUploadFile||!notesSheetName))||(id==='plaza'&&(!plazaUploadFile||!plazaTaskCount));
  if(id==='adgroups')$('#run-summary').textContent='采集全部广告组 · 数量校验 · Excel';
  if(id==='plaza')$('#run-summary').textContent=`${plazaTaskCount} 个启用任务 · Excel`;
  button.disabled=blocked||['queued','running'].includes(run?.status);
  button.innerHTML=run?.status==='running'?'<span class="spinner"></span> 正在采集':blocked?(id==='notes'?I('upload','i16')+'请先上传文件':I('lock','i16')+'账号已停用'):I('play','i16')+'开始采集';
};

function realError(message) { const box=$('#config-errors'); if(box){box.textContent=message;box.classList.remove('hidden');} toast(message,'alert'); }
function collectRealParams(id) {
  if(id==='adgroups')return {pageUrl:$('#adgroups-url').value};
  if(id==='plaza')return {collectComments:$('#plaza-comments').checked};
  if(id==='notes'){const mode=$('#note-mode').value;return {sheetName:notesSheetName,mode,limit:mode==='trial'?Number($('#note-limit')?.value||3):null};}
  const c=configs[id];
  if(id!=='industry') {
    if(!c.input.trim()) throw new Error('请至少填写一个词根。');
    return {roots:c.input,onlyContainRoot:!!$('#only-contain').checked,...(id==='trend'?{start:$('#date-start').value,end:$('#date-end').value}:{})};
  }
  bubbleDraft.taxonomies=$$('[data-index].real-tax-row').map(row=>({name:$('[data-tax-name]',row).value.trim(),code:$('[data-tax-code]',row).value.trim()}));
  bubbleDraft.timePartition=Number($('#partition').value);
  bubbleDraft.dimensionType=$('#dimension').value;
  bubbleDraft.xindex=$('#x-axis').value;
  bubbleDraft.sizeIndex=$('#size-axis').value;
  bubbleDraft.yindexList=$$('[data-y-axis]:checked').map(el=>el.dataset.yAxis);
  for(const key of ['regionCodes','brandIdList','spuIdList','seriesIdList']) bubbleDraft[key]=$(`#${key}`).value;
  return {...bubbleDraft,start:$('#date-start').value,end:$('#date-end').value};
}

async function realStart() {
  const id=currentTool, account=id==='notes'?{id:'',status:'verified'}:connectionFor(id);
  if(!account||account.status==='disabled') return realError('请先在平台账号中启用连接。');
  try {
    const params=collectRealParams(id);
    const button=$('#run-button'); button.disabled=true;
    let created;
    if(id==='plaza'){
      if(!plazaUploadFile||!plazaTaskCount)throw new Error('请先上传并检查筛选条件文件。');
      const form=new FormData();form.append('file',plazaUploadFile,plazaUploadFile.name);form.append('account_id',account.id);form.append('collect_comments',String(params.collectComments));
      created=await realUploadApi('/api/plaza/runs',form);
    }else if(id==='notes'){
      if(!notesUploadFile)throw new Error('请先上传包含笔记id和笔记链接的 .xlsx 文件。');
      const form=new FormData();form.append('file',notesUploadFile,notesUploadFile.name);form.append('sheet_name',params.sheetName);form.append('mode',params.mode);if(params.limit!==null)form.append('limit',String(params.limit));
      created=await realUploadApi('/api/notes/runs',form);
    }else created=await realApi('/api/runs',{method:'POST',body:JSON.stringify({tool:realTools[id],params,accountId:account.id})});
    realSelected[id]=created.id;
    toast('任务已创建，正在请求平台。','info');
    await realPoll(created.id);
    if(['queued','running'].includes(realRuns.get(created.id)?.status)&&!pollTimers.has(created.id)) pollTimers.set(created.id,setInterval(()=>realPoll(created.id),1800));
  } catch(error) { realError(error.message); refreshConfigMeta(); }
}
async function realPoll(id) {
  try {
    const run=await realApi(`/api/runs/${id}`);
    realRuns.set(id,run);
    if(page==='tool'&&realSelected[currentTool]===id){renderResult();refreshConfigMeta();}
    if(!['queued','running'].includes(run.status)) {
      clearInterval(pollTimers.get(id));pollTimers.delete(id);
      if(page==='history') await fetchHistory();
    }
  } catch(error) {clearInterval(pollTimers.get(id));pollTimers.delete(id);toast(error.message,'alert');}
}

renderResult = function () {
  if(page!=='tool'||!$('#result-panel'))return;
  const run=realRuns.get(realSelected[currentTool]);
  let body;
  if(!run) body=`<div class="notice">${I('info')}<span>填写左侧参数并开始采集。这里会显示实际平台返回的结果与失败项。</span></div>${emptyView('尚无运行结果','运行后预览前 30 行，并下载完整文件。','table')}`;
  else {
    const busy=['queued','running'].includes(run.status), columns=run.columns||[];
    const rows=run.rows||[];
    const pct=run.total?Math.min(100,Math.round(run.processed/run.total*100)):0;
    body=`<div class="notice"><span>任务 <span class="mono">${esc(run.id.slice(0,8))}</span> · ${esc(run.created.replace('T',' ').slice(0,19))}<br>来源：小红书 / ${esc(tools[currentTool].source)} · 结果来自实际平台接口</span></div>
      ${busy?`<div class="run-progress"><div class="between"><span>${esc(run.stage||'正在采集')} · 已处理 ${run.processed} / ${run.total} 项</span><button class="text-btn" data-real-cancel="${run.id}">取消任务</button></div>${run.counts?`<div class="field-hint">成功 ${run.counts.success} · 部分成功 ${run.counts.partial} · 失败 ${run.counts.failed}</div>`:''}<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`:''}
      <div class="run-info-line">${statusPill(run.status)}<span>数据 <strong>${number(run.rowCount)}</strong> 行</span><span class="${run.failures.length?'failed':''}">失败 ${run.failures.length} 项</span></div>
      <div class="result-toolbar"><div><h3>数据明细</h3><small>${rows.length?(currentTool==='notes'?'预览前 30 行；Excel 保留每条笔记的状态和错误原因':'预览前 30 行，下载含所有成功结果'):'暂无结果'}</small></div><div class="flex wrap" style="gap:6px">${(run.rowCount||(['adgroups','plaza'].includes(currentTool)&&run.outputReady))&&!busy&&(!['adgroups','plaza'].includes(currentTool)||run.outputReady)?`<a class="btn primary" href="/api/runs/${run.id}/download">${I('download','i16')}${currentTool==='notes'?'下载结果 Excel':`下载${run.status==='partial'?'成功结果':'完整结果'}`}</a>${currentTool==='notes'&&run.coverCount?`<a class="btn" href="/api/runs/${run.id}/assets">${I('download','i16')}下载封面素材包（${run.coverCount}）</a>`:''}`:'<button class="btn" disabled>完成后下载</button>'}</div></div>
      ${rows.length?realTable(columns,rows):emptyView(busy?'正在等待数据':'暂无数据',busy?'完成第一批请求后会显示。':'请查看失败原因或调整查询条件。')}
      ${run.sheets.length?`<div class="table-caption">Excel 工作表：${run.sheets.map(s=>`${esc(s.name)}（${s.count} 行）`).join('、')}</div>`:`<div class="table-caption">显示 ${rows.length} / ${run.rowCount} 行 · 来自平台接口</div>`}
      ${run.failures.length?`<details class="run-details"><summary>失败明细（${run.failures.length} 项）</summary><ul>${run.failures.map(f=>`<li>${esc(f.item)}：${esc(f.error)}</li>`).join('')}</ul></details>`:''}
      <details class="run-details"><summary>运行说明</summary><dl><dt>查询参数</dt><dd>${esc(JSON.stringify(run.params))}</dd><dt>完成时间</dt><dd>${esc(run.ended||'运行中')}</dd><dt>保存位置</dt><dd>本机工作台运行记录</dd></dl></details>`;
  }
  $('#result-panel').innerHTML=`<div class="panel-head"><h2><span class="step">2</span>采集结果</h2>${run?statusPill(run.status):'<span class="pill">等待运行</span>'}</div><div class="result-body">${body}</div><div class="result-foot"><span>数据获取 · 明细预览</span><span>智采 cloud</span></div>`;
};
function realTable(columns,rows){return `<div class="data-wrap"><table class="data-table"><thead><tr><th class="row-index">#</th>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr><td class="row-index">${i+1}</td>${row.map(v=>`<td title="${esc(v)}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}

async function fetchHistory() {
  try {realHistory=await realApi('/api/runs');if(page==='history')renderHistory();}
  catch(error){toast(error.message,'alert');}
}
renderHistory = function () {
  const f=historyFilters, available=allTools.filter(id=>realTools[id]&&(f.platform==='all'||tools[id].platform===f.platform));
  if(!available.includes(f.tool))f.tool='all';
  const nowDate=new Date(), dateStart=f.period==='today'?localDate(nowDate):['7','30'].includes(f.period)?localDate(new Date(Date.now()-(Number(f.period)-1)*86400000)):f.period==='custom'?f.start:'';
  const dateEnd=f.period==='custom'?f.end:'';
  const invalid=!!(dateStart&&dateEnd&&dateStart>dateEnd);
  const list=invalid?[]:realHistory.filter(r=>{const id=fromRealTool[r.tool];return id&&(f.platform==='all'||tools[id].platform===f.platform)&&(f.tool==='all'||id===f.tool)&&(!dateStart||r.created.slice(0,10)>=dateStart)&&(!dateEnd||r.created.slice(0,10)<=dateEnd);});
  const active=f.platform!=='all'||f.tool!=='all'||f.period!=='all';
  $('#main').innerHTML=`<div class="heading"><div><div class="eyebrow">RUN HISTORY</div><h1>运行记录</h1><p>按平台、工具和创建时间，找回采集结果。</p></div><div class="heading-actions"><button class="btn primary" data-page="catalog">${I('plus','i16')}新建采集</button></div></div>
  <section class="panel history-filter-panel"><div class="history-filter-grid">
  ${realField('history-platform','平台',realSelect('history-platform',[['all','全部平台'],['xhs','小红书']],f.platform))}
  ${realField('history-tool','工具',realSelect('history-tool',[['all','全部工具'],...available.map(id=>[id,tools[id].title])],f.tool))}
  ${realField('history-period','创建时间',realSelect('history-period',[['all','全部时间'],['today','今天'],['7','近 7 天'],['30','近 30 天'],['custom','自定义日期']],f.period))}
  <button class="btn ghost reset-history" data-action="reset-history" ${active?'':'disabled'}>${I('refresh','i14')}重置筛选</button></div>
  ${f.period==='custom'?`<div class="history-custom"><label for="history-start">起止日期</label><input id="history-start" type="date" value="${esc(f.start)}"><span>至</span><input id="history-end" type="date" value="${esc(f.end)}"><small>可只填一端</small></div>`:''}
  <div class="history-filter-hint ${invalid?'error':''}">${I(invalid?'alert':'info','i14')}${invalid?'开始日期不能晚于结束日期。':'依据任务创建时间筛选，不是数据查询日期。'}</div></section>
  <section class="panel history-panel"><div class="history-head"><h2>我的任务 <span class="pill">${list.length}</span></h2><p>${active?'匹配 '+list.length+' / '+realHistory.length+' 条':'共 '+realHistory.length+' 条'}记录</p></div>
  ${list.length?`<div class="history-table-scroll"><table class="data-table history-table"><thead><tr><th>平台</th><th>工具 / 任务</th><th>平台账号</th><th>创建时间</th><th>状态</th><th>处理结果</th><th>操作</th></tr></thead><tbody>${list.map(r=>`<tr><td><div class="flex">${platformBadge('xhs')}<span>小红书</span></div></td><td><div class="history-tool"><div><b>${esc(tools[fromRealTool[r.tool]].title)}</b><small>${esc(r.id.slice(0,8))}</small></div></div></td><td>${esc(r.accountAlias||'—')}</td><td class="history-date">${esc(r.created.replace('T',' ').slice(0,19))}</td><td>${statusPill(r.status)}</td><td>${r.rowCount} 行 / ${r.failureCount} 失败</td><td><div class="history-actions"><button class="text-btn" data-real-view="${r.id}">查看</button>${(r.rowCount||r.outputReady)&&!['queued','running'].includes(r.status)&&(!['adgroups','plaza'].includes(r.tool)||r.outputReady)?`<a class="text-btn" href="/api/runs/${r.id}/download">${I('download','i14')}下载</a>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:emptyView(invalid?'请调整日期范围':realHistory.length?'没有匹配的运行记录':'还没有运行记录',invalid?'开始日期需要早于结束日期。':realHistory.length?'调整筛选条件。':'从工具中心开始采集。','clock')}</section>
  <div class="catalog-note">${I('info','i16')}<span>运行记录保存在本机服务端，关闭网页后仍可找回已完成的结果。</span></div>${realFooter()}`;
};

const oldRenderAccounts=renderAccounts;
renderAccounts=function(){
  oldRenderAccounts();
  const heading=$('.heading p');if(heading)heading.textContent='维护聚光与灵犀连接；采集时使用已登录的本机浏览器会话。';
  const principle=$('.connection-principle strong');if(principle)principle.textContent='配置连接 → 验证登录 → 选择工具采集';
  const header=$('.account-panel .panel-head .small');if(header)header.textContent='连接状态以真实平台请求为准';
  $$('[data-verify-account]').forEach(el=>{el.textContent='验证连接';el.disabled=false;el.title='实际请求平台接口验证登录状态';});
  $$('[data-edit-account]').forEach(el=>el.textContent='配置 / 登录');
  const security=$('.account-security-note');if(security)security.innerHTML=`${I('shield','i20')}<div><strong>手动／扫码登录会打开 Edge 窗口；Cookie 导入不会弹出窗口。</strong><p>Cookie 在服务端加密保存，打开对应账号的配置页会回填原文；账号列表只显示配置状态。保存后还需验证连接。</p></div>`;
  $$('[data-account-row]').forEach(row=>{const a=accounts.find(x=>x.id===row.dataset.accountRow);if(a?.cookieConfigured){const method=row.querySelector('td:nth-child(2) small');if(method)method.textContent='Cookie 已保存 · '+(a.cookieSavedAt?formatTime(a.cookieSavedAt):'待验证');}});
  const foot=$('.account-table-foot');if(foot)foot.innerHTML='<span>每个账号使用独立浏览器会话</span><span>停用后不能用该账号发起采集</span>';
  const pageFoot=$('.page-foot');if(pageFoot)pageFoot.outerHTML=realFooter();
};

function realCredentialMarkup(method,a){
  if(method==='cookie')return `<div class="credential-box"><h3>Cookie 配置</h3><div class="notice" style="margin:10px 0">${I('check','i14')}<span id="real-cookie-availability">${a.cookieConfigured?'正在读取已保存的 Cookie…':'尚未保存 Cookie'}</span></div><p class="field-hint">Cookie 会回填在下方。修改后点击“保存 Cookie”；随后点击“验证连接”检查是否有效。</p><div class="field"><div class="field-label"><label for="real-cookie">Cookie</label></div><textarea id="real-cookie" class="secret-input" rows="5" autocomplete="off" spellcheck="false" placeholder="name=value; name2=value2"></textarea></div><button class="btn primary sm" data-real-import-cookie="${esc(a.id)}">保存 Cookie</button></div>`;
  return `<div class="credential-box login-box"><div class="login-explanation"><span class="browser-connection-icon">${I('terminal')}</span><div><h3>使用已登录浏览器会话</h3><p>支持手动输入账号密码或扫码登录；后续采集复用此会话。</p></div></div><div class="login-complete"><span class="pill ${a.status==='verified'?'green':'amber'}">${a.status==='verified'?'已验证':'待验证'}</span><button class="btn primary sm" data-real-login="${a.id}">打开登录窗口</button></div></div>`;
}
openAccountEditor=function(id=null){
  const existing=id?accounts.find(x=>x.id===id):null;
  if(id&&!existing)return;
  const a=existing||{id:'',service:'jug',alias:'',status:'unverified'};
  accountDraft=clone(a); accountFormDirty=false;
  $('#account-drawer-content').innerHTML=`<div class="drawer-header"><div><div class="eyebrow">PLATFORM CONNECTION</div><h2 id="account-drawer-title">${existing?'配置平台账号':'新增平台账号'}</h2><p>${existing?esc(a.alias):'每个账号使用独立的本机登录会话。'}</p></div><button class="icon-btn" data-action="close-account" aria-label="关闭">${I('close','i20')}</button></div>
    <div class="drawer-body"><div class="notice">${I('info')}<span>${existing?`这是本机的 ${esc(services[a.service].name)} 连接。`:'请选择聚光或灵犀服务。'}登录将在专用浏览器窗口中完成。</span></div>
    ${realField('real-service','具体服务',realSelect('real-service',[['jug','聚光'],['lingxi','灵犀']],a.service),existing?'已建立的账号不能修改服务；可新增另一账号。':'')}
    ${realField('real-alias','账号别名<span class="required">*</span>',`<input id="real-alias" maxlength="40" value="${esc(a.alias)}" placeholder="例如：品牌 A 聚光账号">`)}
    ${existing?`<div class="drawer-section-title"><span class="step">2</span><h3>建立连接</h3></div>
    ${realField('real-method','连接方式',realSelect('real-method',[['login','账号登录'],['cookie','Cookie 导入']],a.method||'login'))}
    <div id="real-credential-mode">${realCredentialMarkup(a.method||'login',a)}</div>`:''}
    <p class="field-hint">账号密码只在平台登录窗口中填写；Cookie 在服务端加密保存，配置页回填时不会写入浏览器本地存储。</p></div>
    <div class="drawer-footer"><div><strong>${existing?'登录完成后请验证连接':'保存后打开登录窗口'}</strong><small>${existing?'验证会调用实际平台接口。':'账号默认未验证。'}</small></div><div class="flex"><button class="btn" data-action="close-account">关闭</button><button class="btn primary" data-real-save-alias="${a.id||'new'}">${existing?'保存配置':'新增账号'}</button></div></div>`;
  if(existing)$('#real-service').disabled=true;
  $('#account-drawer').showModal();
  if(existing&&a.method==='cookie')void fillStoredCookie(a.id);
};
closeAccountEditor=function(){accountDraft=null;accountFormDirty=false;if($('#account-drawer').open)$('#account-drawer').close();};
async function fillStoredCookie(id){
  const field=$('#real-cookie'),notice=$('#real-cookie-availability');
  if(!field||!accountDraft||accountDraft.id!==id)return;
  try{
    const result=await realApi(`/api/accounts/${id}/cookie/reveal`,{method:'POST',body:'{}'});
    if(!field.isConnected||!accountDraft||accountDraft.id!==id||accountDraft.method!=='cookie')return;
    accountDraft.cookieOriginal=result.content;
    if(!field.value)field.value=result.content;
    if(notice)notice.textContent=result.available?`已保存 Cookie${accountDraft.cookieSavedAt?' · '+formatTime(accountDraft.cookieSavedAt):''}，可在下方查看和修改。`:'旧 Cookie 原文未能恢复，请重新粘贴并保存一次。';
  }catch(error){if(notice?.isConnected)notice.textContent=`读取 Cookie 失败：${error.message}`;}
}
async function saveCookieValue(id,content){
  const result=await realApi(`/api/accounts/${id}/cookie`,{method:'POST',body:JSON.stringify({content})});
  const a=accounts.find(x=>x.id===id);
  if(a){a.status='unverified';a.method='cookie';a.cookieConfigured=true;a.cookieSavedAt=result.cookieSavedAt;}
  if(accountDraft&&accountDraft.id===id){Object.assign(accountDraft,a);accountDraft.cookieOriginal=content;}
  if($('#real-credential-mode')){$('#real-credential-mode').innerHTML=realCredentialMarkup('cookie',accountDraft);$('#real-cookie').value=content;const note=$('#real-cookie-availability');if(note)note.textContent=`已保存 Cookie · ${formatTime(result.cookieSavedAt)}，可在下方查看和修改。`;}
  return result;
}
verifyAccount=async function(id){
  const a=accounts.find(x=>x.id===id);if(!a)return;
  try {const result=await realApi(`/api/accounts/${a.id}/verify`,{method:'POST',body:'{}'});a.status='verified';a.verifiedAt=result.verifiedAt;a.lastEvent=result.message;toast(result.message);renderAccounts();}
  catch(error){try{const latest=(await realApi('/api/accounts')).find(x=>x.id===id);if(latest)Object.assign(a,latest);}catch{}a.lastEvent=error.message;toast(error.message,'alert');renderAccounts();}
};
toggleAccount=async function(id){const a=accounts.find(x=>x.id===id);if(!a)return;try{const result=await realApi(`/api/accounts/${id}`,{method:'PATCH',body:JSON.stringify({disabled:a.status!=='disabled'})});Object.assign(a,result);renderAccounts();toast(a.status==='disabled'?'连接已停用。':'连接已启用，请重新验证。');}catch(error){toast(error.message,'alert');}};

renderPermissions=function(){
  const local=user(), supported=allTools.filter(id=>realTools[id]);
  const visible=allTools.filter(id=>permPlatform==='all'||tools[id].platform===permPlatform);
  $('#main').innerHTML=`<div class="heading"><div><div class="eyebrow">ACCESS CONTROL</div><h1>权限配置</h1><p>沿用原版的团队与工具视图；本机模式只识别当前电脑用户。</p></div></div>
    <div class="notice amber" style="margin-bottom:18px">${I('info')}<span>当前选择了本机使用。这里展示本机用户的工具访问情况；如果将来要按团队成员执行真实权限，需要先部署独立登录与服务端鉴权。</span></div>
    <div class="member-team-filter panel"><label for="member-team-filter">团队筛选</label><select id="member-team-filter"><option value="all" ${memberTeam==='all'?'selected':''}>全部团队（1）</option><option value="本机使用" ${memberTeam==='本机使用'?'selected':''}>本机使用（1）</option></select></div>
    <div class="permission-layout"><section class="panel member-panel"><div class="panel-head"><h2>成员 <span class="pill">1</span></h2></div><div class="member-list"><div class="member active"><span class="avatar">${esc(local.name.slice(-2))}</span><div><strong>${esc(local.name)}</strong><small>本机使用 · 当前用户</small></div></div></div></section>
    <section class="panel permission-editor"><div class="editor-top"><div class="editor-person"><div class="flex"><span class="avatar">${esc(local.name.slice(-2))}</span><div><h2>${esc(local.name)}</h2><small>本机使用 · 管理员</small></div></div></div><div class="scope-line"><span>本机开放 ${supported.length} 个真实采集流程</span></div></div>
    <div class="permission-filters"><span class="label">工具访问 <span class="pill blue">${visible.filter(id=>realTools[id]).length} / ${visible.length}</span></span><div class="flex"><label for="perm-platform" class="small muted">平台</label><select id="perm-platform"><option value="all" ${permPlatform==='all'?'selected':''}>全部平台</option>${Object.entries(platforms).map(([id,item])=>`<option value="${id}" ${permPlatform===id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div></div>
    <div class="matrix-scroll"><table class="matrix access-matrix"><thead><tr><th>平台 / 工具</th><th>允许访问</th><th>可用账号</th></tr></thead><tbody>${visible.map(id=>`<tr><td><span class="tool-title">${esc(tools[id].title)}</span><span class="tool-source">${esc(tools[id].source)}</span></td><td>${realTools[id]?'<span class="pill green">本机可用</span>':'<span class="pill amber">尚未接入</span>'}</td><td>${realTools[id]?esc(connectionFor(id)?.alias||'待配置'):'—'}</td></tr>`).join('')}</tbody></table></div><div class="permission-note">本机单用户模式不提供虚构成员或可绕过的授权开关。</div></section></div>${realFooter()}`;
};

clickActions.start=realStart;
clickActions['reset-config']=()=>{if(currentTool==='plaza'){plazaUploadFile=null;plazaTaskCount=0;}if(realRuns.get(realSelected[currentTool])?.status==='running')return;configs[currentTool]=defaultConfig(currentTool);configs[currentTool].input='';configs[currentTool].onlyContainRoot=currentTool==='keywords';if(currentTool==='notes'){notesUploadFile=null;notesSheets=[];notesSheetName='';}bubbleDraft={taxonomies:[{name:'',code:''}],timePartition:1,dimensionType:'1',xindex:'1',yindexList:['readNum'],sizeIndex:'noteNum',regionCodes:'',brandIdList:'',spuIdList:'',seriesIdList:''};renderConfig();renderResult();};
clickActions.template=()=>saveFile('﻿"词根"\r\n',`${tools[currentTool].title}_输入模板.csv`);
clickActions['close-account']=closeAccountEditor;
clickActions['add-account']=()=>openAccountEditor(null);
clickActions['reset-history']=()=>{historyFilters={platform:'all',tool:'all',period:'all',start:'',end:''};renderHistory();};
clickActions['add-member']=()=>toast('本机模式仅当前电脑用户；团队成员需要独立登录服务。','info');
clickActions['save-permissions']=()=>toast('本机模式只识别当前电脑用户。','info');

document.addEventListener('click',async event=>{
  const locationButton=event.target.closest('[data-location-image]');
  if(locationButton){const id=locationButton.dataset.locationImage,src=toolLocationImages[realTools[id]];if(src){showModal('平台取数位置',`<figure><img src="${esc(src)}" alt="${esc(tools[id].title)}在平台中的取数位置"><figcaption>${esc(tools[id].title)} · <a href="${esc(src)}" target="_blank" rel="noopener">查看原图</a></figcaption></figure>`);$('#modal').classList.add('location-modal');}return;}
  const add=event.target.closest('[data-real-add-tax]');
  if(add){bubbleDraft.taxonomies=$$('[data-index].real-tax-row').map(row=>({name:$('[data-tax-name]',row).value,code:$('[data-tax-code]',row).value}));bubbleDraft.taxonomies.push({name:'',code:''});renderConfig();return;}
  const remove=event.target.closest('[data-real-remove-tax]');
  if(remove){bubbleDraft.taxonomies=$$('[data-index].real-tax-row').map(row=>({name:$('[data-tax-name]',row).value,code:$('[data-tax-code]',row).value}));bubbleDraft.taxonomies.splice(Number(remove.dataset.realRemoveTax),1);renderConfig();return;}
  const login=event.target.closest('[data-real-login]');
  if(login){login.disabled=true;try{const result=await realApi(`/api/accounts/${login.dataset.realLogin}/login`,{method:'POST',body:'{}'});const a=accounts.find(x=>x.id===login.dataset.realLogin);if(a)a.status='unverified';toast(result.message,'info');}catch(error){toast(error.message,'alert');}finally{login.disabled=false;}return;}
  const importButton=event.target.closest('[data-real-import-cookie]');
  if(importButton){const content=$('#real-cookie')?.value||'';if(!content.trim())return toast('请填写 Cookie。','alert');importButton.disabled=true;try{const result=await saveCookieValue(importButton.dataset.realImportCookie,content);toast(result.message,'info');}catch(error){toast(error.message,'alert');}finally{importButton.disabled=false;}return;}
  const save=event.target.closest('[data-real-save-alias]');
  if(save){const alias=$('#real-alias').value.trim();if(!alias)return toast('请输入账号别名。','alert');try{const isNew=save.dataset.realSaveAlias==='new';if(!isNew&&accountDraft?.method==='cookie'){const content=$('#real-cookie')?.value||'';if(content.trim()&&content!==accountDraft.cookieOriginal)await saveCookieValue(save.dataset.realSaveAlias,content);}const result=await realApi(isNew?'/api/accounts':`/api/accounts/${save.dataset.realSaveAlias}`,{method:isNew?'POST':'PATCH',body:JSON.stringify(isNew?{service:$('#real-service').value,alias}:{alias})});if(isNew)accounts.push({...result,owner:'local',method:'login',credentialConfigured:true});else Object.assign(accounts.find(x=>x.id===result.id),result);closeAccountEditor();renderAccounts();toast(isNew?'账号已新增，请配置登录。':'配置已保存。');}catch(error){toast(error.message,'alert');}return;}
  const open=event.target.closest('[data-real-view]');
  if(open){try{const run=await realApi(`/api/runs/${open.dataset.realView}`);realRuns.set(run.id,run);openTool(fromRealTool[run.tool],run);if(['queued','running'].includes(run.status)&&!pollTimers.has(run.id))pollTimers.set(run.id,setInterval(()=>realPoll(run.id),1800));}catch(error){toast(error.message,'alert');}return;}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='note-file'){void inspectNotesUpload(el.files?.[0]||null);return;}
  if(el.id==='adgroups-url'){configs.adgroups.pageUrl=el.value;return;}
  if(el.id==='plaza-comments'){configs.plaza.collectComments=el.checked;return;}
  if(el.id==='plaza-file'){
    const file=el.files[0];plazaUploadFile=null;plazaTaskCount=0;refreshConfigMeta();
    if(!file)return;
    const state=$('#plaza-file-state');
    try{
      if(!/\.xlsx$/i.test(file.name)||file.size>20*1024*1024)throw new Error('请选择不超过 20 MB 的 .xlsx 文件。');
      state.textContent='正在检查筛选条件…';const form=new FormData();form.append('file',file,file.name);
      const result=await realUploadApi('/api/plaza/inspect',form);
      if(el.files[0]!==file)return;
      plazaUploadFile=file;plazaTaskCount=result.taskCount;state.textContent=`已读取 ${plazaTaskCount} 个启用任务`;
    }catch(error){state.textContent=error.message;}
    refreshConfigMeta();return;
  }
  if(el.id==='note-sheet'){notesSheetName=el.value;refreshConfigMeta();return;}
  if(el.id==='note-mode'){$('#note-limit-field')?.classList.toggle('hidden',el.value!=='trial');refreshConfigMeta();return;}
  if(el.id==='real-method'&&accountDraft){accountDraft.method=el.value;$('#real-credential-mode').innerHTML=realCredentialMarkup(el.value,accountDraft);if(el.value==='cookie')void fillStoredCookie(accountDraft.id);return;}
  if(el.id==='only-contain'){configs[currentTool].onlyContainRoot=el.checked;return;}
  if(el.id==='partition'){bubbleDraft.timePartition=Number(el.value);configs.industry.start=configs.industry.start.slice(0,bubbleDraft.timePartition===2?7:10);configs.industry.end=configs.industry.end.slice(0,bubbleDraft.timePartition===2?7:10);renderConfig();return;}
  if(el.id==='dimension')bubbleDraft.dimensionType=el.value;
  if(el.id==='x-axis')bubbleDraft.xindex=el.value;
  if(el.id==='size-axis')bubbleDraft.sizeIndex=el.value;
  if(el.dataset.yAxis)bubbleDraft.yindexList=$$('[data-y-axis]:checked').map(x=>x.dataset.yAxis);
});
document.addEventListener('input',event=>{if(event.target.id==='note-limit')refreshConfigMeta();});

persist=function(){};
$('#modal').addEventListener('close',()=>$('#modal').classList.remove('location-modal'));

(async()=>{
  try {
    const meta=await realApi('/api/meta');
    window.ZHICAI_SERVER_MODE=!!meta.serverMode;
    const me=meta.serverMode?await realApi('/api/auth/me'):null;
    if(me){window.ZHICAI_ME=me;window.ZHICAI_CSRF=me.csrfToken;}
    toolLocationImages=meta.toolLocationImages||{};
    const name=meta.localUser||'本机用户';
    users=[{id:me?.id||'local',name:me?.email||name,team:me?.teamName||'本机使用',role:me?.role||'admin',expiry:'',grants:granted(me?me.tools.map(id=>fromRealTool[id]).filter(Boolean):Object.keys(realTools)),bindings:blankBindings()}];
    currentUser=users[0].id;editorUser=currentUser;editor=clone(users[0]);
    accounts=(await realApi('/api/accounts')).map(a=>({...a,owner:a.ownerUserId||'local',method:a.method||'login',loginMode:'manual',credentialConfigured:true,revision:1,created:Date.now(),updated:Date.now(),lastEvent:''}));
    runs=[];page='catalog';platform='all';catalogQuery='';
    configs.trend.input='';configs.trend.onlyContainRoot=false;
    configs.keywords.input='';configs.keywords.onlyContainRoot=true;
    render();
    await fetchHistory();
  } catch(error) {$('#main').innerHTML=`<div class="panel empty"><h3>本机服务暂不可用</h3><p>${esc(error.message)}</p></div>`;}
})();

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-real-cancel]');if(!button)return;
  button.disabled=true;
  try{await realApi(`/api/runs/${button.dataset.realCancel}/cancel`,{method:'POST',body:'{}'});await realPoll(button.dataset.realCancel);}
  catch(error){toast(error.message,'alert');button.disabled=false;}
});
