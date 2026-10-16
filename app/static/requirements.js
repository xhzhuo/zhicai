/* Server-backed requirement intake. No durable browser storage or demo rows. */
'use strict';

const requirementKinds={new_tool:'新增取数工具',enhancement:'改进现有工具',problem:'运行问题'};
const requirementStatuses={submitted:'待评估',needs_info:'需补充',evaluating:'评估中',scheduled:'已排期',in_progress:'处理中',done:'已完成',declined:'不采纳'};
const requirementStatusColors={submitted:'blue',needs_info:'amber',evaluating:'blue',scheduled:'blue',in_progress:'amber',done:'green',declined:'red'};
let requirementMode='list',requirementList=[],requirementDetail=null,requirementDraft=null;
let requirementFilters={kind:'',status:''},requirementLoaded=false,requirementLoading=false,requirementLoadError='',requirementManageEnabled=false;

const previousRenderChrome=renderChrome;
renderChrome=function(){
  previousRenderChrome();
  const selected=page==='requirements';
  const nav=`<button class="nav-btn ${selected?'active':''}" data-page="requirements" ${selected?'aria-current="page"':''} title="需求中心">${I('file')}<span>需求中心</span></button>`;
  $('#main-nav [data-page="history"]')?.insertAdjacentHTML('afterend',nav);
  $('#mobile-nav [data-page="history"]')?.insertAdjacentHTML('afterend',`<button data-page="requirements" class="${selected?'active':''}">${I('file')}<span>需求中心</span></button>`);
  if(selected){$('#breadcrumb b').textContent='需求中心';document.title='需求中心 · 智采 cloud';}
};

const previousRender=render;
render=function(){
  if(page==='requirements'){renderChrome();renderRequirements();return;}
  previousRender();
};

const previousRenderTool=renderTool;
renderTool=function(){
  previousRenderTool();
  if(page==='tool'&&realTools[currentTool])$('#main .heading-actions')?.insertAdjacentHTML('afterbegin',`<button class="btn" data-requirement-for-tool="${currentTool}">${I('plus','i16')}对此工具提需求</button>`);
};

const previousRenderHistory=renderHistory;
renderHistory=function(){
  previousRenderHistory();
  $$('[data-real-view]').forEach(button=>{
    const id=button.dataset.realView;
    button.parentElement?.insertAdjacentHTML('beforeend',`<button class="text-btn" data-requirement-for-run="${id}">反馈问题</button>`);
  });
};

function reqStatus(status){return `<span class="pill ${requirementStatusColors[status]||''}">${requirementStatuses[status]||esc(status)}</span>`;}
function reqTabs(){const listActive=requirementMode==='list'||requirementMode==='detail';return `<div class="req-tabs" role="tablist" aria-label="需求中心页面"><button class="req-tab ${requirementMode==='new'?'active':''}" data-req-mode="new" role="tab" aria-selected="${requirementMode==='new'}">提交需求</button><button class="req-tab ${listActive?'active':''}" data-req-mode="list" role="tab" aria-selected="${listActive}">我的需求</button></div>`;}
function reqHeading(subtitle){return `<div class="heading"><div><div class="eyebrow">REQUEST CENTER</div><h1>需求中心</h1><p>${subtitle}</p></div>${requirementMode==='list'?`<div class="heading-actions"><button class="btn primary" data-req-mode="new">${I('plus','i16')}提交需求</button></div>`:''}</div>`;}

function renderRequirements(){
  if(requirementMode==='new'){renderRequirementForm();return;}
  if(requirementMode==='detail'){renderRequirementDetail();return;}
  renderRequirementList();
}

async function fetchRequirementList(){
  if(requirementLoading)return;
  requirementLoading=true;
  const selected=JSON.stringify(requirementFilters);
  try{
    const query=new URLSearchParams();
    if(requirementFilters.kind)query.set('kind',requirementFilters.kind);
    if(requirementFilters.status)query.set('status',requirementFilters.status);
    const rows=await realApi(`/api/requirements${query.size?'?'+query.toString():''}`);
    if(selected===JSON.stringify(requirementFilters)){requirementList=rows;requirementLoaded=true;requirementLoadError='';}
  }catch(error){if(selected===JSON.stringify(requirementFilters)){requirementLoaded=true;requirementLoadError=error.message;}}
  finally{requirementLoading=false;if(selected!==JSON.stringify(requirementFilters))void fetchRequirementList();else if(page==='requirements'&&requirementMode==='list')renderRequirementList();}
}

