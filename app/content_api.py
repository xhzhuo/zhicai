"""Read-only Lingxi content export with checked pagination per product."""
import asyncio
from collections import Counter
import hashlib
import json
import re
from datetime import date
from openpyxl import Workbook

PATH = '/api/idea/databank/note/table'
PAGE_SIZE = 100
FIELDS = [
    ('noteId', '笔记ID'), ('noteTitle', '笔记标题'), ('noteType', '笔记类型'),
    ('noteSource', '笔记来源'), ('pushTime', '笔记发布时间'), ('noteStatus', '笔记状态'),
    ('brandAccountName', '绑定专业号名称'), ('authorId', '作者ID'),
    ('authorName', '作者名称'), ('authorFansCnt', '作者粉丝数'),
    ('interestCost', '种草消耗'), ('interestCostGrowth', '种草消耗环比'),
    ('ctr', 'CTR（全部流量）'), ('ctrGrowth', 'CTR环比（全部流量）'),
    ('impNum', '曝光量'), ('readNum', '阅读量（全部流量）'),
    ('noteUrl', '笔记链接'), ('noteImageUrl', '封面链接'),
]
HEADERS = ['产品名称', 'SPU ID', '查询开始日期', '查询结束日期'] + [label for _, label in FIELDS] + ['记录提示', '同产品笔记ID出现次数', '来源页码', '页内序号']
AUDIT_HEADERS = ['产品名称', 'SPU ID', '接口总数', '导出条数', '状态', '失败原因', '唯一笔记数', '重复笔记ID数', '涉及重复的记录行数', '数据提示']


def parse_options(brands, products):
    for response in (brands, products):
        if not isinstance(response, dict) or response.get('code') != 0 or response.get('success') is False:
            raise ValueError('未能读取品牌或授权产品，请检查灵犀 Cookie')
    brand_list = brands.get('data', {}).get('brandList', [])
    current = [item for item in brand_list if item.get('selected') is True]
    if len(current) != 1:
        raise ValueError('无法确认当前品牌，请在灵犀确认品牌后手动填写品牌 ID 和产品清单')
    items = products.get('data', {}).get('spuList', [])
    selected = [{'id': str(item['code']), 'name': item['name']} for item in items if item.get('enable') is True]
    if not selected:
        raise ValueError('当前账号没有已授权的可用产品')
    return str(current[0]['brandId']), selected


def validate(raw):
    brand = str(raw.get('brandUserId') or '').strip()
    if not re.fullmatch(r'\d{1,30}', brand):
        raise ValueError('请填写有效的品牌 ID（brandUserId）')
    start, end = str(raw.get('start') or ''), str(raw.get('end') or '')
    try:
        for value in (start, end):
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError()
            date.fromisoformat(value)
    except ValueError:
        raise ValueError('请选择有效的开始日期和结束日期') from None
    if start > end:
        raise ValueError('开始日期不能晚于结束日期')
    products = raw.get('products')
    if not isinstance(products, list) or not 1 <= len(products) <= 20:
        raise ValueError('请填写 1～20 个产品，每行填写 SPU ID 和产品名称')
    cleaned, seen = [], set()
    for item in products:
        if not isinstance(item, dict):
            raise ValueError('产品格式不正确')
        identity, name = str(item.get('id') or '').strip(), str(item.get('name') or '').strip()
        if not re.fullmatch(r'\d{1,30}', identity) or not 1 <= len(name) <= 100:
            raise ValueError('每个产品必须包含数字 SPU ID 和最多 100 字的名称')
        if identity in seen:
            raise ValueError('SPU ID 不可重复')
        seen.add(identity)
        cleaned.append({'id': identity, 'name': name})
    return {'brandUserId': brand, 'start': start, 'end': end, 'products': cleaned}


