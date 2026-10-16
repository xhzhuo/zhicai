/* Real team and user management layered over the v0.4 workbench shell. */
'use strict';

canManageAnyAccount=function(){return true;};
let adminTeams=[],adminUsers=[],adminLoaded=false,adminLoading=false;
let selectedMemberId='',selectedTeamFilter='all';

const originalAccountEditor=openAccountEditor;
openAccountEditor=function(id=null){
  const account=id?accounts.find(item=>item.id===id):null;
  if(account&&account.ownerUserId!==currentUser&&window.ZHICAI_ME?.role!=='admin')return toast('没有此账号的维护权限。','alert');
  originalAccountEditor(id);
  const drawer=$('#account-drawer');
  if(drawer?.open){
    drawer.querySelector('.drawer-body .notice')?.remove();
    const headerNote=drawer.querySelector('.drawer-header p');
    if(headerNote)headerNote.textContent=account?account.alias:'';
    const method=$('#real-method');
    if(account?.service==='custom'){
      method?.closest('.field')?.remove();
      drawer.querySelector('.drawer-section-title')?.remove();
      $('#real-credential-mode')?.remove();
      drawer.querySelector('.drawer-body > .field-hint')?.remove();
    }else if(method){method.value='cookie';method.disabled=true;accountDraft.method='cookie';$('#real-credential-mode').innerHTML=realCredentialMarkup('cookie',accountDraft);if(account)void fillStoredCookie(account.id);}
    const footer=drawer.querySelector('.drawer-footer strong');
    if(footer)footer.textContent=account?.service==='custom'?'该服务尚未接入连接验证或采集':account?'保存后请验证连接':'保存平台账号';
    const footerHint=drawer.querySelector('.drawer-footer small');
    if(footerHint&&account?.service==='custom')footerHint.textContent='可维护平台、服务和账号别名。';
  }
};

