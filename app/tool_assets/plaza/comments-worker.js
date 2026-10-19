/* Read rendered comments; normal scroll and expand controls only. No private API requests. */
(() => {
  const send=async(type,data={})=>{const r=await chrome.runtime.sendMessage({scope:'xhs-comments',type,...data});if(!r.ok)throw Error(r.error);return r.value;};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const text=e=>(e?.innerText||e?.textContent||'').trim();
  function content(e){if(!e)return '';return [...e.childNodes].map(n=>n.nodeType===3?n.textContent:n.nodeName==='IMG'?(n.alt||'[图片]'):n.nodeName==='BR'?'\n':content(n)).join('').trim();}
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  function read(){return [...document.querySelectorAll('.comments-container .comment-item[id]')].map(e=>({
    id:e.id.replace(/^comment-/,''),rootId:e.closest('.parent-comment')?.querySelector('.comment-item[id]')?.id.replace(/^comment-/,'')||e.id.replace(/^comment-/,''),
    level:e.classList.contains('comment-item-sub')?'回复':'主评论',author:text(e.querySelector('.author .name')),
    content:content(e.querySelector('.content')),date:text(e.querySelector('.date > span:first-child')),likes:text(e.querySelector('.like .count'))
  }));}
  async function run(){
    const job=await send('claim');if(!job)return;
    const badge=document.createElement('div');badge.textContent='正在读取评论，请勿操作此页';Object.assign(badge.style,{position:'fixed',top:'8px',right:'8px',zIndex:2147483647,background:'#243a5e',color:'white',padding:'12px'});document.body.append(badge);
    const found=new Map();let total=null,stable=0,previous='',reason='',complete=false;
    try{
      while(Date.now()<job.deadline-1000){
        const container=document.querySelector('.comments-container'),body=text(document.body);
        if(/请完成.*验证|安全验证|访问频繁|操作频繁|滑动.*验证/.test(body)){reason='页面出现验证或访问限制，请手动处理后重试';break;}
        if(!container){
          if(/登录后.*查看|扫码登录|手机号登录/.test(body)){reason='小红书详情页需要登录';break;}
          if(/笔记不存在|笔记已删除|无法查看|内容无法展示/.test(body)){reason='笔记不可访问';break;}
          await delay(1200);continue;
        }
        const count=text(container).match(/共\s*([\d,]+)\s*条评论/);if(count)total=Number(count[1].replace(/,/g,''));
        for(const c of read())if(c.id)found.set(c.id,c);
        const snapshot={comments:[...found.values()],total};await send('progress',{token:job.token,result:snapshot});
        const expands=[...container.querySelectorAll('*')].filter(e=>visible(e)&&/^展开\s*\d*\s*条?回复$|^展开更多回复$|^查看全部\s*\d*\s*条?回复$/.test(text(e))&&![...e.children].some(c=>text(c)===text(e)));
        const signature=found.size+':'+total;
        stable=signature===previous?stable+1:0;previous=signature;
        if(total!==null&&found.size===total&&!expands.length){complete=true;break;}
        if(stable>=8){reason='滚动后没有新增评论，未能核对全部评论';break;}
        if(found.size>=50000){reason='单篇达到50000条保护上限';break;}
        if(expands.length){expands[0].scrollIntoView({block:'center'});expands[0].click();}
        else {const scroller=container.closest('.note-scroller');if(!scroller){reason='未找到评论滚动区域';break;}scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new Event('scroll',{bubbles:true}));}
        badge.textContent=`读取评论：${found.size} / ${total??'未知'}`;await delay(1500);
      }
      if(!complete&&!reason)reason='单篇采集超时';
    }catch(e){reason=e.message;}
    try{await send('finish',{token:job.token,result:{comments:[...found.values()],total,state:complete?'完整':found.size?'部分结果':'无法读取',reason}});}catch{badge.textContent='采集已中断，请回合作广场查看进度';}
  }
  run().catch(()=>{});
})();
