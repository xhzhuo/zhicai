(() => {
  const fields=['noteType','noteStatus','authorId','likeNum','cmtNum','title','pushTime','noteReason','videoUrl','authorName','authorAvatar','favNum','content','imagesList','authorFansNum','noteId'];
  const headers=['任务名称','启用','搜索类型','关键词','笔记类型','发布时间','开始日期','结束日期','曝光量','阅读量','互动量','作者粉丝数','排序','最多笔记数'];
  function date(v) {
    if(v===''||v==null)return '';
    if(typeof v==='number')v=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000).toISOString().slice(0,10);
    v=String(v).trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw Error('日期须为有效的 YYYY-MM-DD');
    return v;
  }
  function tasks(rows) {
    if(!rows.length)throw Error('筛选表为空');
    const h=rows[0].map(x=>String(x??'').trim());
    for(const key of headers)if(!h.includes(key))throw Error('缺少列：'+key+'，请使用配套模板');
    if(new Set(h).size!==h.length)throw Error('表头重复');
    for(const key of h)if(key&&!headers.includes(key))throw Error('不支持的筛选列：'+key);
    const result=[];
    rows.slice(1).forEach((row,index)=>{
      if(row.every(x=>x===''||x==null))return;
      const t=Object.fromEntries(headers.map(k=>[k,row[h.indexOf(k)]??'']));
      if(['否','0',0,false].includes(t.启用))return;
      if(!['是','1',1,true].includes(t.启用))throw Error(`第 ${index+2} 行：启用须填写是或否`);
      t.任务名称=String(t.任务名称).trim()||`任务${index+1}`;
      for(const [k,options] of Object.entries({'搜索类型':['笔记','笔记ID','作者昵称','作者ID','话题','作者'],'笔记类型':['不限','图文','视频'],'排序':['高曝光','高阅读','高互动']}))if(!options.includes(t[k]))throw Error(`${t.任务名称}：${k}须填写 ${options.join('、')}`);
      t.关键词=String(t.关键词).trim();if(!t.关键词)throw Error(t.任务名称+'：关键词不能为空');
      if(!['近7天','近14天','近30天','近90天','近180天','近365天','自定义'].includes(t.发布时间))throw Error(t.任务名称+'：发布时间不支持，请看填写说明');
      t.开始日期=date(t.开始日期);t.结束日期=date(t.结束日期);
      if(t.发布时间==='自定义'&&(!t.开始日期||!t.结束日期||t.开始日期>t.结束日期))throw Error(t.任务名称+'：请填写正确的开始和结束日期');
      if(t.发布时间!=='自定义'&&(t.开始日期||t.结束日期))throw Error(t.任务名称+'：填写日期时，请将发布时间设为自定义');
      for(const k of ['曝光量','阅读量','互动量','作者粉丝数'])t[k]=String(t[k]||'不限').trim();
      if(t.最多笔记数==='')t.最多笔记数=1000;
      t.最多笔记数=Number(t.最多笔记数);if(!Number.isInteger(t.最多笔记数)||t.最多笔记数<1||t.最多笔记数>10000)throw Error(t.任务名称+'：最多笔记数须为 1—10000');
      result.push(t);
    });
    if(!result.length)throw Error('没有启用的任务');
    if(result.length>100)throw Error('一次最多执行 100 个任务');
    return result;
  }
  function payload(data) {
    const d=data?.data;
    if(!d || !Array.isArray(d.cooperationCodeNoteDtoList))return null;
    if(data.success===false || (data.code!==undefined && ![0,'0'].includes(data.code)))throw Error(data.msg||'笔记接口返回失败');
    const notes=d.cooperationCodeNoteDtoList;
    if(notes.some(n=>!n||typeof n!=='object'||!n.noteId))throw Error('笔记响应缺少 noteId，无法可靠去重');
    const p=d.pageRespDTO||d.pageRespDto;
    if(!p||p.totalCount==null||p.pageIndex==null||!Number.isInteger(Number(p.totalCount))||Number(p.totalCount)<0||!Number.isInteger(Number(p.pageIndex))||Number(p.pageIndex)<0)throw Error('响应缺少有效总数或页码，无法校验完整性');
    if(notes.length>Number(p.totalCount))throw Error('响应笔记数量超过网站总数');
    return {notes,total:Number(p.totalCount),page:Number(p.pageIndex)};
  }
  function noteRow(n){return fields.map(k=>n[k]==null?null:typeof n[k]==='object'?JSON.stringify(n[k]):n[k]);}
  class Collector {
    constructor(limit){this.limit=limit;this.notes=new Map();this.total=null;this.pages=new Set();this.lastPage=null;}
    add(p){
      if(this.lastPage===null && ![0,1].includes(p.page))throw Error('没有捕获到第一页，请重新开始');
      if(this.lastPage!==null && p.page>this.lastPage+1)throw Error('分页不连续，已暂停以避免漏采');
      if(this.total!==null && this.total!==p.total)throw Error('采集期间总数发生变化，请重新运行');
      this.total=p.total;this.pages.add(p.page);this.lastPage=Math.max(this.lastPage??p.page,p.page);
      for(const n of p.notes){if(this.notes.has(String(n.noteId)))continue;if(this.notes.size<this.limit)this.notes.set(String(n.noteId),n);}
      if(this.notes.size>this.total)throw Error('去重数量超过网站总数，可能混入其他筛选结果');
    }
    get complete(){return this.total!==null&&this.notes.size>=this.total;}
    get capped(){return !this.complete&&this.notes.size>=this.limit;}
  }
  function mergedRows(notes,relations){
    const byId=new Map();
    for(const [seq,name,keyword,id] of relations){
      const key=String(id);if(!byId.has(key))byId.set(key,new Map());
      byId.get(key).set(seq,[name,keyword]);
    }
    return [['任务名称','筛选关键词',...fields],...notes.flatMap(n=>{
      const pairs=[...(byId.get(String(n.noteId))?.values()||[])];
      return pairs.map(([name,keyword])=>[name,keyword,...noteRow(n)]);
    })];
  }
  globalThis.XHSCore={fields,headers,tasks,payload,noteRow,Collector,mergedRows};
})();
