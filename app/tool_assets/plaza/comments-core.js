/* Comment rows are joined to task-note rows only at export time. */
(() => {
  const headers=['任务名称','筛选关键词','noteId','笔记标题','commentId','主评论ID','评论层级','评论者昵称','评论内容','评论情感','发布时间原文','点赞数原文','采集时间UTC'];
  // Local, deterministic estimate. Questions and mixed praise/complaints stay neutral.
  const positive=['好用','很好用','不错','还可以','喜欢','满意','推荐','回购','值得','划算','便宜','惊喜','舒服','有效','有用','方便','省心','适合','可爱','厉害','很牛','滋润','润眼睛','顺滑','很顺','好闻','香香','超棒','绝了','买买买','买它','赞爆','防脱效果好'];
  const negative=['不好用','难用','失望','踩雷','太贵','不值','不喜欢','不推荐','没用','无效','不好闻','难闻','刺痛','过敏','翻车','垃圾','坑人','退货','掉发','掉头发','脱发','油腻','干燥','抗性','投诉','效果差','质量差','不好','不行'];
  const terms=[...positive.map(s=>({s,w:1})),...negative.map(s=>({s,w:-1}))].sort((a,b)=>b.s.length-a.s.length);
  function sentiment(value){
    const text=String(value||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ');
    if(!text||/原评论已删除|该评论已删除/.test(text))return '中性';
    const used=new Uint8Array(text.length);let score=0,pos=0,neg=0;
    for(const {s,w} of terms){
      let start=0,index;
      while((index=text.indexOf(s,start))>=0){
        start=index+s.length;
        if([...used.slice(index,index+s.length)].some(Boolean))continue;
        used.fill(1,index,index+s.length);
        const previous=text.slice(Math.max(0,index-2),index);
        const flipped=/不$|没$|无$|未$/.test(previous);
        const weight=flipped?-w:w;score+=weight;
        if(weight>0)pos++;else neg++;
      }
    }
    if(pos&&neg)return '中性';
    if(/[？?]/.test(text)&&/吗|么|咋样|如何|是不是|有没有|会不会|求问|请问/.test(text))return '中性';
    if(score>0)return '正面';if(score<0)return '负面';return '中性';
  }
  function source(rows){
    const h=rows[0]||[], id=h.indexOf('noteId'),cmt=h.indexOf('cmtNum');
    if(id<0||!h.includes('任务名称')||!h.includes('筛选关键词'))throw Error('请选择按任务拆行的采集结果（data 须含任务名称、筛选关键词、noteId）');
    const notes=new Map();
    for(const r of rows.slice(1)){
      if(r.every(v=>v===null||v===undefined||v===''))continue;
      const key=String(r[id]||'');if(!/^[a-f0-9]{24}$/i.test(key))throw Error('data 中存在无效 noteId：'+key);
      if(String(r[h.indexOf('任务名称')]||'').includes('\n'))throw Error('请先使用按任务拆行版结果，不能使用任务合并在同一单元格的旧版');
      const value=cmt>=0?r[cmt]:null;
      const zero=value===0||(typeof value==='string'&&/^0+(?:\.0+)?$/.test(value.trim()));
      const prior=notes.get(key);
      if(prior){prior.noComments=prior.noComments&&zero;prior.title=r[h.indexOf('title')]||prior.title;}
      else notes.set(key,{id:key,title:r[h.indexOf('title')]||'',noComments:zero});
    }
    if(!notes.size)throw Error('data 没有笔记');return [...notes.values()];
  }
  function state(count,total,reason=''){
    if(!reason&&Number.isInteger(total)&&count===total)return '完整';
    return count?'部分结果':'无法读取';
  }
  const cloudStop=new Set('这个 那个 这些 那些 一个 一些 还是 就是 真的 感觉 觉得 看到 现在 之前 之后 今天 昨天 已经 可以 怎么 什么 为什么 有没有 是不是 不是 没有 还有 比较 非常 真的 这么 那么 这样 那样 里面 外面 时候 因为 所以 如果 但是 然后 而且 以及 大家 你们 我们 他们 她们 自己 人家 这里 那里 一下 一直 一点 好像 可能 应该 需要 知道 说的 说是 评论 原评论 已删除 评论已删除 图片 视频 小红书 笔记 作者 回复 发布'.split(' '));
  function words(value){
    const text=String(value||'').toLowerCase().replace(/https?:\/\/\S+|@[\p{Script=Han}a-z0-9_]+|#[^#\s]+#/giu,' ');
    if(!text||/^(原评论已删除|该评论已删除)$/.test(text.trim()))return [];
    const raw=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)].filter(x=>x.isWordLike).map(x=>x.segment):text.match(/[\p{Script=Han}]{2,}|[a-z]{2,}/gu)||[];
    return raw.flatMap(x=>x.match(/[\p{Script=Han}a-z]+/gu)||[]).filter(x=>x.length>=2&&!cloudStop.has(x)&&!/^\d+$/.test(x));
  }
  function cloudGroups(details){
    const groups=new Map();
    for(const row of details.slice(1)){
      const keyword=String(row[1]??'').trim()||'（空关键词）';
      if(!groups.has(keyword))groups.set(keyword,{keyword,comments:0,seen:new Set(),counts:new Map()});
      const group=groups.get(keyword),content=String(row[8]??'');
      const key=String(row[2]??'')+'\u0000'+String(row[4]||content);
      if(group.seen.has(key))continue;
      group.seen.add(key);group.comments++;
      for(const word of words(content))group.counts.set(word,(group.counts.get(word)||0)+1);
    }
    return [...groups.values()].map(g=>({keyword:g.keyword,comments:g.comments,terms:[...g.counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN')).slice(0,40)}));
  }
  function renderCloud(terms){
    const canvas=document.createElement('canvas');canvas.width=760;canvas.height=440;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器无法绘制评论词云');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,760,440);
    if(!terms.length){ctx.font='24px Microsoft YaHei, sans-serif';ctx.fillStyle='#64748b';ctx.textAlign='center';ctx.fillText('没有可用于词云的评论文本',380,220);}
    else {
      const colors=['#1d4f91','#126a83','#2e75b6','#1d8679','#665aa8','#d16b45','#4472a3'];
      const used=[],max=terms[0][1];ctx.textAlign='left';ctx.textBaseline='alphabetic';
      for(let i=0;i<terms.length;i++){
        const [word,count]=terms[i],size=Math.round(18+39*Math.sqrt(count/max));
        ctx.font=`600 ${size}px Microsoft YaHei, PingFang SC, sans-serif`;
        const width=ctx.measureText(word).width,height=size*1.1;
        if(width>720)continue;
        let box=null;
        for(let k=0;k<2400;k++){
          const angle=k*0.42,r=5.5*Math.sqrt(k),x=(760-width)/2+Math.cos(angle)*r,y=(440-height)/2+Math.sin(angle)*r;
          const next={x:x-5,y:y-4,w:width+10,h:height+8};
          if(next.x<10||next.y<9||next.x+next.w>750||next.y+next.h>431)continue;
          if(used.some(b=>next.x<b.x+b.w&&next.x+next.w>b.x&&next.y<b.y+b.h&&next.y+next.h>b.y))continue;
          box=next;break;
        }
        if(!box)continue;
        used.push(box);ctx.fillStyle=colors[i%colors.length];ctx.fillText(word,box.x+5,box.y+4+size);
      }
    }
    const base64=canvas.toDataURL('image/png').split(',')[1];
    const binary=atob(base64),out=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
    return out;
  }
  function cloudSheet(details){
    const rows=[['筛选关键词','去重评论数','','','','','','','','高频词','出现次数']],images=[];
    for(const group of cloudGroups(details)){
      const first=rows.length;
      for(let i=0;i<27;i++)rows.push(Array(11).fill(null));
      rows[first][0]=group.keyword;rows[first][1]=group.comments;
      group.terms.slice(0,25).forEach(([word,count],i)=>{rows[first+1+i][9]=word;rows[first+1+i][10]=count;});
      images.push({col:0,row:first+1,width:760,height:440,png:()=>renderCloud(group.terms)});
    }
    if(rows.length===1)rows.push(['暂无评论明细，无法生成词云']);
    return {name:'评论词云',rows,widths:[24,18,14,14,14,14,14,14,3,22,12],rowHeight:18,filter:false,images};
  }
  function sheets(rows,audit,results){
    const index=new Map(results.map(r=>[r.noteId,r])), h=rows[0], ix=k=>h.indexOf(k), details=[headers];
    const out=[[...h,'评论采集状态','已采评论条数','页面评论总数','评论采集说明']];
    for(const row of rows.slice(1)){
      const r=index.get(String(row[ix('noteId')]));
      out.push([...h.map((_,i)=>row[i]??null),r?.state||'未执行',r?.comments.length??null,r?.total??null,r?.reason||'']);
      for(const c of r?.comments||[])details.push([row[ix('任务名称')],row[ix('筛选关键词')],r.noteId,row[ix('title')],c.id,c.rootId,c.level,c.author,c.content,sentiment(c.content),c.date,c.likes,r.finished]);
    }
    const logs=[['noteId','状态','页面评论总数','已采条数','说明','采集时间UTC','笔记链接'],...source(rows).map(n=>{
      const r=index.get(n.id);return [n.id,r?.state||'未执行',r?.total??null,r?.comments.length??null,r?.reason||'',r?.finished||'','https://www.xiaohongshu.com/explore/'+n.id];
    })];
    const all=[{name:'data',rows:out,widths:[28,28,...Array(h.length-2).fill(24),18,18,18,55]},
      {name:'评论明细',rows:details,widths:[26,22,28,45,28,28,14,24,85,16,22,16,30],wrapColumns:[3,8]},
      cloudSheet(details),
      {name:'评论采集记录',rows:logs,widths:[28,18,18,18,65,30,65]}];
    if(audit?.length)all.push({name:'采集记录',rows:audit});return all;
  }
  globalThis.XHSComments={source,state,sentiment,words,cloudGroups,sheets};
})();
