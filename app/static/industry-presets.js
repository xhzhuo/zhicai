/* Persistent industry name/code presets for the Lingxi tool. */
'use strict';

let industryPresets=[],industryPresetsLoaded=false,industryPresetsLoading=false;

function syncIndustryRows(){
  if(currentTool==='industry'&&$('#partition'))collectRealParams('industry');
}

async function loadIndustryPresets(){
  if(industryPresetsLoading)return;
  industryPresetsLoading=true;
  try{
    industryPresets=await realApi('/api/industry-presets');
    industryPresetsLoaded=true;
    if(page==='tool'&&currentTool==='industry'){syncIndustryRows();renderConfig();}
  }catch(error){industryPresetsLoaded=true;toast(error.message,'alert');}
  finally{industryPresetsLoading=false;}
}

realTaxRows=function(){
  const selected=bubbleDraft.taxonomies.filter(row=>row.name&&row.code);
  const options=industryPresets.map(row=>`<option value="${esc(row.id)}" ${selected.some(item=>item.code===row.code)?'disabled':''}>${esc(row.name)}</option>`).join('');
  const rows=selected.map((row,i)=>`<li class="industry-selected real-tax-row" data-index="${i}"><span class="industry-selected-name" title="行业code：${esc(row.code)}">${esc(row.name)}</span><input type="hidden" data-tax-name="${i}" value="${esc(row.name)}"><input type="hidden" data-tax-code="${i}" value="${esc(row.code)}"><button type="button" class="icon-btn" data-tax-remove-selected="${i}" aria-label="移除${esc(row.name)}">×</button></li>`).join('');
  return `<div class="industry-section-tools"><button type="button" class="text-btn" data-tax-manage>管理常用行业</button></div>
    <select id="industry-preset" aria-label="选择常用行业" ${industryPresetsLoaded?'':'disabled'}><option value="">${industryPresetsLoaded?'选择常用行业':'正在读取常用行业…'}</option>${options}</select>
    <div class="industry-selected-heading">已选 <span>${selected.length}</span> 个</div>
    <ul id="real-tax-list" class="industry-selected-list">${rows||'<li class="industry-selected-empty">请选择或新增行业</li>'}</ul>
    <button type="button" class="text-btn industry-add" data-tax-new>${I('plus','i14')}新增行业</button>`;
};

const baseIndustryRenderConfig=renderConfig;
renderConfig=function(){
  baseIndustryRenderConfig();
  if(page==='tool'&&currentTool==='industry'&&!industryPresetsLoaded&&!industryPresetsLoading)void loadIndustryPresets();
};

function useIndustryPreset(){
  const preset=industryPresets.find(row=>row.id===$('#industry-preset')?.value);
  if(!preset)return toast('请选择常用行业。','alert');
  syncIndustryRows();
  if(bubbleDraft.taxonomies.some(row=>row.code===preset.code))return toast('该行业已加入本次采集。','info');
  if(bubbleDraft.taxonomies.length>=20&&!bubbleDraft.taxonomies.some(row=>!row.name&&!row.code))return toast('一次最多选择 20 个行业。','alert');
  const empty=bubbleDraft.taxonomies.findIndex(row=>!row.name&&!row.code);
  if(empty>=0)bubbleDraft.taxonomies[empty]={name:preset.name,code:preset.code};
  else bubbleDraft.taxonomies.push({name:preset.name,code:preset.code});
  renderConfig();
}

function newIndustryPreset(){
  syncIndustryRows();
  if(bubbleDraft.taxonomies.filter(row=>row.code).length>=20)return toast('一次最多选择20个行业。','alert');
  showModal('新增行业',`<div class="field"><label for="new-industry-name">行业名称<span class="required">*</span></label><input id="new-industry-name" maxlength="40" autocomplete="off" placeholder="例如：母婴奶粉"></div><div class="field"><label for="new-industry-code">行业code<span class="required">*</span></label><input id="new-industry-code" maxlength="80" autocomplete="off" spellcheck="false" placeholder="填写行业code"></div><p id="industry-save-error" class="form-errors hidden" role="alert"></p>`,'保存并选用',()=>{
    const name=$('#new-industry-name').value.trim(),code=$('#new-industry-code').value.trim();
    const error=$('#industry-save-error');
    if(!name||!code){error.textContent='请填写行业名称和行业code。';error.classList.remove('hidden');return false;}
    const button=$('#modal-foot [data-action="modal-confirm"]');button.disabled=true;
    void (async()=>{try{
      const saved=await realApi('/api/industry-presets',{method:'POST',body:JSON.stringify({name,code})});
      industryPresets.push(saved);industryPresets.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
      bubbleDraft.taxonomies=bubbleDraft.taxonomies.filter(row=>row.name&&row.code);
      if(!bubbleDraft.taxonomies.some(row=>row.code===saved.code))bubbleDraft.taxonomies.push({name:saved.name,code:saved.code});
      closeModal();renderConfig();toast('已保存并选用。');
    }catch(exc){if(error.isConnected){error.textContent=exc.message;error.classList.remove('hidden');button.disabled=false;}}})();
    return false;
  });
  $('#new-industry-name')?.focus();
}

