(() => {
  globalThis.XHSMountComments=({root,apply,click,save,lock,unlock,isBusy})=>{
    const box=document.createElement('details');box.innerHTML=`<summary>评论采集进度／补采历史结果</summary><p>勾选上方“采集评论”后，笔记采集完成会自动继续。也可在这里选择已有的按任务拆行结果 Excel，单独补采评论。</p><input id="comment-file" type="file" accept=".xlsx"><small>同时采集详情页：<select id="comment-concurrency"><option value="1">1 篇（稳妥）</option><option value="2" selected>2 篇（推荐）</option><option value="3">3 篇</option></select></small><small>单篇等待上限（秒，30—1800）</small><input id="comment-seconds" type="number" min="30" max="1800" value="180"><div class="buttons"><button id="comment-run" disabled>开始／继续补采</button><button id="comment-retry" disabled>重试未完整笔记</button><button id="comment-stop" disabled>停止补采</button><button id="comment-export" disabled>导出含评论 Excel</button></div><pre id="comment-status">等待笔记采集或选择已有结果</pre><small>评论进度自动保存在本机扩展中。刷新后重新选择同一文件可继续；卸载扩展会清除进度。评论明细按任务分别对应。</small>`;
    root.querySelector('main').append(box);
    const $=id=>box.querySelector('#comment-'+id), delay=ms=>new Promise(r=>setTimeout(r,ms));
    const send=async(type,data={})=>{const r=await chrome.runtime.sendMessage({scope:'xhs-comments',type,...data});if(!r?.ok)throw Error(r?.error||'扩展未就绪，请刷新扩展和页面');return r.value;};
    let rows=[],audit=[],notes=[],batch='',results=[],active=false,stop=false;
    const status=s=>$('status').textContent=s;
    const buttons=()=>{for(const k of ['run','retry','file','seconds','concurrency'])$(k).disabled=active||(k==='run'||k==='retry')&&!notes.length;$('stop').disabled=!active;$('export').disabled=!notes.length;};
    const guard=()=>{if(stop)throw Error('用户停止');if(!location.pathname.includes('/microapp/creativity/ugc'))throw Error('请保持合作广场页面打开');};
    async function refresh(){results=await send('results',{batch,ids:notes.map(n=>n.id)});}
    async function prepare(inputRows,inputAudit){
      const marker=inputRows[0].indexOf('评论采集状态');
      const cleanRows=marker>=0?inputRows.map(r=>r.slice(0,marker)):inputRows;
      const cleanNotes=XHSComments.source(cleanRows);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(cleanRows)));
      const key=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
      rows=cleanRows;audit=inputAudit;notes=cleanNotes;batch=key;
      await send('save',{batch,data:{rows,audit}});await refresh();
      box.open=true;status(`已读取 ${rows.length-1} 条任务记录，${notes.length} 篇不同笔记。已处理 ${results.length} 篇，完整 ${results.filter(r=>r.state==='完整').length} 篇。`);
      buttons();
    }
    $('file').onchange=async()=>{
      try{
        if(isBusy())throw Error('请先停止笔记采集');
        const file=$('file').files[0];if(!file)return;const bytes=await file.arrayBuffer();
        const importedRows=await XHSXlsx.read(bytes,'data');let importedAudit=[];
        try{importedAudit=await XHSXlsx.read(bytes,'采集记录');}catch(e){if(!e.message.startsWith('缺少工作表'))throw e;}
        await prepare(importedRows,importedAudit);
      }catch(e){status(e.message);}buttons();
    };
    async function run(retry){
      if(active||isBusy())return;
      const seconds=Number($('seconds').value);if(!Number.isInteger(seconds)||seconds<30||seconds>1800){status('单篇等待上限须为30—1800秒整数');return;}
      const concurrency=Number($('concurrency').value);if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3){status('同时采集详情页须为1—3篇');return;}
      active=true;stop=false;lock();buttons();
      const pending=new Map();
      try{
        await refresh();const processed=new Map(results.map(r=>[r.noteId,r]));
        let skipped=0;
        for(const n of notes.filter(n=>n.noComments)){
          const prior=processed.get(n.id);
          if(prior?.comments?.length||prior?.state==='完整'&&prior.total===0)continue;
          await send('record',{batch,result:{noteId:n.id,comments:[],total:0,state:'完整',reason:'笔记列表 cmtNum 为 0，未打开详情页',finished:new Date().toISOString()}});
          skipped++;
        }
        const todo=notes.filter(n=>!n.noComments&&(!processed.has(n.id)||(retry&&processed.get(n.id).state!=='完整')));
        if(skipped)status(`已跳过 ${skipped} 篇 cmtNum 为 0 的笔记，直接记录为 0 条评论。其余 ${todo.length} 篇继续采集。`);
        let started=0,finished=0;
        async function launch(n){
          guard();status(`正在查找第 ${started}/${todo.length} 篇：${n.title}\n进行中 ${pending.size} 篇`);
          const task={搜索类型:'笔记ID',关键词:n.id,笔记类型:'不限',曝光量:'不限',阅读量:'不限',互动量:'不限',作者粉丝数:'不限',发布时间:'近365天',排序:'高曝光'};
          const {button,validate}=await apply(task);guard();await click(button);if(validate)await validate();
          let card=null;
          for(let tries=0;tries<30;tries++){
            guard();card=[...document.querySelectorAll('.note-card')].find(e=>{try{return JSON.parse(e.getAttribute('data-track-impression')).attributes.triggerValue===n.id;}catch{return false;}});
            if(card)break;await delay(500);
          }
          if(!card){
            await send('record',{batch,result:{noteId:n.id,comments:[],total:null,state:'无法读取',reason:'近365天笔记ID检索未找到卡片，可能超出时间范围或已不可访问',finished:new Date().toISOString()}});finished++;return;
          }
          const target=card.querySelector('.note-covers');if(!target)throw Error('笔记详情入口已变化');
          const job=await send('arm',{batch,noteId:n.id,seconds});pending.set(n.id,job);guard();
          let openedUrl=null;
          const onOpen=e=>{if(e.source===window&&e.origin===location.origin&&e.data?.source==='xhs-comment-open-url'&&e.data.token===job.token&&e.data.noteId===n.id)openedUrl=e.data.url;};
          window.addEventListener('message',onOpen);
          window.postMessage({source:'xhs-comment-open-arm',token:job.token,noteId:n.id},location.origin);
          try{
            await delay(50);await click(target);
            for(let tries=0;tries<10&&!openedUrl;tries++)await delay(100);
            if(openedUrl)await send('open',{token:job.token,noteId:n.id,url:openedUrl});
          }finally{
            window.postMessage({source:'xhs-comment-open-disarm',token:job.token},location.origin);
            window.removeEventListener('message',onOpen);
          }
        }
        while(started<todo.length||pending.size){
          guard();
          while(started<todo.length&&pending.size<concurrency){const n=todo[started++];await launch(n);}
          if(!pending.size)continue;
          let changed=false;
          for(const [id,job] of [...pending]){
            guard();const result=await send('poll',{batch,noteId:id,token:job.token});
            if(!result)continue;
            pending.delete(id);finished++;changed=true;
            status(`已完成 ${finished}/${todo.length} 篇；同时采集中 ${pending.size} 篇。最近结果：${result.state}，${result.comments.length} 条评论\n${result.reason||''}`);
            if(/登录|验证|访问限制/.test(result.reason||''))throw Error('详情页需要人工处理，已暂停；处理后重试未完整笔记');
          }
          if(!changed)await delay(1000);
        }
        await refresh();status(`本轮结束：已处理 ${results.length}/${notes.length} 篇；完整 ${results.filter(r=>r.state==='完整').length} 篇。请导出，或重试未完整笔记。`);
      }catch(e){
        for(const [id,job] of pending)try{await send('cancel',{noteId:id,token:job.token,reason:e.message});}catch{}
        await refresh().catch(()=>{});status('已暂停：'+e.message+'。已保存进度，可导出或继续。');
      }finally{active=false;unlock();buttons();}
    }
    $('run').onclick=()=>run(false);$('retry').onclick=()=>run(true);$('stop').onclick=()=>{stop=true;status('正在停止并保存…');};
    async function exportExcel(){
      try{await refresh();save(XHSXlsx.write(XHSComments.sheets(rows,audit,results)),'聚光笔记_含评论_'+new Date().toISOString().replace(/[:.]/g,'-')+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');status('已导出：评论词云按筛选关键词展示，评论明细保留主评论及回复；未完成笔记请查看评论采集记录。');}catch(e){status('导出失败：'+e.message);}
    }
    $('export').onclick=exportExcel;
    document.addEventListener('click',e=>{if(active&&e.isTrusted&&!e.composedPath().includes(root.host)){stop=true;status('检测到合作广场页面操作，正在暂停');}},true);
    return {prepare,run,exportExcel,ready:()=>!!notes.length,active:()=>active};
  };
})();
