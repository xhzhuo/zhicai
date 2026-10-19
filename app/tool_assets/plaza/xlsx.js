/* Minimal dependency-free OOXML reader/writer. No macros or formulas are executed. */
(() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const xml = s => {const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Excel 内部 XML 格式损坏');return d;};
  const tags = (e, n) => [...e.getElementsByTagNameNS('*', n)];
  const escape = v => String(v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const crc = bytes => { let c = -1; for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ -1) >>> 0; };
  function join(parts) { const out = new Uint8Array(parts.reduce((n,p) => n+p.length,0)); let n=0; for(const p of parts){out.set(p,n); n+=p.length;} return out; }
  function zip(files) {
    const local = [], central = []; let offset = 0;
    for (const [path, content] of Object.entries(files)) {
      const name = enc.encode(path), data = content instanceof Uint8Array?content:enc.encode(content), sum = crc(data);
      const h = new Uint8Array(30), v = new DataView(h.buffer);
      v.setUint32(0,0x04034b50,true); v.setUint16(4,20,true); v.setUint16(6,0x800,true); v.setUint32(14,sum,true);
      v.setUint32(18,data.length,true); v.setUint32(22,data.length,true); v.setUint16(26,name.length,true);
      const c = new Uint8Array(46), cv = new DataView(c.buffer);
      cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x800,true);
      cv.setUint32(16,sum,true); cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true); cv.setUint16(28,name.length,true); cv.setUint32(42,offset,true);
      local.push(h,name,data); central.push(c,name); offset += h.length+name.length+data.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer), count=Object.keys(files).length, cd=join(central);
    ev.setUint32(0,0x06054b50,true); ev.setUint16(8,count,true); ev.setUint16(10,count,true); ev.setUint32(12,cd.length,true); ev.setUint32(16,offset,true);
    return join([...local,cd,end]);
  }
  async function unzip(buffer) {
    const a = new Uint8Array(buffer), v = new DataView(a.buffer,a.byteOffset,a.byteLength);
    if(a.length > 20*1024*1024) throw Error('筛选表不能超过 20MB');
    let end = a.length-22;
    for(;end>=Math.max(0,a.length-65557);end--) if(v.getUint32(end,true)===0x06054b50) break;
    if(end<0 || v.getUint32(end,true)!==0x06054b50) throw Error('文件不是有效的 .xlsx，请用 Excel 另存为 .xlsx');
    const count=v.getUint16(end+10,true); let p=v.getUint32(end+16,true), total=0; const files={};
    if(count>2000) throw Error('筛选表包含过多文件');
    for(let i=0;i<count;i++) {
      if(v.getUint32(p,true)!==0x02014b50) throw Error('Excel 压缩目录损坏');
      const flags=v.getUint16(p+8,true), method=v.getUint16(p+10,true), size=v.getUint32(p+20,true), unpacked=v.getUint32(p+24,true);
      const nl=v.getUint16(p+28,true), el=v.getUint16(p+30,true), cl=v.getUint16(p+32,true), pos=v.getUint32(p+42,true);
      const name=dec.decode(a.slice(p+46,p+46+nl)); p+=46+nl+el+cl; total+=unpacked;
      if(flags&1) throw Error('不支持加密 Excel');
      if(total>64*1024*1024) throw Error('Excel 解压体积过大');
      if(!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
      if(v.getUint32(pos,true)!==0x04034b50) throw Error('Excel 文件损坏');
      const start=pos+30+v.getUint16(pos+26,true)+v.getUint16(pos+28,true), data=a.slice(start,start+size);
      let bytes;
      if(method===0) bytes=data;
      else if(method===8) {
        const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks=[]; let length=0;
        while(true){const r=await reader.read();if(r.done)break; length+=r.value.length;if(length>unpacked || length>64*1024*1024){await reader.cancel();throw Error('Excel 解压长度异常');}chunks.push(r.value);}
        bytes=join(chunks);
      } else throw Error('不支持此 Excel 压缩方式');
      if(bytes.length!==unpacked) throw Error('Excel 数据长度异常');
      files[name]=dec.decode(bytes);
    }
    return files;
  }
  async function read(buffer, preferred='筛选条件') {
    const f=await unzip(buffer);
    if(!f['xl/workbook.xml'])throw Error('未找到 Excel 工作簿');
    const book=xml(f['xl/workbook.xml']);
    if(tags(book,'workbookPr').some(x=>['1','true'].includes(x.getAttribute('date1904'))))throw Error('不支持 1904 日期系统，请使用模板或将日期改为文本');
    const sheets=tags(book,'sheet'), sheet=sheets.find(s=>s.getAttribute('name')===preferred);
    if(!sheet)throw Error('缺少工作表：'+preferred+'，请使用配套模板');
    const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const rel=tags(xml(f['xl/_rels/workbook.xml.rels']),'Relationship').find(r=>r.getAttribute('Id')===id);
    if(!rel)throw Error('工作表关联不存在');
    let target=rel.getAttribute('Target'); target=target.startsWith('/')?target.slice(1):'xl/'+target;
    target=target.replace(/\/\.\//g,'/');
    if(!f[target])throw Error('未找到筛选工作表');
    const shared=f['xl/sharedStrings.xml']?tags(xml(f['xl/sharedStrings.xml']),'si').map(s=>tags(s,'t').map(t=>t.textContent).join('')):[];
    return tags(xml(f[target]),'row').map(r=>{
      const row=[];
      for(const c of tags(r,'c')) {
        if(tags(c,'f').length)throw Error('筛选条件不支持公式，请粘贴为值');
        const ref=c.getAttribute('r'), letters=ref.match(/^[A-Z]+/)[0]; let index=0;
        for(const ch of letters)index=index*26+ch.charCodeAt(0)-64;
        const type=c.getAttribute('t'), value=tags(c,'v')[0]?.textContent ?? '';
        row[index-1]=type==='s'?shared[Number(value)]:type==='inlineStr'?tags(c,'t').map(t=>t.textContent).join(''):type==='b'?value==='1':value!==''&&(!type||type==='n')?Number(value):value;
      }
      return row;
    });
  }
  function write(sheets) {
    const files={};
    const withImages=sheets.map((s,i)=>s.images?.length?i:-1).filter(i=>i>=0);
    files['[Content_Types].xml']=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${withImages.length?'<Default Extension="png" ContentType="image/png"/>':''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${withImages.map((_,i)=>`<Override PartName="/xl/drawings/drawing${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('')}</Types>`;
    files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml']=`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${escape(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
    files['xl/_rels/workbook.xml.rels']=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    files['xl/styles.xml']=`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF243A5E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    let drawingNumber=0,imageNumber=0;
    sheets.forEach((s,i)=>{
      const cols=s.rows[0]?.length||1;
      const drawing=s.images?.length?++drawingNumber:0;
      files[`xl/worksheets/sheet${i+1}.xml`]=`<worksheet xmlns="${ns}"${drawing?' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"':''}><dimension ref="A1:${col(cols-1)}${Math.max(1,s.rows.length)}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({length:cols},(_,n)=>`<col min="${n+1}" max="${n+1}" width="${s.widths?.[n]||23}" customWidth="1"/>`).join('')}</cols><sheetData>${s.rows.map((row,r)=>`<row r="${r+1}" ht="${r?Math.min(409,(s.rowHeight||22)*Math.max(1,...(s.wrapColumns||[]).map(c=>String(row[c]??'').split('\n').length))):30}" customHeight="1">${row.map((v,c)=>{
        if(v===null||v===undefined)return '';
        const ref=`${col(c)}${r+1}`, style=r?(s.wrapColumns?.includes(c)?2:0):1;
        if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
        const str=String(v);if(str.length>32767)throw Error(`单元格 ${s.name}!${ref} 超过 Excel 的 32767 字符上限，请下载原始 JSON`);
        return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(str)}</t></is></c>`;
      }).join('')}</row>`).join('')}</sheetData>${s.rows.length>1&&s.filter!==false?`<autoFilter ref="A1:${col(cols-1)}${s.rows.length}"/>`:''}${drawing?'<drawing r:id="rId1"/>':''}</worksheet>`;
      if(drawing){
        files[`xl/worksheets/_rels/sheet${i+1}.xml.rels`]=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawing}.xml"/></Relationships>`;
        const anchors=[],relationships=[];
        s.images.forEach((image,j)=>{
          const png=typeof image.png==='function'?image.png():image.png;
          if(!(png instanceof Uint8Array)||png.length<8||!png.slice(0,8).every((v,k)=>v===[137,80,78,71,13,10,26,10][k]))throw Error(`工作表 ${s.name} 的词云图片无效`);
          const media=++imageNumber,id=j+1;
          files[`xl/media/image${media}.png`]=png;
          relationships.push(`<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${media}.png"/>`);
          anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${image.col||0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${image.row||0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(image.width*9525)}" cy="${Math.round(image.height*9525)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="评论词云 ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
        });
        files[`xl/drawings/drawing${drawing}.xml`]=`<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`;
        files[`xl/drawings/_rels/drawing${drawing}.xml.rels`]=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`;
      }
    });
    return zip(files);
  }
  globalThis.XHSXlsx={read,write,unzip};
})();