renderAccounts=function(){
  const visible=accounts.filter(a=>(accountPlatform==='all'||(a.platform||services[a.service]?.platform)===accountPlatform)
    &&(accountStatusFilter==='all'||a.status===accountStatusFilter)
    &&(!accountQuery||(a.alias+a.ownerEmail+a.teamName).toLowerCase().includes(accountQuery.toLowerCase())));
  $('#main').innerHTML=`<div class="heading"><div><div class="eyebrow">PLATFORM CONNECTIONS</div><h1>平台账号</h1><p>管理各团队的平台连接。</p></div><div class="heading-actions"><button class="btn primary" data-action="add-account">${I('plus','i16')}新增账号</button></div></div>
  <section class="filter-bar account-filters"><div class="flex wrap"><span class="filter-title">平台</span><div class="platforms">${['all',...Object.keys(platforms)].map(p=>`<button class="platform-chip ${accountPlatform===p?'active':''}" data-account-platform="${p}">${p==='all'?'全部平台':platforms[p].name}</button>`).join('')}</div></div><div class="account-filter-right"><select id="account-status-filter"><option value="all">全部状态</option>${Object.entries(accountStatuses).map(([value,item])=>`<option value="${value}" ${accountStatusFilter===value?'selected':''}>${item[1]}</option>`).join('')}</select><div class="search">${I('search','i14')}<input id="account-search" type="search" value="${esc(accountQuery)}" placeholder="账号、团队或配置人"></div></div></section>
  <section class="panel account-panel"><div class="panel-head"><h2>平台连接 <span class="pill">${visible.length}</span></h2></div><div class="account-table-scroll"><table class="account-table"><thead><tr><th>账号 / 服务</th><th>所属团队 / 配置人</th><th>连接状态</th><th>操作</th></tr></thead><tbody>${visible.map(a=>{
    const owner=a.ownerUserId===currentUser||window.ZHICAI_ME?.role==='admin';
    const teamControl=owner&&window.ZHICAI_ME?.role==='admin'&&adminTeams.length?`<select class="team-switch" data-account-team="${esc(a.id)}" aria-label="${esc(a.alias)}所属团队">${adminTeams.filter(team=>team.selectable).map(team=>`<option value="${esc(team.id)}" ${team.id===a.teamId?'selected':''}>${esc(team.name)}</option>`).join('')}${a.teamId==='bootstrap'?'<option value="bootstrap" selected>管理员团队</option>':''}</select>`:esc(a.teamName||'—');
    return `<tr data-account-row="${esc(a.id)}"><td><div class="account-name">${platformBadge(a.platform||services[a.service]?.platform||'xhs')}<div><b>${esc(a.teamName||"—")} · ${esc(a.alias)}</b><small>${esc(platforms[a.platform||services[a.service]?.platform]?.name||"—")} / ${esc(a.serviceName||services[a.service]?.name||a.service)}</small></div></div></td><td>${teamControl}<small>配置人 · ${esc(a.ownerEmail||'—')}</small></td><td>${a.service==='custom'?'<span class="pill amber">尚未接入</span>':connectionPill(a)}<small>${a.service==='custom'?'暂无采集适配器':a.verifiedAt?formatTime(a.verifiedAt):'尚未验证'}</small></td><td><div class="account-row-actions">${owner?`<button class="text-btn" data-edit-account="${esc(a.id)}">配置</button>${a.service==='custom'?'<span class="small muted">不可验证</span>':`<button class="text-btn" data-verify-account="${esc(a.id)}" ${a.disabled?'disabled':''}>验证</button>`}<button class="text-btn" data-toggle-account="${esc(a.id)}">${a.disabled?'启用':'停用'}</button><button class="text-btn danger-text" data-account-delete="${esc(a.id)}">删除</button>`:a.service==='custom'?'<span class="small muted">尚未接入</span>':'<span class="small muted">可用于采集</span>'}</div></td></tr>`;
  }).join('')}</tbody></table></div>${!visible.length?emptyView('没有匹配的账号','可新增账号，或调整筛选条件。','link'):''}</section>${realFooter()}`;
  if(window.ZHICAI_ME?.role==='admin'&&!adminLoaded&&!adminLoading)void loadAdminData();
};

async function loadAdminData(repaint=true){
  if(adminLoading)return;
  adminLoading=true;
  try{[adminTeams,adminUsers]=await Promise.all([realApi('/api/admin/teams'),realApi('/api/admin/users')]);adminLoaded=true;
    if(!selectedMemberId||!adminUsers.some(u=>u.id===selectedMemberId))selectedMemberId=adminUsers[0]?.id||'';
    if(repaint&&page==='permissions')paintPermissions();
    if(repaint&&page==='accounts')renderAccounts();
  }catch(error){toast(error.message,'alert');}finally{adminLoading=false;}
}

renderPermissions=function(){
  if(!adminLoaded){$('#main').innerHTML='<div class="panel empty"><h3>正在读取成员与团队…</h3></div>';void loadAdminData();return;}
  paintPermissions();
};

