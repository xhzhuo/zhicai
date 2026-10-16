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
  const options=industryPresets.map(row=>`<option value="${esc(row.id)}">${esc(row.name)} · ${esc(row.code)}</option>`).join('');
  const rows=bubbleDraft.taxonomies.map((row,i)=>`<div class="industry-row real-tax-row" data-index="${i}">
    <div class="industry-row-fields"><input data-tax-name="${i}" value="${esc(row.name)}" maxlength="40" placeholder="行业名称，如母婴奶粉" aria-label="行业名称"><input data-tax-code="${i}" value="${esc(row.code)}" maxlength="80" placeholder="行业code" aria-label="行业code"></div>
    <div class="industry-row-actions"><button type="button" class="text-btn" data-tax-save-row="${i}">保存到常用行业</button><button type="button" class="text-btn" data-real-remove-tax="${i}">从本次采集移除</button></div>
  </div>`).join('');
  return `<div class="industry-picker"><select id="industry-preset" aria-label="选择常用行业"><option value="">${industryPresetsLoaded?'选择常用行业':'正在读取常用行业…'}</option>${options}</select><button type="button" class="btn sm" data-tax-use-preset ${options?'':'disabled'}>加入本次采集</button></div>
    <div id="real-tax-list">${rows}</div>
    <div class="industry-picker-actions"><button type="button" class="text-btn" data-real-add-tax>${I('plus','i14')}手动添加行业</button><button type="button" class="text-btn" data-tax-manage>管理常用行业</button></div>`;
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

async function saveIndustryRow(index){
  syncIndustryRows();
  const row=bubbleDraft.taxonomies[index];
  if(!row?.name||!row?.code)return toast('请填写行业名称和行业code。','alert');
  try{
    const saved=await realApi('/api/industry-presets',{method:'POST',body:JSON.stringify(row)});
    industryPresets.push(saved);
    industryPresets.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
    renderConfig();
    toast('已保存到常用行业。');
  }catch(error){toast(error.message,'alert');}
}

function manageIndustryPresets(){
  const body=industryPresets.length?`<div class="industry-manage-list">${industryPresets.map(row=>`<div class="industry-manage-item"><span><strong>${esc(row.name)}</strong><small>${esc(row.code)}</small></span>${row.editable?`<button type="button" class="text-btn" data-tax-edit="${esc(row.id)}">编辑</button><button type="button" class="text-btn" data-tax-delete="${esc(row.id)}">删除</button>`:''}</div>`).join('')}</div>`:'<p>还没有保存的行业。请先在本次采集列表中填写并保存。</p>';
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
  if(el.dataset.taxSaveRow!==undefined){void saveIndustryRow(Number(el.dataset.taxSaveRow));return;}
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