function renderRequirementList(){
  $('#main').innerHTML=`${reqHeading('提交新的取数需求，或查看已提交事项的处理进度。')}${reqTabs()}
    <section class="panel req-filter-panel"><div class="req-filter-grid"><div class="field"><div class="field-label"><label for="req-kind-filter">需求类型</label></div><select id="req-kind-filter"><option value="">全部类型</option>${Object.entries(requirementKinds).map(([key,label])=>`<option value="${key}" ${requirementFilters.kind===key?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><div class="field-label"><label for="req-status-filter">处理状态</label></div><select id="req-status-filter"><option value="">全部状态</option>${Object.entries(requirementStatuses).map(([key,label])=>`<option value="${key}" ${requirementFilters.status===key?'selected':''}>${label}</option>`).join('')}</select></div></div></section>
    <section class="panel req-list-panel"><div class="panel-head"><h2>我的需求 <span class="pill">${requirementList.length}</span></h2><span class="small muted">提交后保存在服务端</span></div>
    ${!requirementLoaded?emptyView('正在读取需求','请稍候。','clock'):requirementLoadError?emptyView('需求读取失败',requirementLoadError,'alert'):requirementList.length?`<div class="req-list-scroll"><table class="data-table req-list-table"><thead><tr><th>需求 / 编号</th><th>类型</th><th>平台 / 工具</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${requirementList.map(item=>`<tr><td><strong>${esc(item.title)}</strong><small>${esc(item.id.slice(0,8))}</small></td><td>${requirementKinds[item.kind]}</td><td>${esc(item.tool_id?tools[item.tool_id]?.title||item.tool_id:item.platform||'—')}</td><td>${esc(item.created_at.replace('T',' ').slice(0,19))}</td><td>${reqStatus(item.status)}</td><td><button class="text-btn" data-req-open="${item.id}">查看</button></td></tr>`).join('')}</tbody></table></div>`:emptyView('还没有需求记录','点击“提交需求”告诉我们需要获取哪些数据。','file')}</section>${realFooter()}`;
  if(!requirementLoaded&&!requirementLoading)void fetchRequirementList();
}

function reqInput(id,label,inner,hint=''){return `<div class="field"><div class="field-label"><label for="${id}">${label}</label></div>${inner}${hint?`<div class="field-hint">${hint}</div>`:''}</div>`;}
function reqText(id,placeholder='',value=''){return `<textarea id="${id}" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;}
function reqToolOptions(selected=''){return `<option value="">请选择工具</option>${Object.entries(platforms).map(([platformId,p])=>`<optgroup label="${esc(p.name)}">${allTools.filter(id=>tools[id].platform===platformId).map(id=>`<option value="${id}" ${selected===id?'selected':''}>${esc(tools[id].title)}</option>`).join('')}</optgroup>`).join('')}`;}

function renderRequirementForm(){
  const draft=requirementDraft||{},kind=draft.kind||'new_tool';
  $('#main').innerHTML=`${reqHeading('描述你需要的数据或工具改动，提交后可在“我的需求”中查看。')}${reqTabs()}
    <section class="panel req-form-panel"><form id="req-form" novalidate><div class="panel-head"><h2>提交需求</h2></div><div class="req-form-body">
    <div class="req-form-grid">${reqInput('req-kind','需求类型',`<select id="req-kind">${Object.entries(requirementKinds).map(([key,label])=>`<option value="${key}" ${kind===key?'selected':''}>${label}</option>`).join('')}</select>`)}
    ${reqInput('req-title','标题',`<input id="req-title" maxlength="120" required value="${esc(draft.title||'')}" placeholder="例如：批量获取聚光关键词搜索量">`)}
    ${reqInput('req-contact','联系方式',`<input id="req-contact" maxlength="120" required value="${esc(draft.contact||'')}" placeholder="邮箱或飞书账号">`,'正式接入用户登录后，这项可由账号自动带入。')}
    ${reqInput('req-platform','来源平台',`<select id="req-platform"><option value="">请选择平台</option>${Object.entries(platforms).map(([key,p])=>`<option value="${key}" ${draft.platform===key?'selected':''}>${esc(p.name)}</option>`).join('')}<option value="other" ${draft.platform==='other'?'selected':''}>其他平台</option></select>`)}
    <div class="req-other-platform hidden">${reqInput('req-platform-other','其他平台名称',`<input id="req-platform-other" maxlength="50" placeholder="填写平台名称">`)}</div>
    ${reqInput('req-service','具体服务',`<input id="req-service" maxlength="80" value="${esc(draft.service||'')}" placeholder="例如：聚光、灵犀、生意参谋">`)}
    <div class="req-existing-only">${reqInput('req-tool','现有工具',`<select id="req-tool">${reqToolOptions(draft.toolId||'')}</select>`)}</div>
    <div class="req-problem-only">${reqInput('req-run','运行记录编号（可选）',`<input id="req-run" maxlength="32" value="${esc(draft.runId||'')}" placeholder="从运行记录进入会自动填写">`)}</div></div>
    ${reqInput('req-description','业务目的 / 问题描述',reqText('req-description','你要解决什么问题？',draft.description||''))}
    <div class="req-new-only">${reqInput('req-location','数据所在页面',reqText('req-location','平台菜单路径或页面链接；也可以在下方上传取数位置截图',draft.sourceLocation||''),'页面路径／链接和位置截图至少提供一种。')}
    ${reqInput('req-data','想获取的数据',reqText('req-data','例如：品牌名、搜索量、阅读量；按天还是按月',draft.desiredData||''))}
    </div>
    ${reqInput('req-expected','期望结果',reqText('req-expected','例如：导出 Excel，每个关键词每天一行',draft.expectedResult||''))}
    <div class="req-form-grid">${reqInput('req-frequency','使用频率（可选）',`<select id="req-frequency"><option value="">暂不确定</option>${[['一次性','一次性'],['每天','每天'],['每周','每周'],['每月','每月'],['其他','其他']].map(([key,label])=>`<option value="${key}" ${draft.frequency===key?'selected':''}>${label}</option>`).join('')}</select>`)}
    ${reqInput('req-needed-by','期望完成日期（可选）',`<input id="req-needed-by" type="date" value="${esc(draft.neededBy||'')}">`)}</div>
    ${reqInput('req-attachments','截图或样例文件（可选）',`<input id="req-attachments" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.csv,.xlsx">`,'最多 3 个，每个小于 10 MB。请勿上传账号密码或 Cookie。')}
    <div class="form-errors hidden" id="req-errors" role="alert"></div></div><div class="req-form-footer"><span class="small muted">提交后生成需求编号，可在“我的需求”查看。</span><button type="submit" class="btn primary" id="req-submit">提交需求</button></div></form></section>${realFooter()}`;
  updateRequirementKind();
}

function updateRequirementKind(){
  const kind=$('#req-kind')?.value;if(!kind)return;
  $('#req-contact')?.closest('.field')?.classList.toggle('hidden',kind==='new_tool');
  $('#req-description')?.closest('.field')?.classList.toggle('hidden',kind==='new_tool');
  $$('.req-new-only').forEach(el=>el.classList.toggle('hidden',kind!=='new_tool'));
  $$('.req-existing-only').forEach(el=>el.classList.toggle('hidden',kind==='new_tool'));
  $$('.req-problem-only').forEach(el=>el.classList.toggle('hidden',kind!=='problem'));
  $('.req-other-platform')?.classList.toggle('hidden',$('#req-platform').value!=='other');
  const descriptionLabel=$('label[for="req-description"]');
  const expectedLabel=$('label[for="req-expected"]');
  if(descriptionLabel)descriptionLabel.textContent=kind==='new_tool'?'问题描述':kind==='enhancement'?'现在哪里不方便':'实际发生了什么';
  if(expectedLabel)expectedLabel.textContent=kind==='new_tool'?'期望表格的样子':kind==='enhancement'?'希望改成什么':'期望正常情况是什么';
}

function reqError(message){const box=$('#req-errors');if(box){box.textContent=message;box.classList.remove('hidden');box.scrollIntoView({block:'nearest'});}toast(message,'alert');}
async function submitRequirement(){
  const kind=$('#req-kind').value,title=$('#req-title').value.trim(),contact=$('#req-contact')?.value.trim()||'';
  const description=$('#req-description')?.value.trim()||'',expected=$('#req-expected').value.trim();
  const toolId=$('#req-tool').value,platform=$('#req-platform').value==='other'?$('#req-platform-other').value.trim():$('#req-platform').value,service=$('#req-service').value.trim();
  const location=$('#req-location').value.trim(),wanted=$('#req-data').value.trim(),files=[...$('#req-attachments').files];
  if(!title||!expected)return reqError('请填写标题和期望结果。');
  if(kind!=='new_tool'&&(!contact||!description))return reqError('请填写联系方式和需求描述。');
  if(kind==='new_tool'&&(!platform||!service||!wanted))return reqError('新增工具还需填写平台、具体服务和想获取的数据。');
  if(kind==='new_tool'&&!location&&!files.some(file=>/\.(png|jpe?g|webp)$/i.test(file.name)))return reqError('请填写数据所在页面，或上传取数位置截图。');
  if(kind!=='new_tool'&&!toolId)return reqError('请选择现有工具。');
  if(files.length>3||files.some(file=>file.size>10*1024*1024||file.size===0))return reqError('最多上传 3 个附件，每个需小于 10 MB 且不能为空。');
  const data=new FormData();
  const fields={kind,title,contact:kind==='new_tool'?'':contact,description:kind==='new_tool'?'':description,expected_result:expected,platform,service,
    tool_id:kind==='new_tool'?'':toolId,run_id:kind==='problem'?$('#req-run').value.trim():'',
    source_location:kind==='new_tool'?location:'',desired_data:kind==='new_tool'?wanted:'',
    input_conditions:'',
    usage_frequency:$('#req-frequency').value,needed_by:$('#req-needed-by').value};
  Object.entries(fields).forEach(([key,value])=>data.append(key,value));
  files.forEach(file=>data.append('attachments',file,file.name));
  const button=$('#req-submit');button.disabled=true;
  try{
    const response=await fetch('/api/requirements',{method:'POST',headers:window.ZHICAI_CSRF?{'X-CSRF-Token':window.ZHICAI_CSRF}:{},body:data});
    const result=await response.json();
    if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:`提交失败（HTTP ${response.status}）`);
    requirementLoaded=false;requirementDraft=null;
    await openRequirement(result.id);
    toast(`需求已提交，编号 ${result.id.slice(0,8)}。`);
  }catch(error){reqError(error.message);button.disabled=false;}
}

async function openRequirement(id){
  try{requirementDetail=await realApi(`/api/requirements/${id}`);requirementMode='detail';render();}
  catch(error){toast(error.message,'alert');}
}
function reqLine(label,value){return value?`<dt>${label}</dt><dd>${esc(value)}</dd>`:'';}
function renderRequirementDetail(){
  const item=requirementDetail;
  if(!item){requirementMode='list';renderRequirementList();return;}
  $('#main').innerHTML=`<div class="heading"><div><div class="eyebrow">REQUEST DETAIL</div><h1>${esc(item.title)}</h1><p>需求编号 ${esc(item.id)} · ${requirementKinds[item.kind]}</p></div><div class="heading-actions"><button class="btn" data-req-mode="list">${I('left','i16')}我的需求</button></div></div>
    <section class="panel req-detail-panel"><div class="panel-head"><h2>需求详情</h2>${reqStatus(item.status)}</div><div class="req-detail-body"><dl class="req-details-grid">
    ${reqLine('提交人',item.requester)}${reqLine('联系方式',item.contact)}${reqLine('平台',platforms[item.platform]?.name||item.platform)}${reqLine('具体服务',item.service)}${reqLine('关联工具',tools[item.tool_id]?.title||item.tool_id)}${reqLine('运行记录',item.run_id)}
    ${reqLine(item.kind==='problem'?'实际情况':'业务目的 / 当前问题',item.description)}${reqLine('数据所在页面',item.source_location)}${reqLine('想获取的数据',item.desired_data)}${reqLine('期望结果',item.expected_result)}${reqLine('输入条件',item.input_conditions)}${reqLine('使用频率',item.usage_frequency)}${reqLine('期望完成日期',item.needed_by)}${reqLine('提交时间',item.created_at.replace('T',' ').slice(0,19))}
    </dl>${item.attachments.length?`<div class="req-attachments"><h3>附件</h3>${item.attachments.map(file=>`<a href="/api/requirements/${item.id}/attachments/${file.id}">${I('download','i14')}${esc(file.filename)} <small>(${Math.ceil(file.size_bytes/1024)} KB)</small></a>`).join('')}</div>`:''}</div></section>
    <section class="panel req-timeline"><div class="panel-head"><h2>处理进度</h2></div><div class="req-timeline-body">${item.events.map(event=>`<div class="req-event"><div>${reqStatus(event.status)}<span class="small muted">${esc(event.created_at.replace('T',' ').slice(0,19))}</span></div>${event.note?`<p>${esc(event.note)}</p>`:''}</div>`).join('')}</div></section>
    ${requirementManageEnabled?`<details class="panel req-manage"><summary>本机处理：更新需求状态</summary><div class="req-manage-body"><div class="field"><label for="req-next-status">状态</label><select id="req-next-status">${Object.entries(requirementStatuses).map(([key,label])=>`<option value="${key}" ${item.status===key?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label for="req-status-note">处理说明（可选）</label><textarea id="req-status-note" rows="2" maxlength="1000" placeholder="说明下一步或需补充的信息"></textarea></div><button class="btn primary" data-req-status>保存处理进度</button></div></details>`:''}${realFooter()}`;
}

async function changeRequirementStatus(){
  const status=$('#req-next-status')?.value,note=$('#req-status-note')?.value.trim()||'';
  try{await realApi(`/api/requirements/${requirementDetail.id}/status`,{method:'PATCH',body:JSON.stringify({status,note})});await openRequirement(requirementDetail.id);toast('处理进度已更新。');}
  catch(error){toast(error.message,'alert');}
}

function startRequirementForTool(id){
  requirementDraft={kind:'enhancement',toolId:id,platform:tools[id].platform,service:tools[id].source};
  requirementMode='new';go('requirements');
}
function startRequirementForRun(id){
  const run=realHistory.find(item=>item.id===id);if(!run)return;
  const toolId=fromRealTool[run.tool];
  requirementDraft={kind:'problem',toolId,runId:id,platform:tools[toolId].platform,service:tools[toolId].source};
  requirementMode='new';go('requirements');
}

document.addEventListener('click',event=>{
  const toolButton=event.target.closest('[data-requirement-for-tool]');if(toolButton){startRequirementForTool(toolButton.dataset.requirementForTool);return;}
  const runButton=event.target.closest('[data-requirement-for-run]');if(runButton){startRequirementForRun(runButton.dataset.requirementForRun);return;}
  const modeButton=event.target.closest('[data-req-mode]');if(modeButton){requirementMode=modeButton.dataset.reqMode;if(requirementMode==='new')requirementDraft=null;renderRequirements();return;}
  const openButton=event.target.closest('[data-req-open]');if(openButton){void openRequirement(openButton.dataset.reqOpen);return;}
  if(event.target.closest('[data-req-status]')){void changeRequirementStatus();return;}
});
document.addEventListener('change',event=>{
  const element=event.target;
  if(element.id==='req-kind'){updateRequirementKind();return;}
  if(element.id==='req-tool'&&element.value){const tool=tools[element.value];$('#req-platform').value=tool.platform;$('#req-service').value=tool.source;return;}
  if(element.id==='req-platform'){$('.req-other-platform')?.classList.toggle('hidden',element.value!=='other');return;}
  if(element.id==='req-kind-filter'){requirementFilters.kind=element.value;requirementLoaded=false;requirementLoadError='';requirementList=[];void fetchRequirementList();return;}
  if(element.id==='req-status-filter'){requirementFilters.status=element.value;requirementLoaded=false;requirementLoadError='';requirementList=[];void fetchRequirementList();return;}
});
document.addEventListener('submit',event=>{if(event.target.id==='req-form'){event.preventDefault();void submitRequirement();}});

void realApi('/api/meta').then(meta=>{requirementManageEnabled=!!meta.requirementManageEnabled;if(page==='requirements'&&requirementMode==='detail')renderRequirements();}).catch(()=>{});


/* Server roles: administrators process requests; members submit them. */
const requirementIsAdmin=()=>window.ZHICAI_SERVER_MODE&&window.ZHICAI_ME?.role==='admin';
const originalRequirementTabs=reqTabs;
reqTabs=function(){return window.ZHICAI_SERVER_MODE&&requirementIsAdmin()?'':originalRequirementTabs();};
const originalRequirementHeading=reqHeading;
reqHeading=function(subtitle){
  if(!window.ZHICAI_SERVER_MODE)return originalRequirementHeading(subtitle);
  const title=requirementIsAdmin()?'需求管理':'需求中心';
  return '<div class="heading"><div><div class="eyebrow">REQUEST CENTER</div><h1>'+title+'</h1></div></div>';
};
const originalRequirementChrome=renderChrome;
renderChrome=function(){
  originalRequirementChrome();
  if(!window.ZHICAI_SERVER_MODE)return;
  const label=requirementIsAdmin()?'需求管理':'需求中心';
  document.querySelectorAll('[data-page="requirements"] span').forEach(el=>el.textContent=label);
  if(page==='requirements'){$('#breadcrumb b').textContent=label;document.title=label+' · 智采 cloud';}
};
const originalRequirementTool=renderTool;
renderTool=function(){
  originalRequirementTool();
  if(requirementIsAdmin())document.querySelector('[data-requirement-for-tool]')?.remove();
};
const originalRequirementHistory=renderHistory;
renderHistory=function(){
  originalRequirementHistory();
  if(requirementIsAdmin())document.querySelectorAll('[data-requirement-for-run]').forEach(el=>el.remove());
};
const originalRequirementList=renderRequirementList;
renderRequirementList=function(){
  originalRequirementList();
  if(!requirementIsAdmin())return;
  const heading=$('.req-list-panel .panel-head h2');
  if(heading)heading.innerHTML='需求列表 <span class="pill">'+requirementList.length+'</span>';
  $('.req-list-panel .panel-head .small')?.remove();
  if(requirementList.length===0&&requirementLoaded&&!requirementLoadError){
    const empty=$('.req-list-panel .empty');
    if(empty){const title=empty.querySelector('h3'),description=empty.querySelector('p');if(title)title.textContent='暂无需求';if(description)description.textContent='';}
  }
};
const originalRequirementForm=renderRequirementForm;
renderRequirementForm=function(){
  originalRequirementForm();
  if(!window.ZHICAI_SERVER_MODE)return;
  $('.req-form-footer > span')?.remove();
  const contact=$('#req-contact');
  contact?.closest('.field')?.querySelector('.field-hint')?.remove();
  if(contact&&!contact.value&&window.ZHICAI_ME?.email)contact.value=window.ZHICAI_ME.email;
};
const originalRequirementDetail=renderRequirementDetail;
renderRequirementDetail=function(){
  originalRequirementDetail();
  if(window.ZHICAI_SERVER_MODE&&!requirementIsAdmin()){$('#main .heading')?.insertAdjacentHTML('afterend',reqTabs());return;}
  if(!requirementIsAdmin())return;
  const back=$('[data-req-mode="list"]');if(back)back.textContent='需求列表';
  const status=$('.req-manage summary');if(status)status.textContent='更新需求状态';
};
const originalRequirementRender=renderRequirements;
let memberRequirementInitialized=false;
renderRequirements=function(){
  if(!window.ZHICAI_SERVER_MODE)return originalRequirementRender();
  if(requirementIsAdmin()){
    if(requirementMode==='detail')renderRequirementDetail();
    else{requirementMode='list';renderRequirementList();}
    return;
  }
  if(!memberRequirementInitialized){memberRequirementInitialized=true;if(requirementMode==='list')requirementMode='new';}
  originalRequirementRender();
};
