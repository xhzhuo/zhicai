/* Persist progress locally in extension IndexedDB. Only an armed plaza job may claim a new note tab. */
const dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('xhs-comments-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function db(op,key,value){const d=await dbPromise;return new Promise((resolve,reject)=>{const tx=d.transaction('kv',op==='get'?'readonly':'readwrite'),s=tx.objectStore('kv');const r=op==='get'?s.get(key):op==='put'?s.put(value,key):s.delete(key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
let serial=Promise.resolve();
function plaza(sender){return sender.tab&&new URL(sender.url).hostname==='ad.xiaohongshu.com';}
function noteId(sender){try{const u=new URL(sender.url);return u.hostname==='www.xiaohongshu.com'?u.pathname.match(/^\/explore\/([a-f0-9]{24})/i)?.[1]:null;}catch{return null;}}
const activeKey=id=>'active:'+id;
async function finish(job,result){
  await db('put','result:'+job.batch+':'+job.noteId,{...result,noteId:job.noteId,runToken:job.token,finished:new Date().toISOString()});
  await db('delete',activeKey(job.noteId));
  if(job.child)try{await chrome.tabs.remove(job.child);}catch{}
}
async function handle(m,sender){
  if(m.scope!=='xhs-comments')return;
  if(m.type==='claim'){
    const id=noteId(sender),j=id?await db('get',activeKey(id)):null;
    if(!j||noteId(sender)!==j.noteId||sender.tab?.openerTabId!==j.owner||Date.now()>j.deadline)return null;
    if(j.child&&j.child!==sender.tab.id)return null;
    j.child=sender.tab.id;await db('put',activeKey(j.noteId),j);return j;
  }
  if(m.type==='progress'||m.type==='finish'){
    const id=noteId(sender),j=id?await db('get',activeKey(id)):null;if(!j||j.token!==m.token||j.child!==sender.tab?.id)throw Error('任务已取消');
    if(m.type==='finish')await finish(j,m.result);
    else {j.partial=m.result;await db('put',activeKey(j.noteId),j);}return true;
  }
  if(!plaza(sender))throw Error('请从合作广场操作');
  if(m.type==='load')return await db('get','batch:'+m.batch)||null;
  if(m.type==='save') {await db('put','batch:'+m.batch,m.data);return true;}
  if(m.type==='results')return (await Promise.all(m.ids.map(id=>db('get','result:'+m.batch+':'+id)))).filter(Boolean);
  if(m.type==='arm'){
    const legacy=await db('get','job');
    if(legacy){await db('delete','job');await db('put','result:'+legacy.batch+':'+legacy.noteId,{...legacy.partial,noteId:legacy.noteId,state:legacy.partial.comments.length?'部分结果':'无法读取',reason:'扩展更新时中断',finished:new Date().toISOString()});if(legacy.child)try{await chrome.tabs.remove(legacy.child);}catch{}}
    const old=await db('get',activeKey(m.noteId));if(old&&Date.now()<old.deadline)throw Error('同一篇笔记已有评论任务运行');
    if(old)await finish(old,{...old.partial,state:old.partial.comments.length?'部分结果':'无法读取',reason:'上次任务中断或超时'});
    const j={batch:m.batch,noteId:m.noteId,owner:sender.tab.id,token:crypto.randomUUID(),deadline:Date.now()+m.seconds*1000,partial:{comments:[],total:null}};
    await db('put',activeKey(j.noteId),j);return j;
  }
  if(m.type==='open'){
    const j=await db('get',activeKey(m.noteId));if(!j||j.owner!==sender.tab.id||j.token!==m.token||j.child)throw Error('打开详情任务已失效');
    const u=new URL(m.url);
    if(u.protocol!=='https:'||u.hostname!=='www.xiaohongshu.com'||u.pathname!==`/explore/${j.noteId}`)throw Error('笔记链接与任务不匹配');
    const tab=await chrome.tabs.create({url:u.href,openerTabId:sender.tab.id,active:true});j.child=tab.id;await db('put',activeKey(j.noteId),j);return tab.id;
  }
  if(m.type==='poll'){
    const j=await db('get',activeKey(m.noteId));
    if(j?.owner===sender.tab.id&&j.token===m.token&&Date.now()>j.deadline)await finish(j,{...j.partial,state:j.partial.comments.length?'部分结果':'无法读取',reason:'单篇采集超时；可重试未完整笔记'});
    const r=await db('get','result:'+m.batch+':'+m.noteId);return r?.runToken===m.token?r:null;
  }
  if(m.type==='cancel'){
    const j=await db('get',activeKey(m.noteId));if(j?.owner===sender.tab.id&&j.token===m.token)await finish(j,{...j.partial,state:j.partial.comments.length?'部分结果':'无法读取',reason:m.reason||'用户停止'});return true;
  }
  if(m.type==='record'){await db('put','result:'+m.batch+':'+m.result.noteId,m.result);return true;}
  throw Error('未知操作');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  if(m?.scope!=='xhs-comments')return;
  serial=serial.then(()=>handle(m,sender)).then(value=>respond({ok:true,value}),e=>respond({ok:false,error:e.message}));return true;
});