function manageIndustryPresets(){
  const body=industryPresets.length?`<div class="industry-manage-list">${industryPresets.map(row=>`<div class="industry-manage-item"><span><strong>${esc(row.name)}</strong><small>${esc(row.code)}</small></span>${row.editable?`<button type="button" class="text-btn" data-tax-edit="${esc(row.id)}">编辑</button><button type="button" class="text-btn" data-tax-delete="${esc(row.id)}">删除</button>`:''}</div>`).join('')}</div>`:'<p>还没有常用行业，可从“新增行业”开始添加。</p>';
  showModal('管理常用行业',body);
}

function editIndustryPreset(id){
  const preset=industryPresets.find(row=>row.id===id);
  if(!preset?.editable)return;
  closeModal();
  showModal('编辑常用行业',`<div class="field"><label for="edit-industry-name">行业名称</label><input id="edit-industry-name" maxlength="40" value="${esc(preset.name)}"></div><div class="field"><label for="edit-industry-code">行业code</label><input id="edit-industry-code" maxlength="80" value="${esc(preset.code)}"></div>`,'保存',()=>{
    const name=$('#edit-industry-name').value.trim(),code=$('#edit-industry-code').value.trim();
    void (async()=>{try{
      const updated=await realApi('/api/industry-presets/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({name,code})});
      bubbleDraft.taxonomies.forEach(row=>{if(row.code===preset.code){row.name=updated.name;row.code=updated.code;}});
      Object.assign(preset,updated);industryPresets.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
      closeModal();renderConfig();toast('常用行业已更新。');
    }catch(error){toast(error.message,'alert');}})();
    return false;
  });
}

function deleteIndustryPreset(id){
  const preset=industryPresets.find(row=>row.id===id);
  if(!preset?.editable)return;
  closeModal();
  showModal('删除常用行业',`确定删除“${esc(preset.name)}”？已发起的采集记录不会受影响。`,'删除',()=>{
    void (async()=>{try{
      await realApi('/api/industry-presets/'+encodeURIComponent(id),{method:'DELETE'});
      industryPresets=industryPresets.filter(row=>row.id!==id);
      closeModal();renderConfig();toast('常用行业已删除。');
    }catch(error){toast(error.message,'alert');}})();
    return false;
  });
}

document.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.taxName===undefined&&el.dataset.taxCode===undefined)return;
  const index=Number(el.dataset.taxName??el.dataset.taxCode);
  if(!bubbleDraft.taxonomies[index])bubbleDraft.taxonomies[index]={name:'',code:''};
  bubbleDraft.taxonomies[index][el.dataset.taxName!==undefined?'name':'code']=el.value;
  refreshConfigMeta();
});

document.addEventListener('click',event=>{
  const el=event.target.closest('button');
  if(!el||el.disabled)return;
  if(el.hasAttribute('data-tax-use-preset')){useIndustryPreset();return;}
  if(el.hasAttribute('data-tax-new')){newIndustryPreset();return;}
  if(el.dataset.taxRemoveSelected!==undefined){syncIndustryRows();bubbleDraft.taxonomies.splice(Number(el.dataset.taxRemoveSelected),1);renderConfig();return;}
  if(el.hasAttribute('data-tax-manage')){syncIndustryRows();manageIndustryPresets();return;}
  if(el.dataset.taxEdit){editIndustryPreset(el.dataset.taxEdit);return;}
  if(el.dataset.taxDelete){deleteIndustryPreset(el.dataset.taxDelete);return;}
  if(el.hasAttribute('data-tax-refresh')){industryPresetsLoaded=false;void loadIndustryPresets();}
});

/* The tool switcher and sidebar use the same allTools catalog. */
document.addEventListener('change',event=>{
  if(event.target.id!=='tool-platform')return;
  event.stopImmediatePropagation();
  platform=event.target.value;
  const ids=allTools.filter(id=>platform==='all'||tools[id].platform===platform);
  const available=ids.filter(id=>realTools[id]&&(!window.ZHICAI_SERVER_MODE||can(id)));
  if(!available.length){page='catalog';render();window.scrollTo(0,0);return;}
  openTool(available.includes(currentTool)?currentTool:available[0]);
},true);

document.addEventListener('change',event=>{if(event.target.id==='industry-preset'&&event.target.value)useIndustryPreset();});