function paintPermissions(){
  const members=adminUsers.filter(u=>selectedTeamFilter==='all'||u.team_id===selectedTeamFilter||u.requested_team_id===selectedTeamFilter);
  const selected=adminUsers.find(u=>u.id===selectedMemberId)||members[0];
  if(selected)selectedMemberId=selected.id;
  $('#main').innerHTML=`<div class="heading"><div><div class="eyebrow">USER ACCESS</div><h1>用户与权限</h1><p>审核注册申请、管理团队，并为每位成员配置工具访问。</p></div></div>
  <section class="panel admin-team-panel"><div class="panel-head"><h2>团队</h2></div><div class="admin-team-body"><div class="team-chips">${adminTeams.filter(t=>t.selectable).map(t=>`<span class="pill blue">${esc(t.name)}</span>`).join('')||'<span class="muted">还没有可申请的团队</span>'}</div><form id="create-team-form"><label for="new-team-name">新增团队</label><input id="new-team-name" maxlength="60" required placeholder="输入团队名称"><button class="btn primary" type="submit">创建团队</button></form></div></section>
  <div class="permission-layout"><section class="panel member-panel"><div class="panel-head"><h2>成员 <span class="pill">${members.length}</span></h2><button class="text-btn" data-admin-refresh>刷新</button></div><div class="member-team-filter"><label for="admin-team-filter">团队筛选</label><select id="admin-team-filter"><option value="all">全部团队</option>${adminTeams.map(team=>`<option value="${esc(team.id)}" ${selectedTeamFilter===team.id?'selected':''}>${esc(team.name)}</option>`).join('')}</select></div><div class="member-list">${members.map(u=>`<button class="member ${selected?.id===u.id?'active':''}" data-admin-user="${esc(u.id)}"><span class="avatar">${esc(u.email.slice(0,2).toUpperCase())}</span><span><strong>${esc(u.email)}</strong><small>${esc(u.team_name||u.requested_team_name||'待分配')} · ${u.status==='pending'?'待审核':u.status==='active'?'已启用':u.status==='disabled'?'已停用':'已拒绝'}</small></span></button>`).join('')||'<p class="admin-empty">没有匹配的成员</p>'}</div></section>
  <section class="panel permission-editor">${selected?`<div class="admin-member-body"><div class="admin-member-header"><div><h2>${esc(selected.email)}</h2><small>${selected.role==='admin'?'管理员':'普通成员'} · ${selected.status==='pending'?'待审核':selected.status==='active'?'已启用':selected.status==='disabled'?'已停用':'已拒绝'}</small></div><div class="member-team-static"><span>所属团队</span><strong>${esc(selected.team_name||selected.requested_team_name||"未分配")}</strong></div></div><div class="admin-row admin-status-actions">${selected.status==='pending'?`<button class="btn primary" data-approve-member="${esc(selected.id)}">批准加入</button><button class="btn" data-reject-member="${esc(selected.id)}">拒绝</button>`:selected.status==='active'&&selected.role!=='admin'?`<button class="btn danger" data-disable-member="${esc(selected.id)}">停用成员</button>`:selected.status==='disabled'?`<button class="btn" data-enable-member="${esc(selected.id)}">重新启用</button>`:''}</div><h3>工具访问</h3><div class="admin-platform-groups">${Object.entries(platforms).map(([platformId,platformInfo])=>{
    const ids=allTools.filter(id=>tools[id].platform===platformId);
    return '<section class="admin-platform-group"><h3>'+esc(platformInfo.name)+'</h3><div class="admin-tools">'+
      ids.map(uiId=>{
        const apiId=realTools[uiId]||uiId;
        const checked=selected.role==='admin'||selected.tools.includes(apiId);
        return '<label><span>'+esc(tools[uiId].title)+(realTools[uiId]?'':' <small>暂不可用</small>')+
          '</span><input type="checkbox" data-admin-tool="'+esc(apiId)+'"'+(checked?' checked':'')+
          (selected.role==='admin'?' disabled':'')+'></label>';
      }).join('')+'</div></section>';
  }).join('')}</div><button class="btn primary" data-save-tools="${esc(selected.id)}" ${selected.role==='admin'?'disabled':''}>保存工具权限</button></div>`:'<div class="admin-empty">暂无成员记录</div>'}</section></div>${realFooter()}`;
}

