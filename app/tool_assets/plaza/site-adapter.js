/* Adapter grounded in the cooperation plaza DOM inspected on 2026-10-14. */
(() => {
  const norm=s=>String(s).replace(/\s|,/g,'').replace(/[~～—–]/g,'-');
  const text=e=>(e?.innerText||e?.textContent||'').trim();
  const visible=e=>!!e?.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const list=(scope,selector)=>[...scope.querySelectorAll(selector)].filter(visible);
  const only=(a,label)=>{if(a.length!==1)throw Error(`${label}定位异常（${a.length}个）`);return a[0];};
  const wrap=()=>only(list(document,'.ugc-content-filter-wrap'),'合作广场筛选区');
  function row(label){return only(list(wrap(),'.filter-content-item').filter(e=>text(e.querySelector('.filter-item-label'))===label),label);}
  function exact(scope,value){return [...scope.querySelectorAll('*')].filter(e=>visible(e)&&text(e)===value&&![...e.children].some(x=>text(x)===value));}
  function range(value){
    const m=norm(value).match(/^(\d+)-(\d+)$/);if(!m)return null;
    const pair=m.slice(1).map(Number);if(pair[0]>pair[1]||pair[1]>99999999)throw Error('自定义区间须为0—99999999且下限不大于上限');return pair;
  }
  function items(){return list(wrap(),'.filter-tag-item').map(e=>norm(text(e)));}
  function metricValue(key){return key==='作者粉丝数'?'粉丝数':key;}
  function metricVerified(key,value){const prefix=metricValue(key)+'-',found=items().filter(x=>x.startsWith(prefix));return value==='不限'?found.length===0:found.length===1&&found[0]===prefix+norm(value);}
  async function until(fn,delay,label){for(let i=0;i<20;i++){if(fn())return;await delay(100);}throw Error(label+'未生效，已停止');}
  async function selectPopup(value,{click,delay}){
    await until(()=>list(document,'.d-options').length>0,delay,'展开下拉菜单（目标：'+value+'）');
    const menu=only(list(document,'.d-options'),'下拉菜单（目标：'+value+'）');
    const option=only(exact(menu,value),'选项 '+value);
    const grid=option.closest('.d-grid-item');const rowIndex=grid?.style.gridArea.split('/')[0].trim();
    const handler=rowIndex?[...menu.querySelectorAll('.d-option-handler')].find(e=>e.parentElement.style.gridArea.split('/')[0].trim()===rowIndex):null;
    await click(handler||option.closest('.d-option-content')||option);
    await delay(100);
  }
  async function setMetric(key,value,ctx){
    await ctx.click(only(exact(row('笔记数据'),key),key));
    const pop=only(list(document,'.filter-select-popover'),key+'弹层');
    const choices=exact(pop,value);
    if(choices.length===1)await selectPopup(value,ctx);
    else {
      const pair=range(value);if(!pair)throw Error(key+'：找不到选项 '+value+'，请填写网页选项原文或数字下限~上限');
      const ins=list(pop,'input');if(ins.length!==2)throw Error(key+'：自定义范围控件已变化');
      ctx.input(ins[0],String(pair[0]));ctx.input(ins[1],String(pair[1]));ins[1].blur();await ctx.delay(100);
      await ctx.click(only(list(pop,'button').filter(e=>text(e)==='确定'),'范围确定按钮'));
    }
    await until(()=>metricVerified(key,value),ctx.delay,key+'筛选');
  }
  async function calendarDate(value,index,ctx){
    const [year,month,day]=value.split('-').map(Number);
    const ins=list(row('发布时间'),'.d-daterangepicker-input-filter input');
    if(ins.length!==2)throw Error('日期输入框结构已变化');
    await ctx.click(ins[index]);
    for(let count=0;count<130;count++){
      ctx.guard();const calendars=list(document,'.d-datepicker-calendar');
      if(calendars.length!==2)throw Error('日期范围日历结构已变化');
      const cal=calendars[index],heads=list(cal,'.d-datepicker-selector h6');
      if(heads.length!==2)throw Error('日历年月显示异常');
      const y=parseInt(text(heads[0])),m=parseInt(text(heads[1]));
      if(y===year&&m===month){
        const cells=list(cal,'.d-datepicker-cell').filter(e=>text(e)===String(day)&&!e.classList.contains('--color-text-placeholder')&&!e.classList.contains('disabled'));
        await ctx.click(only(cells,`可选日期 ${value}`));return;
      }
      const arrows=list(cal,'.d-datepicker-header .d-icon.d-clickable');
      if(arrows.length!==4)throw Error('日期翻月按钮结构已变化');
      const delta=(year-y)*12+month-m;
      const idx=delta<=-12?0:delta<0?1:delta>=12?3:2;
      await ctx.click(arrows[idx]);
      const updated=list(cal,'.d-datepicker-selector h6').map(text).join('');
      if(updated===heads.map(text).join(''))await ctx.delay(100);
    }
    throw Error('日期跨度过大或无法翻月');
  }
  function verify(t,includeKeyword=true){
    const w=wrap(), search=only(list(w,'.select-search'),'搜索区域');
    const mode=t.搜索类型==='作者'?'作者昵称':t.搜索类型;
    if(text(search)!==mode)throw Error('搜索类型回读不一致');
    if(text(only(list(row('笔记类型'),'button.active'),'已选笔记类型'))!==t.笔记类型)throw Error('笔记类型回读不一致');
    if(text(only(list(w,'.filter-search button.active'),'已选排序'))!==t.排序)throw Error('排序回读不一致');
    for(const k of ['曝光量','阅读量','互动量','作者粉丝数'])if(!metricVerified(k,t[k]))throw Error(k+'回读不一致');
    const dateRow=row('发布时间');
    if(text(only(list(dateRow,'.d-select-description'),'日期预设'))!==t.发布时间)throw Error('日期预设回读不一致');
    const dates=list(dateRow,'.d-daterangepicker-input-filter input').map(e=>e.value);
    if(dates.length!==2||dates.some(x=>!/^\d{4}-\d\d-\d\d$/.test(x)))throw Error('未读取到实际起止日期');
    if(t.发布时间==='自定义'&&(dates[0]!==t.开始日期||dates[1]!==t.结束日期))throw Error('自定义起止日期回读不一致');
    if(includeKeyword&&!items().includes(norm(t.关键词)))throw Error('关键词尚未进入筛选条件');
    return {搜索类型:mode,笔记类型:t.笔记类型,排序:t.排序,实际日期:dates,筛选标签:list(w,'.filter-tag-list').map(text)};
  }
  async function apply(t,ctx){
    const reset=list(wrap(),'a').filter(e=>text(e)==='重置');
    if(reset.length)await ctx.click(only(reset,'清空全部筛选'));await ctx.delay(600);
    const search=only(list(wrap(),'.select-search'),'搜索区域');
    const mode=t.搜索类型==='作者'?'作者昵称':t.搜索类型;
    if(text(search)!==mode){await ctx.click(only(exact(search,text(search)),'搜索类型开关'));await selectPopup(mode,ctx);}
    await ctx.click(only(list(row('笔记类型'),'button').filter(e=>text(e)===t.笔记类型),'笔记类型 '+t.笔记类型));
    for(const k of ['曝光量','阅读量','互动量','作者粉丝数']){
      if(metricVerified(k,t[k]))continue;
      try{await setMetric(k,t[k],ctx);}catch(e){throw Error(k+'：'+e.message);}
    }
    const dateDescription=only(list(row('发布时间'),'.d-select-description'),'日期预设');
    if(text(dateDescription)!==t.发布时间){await ctx.click(dateDescription);await selectPopup(t.发布时间,ctx);}
    if(t.发布时间==='自定义'){
      // Reset yields a broad default range. Expand end first when necessary, then set start and end.
      const oldEnd=list(row('发布时间'),'.d-daterangepicker-input-filter input')[1]?.value;
      if(oldEnd&&t.开始日期>oldEnd)await calendarDate(t.结束日期,1,ctx);
      await calendarDate(t.开始日期,0,ctx);await calendarDate(t.结束日期,1,ctx);
      await ctx.click(only(exact(row('发布时间'),'发布时间'),'日期标签'));
    }
    await ctx.click(only(list(wrap(),'.filter-search button').filter(e=>text(e)===t.排序),'排序 '+t.排序));
    const currentSearch=only(list(wrap(),'.select-search'),'搜索区域');
    const inp=only(list(currentSearch,'input'),'搜索输入框');ctx.input(inp,t.关键词);await ctx.delay(1000);
    verify(t,false);
    return {inp,button:only(list(currentSearch,'button.search-button'),'搜索按钮'),validate:async()=>{await until(()=>items().includes(norm(t.关键词)),ctx.delay,'关键词');return verify(t);}};
  }
  globalThis.XHSSiteAdapter={available:()=>!!document.querySelector('.ugc-content-filter-wrap'),apply,verify,range};
})();
