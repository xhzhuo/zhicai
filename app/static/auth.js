'use strict';
const $=selector=>document.querySelector(selector);
const msg=$('#auth-message');
function show(message,error=false){msg.textContent=message;msg.classList.toggle('error',error);}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-tab]').forEach(tab=>tab.classList.toggle('active',tab===button));
  $('#login-form').hidden=button.dataset.tab!=='login';
  $('#register-form').hidden=button.dataset.tab!=='register';
  show('');
}));
async function api(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw Error(data.detail||`请求失败（HTTP ${response.status}）`);
  return data;
}
async function loadTeams(){
  try{
    const response=await fetch('/api/auth/teams');const teams=await response.json();
    $('#register-team').innerHTML='<option value="">请选择团队</option>';
    for(const team of teams){const option=document.createElement('option');option.value=team.id;option.textContent=team.name;$('#register-team').append(option);}
    $('#team-field').hidden=teams.length===0;
    $('#register-team').required=teams.length>0;
    $('#bootstrap-note').hidden=teams.length>0;
  }catch{show('暂时无法读取团队，请稍后刷新。',true);}
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#login-form button[type="submit"]');button.disabled=true;
  try{await api('/api/auth/login',{email:$('#login-email').value.trim(),password:$('#login-password').value});location.assign('/');}
  catch(error){show(error.message,true);}finally{button.disabled=false;}
});
$('#register-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if($('#register-password').value!==$('#register-confirm').value)return show('两次输入的密码不一致。',true);
  const button=$('#register-form button[type="submit"]');button.disabled=true;
  try{const data=await api('/api/auth/register',{email:$('#register-email').value.trim(),password:$('#register-password').value,teamId:$('#register-team').value});show(data.message);$('#register-form').reset();}
  catch(error){show(error.message,true);}finally{button.disabled=false;}
});
void loadTeams();
