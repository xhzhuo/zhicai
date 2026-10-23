/* The v0.4 visual shell remains intact. This runtime replaces its demo data flow. */
'use strict';

const realTools = {keywords: 'recommend', trend: 'combined', industry: 'bubble', notes: 'notes', adgroups:'adgroups', plaza:'plaza', content:'content'};
const fromRealTool = {recommend: 'keywords', combined: 'trend', bubble: 'industry', notes: 'notes', adgroups:'adgroups', plaza:'plaza', content:'content'};
let toolLocationImages = {};
const toolLocationPaths = {
  keywords: '小红书聚光 → 工具 → 搜索工具 → 关键词规划工具 → 以词推词 → 词根拓词',
  trend: '小红书聚光 → 工具 → 搜索工具 → 关键词规划工具 → 以词推词 → 词根拓词 → 输入词根并查询 → 点击结果中的关键词 → 关键词洞察 → 数据趋势（搜索指数）',
  industry: '小红书灵犀 → 行业 → 市场机会 → 市场分析 → 市场竞争分析',
  adgroups: '小红书聚光 → 竞价推广 → 标准投 → 广告组'
};
const realRuns = new Map();
const realSelected = {};
let plazaUploadFile=null, plazaTaskCount=0, plazaTasks=[], plazaUploadVersion=0, plazaSubmitting=false;
let plazaUploadState={phase:'idle',name:'',error:''};
let adgroupPreview={key:'',phase:'idle',data:null,error:''}, adgroupPreviewTimer=null, adgroupPreviewFlight=null;
let adgroupSubmitting=false;
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
const realFooter = () => `<footer class="page-foot brandless-foot"><span>统一输入 · 数据交付 · 按需授权 / ZHICAI</span></footer>`;
historyFilters.status='all';
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
  adgroups:{title:'广告组信息导出',desc:'查询所选账号的广告组，自动获取全部数据并导出 Excel。',input:'聚光账号 + 可选统计日期',output:'账号、广告组、广告组ID、广告组状态、导出时间'},
  plaza:{title:'合作广场笔记采集',desc:'按 Excel 筛选条件采集笔记，可选补采评论、情感分析与关键词词云。',input:'聚光账号 + 筛选条件 Excel',output:'笔记数据、采集记录及可选评论结果'}
})){
  tools[id]={...definition,platform:'xhs',source:'聚光',icon:'table',kind:'platform',unit:'任务',sample:'',columns:[]};
  allTools.push(id);configs[id]=defaultConfig(id);services.jug.tools.push(id);
}
toolLocationPaths.adgroups='小红书聚光 → 竞价推广 → 标准投 → 广告组';
toolLocationPaths.plaza='小红书聚光 → 合作广场';
tools.content={title:'灵犀内容管理导出',desc:'按产品和查询日期获取笔记表现，自动翻页并核对数量，导出 Excel。',input:'灵犀账号 + 勾选产品 + 日期',output:'笔记信息、作者、种草消耗、CTR、曝光量、阅读量及采集记录',platform:'xhs',source:'灵犀',icon:'table',kind:'platform',unit:'产品',sample:'',columns:[]};
allTools.push('content');configs.content=defaultConfig('content');services.lingxi.tools.push('content');
toolLocationPaths.content='小红书灵犀 → 洞察 → 内容 → 内容管理';