async def collect(run, post, output, save, max_bytes):
    params = run['params']
    rows, summary = [], []
    duplicate_ids = duplicate_rows = unique_notes = 0
    for product_index, product in enumerate(params['products']):
        records, locations, page_signatures = [], [], set()
        expected, page = None, 1
        try:
            while True:
                body = {
                    'brandUserId': params['brandUserId'], 'spuId': product['id'],
                    'startDate': params['start'], 'endDate': params['end'], 'quickTab': 'custom',
                    'noteId': '', 'creator': '', 'noteTitle': '', 'noteEcomStatus': '',
                    'ecomStatus': '', 'noteType': '', 'noteSource': ['1','2','6','5','3','10','11','12'],
                    'dynamicsEffect': False, 'pageNum': page, 'pageSize': PAGE_SIZE,
                    'sorts': [{'column':'pushTime','sort':'asc'}],
                    'columns': ['noteTitle','pushTime','noteStatus','brandAccountName','interestCost',
                                'interestCostGrowth','ctr','ctrGrowth','impNum','readNum','noteId'],
                }
                result = await post(PATH, body)
                if not isinstance(result, dict) or result.get('code') != 0 or result.get('success') is False:
                    raise RuntimeError('灵犀接口未成功返回，请检查登录状态和产品权限')
                data = result.get('data')
                if not isinstance(data, dict) or not isinstance(data.get('list'), list):
                    raise RuntimeError('灵犀返回的数据结构无效')
                total, size = data.get('total'), data.get('pageSize')
                if type(total) is not int or total < 0 or total > 100000:
                    raise RuntimeError('灵犀总数无效或超过单产品 100000 条上限')
                if data.get('pageNum') != page or type(size) is not int or size < 1:
                    raise RuntimeError('灵犀返回页码或每页条数无效')
                if expected is None:
                    expected = total
                elif total != expected:
                    raise RuntimeError('采集期间总数变化，请重新采集')
                items = data['list']
                if not items and len(records) < expected:
                    raise RuntimeError('分页提前结束，数据不完整')
                # Repeated IDs are valid raw records; an identical entire page is
                # still evidence that pagination may not be advancing.
                signature = hashlib.sha256(json.dumps(items, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                if items and signature in page_signatures:
                    raise RuntimeError('平台重复返回完全相同的一整页，分页可能未推进，请重试')
                page_signatures.add(signature)
                for row_index, item in enumerate(items, 1):
                    identity = str(item.get('noteId') or '') if isinstance(item, dict) else ''
                    if not identity:
                        raise RuntimeError(f'第 {row_index} 条记录缺少笔记 ID，数据无法核对')
                    records.append(item)
                    locations.append((page, row_index))
                if len(records) > expected or len(rows) + len(records) > 100000:
                    raise RuntimeError('返回数量异常或超过单次 100000 条上限')
                run.update(stage=f"{product['name']}：第 {page} 页，已读取 {len(records)} / {expected} 条")
                save(run)
                if len(records) == expected:
                    break
                if page >= (expected + size - 1) // size:
                    raise RuntimeError('分页条数与接口总数不一致')
                page += 1
                await asyncio.sleep(.5)
            counts = Counter(str(item['noteId']) for item in records)
            duplicate_count = sum(count > 1 for count in counts.values())
            marked_rows = sum(count for count in counts.values() if count > 1)
            duplicate_ids += duplicate_count
            duplicate_rows += marked_rows
            unique_notes += len(counts)
            warning = f'{duplicate_count} 个笔记ID重复，涉及 {marked_rows} 行；保留原始记录，未去重或合并指标' if duplicate_count else ''
            for item, (source_page, source_row) in zip(records, locations):
                count = counts[str(item['noteId'])]
                rows.append([product['name'], product['id'], params['start'], params['end']]
                            + [item.get(key, '') for key, _ in FIELDS]
                            + ['同产品笔记ID重复，保留原始记录' if count > 1 else '', count, source_page, source_row])
            summary.append([product['name'], product['id'], expected, len(records), '完成', '', len(counts), duplicate_count, marked_rows, warning])
        except Exception as exc:
            # Never publish an incomplete product as a complete set.
            error = f'第 {page} 页：{exc}'
            run['failures'].append({'item': product['name'], 'error': error})
            summary.append([product['name'], product['id'], expected, 0, '失败', error, None, None, None, ''])
        run['processed'] = product_index + 1
        save(run)
    wb = Workbook()
    ws = wb.active
    ws.title = '内容数据'
    ws.append(HEADERS)
    for row in rows:
        ws.append(row)
    audit = wb.create_sheet('采集记录')
    audit.append(AUDIT_HEADERS)
    for item in summary:
        audit.append(item)
    for sheet in wb:
        for row in sheet:
            for cell in row:
                if isinstance(cell.value, str):
                    cell.data_type = 's'
    wb.save(output)
    wb.close()
    if output.stat().st_size > max_bytes:
        output.unlink()
        raise RuntimeError('导出文件超过服务器输出上限')
    failures = len(run['failures'])
    successful = len(summary) - failures
    run.update(columns=HEADERS[:], rows=rows[:30], rowCount=len(rows),
               sheets=[{'name':'内容数据','columns':HEADERS[:],'rows':rows[:30],'count':len(rows)},
                       {'name':'采集记录','columns':AUDIT_HEADERS[:],
                        'rows':summary,'count':len(summary)}],
               outputFile=str(output), status='partial' if failures and successful else 'failed' if failures else 'complete',
               stage=f'已导出 {len(rows)} 条，{successful} 个产品完成，{failures} 个失败', dataSource='api',
               duplicateIdCount=duplicate_ids, duplicateRowCount=duplicate_rows, uniqueNoteCount=unique_notes)
    save(run)
