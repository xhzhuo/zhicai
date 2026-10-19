/* Reads only matching note-list responses. Never reads cookies or request headers. */
(() => {
  if(window.__xhsExcelCapture)return; window.__xhsExcelCapture=true;
  let generation=0, enabled=false;
  let openCapture=null;
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin)return;
    if(e.data?.source==='xhs-excel-control'){
      generation=e.data.generation;enabled=!!e.data.enabled;
    }
    if(e.data?.source==='xhs-comment-open-arm'){
      openCapture={token:e.data.token,noteId:e.data.noteId,expires:Date.now()+5000};
    }
    if(e.data?.source==='xhs-comment-open-disarm'&&openCapture?.token===e.data.token)openCapture=null;
  });
  const originalWindowOpen=window.open;
  window.open=function(url,...rest){
    const cap=openCapture;
    if(cap&&Date.now()<cap.expires){
      try{
        const u=new URL(String(url),location.href);
        if(u.protocol==='https:'&&u.hostname==='www.xiaohongshu.com'&&u.pathname===`/explore/${cap.noteId}`){
          openCapture=null;
          window.postMessage({source:'xhs-comment-open-url',token:cap.token,noteId:cap.noteId,url:u.href},location.origin);
          return null;
        }
      }catch{}
    }
    return originalWindowOpen.call(this,url,...rest);
  };
  function emit(body,startGen,url,status){
    if(!enabled||generation!==startGen)return;
    if(!body?.data||!Object.hasOwn(body.data,'cooperationCodeNoteDtoList'))return;
    window.postMessage({source:'xhs-excel-response',generation:startGen,body,status,endpoint:new URL(url,location.href).pathname},location.origin);
  }
  const originalFetch=window.fetch;
  window.fetch=async function(...args){
    const g=generation, watch=enabled;
    const response=await originalFetch.apply(this,args);
    if(watch && /json/i.test(response.headers.get('content-type')||''))response.clone().json().then(b=>emit(b,g,response.url,response.status)).catch(()=>{});
    return response;
  };
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  const meta=new WeakMap();
  XMLHttpRequest.prototype.open=function(method,url,...rest){meta.set(this,{url:String(url)});return open.call(this,method,url,...rest);};
  XMLHttpRequest.prototype.send=function(...args){
    const g=generation,watch=enabled,url=meta.get(this)?.url;
    if(watch)this.addEventListener('load',()=>{
      try {const b=this.responseType==='json'?this.response:JSON.parse(this.responseText);emit(b,g,url,this.status);}catch{}
    },{once:true});
    return send.apply(this,args);
  };
})();