const oldRenderChrome = renderChrome;
renderChrome = function () {
  oldRenderChrome();
  // The tool picker is the single tool-switching control; global navigation stays visible.
  $('#recent-tools').innerHTML='';
  const count=$('#main-nav .count');
  if(count)count.textContent=`${Object.keys(realTools).length} 可用`;
  const sideName=window.ZHICAI_SERVER_MODE?user().name.split('@')[0]:user().name;
  $('#side-user strong').textContent=sideName;
  $('#side-user .avatar').textContent=sideName.slice(0,2).toUpperCase();
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

function catalogCard(id) {
  const t=tools[id],ready=!!realTools[id],allowed=ready&&(!window.ZHICAI_SERVER_MODE||can(id));
  const path=toolLocationPaths[id]||(id==='notes'?'笔记公开页面':''), image=toolLocationImages[realTools[id]];
  const steps=path.split(' → '), last=steps.pop();
  const location=path?`<div class="catalog-location"><span class="catalog-location-label">${I('link','i14')}取数位置</span><p>${steps.map(step=>`${esc(step)} <span aria-hidden="true">›</span> `).join('')}<strong>${esc(last)}</strong></p></div>`:'';
  const preview=image?`<button type="button" class="catalog-location-image" data-location-image="${id}" aria-label="放大查看${esc(t.title)}的取数位置"><span class="catalog-image-heading">平台取数位置${I('image','i14')}</span><img src="${esc(image)}" alt="${esc(t.title)}在平台中的取数位置" loading="lazy"><span class="catalog-image-caption">点击查看大图</span></button>`:`<div class="catalog-location-empty">${I(id==='notes'?'file':'image')}<span>${id==='notes'?'笔记公开页面':'暂无位置截图'}</span>${id==='notes'?'<small>通过上传的笔记链接读取</small>':''}</div>`;
  return `<article class="tool-card ${ready?'':'tool-card-unavailable'}"><div class="catalog-card-info"><div class="catalog-card-heading">${platformBadge(t.platform)}<div class="catalog-card-titles"><div class="catalog-card-meta"><span>${esc(platforms[t.platform].name)} · ${esc(t.source)}</span><span class="pill ${allowed?'green':ready?'amber':''}">${allowed?'可用':ready?'未授权':'尚未接入'}</span></div><h2>${esc(t.title)}</h2></div></div><p class="desc">${esc(t.desc)}</p>${location}<div class="tool-card-foot"><div class="tool-spec"><span>输入</span><span>${esc(t.input)}</span><span>输出</span><span>${esc(t.output)}</span></div><button class="btn catalog-config" data-open-tool="${id}" ${allowed?'':'disabled'}>${allowed?'配置采集':ready?'无访问权限':'暂未开放'}${I('chevron','i14')}</button></div></div>${preview}</article>`;
}
renderCatalog = function () {
  const list = allTools.filter(id => (platform==='all'||tools[id].platform===platform)
    && (!catalogQuery||(tools[id].title+tools[id].source+tools[id].desc).includes(catalogQuery)));
  if(platform==='all')list.sort((a,b)=>Number(!!realTools[b])-Number(!!realTools[a]));
  const ready=list.filter(id=>realTools[id]), pending=list.filter(id=>!realTools[id]);
  $('#main').innerHTML = `<div class="heading"><div><div class="eyebrow">DATA ACQUISITION</div><h1>工具中心</h1><p>选择平台与工具，填写参数，获取可下载的数据。</p></div><div class="heading-actions"><button class="btn" data-page="history">${I('clock','i16')}<span>运行记录</span></button></div></div>
    <section class="filter-bar" aria-label="按平台筛选工具"><div class="flex"><span class="filter-title">平台</span><div class="platforms">${platformChips()}</div></div><div class="search">${I('search','i14')}<input id="tool-search" type="search" aria-label="搜索工具" placeholder="搜索工具名称" value="${esc(catalogQuery)}"></div></section>
    <div class="between catalog-meta"><span><strong>可用 ${ready.length} 个</strong> <span class="muted">· ${platform==='all'?'所有平台':platforms[platform].name}</span></span><span>共 ${list.length} 个工具</span></div>
    ${ready.length?`<section class="catalog-grid" aria-label="已开放工具">${ready.map(catalogCard).join('')}</section>`:''}
    ${pending.length?`<details class="catalog-pending" ${!ready.length||catalogQuery?'open':''}><summary>尚未开放的工具 <span class="pill">${pending.length}</span></summary><section class="catalog-grid" aria-label="尚未开放工具">${pending.map(catalogCard).join('')}</section></details>`:''}
    ${!list.length?emptyView('没有匹配的工具','试试切换平台或清空搜索条件。','search'):''}
    ${realFooter()}`;
};

function accountListFor(id) { return accounts.filter(a => a.service === (['industry','content'].includes(id)?'lingxi':'jug')&&(!window.ZHICAI_SERVER_MODE||a.teamId===window.ZHICAI_ME?.teamId)); }
function connectionFor(id) {
  const list=accountListFor(id), selected=configs[id]?.accountId;
  return list.find(a=>a.id===selected)||list.find(a=>a.status!=='disabled')||list[0];
}
renderTool = function () {
  if (!realTools[currentTool]) { page='catalog'; render(); return; }
  if (window.ZHICAI_SERVER_MODE&&!can(currentTool)) { page='catalog'; render(); return; }
  const t=tools[currentTool], supported=allTools.filter(id=>realTools[id]&&(platform==='all'||tools[id].platform===platform));
  if (!supported.includes(currentTool)) platform=t.platform;
  const items=allTools.filter(id=>realTools[id]&&(platform==='all'||tools[id].platform===platform));
  $('#main').innerHTML = `<div class="heading tool-heading"><div><div class="flex" style="gap:11px"><span class="heading-icon">${I(t.icon)}</span><h1>${t.title}</h1><span class="pill green">可用</span></div><p>${t.desc}</p></div><div class="heading-actions"></div></div>
    <div class="tool-switchbar"><span class="pill">${esc(platforms[t.platform].name)} · ${esc(t.source)}</span><label class="small muted" for="tool-picker">切换工具</label><select id="tool-picker">${items.filter(id=>!window.ZHICAI_SERVER_MODE||can(id)).map(id=>`<option value="${id}" ${id===currentTool?'selected':''}>${esc(tools[id].title)}</option>`).join('')}</select></div>
    <div class="workbench ${currentTool==='content'?'content-vertical':''}"><section class="panel config-panel"><div class="panel-head"><h2><span class="step">1</span>运行配置</h2><button class="text-btn" data-action="reset-config">重置</button></div><div id="config-body" class="config-body"></div><div class="config-footer"><div id="run-summary" class="run-summary"></div><button class="btn primary" id="run-button" data-action="start">${I('play','i16')}开始采集</button></div></section><section class="panel results" id="result-panel" aria-label="采集结果"></section></div>${realFooter()}`;
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
function plazaConfigBusy(){return plazaSubmitting||['queued','running'].includes(realRuns.get(realSelected.plaza)?.status);}
function plazaDeliveryText(){return configs.plaza.collectComments?'笔记数据、采集记录、评论明细、评论情感分类、关键词词云':'笔记数据、采集记录';}
function plazaFileDetails(){
  const state=plazaUploadState;
  const message=state.phase==='checking'?'正在检查筛选条件…':state.phase==='ready'?`检查通过 · ${plazaTaskCount} 个启用任务`:state.phase==='error'?state.error:'使用模板中的“筛选条件”工作表，文件不超过 20 MB。';
  return `<strong id="plaza-file-name">${esc(state.name||'尚未选择文件')}</strong><div id="plaza-file-state" class="field-hint ${state.phase==='error'?'error':''}" role="${state.phase==='error'?'alert':'status'}">${state.phase==='checking'?'<span class="spinner" aria-hidden="true"></span> ':''}${esc(message)}</div>`;
}
function plazaTaskPreview(){
  if(!plazaTasks.length)return '';
  return `<details class="plaza-task-preview"><summary>查看 ${plazaTasks.length} 个启用任务</summary><ol>${plazaTasks.map(task=>{
    const period=task.发布时间==='自定义'?`${task.开始日期} 至 ${task.结束日期}`:task.发布时间;
    const filters=['曝光量','阅读量','互动量','作者粉丝数'].filter(key=>task[key]&&task[key]!=='不限').map(key=>`${key} ${task[key]}`);
    return `<li><strong>${esc(task.任务名称)}</strong><dl><dt>关键词</dt><dd>${esc(task.关键词)}</dd><dt>筛选方式</dt><dd>${esc(task.搜索类型)} · ${esc(task.笔记类型)} · ${esc(task.排序)}</dd><dt>发布时间</dt><dd>${esc(period)}</dd><dt>采集上限</dt><dd>最多 ${number(task.最多笔记数)} 条</dd>${filters.length?`<dt>数据筛选</dt><dd>${esc(filters.join('；'))}</dd>`:''}</dl></li>`;
  }).join('')}</ol><p class="field-hint">以上为启用任务及设置的上限，实际数量以平台返回为准。</p></details>`;
}
function paintPlazaUpload(){
  if(page!=='tool'||currentTool!=='plaza')return;
  if($('#plaza-file-details'))$('#plaza-file-details').innerHTML=plazaFileDetails();
  const choice=$('.plaza-file-choice');if(choice)choice.textContent=plazaUploadState.name?'更换文件':'选择文件';
  if($('#plaza-task-preview'))$('#plaza-task-preview').innerHTML=plazaTaskPreview();
  refreshConfigMeta();
}
async function inspectPlazaUpload(file){
  if(plazaConfigBusy())return;
  const version=++plazaUploadVersion;
  plazaUploadFile=null;plazaTaskCount=0;plazaTasks=[];
  plazaUploadState={phase:file?'checking':'idle',name:file?.name||'',error:''};paintPlazaUpload();
  if(!file)return;
  try{
    if(!/\.xlsx$/i.test(file.name)||file.size>20*1024*1024)throw new Error('请选择不超过 20 MB 的 .xlsx 文件。');
    const form=new FormData();form.append('file',file,file.name);
    const result=await realUploadApi('/api/plaza/inspect',form);
    if(version!==plazaUploadVersion)return;
    plazaTasks=result.tasks||[];plazaTaskCount=result.taskCount||0;
    if(!plazaTaskCount||plazaTasks.length!==plazaTaskCount)throw new Error('未读取到完整的启用任务，请检查筛选条件文件。');
    plazaUploadFile=file;plazaUploadState={phase:'ready',name:file.name,error:''};
  }catch(error){
    if(version!==plazaUploadVersion)return;
    plazaUploadFile=null;plazaTaskCount=0;plazaTasks=[];
    plazaUploadState={phase:'error',name:file.name,error:error.message};
  }
  paintPlazaUpload();
}
function refreshPlazaConfigMeta(button,run,account){
  const busy=plazaConfigBusy(), fileReady=!!plazaUploadFile&&plazaUploadState.phase==='ready'&&plazaTaskCount>0;
  let reason='';
  if(!account)reason='请先配置聚光账号';
  else if(account.status==='disabled')reason='所选账号已停用，请选择其他账号';
  else if(plazaUploadState.phase==='checking')reason='正在检查筛选条件';
  else if(!fileReady)reason=plazaUploadState.phase==='error'?'请修正筛选条件文件':'请先上传筛选条件文件';
  button.disabled=busy||!!reason;button.title=reason;
  button.innerHTML=busy?`<span class="spinner"></span>${run?.status==='queued'?'等待运行':plazaSubmitting?'正在提交':'正在采集'}`:I('play','i16')+'开始采集';
  $('#run-summary').textContent=busy?'本次配置已锁定':fileReady?`${plazaTaskCount} 个启用任务 · ${configs.plaza.collectComments?'笔记及评论':'仅笔记'}`:reason;
  const file=$('#plaza-file');if(file)file.disabled=busy;
  const choice=$('.plaza-file-choice');if(choice){choice.classList.toggle('is-disabled',busy);choice.setAttribute('aria-disabled',String(busy));}
  $$('input[name="plaza-content"]').forEach(el=>el.disabled=busy);
  const selector=$('#run-account');if(selector)selector.disabled=busy||!accountListFor('plaza').length;
  const reset=$('.config-panel [data-action="reset-config"]');if(reset)reset.disabled=busy;
  if($('#plaza-delivery'))$('#plaza-delivery').textContent=plazaDeliveryText();
  if($('#plaza-comments-note'))$('#plaza-comments-note').classList.toggle('hidden',!configs.plaza.collectComments);
}


function contentProductRows(text){
  const rows=[], seen=new Set();
  for(const line of String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
    const match=line.match(/^(\d+)[,，\t]+(.+)$/);
    if(!match)return {rows,error:'产品选择无效，请重新读取授权产品'};
    if(seen.has(match[1]))return {rows,error:'产品清单中有重复的 SPU ID'};
    seen.add(match[1]);rows.push({id:match[1],name:match[2].trim()});
  }
  return {rows,error:''};
}
function contentConfigBusy(){return !!configs.content.loading||['queued','running'].includes(realRuns.get(realSelected.content)?.status);}
function contentSelectedRows(){return contentProductRows(configs.content.productsText).rows;}
function setContentSelected(rows){
  configs.content.productsText=rows.map(p=>`${p.id},${p.name}`).join('\n');
}
function toggleContentProduct(id,checked){
  if(contentConfigBusy())return false;
  const selected=contentSelectedRows(),product=(configs.content.productOptions||[]).find(p=>p.id===id);
  if(!product)return false;
  if(checked&&!selected.some(p=>p.id===id)){
    if(selected.length>=20)return false;
    selected.push(product);
  }
  setContentSelected(checked?selected:selected.filter(p=>p.id!==id));
  return true;
}
function paintContentPicker(){
  const list=$('#content-product-list');if(!list||currentTool!=='content')return;
  const c=configs.content, options=c.productOptions||[], selected=contentSelectedRows(), ids=new Set(selected.map(p=>p.id));
  const query=(c.productQuery||'').trim().toLowerCase(),matches=options.filter(p=>(p.name+' '+p.id).toLowerCase().includes(query));
  const busy=contentConfigBusy();
  list.innerHTML=matches.length?matches.map(p=>`<label class="content-product-option ${ids.has(p.id)?'is-selected':''}"><input type="checkbox" data-content-product="${esc(p.id)}" ${ids.has(p.id)?'checked':''} ${busy||selected.length>=20&&!ids.has(p.id)?'disabled':''}><span><b>${esc(p.name)}</b><small>SPU ID ${esc(p.id)}</small></span></label>`).join(''):`<div class="content-picker-empty">${options.length?'没有匹配产品，试试其他名称或编号。':'先读取授权产品，再勾选本次要采集的产品。'}</div>`;
  if($('#content-selection-count'))$('#content-selection-count').textContent=`已选 ${selected.length} / 20 个 · 共 ${options.length} 个授权产品`;
  if($('#content-selection-hint'))$('#content-selection-hint').textContent=selected.length>=20?'已达到 20 个上限，请先取消一个产品再选其他产品。':'最多选择 20 个，可按产品名称或 SPU ID 搜索。';
  const clear=$('[data-content-clear]');if(clear)clear.disabled=busy||!selected.length;
  const search=$('#content-product-search');if(search)search.disabled=busy||!options.length;
}

renderConfig = function () {
  if (!$('#config-body')) return;
  const id=currentTool, c=configs[id], account=connectionFor(id), busy=realRuns.get(realSelected[id])?.status==='running';
  let html=realAccountBox(id);
  if(id==='content'){
    html+=realField('date-start','查询日期<span class="required">*</span>',`<div class="dates"><input id="date-start" type="date" data-config="start" value="${esc(c.start)}" aria-label="开始日期"><span>至</span><input id="date-end" type="date" data-config="end" value="${esc(c.end)}" aria-label="结束日期"></div>`,'统计所选日期内的表现，不限制笔记发布时间。');
    html+=`<section class="content-products-section field" aria-label="导出产品"><div class="content-product-label"><span>选择产品<span class="required">*</span></span><button type="button" class="text-btn" data-content-load>${c.loading?'正在读取…':'读取授权产品'}</button></div>
      <p class="field-hint" id="content-load-state" role="status">${esc(c.productStatus||'读取当前品牌下的授权产品，再勾选需要采集的产品。')}</p>
      <input id="content-product-search" type="search" aria-label="搜索产品" placeholder="搜索产品名称或 SPU ID" value="${esc(c.productQuery||'')}">
      <div class="content-selection-toolbar"><span id="content-selection-count" role="status"></span><button type="button" class="text-btn" data-content-clear>清空已选</button></div>
      <div id="content-product-list" class="content-product-list" role="group" aria-label="授权产品列表"></div>
      <p id="content-selection-hint" class="field-hint"></p>
      </section>`;
  }else if(id==='adgroups'){
    html+=realField('adgroups-start','开始日期（可选）',`<input id="adgroups-start" type="date" value="${esc(c.apiStart||'')}" aria-describedby="adgroups-date-hint">`);
    html+=realField('adgroups-end','结束日期（可选）',`<input id="adgroups-end" type="date" value="${esc(c.apiEnd||'')}" aria-describedby="adgroups-date-hint">`);
    html+=`<p id="adgroups-date-hint" class="field-hint">日期留空默认今天；指定日期时请同时填写开始和结束日期。自动获取所选账号的全部广告组。</p><div id="adgroup-link-state" class="adgroup-link-state" role="status" aria-live="polite"></div>`;
  }else if(id==='plaza'){
    html+=`<section class="plaza-upload"><div class="between plaza-upload-heading"><label for="plaza-file">筛选条件文件<span class="required">*</span></label><a class="text-btn" href="/api/plaza/template">下载模板</a></div><div class="plaza-upload-row"><div id="plaza-file-details">${plazaFileDetails()}</div><label class="btn sm plaza-file-choice" for="plaza-file">${plazaUploadState.name?'更换文件':'选择文件'}</label><input id="plaza-file" class="plaza-file-input" type="file" accept=".xlsx" aria-label="上传筛选条件文件"></div><div id="plaza-task-preview">${plazaTaskPreview()}</div></section>`;
    html+=`<fieldset class="adgroup-scope plaza-content"><legend>采集内容</legend><div class="adgroup-scope-options"><label><input type="radio" name="plaza-content" value="notes" ${!c.collectComments?'checked':''}>仅采集笔记</label><label><input type="radio" name="plaza-content" value="comments" ${c.collectComments?'checked':''}>笔记及评论</label></div></fieldset><p id="plaza-comments-note" class="field-hint ${c.collectComments?'':'hidden'}">采集评论会增加耗时，建议先用少量笔记试跑。</p><details class="plaza-instructions"><summary>文件与采集说明</summary><p>仅执行文件中“启用”为“是”的任务，最多 100 个。筛选条件和每任务采集上限在模板中设置。</p><p>整项任务最长 15 分钟；评论逐篇采集，单篇最多等待 90 秒。评论情感按内置词典分类，失败及未完成原因写入采集记录。</p></details>`;
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
  } else {
    html+=realField('real-tax-list','行业<span class="required">*</span>',realTaxRows());
    html+=realField('date-start','查询日期<span class="required">*</span>',`<div class="dates"><input type="${bubbleDraft.timePartition===2?'month':'date'}" id="date-start" data-config="start" value="${esc(c.start.slice(0,bubbleDraft.timePartition===2?7:10))}" aria-label="开始日期"><span>至</span><input type="${bubbleDraft.timePartition===2?'month':'date'}" id="date-end" data-config="end" value="${esc(c.end.slice(0,bubbleDraft.timePartition===2?7:10))}" aria-label="结束日期"></div>`);
    html+=realField('partition','时间粒度',realSelect('partition',[[1,'按日'],[4,'按周'],[2,'按月']],bubbleDraft.timePartition));
    html+=realField('dimension','分析主体',realSelect('dimension',[['1','品牌'],['2','SPU'],['3','系列']],bubbleDraft.dimensionType));
    html+=realField('x-axis','X 轴',realSelect('x-axis',[['1','搜索量'],['impNum','曝光量'],['readNum','阅读量']],bubbleDraft.xindex));
    html+=`<div class="field"><div class="field-label"><span>Y 轴<span class="required">*</span> · 可多选</span></div>${[['readNum','阅读量'],['readYOYIncreaseRate','阅读同比增长率'],['readRGIncreaseRate','阅读环比增长率']].map(([key,label])=>`<label class="flex" style="margin:6px 0;font-size:11px;color:#53637c"><input type="checkbox" data-y-axis="${key}" ${bubbleDraft.yindexList.includes(key)?'checked':''}>${label}</label>`).join('')}</div>`;
    html+=realField('size-axis','气泡大小',realSelect('size-axis',[['noteNum','平均有曝光笔记数'],['noteIncreaseNum','新增笔记数']],bubbleDraft.sizeIndex));
    html+=`<details class="run-details"><summary>高级筛选（可留空）</summary>${[['regionCodes','地域 code，空白为全国'],['brandIdList','品牌 ID'],['spuIdList','SPU ID'],['seriesIdList','系列 ID']].map(([key,label])=>realField(key,label,`<input id="${key}" value="${esc(bubbleDraft[key])}" placeholder="多个值用逗号分隔">`)).join('')}</details>`;
  }
  if(id!=='content')html+=`<div class="field"><div class="field-label"><span>交付内容</span><span class="pill">${id==='notes'?'Excel + ZIP':['industry','adgroups','plaza','content'].includes(id)?'Excel':'CSV'}</span></div><div class="field-hint" style="border:1px solid var(--line);border-radius:6px;padding:9px 10px;background:#fafcff">${id==='plaza'?`<span id="plaza-delivery">${esc(plazaDeliveryText())}</span>`:esc(tools[id].output)}<br>失败项保留原因，不填充模拟值。</div></div>`;
  if(id==='content')html+='<div class="content-output-note">Excel · 内容数据 + 采集记录</div>';
  html+='<div id="config-errors" class="form-errors hidden" role="alert"></div>';
  $('#config-body').innerHTML=html;
  if(id==='content')paintContentPicker();
  refreshConfigMeta();
  if(id==='adgroups')scheduleAdgroupPreview();
};

refreshConfigMeta = function () {
  const button=$('#run-button'); if(!button)return;
  const id=currentTool, run=realRuns.get(realSelected[id]), account=id==='notes'?true:connectionFor(id);
  if(id==='plaza'){refreshPlazaConfigMeta(button,run,account);return;}
  const count=id==='notes'?(notesUploadFile&&notesSheetName?1:0):id==='industry'?bubbleDraft.taxonomies.filter(x=>x.name&&x.code).length:inputItems(configs[id],id).valid.length;
  if($('#input-meta')) $('#input-meta').textContent=`已识别 ${count} 个词根`;
  $('#run-summary').textContent=id==='notes'?(count?'已读取 1 个 Excel 文件':'等待上传 .xlsx 文件'):id==='industry'?`${count} 个行业 · ${bubbleDraft.yindexList.length} 个 Y 轴指标 · Excel 文件`:`${count} 个词根 · CSV 文件`;
  const blocked=!account||account.status==='disabled'||(id==='notes'&&(!notesUploadFile||!notesSheetName));
  if(id==='content'){
    const parsed=contentProductRows(configs.content.productsText),selected=parsed.rows.length;
    const busy=contentConfigBusy(),start=$('#date-start')?.value,end=$('#date-end')?.value;
    const reason=busy?(configs.content.loading?'正在读取授权产品，请稍候。':'任务正在运行。'):blocked?'请先选择启用的灵犀账号。':parsed.error||(!selected?'请至少选择 1 个产品。':selected>20?'已超过 20 个，请减少选择。':!/^\d+$/.test(configs.content.brandUserId||'')?'请先读取授权产品。':!start||!end?'请选择开始和结束日期。':start>end?'开始日期不能晚于结束日期。':'');
    $('#run-summary').textContent=`已选 ${selected} / 20 个产品 · Excel${reason?' · '+reason:''}`;
    $$('#date-start,#date-end,#run-account,[data-content-load],[data-content-product],[data-content-clear],#content-product-search').forEach(el=>{
      if(el.matches('[data-content-product]'))el.disabled=busy||selected>=20&&!el.checked;
      else if(el.matches('[data-content-clear]'))el.disabled=busy||!selected;
      else if(el.id==='content-product-search')el.disabled=busy||!configs.content.productOptions?.length;
      else el.disabled=busy;
    });
    const reset=$('.config-panel [data-action="reset-config"]');if(reset)reset.disabled=busy;
    button.disabled=!!reason;
    button.innerHTML=busy?'<span class="spinner"></span> 正在处理':I('play','i16')+'开始采集';
    return;
  }
  if(id==='adgroups'){
    $('#run-summary').textContent='广告组信息 · Excel';
    paintAdgroupPreview();
    const busy=adgroupSubmitting||['queued','running'].includes(run?.status);
    $$('#adgroups-start,#adgroups-end,#run-account').forEach(el=>el.disabled=busy);
    const reset=$('.config-panel [data-action="reset-config"]');if(reset)reset.disabled=busy;
    button.disabled=blocked||busy;
    button.innerHTML=busy?'<span class="spinner"></span> 正在采集':I('play','i16')+'开始采集';
    return;
  }
  button.disabled=blocked||['queued','running'].includes(run?.status);
  button.innerHTML=run?.status==='running'?'<span class="spinner"></span> 正在采集':blocked?(id==='notes'?I('upload','i16')+'请先上传文件':I('lock','i16')+'账号已停用'):I('play','i16')+'开始采集';
};

function realError(message) { const box=$('#config-errors'); if(box){box.textContent=message;box.classList.remove('hidden');} toast(message,'alert'); }
function collectRealParams(id) {
  if(id==='content'){
    const c=configs.content;
    c.brandUserId=String(c.brandUserId||'').trim();
    c.start=$('#date-start').value;c.end=$('#date-end').value;
    const products=c.productsText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
      const match=line.match(/^(\d+)[,，\t]+(.+)$/);
      if(!match)throw new Error('产品清单每行填写：SPU ID,产品名称');
      return {id:match[1],name:match[2].trim()};
    });
    if(products.length>20)throw new Error('每次最多选择 20 个产品');
    if(!/^\d+$/.test(c.brandUserId))throw new Error('请先读取授权产品');
    if(!products.length)throw new Error('请至少选择 1 个产品');
    if(!c.start||!c.end||c.start>c.end)throw new Error('请选择有效的查询日期范围');
    return {brandUserId:c.brandUserId,products,start:c.start,end:c.end};
  }
  if(id==='adgroups'){
    const start=$('#adgroups-start').value,end=$('#adgroups-end').value;
    if(!!start!==!!end)throw new Error('请同时选择开始日期和结束日期，或全部留空使用今天。');
    if(start&&start>end)throw new Error('开始日期不能晚于结束日期。');
    return {start,end};
  }
  if(id==='plaza')return {collectComments:!!configs.plaza.collectComments};
  if(id==='notes'){const mode=$('#note-mode').value;return {sheetName:notesSheetName,mode,limit:mode==='trial'?Number($('#note-limit')?.value||3):null};}
  const c=configs[id];
  if(id!=='industry') {
    if(!c.input.trim()) throw new Error('请至少填写一个词根。');
    return {roots:c.input,onlyContainRoot:true,...(id==='trend'?{start:$('#date-start').value,end:$('#date-end').value}:{})};
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
  if(id==='plaza'){if(plazaConfigBusy())return;plazaSubmitting=true;refreshConfigMeta();}
  if(id==='adgroups'){if(adgroupSubmitting)return;adgroupSubmitting=true;refreshConfigMeta();}
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
  finally{if(id==='plaza'){plazaSubmitting=false;refreshConfigMeta();}if(id==='adgroups'){adgroupSubmitting=false;refreshConfigMeta();}}
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
      <div class="result-toolbar"><div><h3>数据明细</h3><small>${rows.length?(currentTool==='notes'?'预览前 30 行；Excel 保留每条笔记的状态和错误原因':'预览前 30 行，下载含所有成功结果'):'暂无结果'}</small></div><div class="flex wrap" style="gap:6px">${(run.rowCount||(['adgroups','plaza','content'].includes(currentTool)&&run.outputReady))&&!busy&&(!['adgroups','plaza','content'].includes(currentTool)||run.outputReady)?`<a class="btn primary" href="/api/runs/${run.id}/download">${I('download','i16')}${currentTool==='content'&&run.status==='failed'?'下载采集记录':currentTool==='adgroups'?'导出已采集数据':currentTool==='notes'?'下载结果 Excel':`下载${run.status==='partial'?'成功结果':'完整结果'}`}</a>${currentTool==='notes'&&run.coverCount?`<a class="btn" href="/api/runs/${run.id}/assets">${I('download','i16')}下载封面素材包（${run.coverCount}）</a>`:''}`:'<button class="btn" disabled>完成后下载</button>'}</div></div>
      ${currentTool==='adgroups'&&run.dataSource==='api'?`<div class="notice">统计日期：${esc(run.params.start)} 至 ${esc(run.params.end)} · 已自动获取全部分页</div>`:''}
      ${currentTool==='content'&&run.duplicateRowCount?`<div class="notice amber" role="status">数据提示：${number(run.duplicateIdCount)} 个笔记 ID 重复，涉及 ${number(run.duplicateRowCount)} 行。已保留平台原始记录，未去重或合并指标；请在 Excel 的“记录提示”和“采集记录”中核对。</div>`:''}
      ${rows.length?realTable(columns,rows):emptyView(busy?'正在等待数据':'暂无数据',busy?'完成第一批请求后会显示。':'请查看失败原因或调整查询条件。')}
      ${run.sheets.length?`<div class="table-caption">Excel 工作表：${run.sheets.map(s=>`${esc(s.name)}（${s.count} 行）`).join('、')}</div>`:`<div class="table-caption">显示 ${rows.length} / ${run.rowCount} 行 · 来自平台接口</div>`}
      ${run.failures.length?`<details class="run-details"><summary>失败明细（${run.failures.length} 项）</summary><ul>${run.failures.map(f=>`<li>${esc(f.item)}：${esc(f.error)}</li>`).join('')}</ul></details>`:''}
      <details class="run-details"><summary>运行说明</summary><dl><dt>查询参数</dt><dd>${esc(JSON.stringify(run.params))}</dd><dt>完成时间</dt><dd>${esc(run.ended||'运行中')}</dd></dl></details>`;
  }
  $('#result-panel').innerHTML=`<div class="panel-head"><h2><span class="step">2</span>采集结果</h2>${run?statusPill(run.status):'<span class="pill">等待运行</span>'}</div><div class="result-body">${body}</div><div class="result-foot"><span>数据获取 · 明细预览</span><span>智采</span></div>`;
  $('#result-panel').classList.toggle('results-empty',!run);
};
function realTable(columns,rows){return `<div class="data-wrap"><table class="data-table"><thead><tr><th class="row-index">#</th>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr><td class="row-index">${i+1}</td>${row.map(v=>`<td title="${esc(v)}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}

async function fetchHistory() {
  try {realHistory=await realApi('/api/runs');if(page==='history')renderHistory();}
  catch(error){toast(error.message,'alert');}
}
renderHistory = function () {
  const f=historyFilters, available=allTools.filter(id=>realTools[id]&&(f.platform==='all'||tools[id].platform===f.platform));
  f.status=f.status||'all';
  if(!available.includes(f.tool))f.tool='all';
  const nowDate=new Date(), dateStart=f.period==='today'?localDate(nowDate):['7','30'].includes(f.period)?localDate(new Date(Date.now()-(Number(f.period)-1)*86400000)):f.period==='custom'?f.start:'';
  const dateEnd=f.period==='custom'?f.end:'';
  const invalid=!!(dateStart&&dateEnd&&dateStart>dateEnd);
  const list=invalid?[]:realHistory.filter(r=>{const id=fromRealTool[r.tool];return id&&(f.platform==='all'||tools[id].platform===f.platform)&&(f.tool==='all'||id===f.tool)&&(f.status==='all'||r.status===f.status)&&(!dateStart||r.created.slice(0,10)>=dateStart)&&(!dateEnd||r.created.slice(0,10)<=dateEnd);});
  const active=f.platform!=='all'||f.tool!=='all'||f.period!=='all'||f.status!=='all';
  $('#main').innerHTML=`<div class="heading"><div><div class="eyebrow">RUN HISTORY</div><h1>运行记录</h1><p>按平台、工具和创建时间，找回采集结果。</p></div><div class="heading-actions"><button class="btn primary" data-page="catalog">${I('plus','i16')}新建采集</button></div></div>
  <section class="panel history-filter-panel"><div class="history-filter-grid">
  ${realField('history-platform','平台',realSelect('history-platform',[['all','全部平台'],['xhs','小红书']],f.platform))}
  ${realField('history-tool','工具',realSelect('history-tool',[['all','全部工具'],...available.map(id=>[id,tools[id].title])],f.tool))}
  ${realField('history-period','创建时间',realSelect('history-period',[['all','全部时间'],['today','今天'],['7','近 7 天'],['30','近 30 天'],['custom','自定义日期']],f.period))}
  ${realField('history-status','状态',realSelect('history-status',[['all','全部状态'],['queued','等待运行'],['running','运行中'],['complete','全部完成'],['partial','部分完成'],['failed','运行失败'],['stopped','已停止']],f.status))}
  <button class="btn ghost reset-history" data-action="reset-history" ${active?'':'disabled'}>${I('refresh','i14')}重置筛选</button></div>
  ${f.period==='custom'?`<div class="history-custom"><label for="history-start">起止日期</label><input id="history-start" type="date" value="${esc(f.start)}"><span>至</span><input id="history-end" type="date" value="${esc(f.end)}"><small>可只填一端</small></div>`:''}
  <div class="history-filter-hint ${invalid?'error':''}">${I(invalid?'alert':'info','i14')}${invalid?'开始日期不能晚于结束日期。':'依据任务创建时间筛选，不是数据查询日期。'}</div></section>
  <section class="panel history-panel"><div class="history-head"><h2>我的任务 <span class="pill">${list.length}</span></h2><p>${active?'匹配 '+list.length+' / '+realHistory.length+' 条':'共 '+realHistory.length+' 条'}记录</p></div>
  ${list.length?`<div class="history-table-scroll"><table class="data-table history-table"><thead><tr><th>平台</th><th>工具 / 任务</th><th>平台账号</th><th>创建时间</th><th>状态</th><th>处理结果</th><th>操作</th></tr></thead><tbody>${list.map(r=>`<tr><td><div class="flex">${platformBadge('xhs')}<span>小红书</span></div></td><td><div class="history-tool"><div><b>${esc(tools[fromRealTool[r.tool]].title)}</b><small>${esc(r.id.slice(0,8))}</small></div></div></td><td>${esc(r.accountAlias||'—')}</td><td class="history-date">${esc(r.created.replace('T',' ').slice(0,19))}</td><td>${statusPill(r.status)}</td><td>${r.rowCount} 行 / ${r.failureCount} 失败</td><td><div class="history-actions"><button class="text-btn" data-real-view="${r.id}">查看详情</button>${(r.rowCount||r.outputReady)&&!['queued','running'].includes(r.status)&&(!['adgroups','plaza','content'].includes(r.tool)||r.outputReady)?`<a class="text-btn" href="/api/runs/${r.id}/download">${I('download','i14')}下载</a>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:emptyView(invalid?'请调整日期范围':realHistory.length?'没有匹配的运行记录':'还没有运行记录',invalid?'开始日期需要早于结束日期。':realHistory.length?'调整筛选条件。':'从工具中心开始采集。','clock')}</section>
  ${realFooter()}`;
};

const oldRenderAccounts=renderAccounts;
renderAccounts=function(){
  oldRenderAccounts();
  const heading=$('.heading p');if(heading)heading.textContent='维护聚光与灵犀连接；采集时使用已登录的本机浏览器会话。';
  const principle=$('.connection-principle strong');if(principle)principle.textContent='配置连接 → 验证登录 → 选择工具采集';
  const header=$('.account-panel .panel-head .small');if(header)header.textContent='连接状态以真实平台请求为准';
  $$('[data-verify-account]').forEach(el=>{el.textContent='验证连接';el.disabled=false;el.title='实际请求平台接口验证登录状态';});
  $$('[data-edit-account]').forEach(el=>el.textContent='配置 / 登录');
  const security=$('.account-security-note');if(security)security.innerHTML=`${I('shield','i20')}<div><strong>手动／扫码登录会打开 Edge 窗口；Cookie 导入不会弹出窗口。</strong><p>Cookie 在服务端加密保存，已保存内容不回显；账号列表只显示配置状态。保存后还需验证连接。</p></div>`;
  $$('[data-account-row]').forEach(row=>{const a=accounts.find(x=>x.id===row.dataset.accountRow);if(a?.cookieConfigured){const method=row.querySelector('td:nth-child(2) small');if(method)method.textContent='Cookie 已保存 · '+(a.cookieSavedAt?formatTime(a.cookieSavedAt):'待验证');}});
  const foot=$('.account-table-foot');if(foot)foot.innerHTML='<span>每个账号使用独立浏览器会话</span><span>停用后不能用该账号发起采集</span>';
  const pageFoot=$('.page-foot');if(pageFoot)pageFoot.outerHTML=realFooter();
};

function realCredentialMarkup(method,a){
  if(method==='cookie')return `<div class="credential-box"><h3>Cookie 配置</h3><div class="notice" style="margin:10px 0">${I('check','i14')}<span id="real-cookie-availability">${a.cookieConfigured?'Cookie 已配置':'尚未保存 Cookie'}</span></div><p class="field-hint">已保存的 Cookie 不回显。留空保留原配置；填写新 Cookie 后保存以替换。</p><div class="field"><div class="field-label"><label for="real-cookie">Cookie</label></div><textarea id="real-cookie" class="secret-input" rows="5" autocomplete="off" spellcheck="false" placeholder="name=value; name2=value2"></textarea></div><button class="btn primary sm" data-real-import-cookie="${esc(a.id)}">保存 Cookie</button></div>`;
  return `<div class="credential-box login-box"><div class="login-explanation"><span class="browser-connection-icon">${I('terminal')}</span><div><h3>使用已登录浏览器会话</h3><p>支持手动输入账号密码或扫码登录；后续采集复用此会话。</p></div></div><div class="login-complete"><span class="pill ${a.status==='verified'?'green':'amber'}">${a.status==='verified'?'已验证':'待验证'}</span><button class="btn primary sm" data-real-login="${a.id}">打开登录窗口</button></div></div>`;
}
openAccountEditor=function(id=null){
  const existing=id?accounts.find(x=>x.id===id):null;
  if(id&&!existing)return;
  const a=existing||{id:'',platform:'xhs',serviceName:'',service:'custom',alias:'',status:'unverified'};
  accountDraft=clone(a); accountFormDirty=false;
  $('#account-drawer-content').innerHTML=`<div class="drawer-header"><div><div class="eyebrow">PLATFORM CONNECTION</div><h2 id="account-drawer-title">${existing?'配置平台账号':'新增平台账号'}</h2><p>${existing?esc(a.alias):'每个账号使用独立的本机登录会话。'}</p></div><button class="icon-btn" data-action="close-account" aria-label="关闭">${I('close','i20')}</button></div>
    <div class="drawer-body"><div class="notice">${I('info')}<span>${existing?`这是本机的 ${esc((a.serviceName||services[a.service]?.name||a.service))} 连接。`:'请选择聚光或灵犀服务。'}登录将在专用浏览器窗口中完成。</span></div>
    ${realField('real-platform','平台',realSelect('real-platform',Object.entries(platforms).map(([key,item])=>[key,item.name]),a.platform||services[a.service]?.platform||'xhs'))}
    ${realField('real-service-name','服务',`<input id="real-service-name" maxlength="80" value="${esc(a.serviceName||services[a.service]?.name||'')}" placeholder="例如：聚光、灵犀、生意参谋">`)}
    ${realField('real-alias','账号别名<span class="required">*</span>',`<input id="real-alias" maxlength="40" value="${esc(a.alias)}" placeholder="例如：品牌 A 聚光账号">`)}
    <div id="real-page-link-field" class="${a.service==='jug'?'':'hidden'}">${realField('real-page-link','页面链接<span class="required">*</span>',`<input id="real-page-link" type="url" maxlength="2048" value="${esc(a.pageLink||'')}" placeholder="粘贴已进入目标账户的聚光页面链接">`,'请粘贴包含 vSellerId 的聚光页面链接。')}</div>
    ${existing?`<div class="drawer-section-title"><span class="step">2</span><h3>建立连接</h3></div>
    ${realField('real-method','连接方式',realSelect('real-method',[['login','账号登录'],['cookie','Cookie 导入']],a.method||'login'))}
    <div id="real-credential-mode">${realCredentialMarkup(a.method||'login',a)}</div>`:''}
    <p class="field-hint">账号密码只在平台登录窗口中填写；Cookie 在服务端加密保存，已保存内容不回显。</p></div>
    <div class="drawer-footer"><div><strong>${existing?'登录完成后请验证连接':'保存后打开登录窗口'}</strong><small>${existing?'验证会调用实际平台接口。':'账号默认未验证。'}</small></div><div class="flex"><button class="btn" data-action="close-account">关闭</button><button class="btn primary" data-real-save-alias="${a.id||'new'}">${existing?'保存配置':'新增账号'}</button></div></div>`;
  if(existing){$('#real-platform').disabled=true;$('#real-service-name').disabled=true;}
  $('#account-drawer').showModal();
  if(existing&&a.method==='cookie')void fillStoredCookie(a.id);
};
closeAccountEditor=function(){accountDraft=null;accountFormDirty=false;if($('#account-drawer').open)$('#account-drawer').close();};
async function fillStoredCookie(id){
 const notice=$('#real-cookie-availability'),account=accounts.find(item=>item.id===id);
 if(notice)notice.textContent=account?.cookieConfigured?'Cookie 已配置':'尚未保存 Cookie';
}
async function saveCookieValue(id,content){
  const result=await realApi(`/api/accounts/${id}/cookie`,{method:'POST',body:JSON.stringify({content})});
  const a=accounts.find(x=>x.id===id);
  if(a){a.status='unverified';a.method='cookie';a.cookieConfigured=true;a.cookieSavedAt=result.cookieSavedAt;}
  if(accountDraft&&accountDraft.id===id){Object.assign(accountDraft,a);}
  if($('#real-credential-mode')){$('#real-credential-mode').innerHTML=realCredentialMarkup('cookie',accountDraft);$('#real-cookie').value='';const note=$('#real-cookie-availability');if(note)note.textContent=`已保存 Cookie · ${formatTime(result.cookieSavedAt)}，请验证连接。`;}
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

clickActions.start=()=>realStart();
clickActions['reset-config']=()=>{if(currentTool==='plaza'&&plazaConfigBusy())return;if(['queued','running'].includes(realRuns.get(realSelected[currentTool])?.status))return;if(currentTool==='plaza'){++plazaUploadVersion;plazaUploadFile=null;plazaTaskCount=0;plazaTasks=[];plazaUploadState={phase:'idle',name:'',error:''};}configs[currentTool]=defaultConfig(currentTool);configs[currentTool].input='';configs[currentTool].onlyContainRoot=true;if(currentTool==='notes'){notesUploadFile=null;notesSheets=[];notesSheetName='';}bubbleDraft={taxonomies:[{name:'',code:''}],timePartition:1,dimensionType:'1',xindex:'1',yindexList:['readNum'],sizeIndex:'noteNum',regionCodes:'',brandIdList:'',spuIdList:'',seriesIdList:''};renderConfig();renderResult();};
clickActions.template=()=>saveFile('﻿"词根"\r\n',`${tools[currentTool].title}_输入模板.csv`);
clickActions['close-account']=closeAccountEditor;
clickActions['add-account']=()=>openAccountEditor(null);
clickActions['reset-history']=()=>{historyFilters={platform:'all',tool:'all',period:'all',status:'all',start:'',end:''};renderHistory();};
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
  if(save){const alias=$('#real-alias').value.trim();if(!alias)return toast('请输入账号别名。','alert');try{const isNew=save.dataset.realSaveAlias==='new';const pageLink=$('#real-page-link')?.value.trim()||'';const platform=$('#real-platform').value,serviceName=$('#real-service-name').value.trim();const service=isNew?(platform==='xhs'&&serviceName==='聚光'?'jug':platform==='xhs'&&serviceName==='灵犀'?'lingxi':'custom'):accountDraft.service;if(isNew&&!serviceName)return toast('请填写服务。','alert');if(service==='jug'&&!pageLink)return toast('请填写页面链接。','alert');if(!isNew&&accountDraft?.method==='cookie'){const content=$('#real-cookie')?.value||'';if(content.trim())await saveCookieValue(save.dataset.realSaveAlias,content);}const result=await realApi(isNew?'/api/accounts':`/api/accounts/${save.dataset.realSaveAlias}`,{method:isNew?'POST':'PATCH',body:JSON.stringify(isNew?{platform,serviceName,alias,pageLink}:{alias,...(service==='jug'?{pageLink}:{})})});if(isNew)accounts.push(result);else Object.assign(accounts.find(x=>x.id===result.id),result);closeAccountEditor();renderAccounts();toast(isNew?'账号已新增，请配置登录。':'配置已保存。');}catch(error){toast(error.message,'alert');}return;}
  const open=event.target.closest('[data-real-view]');
  if(open){try{const run=await realApi(`/api/runs/${open.dataset.realView}`);realRuns.set(run.id,run);openTool(fromRealTool[run.tool],run);if(['queued','running'].includes(run.status)&&!pollTimers.has(run.id))pollTimers.set(run.id,setInterval(()=>realPoll(run.id),1800));}catch(error){toast(error.message,'alert');}return;}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='history-status'){historyFilters.status=el.value;renderHistory();return;}
  if(el.id==='note-file'){void inspectNotesUpload(el.files?.[0]||null);return;}
  if(el.id==='adgroups-start'||el.id==='adgroups-end'){configs.adgroups[el.id==='adgroups-start'?'apiStart':'apiEnd']=el.value;scheduleAdgroupPreview();return;}
  if(el.name==='plaza-content'){
    if(plazaConfigBusy())return;
    configs.plaza.collectComments=el.value==='comments';refreshConfigMeta();return;
  }
  if(el.id==='plaza-file'){void inspectPlazaUpload(el.files?.[0]||null);return;}
  if(el.id==='note-sheet'){notesSheetName=el.value;refreshConfigMeta();return;}
  if(el.id==='note-mode'){$('#note-limit-field')?.classList.toggle('hidden',el.value!=='trial');refreshConfigMeta();return;}
  if(el.id==='real-platform'){$('#real-page-link-field')?.classList.toggle('hidden',!($('#real-platform').value==='xhs'&&$('#real-service-name').value.trim()==='聚光'));return;}
  if(el.id==='real-method'&&accountDraft){accountDraft.method=el.value;$('#real-credential-mode').innerHTML=realCredentialMarkup(el.value,accountDraft);if(el.value==='cookie')void fillStoredCookie(accountDraft.id);return;}
  if(el.id==='partition'){bubbleDraft.timePartition=Number(el.value);configs.industry.start=configs.industry.start.slice(0,bubbleDraft.timePartition===2?7:10);configs.industry.end=configs.industry.end.slice(0,bubbleDraft.timePartition===2?7:10);renderConfig();return;}
  if(el.id==='dimension')bubbleDraft.dimensionType=el.value;
  if(el.id==='x-axis')bubbleDraft.xindex=el.value;
  if(el.id==='size-axis')bubbleDraft.sizeIndex=el.value;
  if(el.dataset.yAxis)bubbleDraft.yindexList=$$('[data-y-axis]:checked').map(x=>x.dataset.yAxis);
});
document.addEventListener('input',event=>{if(event.target.id==='note-limit')refreshConfigMeta();});
document.addEventListener('input',event=>{
  if(currentTool!=='content')return;
  const el=event.target,c=configs.content;
  if(el.id==='content-product-search'){c.productQuery=el.value;paintContentPicker();return;}
  if(['date-start','date-end'].includes(el.id))refreshConfigMeta();
});
document.addEventListener('change',event=>{
  if(currentTool!=='content')return;
  const el=event.target;
  if(el.dataset.contentProduct){
    if(!toggleContentProduct(el.dataset.contentProduct,el.checked))el.checked=false;
    paintContentPicker();refreshConfigMeta();return;
  }
  if(el.id==='run-account'){
    Object.assign(configs.content,{brandUserId:'',productsText:'',productOptions:[],productQuery:'',productStatus:'账号已切换，请重新读取授权产品。',loading:false});
    renderConfig();
  }
});
document.addEventListener('click',async event=>{
  if(event.target.closest('[data-content-clear]')){
    if(!contentConfigBusy()){setContentSelected([]);paintContentPicker();refreshConfigMeta();}return;
  }
  const button=event.target.closest('[data-content-load]');if(!button||contentConfigBusy())return;
  const account=connectionFor('content');if(!account)return realError('请先选择灵犀账号');
  const accountId=account.id,c=configs.content;
  c.loading=true;c.productStatus='正在读取当前品牌与授权产品…';
  $('#content-load-state').textContent=c.productStatus;refreshConfigMeta();
  try{
    const data=await realApi('/api/content/options',{method:'POST',body:JSON.stringify({accountId})});
    if(configs.content!==c||connectionFor('content')?.id!==accountId)return;
    const valid=new Set(data.products.map(p=>p.id));
    const selected=c.productAccountId===accountId?contentProductRows(c.productsText).rows.filter(p=>valid.has(p.id)).slice(0,20):[];
    c.brandUserId=data.brandUserId;c.productOptions=data.products;c.productAccountId=accountId;c.productQuery='';
    c.productsText=selected.map(p=>`${p.id},${p.name}`).join('\n');
    c.productStatus=`已读取 ${data.products.length} 个授权产品，请勾选本次需要的产品。`;
  }catch(error){c.productStatus=error.message;}
  finally{c.loading=false;if(currentTool==='content'&&configs.content===c)renderConfig();}
});

persist=function(){};
$('#modal').addEventListener('close',()=>$('#modal').classList.remove('location-modal'));

(async()=>{
  try {
    const meta=await realApi('/api/meta');
    window.ZHICAI_SERVER_MODE=!!meta.serverMode;
    const me=meta.serverMode?await realApi('/api/auth/me'):null;
    if(me){window.ZHICAI_ME=me;window.ZHICAI_CSRF=me.csrfToken;}
    // Availability is controlled by the server; adapters and form configuration remain intact.
    for(const [uiId,apiId] of Object.entries(realTools)){
      if((meta.disabledTools||[]).includes(apiId))delete realTools[uiId];
    }
    toolLocationImages=meta.toolLocationImages||{};
    const name=meta.localUser||'本机用户';
    users=[{id:me?.id||'local',name:me?.email||name,team:me?.teamName||'本机使用',role:me?.role||'admin',expiry:'',grants:granted(me?me.tools.map(id=>fromRealTool[id]).filter(Boolean):Object.keys(realTools)),bindings:blankBindings()}];
    currentUser=users[0].id;editorUser=currentUser;editor=clone(users[0]);
    accounts=(await realApi('/api/accounts')).map(a=>({...a,owner:a.ownerUserId||'local',method:a.method||'login',loginMode:'manual',credentialConfigured:true,revision:1,created:Date.now(),updated:Date.now(),lastEvent:''}));
    runs=[];page='catalog';platform='all';catalogQuery='';
    configs.trend.input='';configs.trend.onlyContainRoot=true;
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

function adgroupPreviewInput(){
  const start=configs.adgroups.apiStart||'',end=configs.adgroups.apiEnd||'',account=connectionFor('adgroups');
  return {start,end,account,key:account&&!account.disabled?`${account.id}\n${start}\n${end}`:''};
}
function paintAdgroupPreview(){
  const el=$('#adgroup-link-state');if(!el)return;
  const {key}=adgroupPreviewInput(), state=adgroupPreview;
  el.className='adgroup-link-state';
  if(!key||state.key!==key){el.textContent='选择账号后自动读取广告组数量';return;}
  if(state.phase==='loading'||state.phase==='pending'){
    el.innerHTML='<span class="spinner" aria-hidden="true"></span>正在查询广告组数量…';return;
  }
  if(state.phase==='error'){el.classList.add('error');el.textContent=state.error;return;}
  if(state.phase==='ready'){
    el.textContent=`可导出 ${state.data.websiteTotal??'未知'} 个广告组`;
    return;
  }
  el.textContent='选择账号后自动读取广告组数量';
}
function scheduleAdgroupPreview(){
  clearTimeout(adgroupPreviewTimer);
  const {key}=adgroupPreviewInput();
  if(key!==adgroupPreview.key)adgroupPreview={key,phase:key?'pending':'idle',data:null,error:''};
  paintAdgroupPreview();
  adgroupPreviewTimer=setTimeout(()=>void readAdgroupPreview(),600);
}
async function readAdgroupPreview(){
  if(page!=='tool'||currentTool!=='adgroups')return;
  const input=adgroupPreviewInput();if(!input.key)return;
  if(adgroupPreviewFlight)return;
  if(adgroupPreview.key===input.key&&adgroupPreview.phase==='ready')return;
  if(!!input.start!==!!input.end||(input.start&&input.start>input.end)){
    adgroupPreview={key:input.key,phase:'error',data:null,error:!!input.start!==!!input.end?'请同时选择开始和结束日期，或全部留空。':'开始日期不能晚于结束日期。'};paintAdgroupPreview();return;
  }
  adgroupPreview={key:input.key,phase:'loading',data:null,error:''};paintAdgroupPreview();
  adgroupPreviewFlight=(async()=>{
    try{
      const data=await realApi('/api/adgroups/inspect',{method:'POST',body:JSON.stringify({accountId:input.account.id,start:input.start,end:input.end})});
      if(adgroupPreviewInput().key===input.key)adgroupPreview={key:input.key,phase:'ready',data,error:''};
    }catch(error){
      if(adgroupPreviewInput().key===input.key)adgroupPreview={key:input.key,phase:'error',data:null,error:error.message};
    }finally{
      adgroupPreviewFlight=null;paintAdgroupPreview();
      if(adgroupPreviewInput().key!==input.key)void readAdgroupPreview();
    }
  })();
  await adgroupPreviewFlight;
}
document.addEventListener('change',event=>{
  if(event.target.id==='run-account'&&currentTool==='adgroups')scheduleAdgroupPreview();
});

document.addEventListener('input',event=>{if(event.target.id==='real-service-name')$('#real-page-link-field')?.classList.toggle('hidden',!($('#real-platform').value==='xhs'&&event.target.value.trim()==='聚光'));});
