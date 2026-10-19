(() => {
  if(document.getElementById('xhs-excel-assistant'))return;
  const {tasks,payload,noteRow,fields,Collector}=XHSCore;
  const host=document.createElement('div');host.id='xhs-excel-assistant';
  Object.assign(host.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483647'});
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
    :host{font:14px/1.6 Arial,"Microsoft YaHei",sans-serif;color:#26354b}*{box-sizing:border-box}
    section{width:380px;background:#fff;border:1px solid #d9e0eb;border-radius:14px;box-shadow:0 8px 38px #19325230;overflow:hidden}
    header{background:#243a5e;color:white;padding:13px 18px;display:flex;justify-content:space-between;align-items:center;font-weight:bold}
    main{padding:16px;max-height:75vh;overflow:auto}p{margin:0 0 12px}button{border:0;border-radius:7px;padding:9px 12px;cursor:pointer;background:#edf1f7;color:#243a5e;font:inherit}button.primary{background:#e93458;color:white}button:disabled{opacity:.45;cursor:default}.buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}input{max-width:100%;font:inherit}select{padding:6px;width:100%;margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7fa;padding:10px;max-height:190px;overflow:auto;font:12px/1.65 Arial,sans-serif}small{display:block;color:#697990;margin-top:8px}#count{font-size:25px;font-weight:bold;color:#243a5e;margin:12px 0}details{margin-top:14px}summary{cursor:pointer}.hidden{display:none}header button{padding:0 7px;color:white;background:transparent}
  </style><section><header><span>聚光笔记 · Excel 采集</span><button id="fold">收起</button></header><main>
    <p>打开并登录合作广场，选择填写好的筛选表。</p>
    <input id="file" type="file" accept=".xlsx"><select id="tasks" disabled><option>尚未读取任务</option></select>
    <label style="display:block;margin-top:10px"><input id="collectComments" type="checkbox"> 采集笔记评论</label>
    <small>勾选后，笔记采集结束会逐篇打开详情读取评论；耗时随笔记数量增加。</small>
    <div class="buttons"><button class="primary" id="run" disabled>执行全部启用任务</button><button id="stop" disabled>停止</button></div>
    <div id="count">0 条</div><div id="status">等待选择 Excel</div>
    <div class="buttons"><button id="export" disabled>导出 Excel</button><button id="json" disabled>原始 JSON</button></div>
    <small>保持页面打开，采集时不要操作筛选条件。超过上限或中断的任务会标明“部分结果”。</small>
    <details><summary>适配与日志</summary><p>若网页改版无法定位搜索框或按钮，可先点下方按钮，再点击网页上的对应控件。</p><div class="buttons"><button id="pickInput">定位搜索框</button><button id="pickButton">定位搜索按钮</button><button id="clearPick">清除定位</button></div><pre id="log"></pre></details>
  </main></section>`;
  document.documentElement.append(host);
  const $=id=>root.getElementById(id), delay=ms=>new Promise(r=>setTimeout(r,ms));
  let plans=[],running=false,stopped=false,generation=0,queue=[],captureError=null,results=[],current=null,endpoint=null,lastResponse=0;
  let calibration={};
  // DOM selectors only; never account credentials or note data.
  try{calibration=JSON.parse(localStorage.getItem('xhs-excel-selectors-v1')||'{}');}catch{}
  function log(s){$('log').textContent=(new Date().toLocaleTimeString()+' '+s+'\n'+$('log').textContent).slice(0,12000);}
  function status(s){$('status').textContent=s;log(s);}
  function guard(){if(stopped)throw Error('用户停止');if(!location.pathname.includes('/microapp/creativity/ugc'))throw Error('请保持在合作广场页面');}
  const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  const text=e=>(e?.innerText||e?.textContent||'').trim().replace(/\s+/g,' ');
  function exact(value,scope=document){return [...scope.querySelectorAll('*')].filter(e=>e!==host&&!host.contains(e)&&visible(e)&&text(e)===value&&!Array.from(e.children).some(c=>visible(c)&&text(c)===value));}
  function one(list,label){if(list.length!==1)throw Error(`无法唯一定位${label}（找到 ${list.length} 个），请检查当前页面或使用适配功能`);return list[0];}
  async function click(e){
    guard();e.scrollIntoView({block:'nearest'});
    const r=e.getBoundingClientRect(),opts={bubbles:true,cancelable:true,composed:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0};
    e.dispatchEvent(new PointerEvent('pointerdown',{...opts,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:1}));
    e.dispatchEvent(new MouseEvent('mousedown',{...opts,buttons:1}));
    e.closest('input,button,textarea,select,[tabindex]')?.focus({preventScroll:true});
    e.dispatchEvent(new PointerEvent('pointerup',{...opts,pointerId:1,pointerType:'mouse',isPrimary:true}));
    e.dispatchEvent(new MouseEvent('mouseup',opts));e.dispatchEvent(new MouseEvent('click',opts));await delay(600);
  }
  function input(e,value){
    if(!e||!['INPUT','TEXTAREA'].includes(e.tagName))throw Error('未找到可编辑输入框');
    if(e.readOnly)throw Error('日期控件只读，请使用近N天预设；此页面自定义日期需另行适配');
    const proto=e.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function row(label){
    const e=one(exact(label),label);let p=e.parentElement;
    for(let i=0;i<5&&p;i++,p=p.parentElement){if(text(p).length>label.length+1 && text(p).length<600)return p;}
    throw Error('无法识别筛选区域：'+label);
  }
  function labelControl(label){
    const e=one(exact(label),label);
    return e.closest('button,[role="combobox"],[role="button"],.el-select,.ant-select,[class*="select-trigger"],[class*="dropdown-trigger"]')||e;
  }
  async function option(value,scope=document){
    let choices=exact(value,scope);
    const popup=choices.filter(e=>e.closest('[role="option"],[role="listbox"],.el-select-dropdown,.ant-select-dropdown,[class*="dropdown-menu"],[class*="select-dropdown"],[class*="select-option"]'));
    if(popup.length)choices=popup;
    await click(one(choices,'选项“'+value+'”'));
  }
  async function dropdown(label,value){
    await click(labelControl(label));
    try{await option(value);}catch(e){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));throw Error(label+'：'+e.message+'。Excel 必须填写网页下拉选项原文。');}
  }
  function searchInput(){
    if(calibration.input)return one([...document.querySelectorAll(calibration.input)].filter(visible),'已定位的搜索框');
    const candidates=[...document.querySelectorAll('input')].filter(e=>visible(e)&&!['checkbox','radio','file','hidden'].includes(e.type)&&!e.disabled);
    const named=candidates.filter(e=>/搜索|笔记|作者|关键词|关键字/.test(e.placeholder));
    if(named.length===1)return named[0];
    const nonDates=candidates.filter(e=>!/日期|时间|开始|结束|date/i.test(e.placeholder+' '+e.className)&&!/^\d{4}-\d\d-\d\d/.test(e.value)&&e.type!=='number');
    return one(nonDates,'搜索框');
  }
  function searchBox(inp){
    let p=inp.parentElement;
    for(let i=0;i<6&&p;i++,p=p.parentElement)if(p.querySelector('button,[class*="search-icon"],[class*="icon-search"],[aria-label*="搜索"],svg')&&text(p).length<100)return p;
    return inp.parentElement.parentElement;
  }
  function searchButton(inp){
    if(calibration.button)return one([...document.querySelectorAll(calibration.button)].filter(visible),'已定位的搜索按钮');
    const b=searchBox(inp);
    const explicit=[...b.querySelectorAll('[aria-label*="搜索"],[class*="search-icon"],[class*="icon-search"]')].filter(visible);
    if(explicit.length===1)return explicit[0];
    const named=[...b.querySelectorAll('[aria-label*="搜索"],button,[class*="search-icon"],[class*="icon-search"]')].filter(visible);
    if(named.length===1)return named[0];
    const icons=[...b.querySelectorAll('svg')].filter(e=>visible(e)&&/search|搜索/i.test(e.outerHTML));
    if(icons.length===1)return icons[0].closest('button')||icons[0].parentElement;
    throw Error('无法定位搜索按钮，请在“适配与日志”中定位后重试');
  }
  async function apply(t){
    if(globalThis.XHSSiteAdapter?.available())return XHSSiteAdapter.apply(t,{click,input,delay,guard});
    const reset=exact('重置');if(reset.length===1){await click(reset[0]);await delay(700);}
    const inp=searchInput(), box=searchBox(inp);
    const mode=exact('笔记',box).concat(exact('作者',box));
    const active=one(mode,'搜索类型');
    if(text(active)!==t.搜索类型){await click(active);await option(t.搜索类型);}
    await option(t.笔记类型,row('笔记类型'));
    for(const k of ['曝光量','阅读量','互动量','作者粉丝数'])await dropdown(k,t[k]);
    const dateRow=row('发布时间');
    const dateControl=[...dateRow.querySelectorAll('*')].filter(e=>visible(e)&&/^近\d+天$|^自定义$/.test(text(e))&&!Array.from(e.children).some(c=>text(c)===text(e)));
    const d=one(dateControl,'发布时间选项');
    if(text(d)!==t.发布时间){await click(d);await option(t.发布时间);}
    if(t.发布时间==='自定义'){
      const ins=[...dateRow.querySelectorAll('input')].filter(visible);
      if(ins.length!==2)throw Error('无法定位自定义日期，请改用近N天预设');
      input(ins[0],t.开始日期);input(ins[1],t.结束日期);ins[1].blur();await delay(500);
      const confirm=exact('确定').concat(exact('确认'));if(confirm.length===1)await click(confirm[0]);
      if(ins[0].value!==t.开始日期||ins[1].value!==t.结束日期)throw Error('日期设置未生效');
    }
    await option(t.排序);
    input(inp,t.关键词);await delay(1000);
    if(inp.value!==t.关键词)throw Error('关键词设置未生效');
    return {inp,button:searchButton(inp)};
  }
  function enable(on){generation++;queue=[];captureError=null;endpoint=null;lastResponse=0;window.postMessage({source:'xhs-excel-control',generation,enabled:on},location.origin);}
  for(const type of ['click','keydown'])document.addEventListener(type,e=>{
    if(running&&e.isTrusted&&!e.composedPath().includes(host)){
      stopped=true;status('检测到页面操作，已停止采集，避免混入其他筛选结果。可导出已采集内容。');
    }
  },true);
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.source!=='xhs-excel-response'||e.data.generation!==generation||!running)return;
    try{
      if(e.data.status>=400)throw Error('笔记接口返回 HTTP '+e.data.status);
      const p=payload(e.data.body);if(!p)return;
      if(endpoint&&endpoint!==e.data.endpoint)throw Error('出现不同的笔记列表接口，请重新运行');
      endpoint=e.data.endpoint;queue.push(p);lastResponse=Date.now();
    }catch(err){captureError=err;}
  });
  async function waitPage(timeout=18000){
    const until=Date.now()+timeout;
    while(Date.now()<until){guard();if(captureError)throw captureError;if(queue.length)return queue.shift();await delay(200);}
    throw Error('等待笔记响应超时（可能登录过期、出现验证、没有触发请求或页面接口已变化）');
  }
  async function nextPage(){
    const next=[...document.querySelectorAll('button,[role="button"],a')].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&(/^(下一页|下页)$/.test(text(e))||/下一页|next page/i.test(e.getAttribute('aria-label')||'')));
    if(next.length===1){await click(next[0]);return;}
    const scrolls=[document.scrollingElement,...document.querySelectorAll('main,section,div')].filter(e=>e&&e!==host&&visible(e)&&e.scrollHeight>e.clientHeight+80&&e.clientHeight>150&&(/auto|scroll/.test(getComputedStyle(e).overflowY)||e===document.scrollingElement));
    for(const e of scrolls){e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll',{bubbles:true}));}
    window.dispatchEvent(new Event('scroll'));
    if(!scrolls.length)throw Error('未找到分页或滚动容器，无法加载下一页');
  }
  function updateCount(){const n=results.reduce((a,r)=>a+r.collector.notes.size,0);$('count').textContent=n+' 条';$('export').disabled=!results.length;$('json').disabled=!results.length;}
  async function run(){
    if(running||commentPanel.active())return;
    const withComments=$('collectComments').checked;let finishedNormally=false;
    running=true;stopped=false;results=[];$('run').disabled=true;$('file').disabled=true;$('collectComments').disabled=true;$('stop').disabled=false;
    try{
      guard();
      for(let i=0;i<plans.length;i++){
        const t=plans[i];$('tasks').selectedIndex=i;status(`设置筛选 ${i+1}/${plans.length}：${t.任务名称}`);
        enable(false);current={task:t,collector:new Collector(t.最多笔记数),state:'未开始',message:'',started:new Date().toISOString(),endpoint:''};results.push(current);updateCount();
        const {button,validate}=await apply(t);
        enable(true);await delay(50);await click(button);
        if(validate)current.observed=await validate();
        current.state='采集中';let repeated=0;
        while(true){
          const page=await waitPage();const before=current.collector.notes.size;
          current.collector.add(page);current.endpoint=endpoint;updateCount();
          status(`${t.任务名称}：${current.collector.notes.size} / ${current.collector.total} 条`);
          if(current.collector.complete){current.state='完整';break;}
          if(current.collector.capped){current.state='部分结果';current.message='达到最多笔记数上限';break;}
          repeated=before===current.collector.notes.size?repeated+1:0;
          if(repeated>=2)throw Error('连续分页没有新增笔记，不能确认全部采集');
          await delay(1600);guard();await nextPage();
        }
        enable(false);current.finished=new Date().toISOString();await delay(1500);
      }
      finishedNormally=true;
      status(withComments?'笔记任务结束，准备补采评论…':'任务执行结束，请导出 Excel。完整性请查看“采集记录”。');
    }catch(e){
      if(current){current.state=current.collector.notes.size?'部分结果':'失败';current.message=e.message;current.finished=new Date().toISOString();}
      status('已停止：'+e.message+'。已采集内容仍可导出。');
    }finally{enable(false);running=false;$('run').disabled=!plans.length;$('file').disabled=false;$('collectComments').disabled=false;$('stop').disabled=true;updateCount();}
    if(withComments&&results.some(r=>r.collector.notes.size)){
      try{
        const {rows,audit}=buildResult();await commentPanel.prepare(rows,audit);
        if(finishedNormally&&!stopped){status('正在补采评论；可在“评论采集进度”查看状态和停止。');await commentPanel.run(false);status('评论补采已结束或暂停。可导出含评论 Excel，并查看逐篇状态。');}
        else status('笔记阶段已中断，已有笔记已准备好补采评论。可在“评论采集进度”中继续。');
      }catch(e){status('评论补采准备失败：'+e.message+'。笔记结果仍可导出。');}
    }
  }
  function save(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  const timestamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
  $('file').onchange=async()=>{
    try{const file=$('file').files[0];if(!file)return;plans=tasks(await XHSXlsx.read(await file.arrayBuffer()));$('tasks').replaceChildren(...plans.map(t=>{const o=document.createElement('option');o.textContent=t.任务名称+' · '+t.关键词;return o;}));$('tasks').disabled=false;$('run').disabled=false;status(`读取 ${plans.length} 个启用任务，点击执行开始`);}
    catch(e){plans=[];$('run').disabled=true;status(e.message);}
  };
  $('run').onclick=run;$('stop').onclick=()=>{stopped=true;status('正在停止…');};
  $('fold').onclick=()=>{const main=root.querySelector('main');main.classList.toggle('hidden');$('fold').textContent=main.classList.contains('hidden')?'展开':'收起';};
  $('json').onclick=()=>save(JSON.stringify(results.map(r=>({...r,collector:undefined,notes:[...r.collector.notes.values()],total:r.collector.total})),null,2),'聚光原始数据_'+timestamp()+'.json','application/json');
  globalThis.ZhicaiPlaza = {
    snapshot: () => {const result=buildResult();return {...result,rows:result.rows.slice(0,31),
      rowCount:Math.max(0,result.rows.length-1),running, commentsActive:commentPanel.active(),
      plans:plans.length, status:$('status').textContent,
      commentStatus:root.querySelector('#comment-status')?.textContent||''};}
  };
  function buildResult(){
      const all=new Map(),relations=[],audit=[];
      results.forEach((r,i)=>{
        for(const [id,n] of r.collector.notes){all.set(id,n);relations.push([i+1,r.task.任务名称,r.task.关键词,id]);}
        audit.push([i+1,r.task.任务名称,r.state,r.message,r.collector.total,r.collector.notes.size,r.started,r.finished||'',r.endpoint,JSON.stringify(r.task),JSON.stringify(r.observed||{})]);
      });
      const done=results.length;
      plans.slice(done).forEach((t,i)=>audit.push([done+i+1,t.任务名称,'未执行','前序任务中断',null,0,'','','',JSON.stringify(t)]));
      return {rows:XHSCore.mergedRows([...all.values()],relations),audit:[['任务序号','任务名称','状态','说明','网站总数','采集数量','开始时间UTC','结束时间UTC','接口路径','筛选条件','页面回读'],...audit]};
  }
  $('collectComments').onchange=()=>{$('export').textContent=$('collectComments').checked?'导出含评论 Excel':'导出 Excel';};
  $('export').onclick=async()=>{
    try{
      const {rows,audit}=buildResult();
      if($('collectComments').checked&&rows.length>1){await commentPanel.prepare(rows,audit);await commentPanel.exportExcel();return;}
      save(XHSXlsx.write([{name:'data',rows,wrapColumns:[0,1],widths:[28,28,12,12,28,13,13,48,23,42,36,22,36,13,60,60,17,28]},
        {name:'采集记录',rows:audit,widths:[12,24,16,55,14,14,30,30,45,70,70]}]),'聚光笔记_'+timestamp()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      status('Excel 已生成。每篇笔记按命中任务分别输出一行，可在 data 中按任务或关键词筛选。');
    }catch(e){status('导出失败：'+e.message);}
  };
  function selector(el){
    if(el.id)return '#'+CSS.escape(el.id);
    const parts=[];let e=el;
    while(e&&e!==document.body){const siblings=[...e.parentElement.children].filter(x=>x.tagName===e.tagName);parts.unshift(e.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(e)+1)+')');e=e.parentElement;}
    return 'body>'+parts.join('>');
  }
  function pick(key){
    if(running)return;status('请点击网页上的'+(key==='input'?'搜索输入框':'搜索按钮')+'，这次点击只用于定位');
    const listener=e=>{
      if(e.composedPath().includes(host))return;e.preventDefault();e.stopImmediatePropagation();document.removeEventListener('click',listener,true);
      let el=e.target;if(key==='input'&&el.tagName!=='INPUT'){status('请选择输入框');return;}
      if(key==='button')el=el.closest('button')||el;
      calibration[key]=selector(el);localStorage.setItem('xhs-excel-selectors-v1',JSON.stringify(calibration));status('已保存定位，可重新执行');
    };document.addEventListener('click',listener,true);
  }
  $('pickInput').onclick=()=>pick('input');$('pickButton').onclick=()=>pick('button');$('clearPick').onclick=()=>{calibration={};localStorage.removeItem('xhs-excel-selectors-v1');status('已清除定位');};
  const commentPanel=XHSMountComments({root,apply,click,save,isBusy:()=>running,
    lock:()=>{stopped=false;for(const id of ['file','run','collectComments','export','pickInput','pickButton','clearPick'])$(id).disabled=true;},
    unlock:()=>{for(const id of ['file','collectComments','pickInput','pickButton','clearPick'])$(id).disabled=false;$('run').disabled=!plans.length;updateCount();}
  });
})();