document.addEventListener('click',async event=>{
  if(event.target.closest('[data-password-change]')){
    let dialog=$('#security-dialog');
    if(!dialog){document.body.insertAdjacentHTML('beforeend',`<dialog id="security-dialog"><form id="security-form"><h2>修改登录密码</h2><label for="old-password">当前密码</label><input id="old-password" type="password" autocomplete="current-password" required><label for="new-password">新密码（至少 12 位）</label><input id="new-password" type="password" autocomplete="new-password" minlength="12" required><div class="flex"><button class="btn" type="button" data-close-security>取消</button><button class="btn primary" type="submit">保存并重新登录</button></div></form></dialog>`);dialog=$('#security-dialog');}
    dialog.showModal();return;
  }
  if(event.target.closest('[data-close-security]')){$('#security-dialog')?.close();return;}
  const logout=event.target.closest('[data-real-logout]');
  if(logout){try{await realApi('/api/auth/logout',{method:'POST',body:'{}'});}finally{location.assign('/');}return;}
  const del=event.target.closest('[data-account-delete]');
  if(del){const account=accounts.find(a=>a.id===del.dataset.accountDelete);if(!account)return;
    if(!confirm(`确定删除“${account.alias}”吗？凭据会被清除，同团队成员将不能再使用，历史任务仍保留。`))return;
    try{await realApi(`/api/accounts/${account.id}`,{method:'DELETE'});accounts=accounts.filter(a=>a.id!==account.id);renderAccounts();toast('账号已删除。');}catch(error){toast(error.message,'alert');}return;
  }
  const member=event.target.closest('[data-admin-user]');if(member){selectedMemberId=member.dataset.adminUser;paintPermissions();return;}
  if(event.target.closest('[data-admin-refresh]')){await loadAdminData();return;}
  const command=event.target.closest('[data-approve-member],[data-reject-member],[data-disable-member],[data-enable-member],[data-save-tools]');
  if(!command)return;
  const id=command.dataset.approveMember||command.dataset.rejectMember||command.dataset.disableMember||command.dataset.enableMember||command.dataset.saveTools;
  const selected=adminUsers.find(u=>u.id===id);if(!selected)return;
  let payload={};
  if(command.dataset.approveMember)payload={status:'active',teamId:selected.team_id||selected.requested_team_id};
  if(command.dataset.rejectMember){if(!confirm(`拒绝 ${selected.email} 的注册申请？`))return;payload={status:'rejected'};}
  if(command.dataset.disableMember){if(!confirm(`停用 ${selected.email}？其现有登录会话将失效。`))return;payload={status:'disabled'};}
  if(command.dataset.enableMember)payload={status:'active'};
  if(command.dataset.saveTools)payload={tools:[...document.querySelectorAll('[data-admin-tool]:checked')].map(x=>x.dataset.adminTool)};
  try{await realApi(`/api/admin/users/${id}`,{method:'PATCH',body:JSON.stringify(payload)});await loadAdminData();toast('设置已保存。');}catch(error){toast(error.message,'alert');}
});

document.addEventListener('change',async event=>{
  if(event.target.id==='admin-team-filter'){selectedTeamFilter=event.target.value;paintPermissions();return;}
  if(event.target.matches('[data-account-team]')){
    const select=event.target,account=accounts.find(a=>a.id===select.dataset.accountTeam);if(!account)return;
    const old=account.teamId;
    if(!confirm(`将“${account.alias}”共享给所选团队？原团队成员会立即失去使用权限。`)){select.value=old;return;}
    try{const updated=await realApi(`/api/accounts/${account.id}`,{method:'PATCH',body:JSON.stringify({teamId:select.value})});Object.assign(account,updated);renderAccounts();toast('所属团队已更新。');}
    catch(error){select.value=old;toast(error.message,'alert');}
  }
});

document.addEventListener('submit',async event=>{
  if(event.target.id==='security-form'){
    event.preventDefault();
    try{const result=await realApi('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:$('#old-password').value,newPassword:$('#new-password').value})});toast(result.message);location.assign('/');}
    catch(error){toast(error.message,'alert');}
    return;
  }
  if(event.target.id!=='create-team-form')return;
  event.preventDefault();const name=$('#new-team-name').value.trim();if(!name)return;
  try{await realApi('/api/admin/teams',{method:'POST',body:JSON.stringify({name})});await loadAdminData();toast('团队已创建。');}
  catch(error){toast(error.message,'alert');}
});
