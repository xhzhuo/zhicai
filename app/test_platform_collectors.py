"""Local API tests and real Chromium tests with synthetic platform responses only."""
import asyncio
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import AsyncMock
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from app import main, auth, platform_collectors as pc


def workbook(**changes):
    row = dict(zip(pc.HEADERS, ['测试任务','是','笔记','测试词','不限','近7天','','','不限','不限','不限','不限','高曝光',3]))
    row.update(changes)
    wb=Workbook();ws=wb.active;ws.title='筛选条件';ws.append(pc.HEADERS);ws.append([row[key] for key in pc.HEADERS])
    stream=io.BytesIO();wb.save(stream);return stream.getvalue()


class CollectorApiTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ, {'ZHICAI_DEPLOYMENT':'local'})
        self.env.start()
        # Keep exercising retained adapters when temporarily re-enabled.
        self.availability=patch.object(main,'DISABLED_TOOLS',set());self.availability.start()
        self.client=TestClient(main.app, base_url='http://127.0.0.1:8765',client=('127.0.0.1',50000))

    def tearDown(self):
        self.availability.stop()
        self.env.stop()

    def test_urls_do_not_accept_other_hosts_or_embedded_credentials(self):
        self.assertEqual(pc.platform_url(''), 'https://ad.xiaohongshu.com/')
        for value in ('https://evil.test/', 'https://ad.xiaohongshu.com.evil.test/',
                      'https://user:secret@ad.xiaohongshu.com/', 'http://ad.xiaohongshu.com/',
                      'https://ad.xiaohongshu.com:9999/'):
            with self.assertRaises(ValueError):pc.platform_url(value)

    def test_adgroups_dates_replace_browser_modes(self):
        params=main.validate_params('adgroups',{})
        self.assertEqual(params['start'],params['end'])
        self.assertEqual(main.validate_params('adgroups',{'start':'2026-10-01','end':'2026-10-19'}),{'start':'2026-10-01','end':'2026-10-19'})
        for raw in ({'mode':'current'},{'pageUrl':'https://ad.xiaohongshu.com/'},{'start':'2026-10-01'},{'start':'2026-10-20','end':'2026-10-19'}):
            with self.assertRaises(ValueError):main.validate_params('adgroups',raw)

    def test_inline_inspection_does_not_create_a_run(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(main,'RUNS',Path(temp)), \
             patch.object(auth,'require_tool',return_value={'id':'u','team_id':'one'}), \
             patch.object(main,'account_get',return_value={'id':'account','service':'jug','disabled':False}), \
             patch.object(main,'check_disk_space'),patch.object(main,'submit_run') as submit, \
             patch.object(main,'save_run') as save,patch.object(main.task_control,'tasks',{}), \
             patch.object(main.task_control,'run_lock',asyncio.Lock()),patch.dict(main.locks,{'jug':asyncio.Lock()}), \
             patch.object(main,'read_adgroup_page_summary',new=AsyncMock(return_value={'websiteTotal':25,'currentPageCount':10,'collectedCount':0})) as read:
            response=self.client.post('/api/adgroups/inspect',json={'accountId':'account'})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json(),{'websiteTotal':25,'currentPageCount':10})
            self.assertEqual(read.await_args.args[0],'account')
            self.assertEqual(set(read.await_args.args[1]),{'start','end'})
            submit.assert_not_called();save.assert_not_called()
            self.assertEqual(list(Path(temp).iterdir()),[])

    def test_inline_inspection_checks_permissions_and_url(self):
        with patch.object(auth,'require_tool',side_effect=HTTPException(403,'无权限')):
            response=self.client.post('/api/adgroups/inspect',json={})
            self.assertEqual(response.status_code,403)
        with patch.object(auth,'require_tool',return_value={'id':'u','team_id':'one'}), \
             patch.object(main,'read_adgroup_page_summary',new=AsyncMock()) as read:
            self.assertEqual(self.client.post('/api/adgroups/inspect',json={'start':'2026-10-01'}).status_code,422)
            self.assertEqual(self.client.post('/api/adgroups/inspect',json={'start':'2026-02-30','end':'2026-03-01'}).status_code,422)
            read.assert_not_awaited()
        with patch.object(main,'assert_local'),patch.object(auth,'require_tool',return_value={'id':'u','team_id':'one'}), \
             patch.object(auth,'server_mode',return_value=True),patch.object(main,'account_get',return_value={'id':'a','teamId':'other'}):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(main.inspect_adgroup_page(main.AdgroupInspectInput(),object()))
            self.assertEqual(caught.exception.status_code,403)

    def test_inline_inspection_shares_browser_slot_and_reports_failure(self):
        with patch.object(auth,'require_tool',return_value={'id':'u','team_id':'one'}), \
             patch.object(main,'account_get',return_value={'id':'a','service':'jug','disabled':False}), \
             patch.object(main,'check_disk_space'),patch.object(main.task_control,'tasks',{'running':object()}), \
             patch.object(main,'read_adgroup_page_summary',new=AsyncMock()) as read:
            self.assertEqual(self.client.post('/api/adgroups/inspect',json={}).status_code,409)
            read.assert_not_awaited()
        with patch.object(auth,'require_tool',return_value={'id':'u','team_id':'one'}), \
             patch.object(main,'account_get',return_value={'id':'a','service':'jug','disabled':False}), \
             patch.object(main,'check_disk_space'),patch.object(main.task_control,'tasks',{}), \
             patch.object(main.task_control,'run_lock',asyncio.Lock()),patch.dict(main.locks,{'jug':asyncio.Lock()}), \
             patch.object(main,'read_adgroup_page_summary',new=AsyncMock(side_effect=RuntimeError('未找到广告组表格'))):
            response=self.client.post('/api/adgroups/inspect',json={})
            self.assertEqual(response.status_code,422)
            self.assertEqual(response.json()['detail'],'未找到广告组表格')

    def test_workbook_validation(self):
        tasks=pc.read_tasks(workbook())
        self.assertEqual(tasks[0]['关键词'], '测试词')
        self.assertEqual(tasks[0]['最多笔记数'], 3)
        for changes in ({'启用':'否'}, {'最多笔记数':1.5}, {'发布时间':'自定义'},
                        {'开始日期':'2026-10-01'}, {'搜索类型':'错误'}):
            with self.assertRaises(ValueError):pc.read_tasks(workbook(**changes))

    def test_inspection_and_template_require_new_permission(self):
        with patch.object(auth,'require_tool',side_effect=HTTPException(403,'无工具权限')):
            self.assertEqual(self.client.get('/api/plaza/template').status_code,403)
            self.assertEqual(self.client.post('/api/plaza/inspect',files={'file':('x.xlsx',workbook())}).status_code,403)
        with patch.object(auth,'require_tool',return_value={'id':'test','team_id':'t'}):
            response=self.client.post('/api/plaza/inspect',files={'file':('x.xlsx',workbook())})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['taskCount'],1)
            self.assertEqual(self.client.post('/api/plaza/inspect',files={'file':('x.txt',b'bad')}).status_code,422)
            self.assertEqual(self.client.get('/api/plaza/template').status_code,200)

    def test_new_runs_use_existing_scheduler_and_uploaded_file(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(main,'RUNS',Path(temp)), \
             patch.object(main,'account_get',return_value={'id':'test-account','service':'jug','disabled':False,'alias':'测试连接','pageLink':'https://ad.xiaohongshu.com/aurora/ad/manage/campaigngroup?vSellerId='+'a'*24}), \
             patch.object(main,'submit_run') as submit, patch.object(main.task_control,'check'), \
             patch.object(main,'check_disk_space'), patch.object(auth,'require_tool',return_value={'id':'test','team_id':'t'}):
            response=self.client.post('/api/runs',json={'tool':'adgroups','accountId':'test-account','params':{}})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(submit.call_args[0][0]['tool'],'adgroups')
            response=self.client.post('/api/plaza/runs',data={'account_id':'test-account','collect_comments':'true'},files={'file':('x.xlsx',workbook())})
            self.assertEqual(response.status_code,200,response.text)
            run=submit.call_args[0][0]
            self.assertTrue(run['params']['collectComments'])
            self.assertEqual((Path(temp)/run['id']/'筛选条件.xlsx').read_bytes(),workbook())

    def test_plaza_run_is_scoped_to_selected_account(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(main,'RUNS',Path(temp)), \
             patch.object(auth,'server_mode',return_value=True),patch.object(main,'check_disk_space'), \
             patch.object(main.task_control,'check'),patch.object(main,'submit_run') as submit:
            for seller in ('a'*24,'b'*24):
                account={'id':'test','teamId':'one','service':'jug','disabled':False,'alias':'test',
                         'pageLink':'https://ad.xiaohongshu.com/aurora/ad/manage/campaign?vSellerId='+seller}
                with patch.object(main,'account_get',return_value=account):
                    main.enqueue_platform_collection({'id':'u','team_id':'one'},'test','plaza',{'tasks':[]})
                self.assertEqual(submit.call_args[0][0]['params']['pageUrl'],
                    'https://ad.xiaohongshu.com/microapp/creativity/ugc?vSellerId='+seller)

    def test_cross_team_account_cannot_be_used(self):
        with patch.object(auth,'server_mode',return_value=True), patch.object(main,'account_get',return_value={'teamId':'other'}):
            with self.assertRaises(HTTPException) as caught:
                main.enqueue_platform_collection({'id':'u','team_id':'one'},'a','adgroups',{})
            self.assertEqual(caught.exception.status_code,403)

    def test_native_result_counts_preview_and_ownership(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);run_id='c'*32;folder=root/run_id;folder.mkdir()
            output=folder/'结果.xlsx'
            wb=Workbook();ws=wb.active;ws.title='data';ws.append(['笔记ID'])
            for i in range(45):ws.append([str(10000000000000000000+i)])
            audit=wb.create_sheet('采集记录');audit.append(['任务序号','任务名称','状态','说明']);audit.append([1,'任务','部分结果','达到上限'])
            wb.save(output)
            run={'id':run_id,'tool':'plaza','rows':[],'columns':[],'sheets':[],'failures':[], 'ownerUserId':'owner'}
            pc.import_result(run,output,200000)
            self.assertEqual(run['rowCount'],45);self.assertEqual(len(run['rows']),30)
            self.assertEqual(run['status'],'partial')
            with patch.object(main,'RUNS',root), patch.object(main,'read_run',return_value=run):
                response=self.client.get('/api/runs/'+run_id)
                self.assertEqual(response.json()['rowCount'],45)
                self.assertTrue(response.json()['outputReady'])
                self.assertEqual(self.client.get('/api/runs/'+run_id+'/download').status_code,200)
                with patch.object(main,'assert_local'), patch.object(auth,'server_mode',return_value=True), patch.object(auth,'user_from_request',return_value={'id':'other','role':'member'}):
                    with self.assertRaises(HTTPException) as caught:
                        main.download(run_id,object())
                    self.assertEqual(caught.exception.status_code,404)


class BrowserCollectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_closes_collection_browser(self):
        entered=asyncio.Event()
        async def pending(*args,**kwargs):
            entered.set();await asyncio.Event().wait()
        context=SimpleNamespace(pages=[SimpleNamespace(goto=pending)],close=AsyncMock())
        playwright=SimpleNamespace(stop=AsyncMock())
        with tempfile.TemporaryDirectory() as temp, patch.object(pc,'extension_browser',new=AsyncMock(return_value=(playwright,context,None))):
            task=asyncio.create_task(pc.collect({'tool':'adgroups','params':{'pageUrl':'https://ad.xiaohongshu.com/'}},[],Path(temp),lambda _:None,1000))
            await entered.wait();task.cancel()
            with self.assertRaises(asyncio.CancelledError):await task
        context.close.assert_awaited_once();playwright.stop.assert_awaited_once()

    async def test_plaza_login_page_fails_before_upload_or_export(self):
        filter_locator=SimpleNamespace(wait_for=AsyncMock(side_effect=TimeoutError('not found')))
        body=SimpleNamespace(inner_text=AsyncMock(return_value='短信登录 账号登录'))
        seen=[]
        def locator(selector):
            seen.append(selector)
            if selector=='.ugc-content-filter-wrap':return filter_locator
            if selector=='body':return body
            raise AssertionError('Should not upload or export on a login page: '+selector)
        page=SimpleNamespace(url='https://ad.xiaohongshu.com/',locator=locator)
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError,'Cookie 未能恢复登录'):
                await pc.collect_plaza({'params':{'collectComments':False}},page,Path(temp),Path(temp)/'out.xlsx',lambda _:None)
            self.assertFalse((Path(temp)/'out.xlsx').exists())
        self.assertEqual(seen,['.ugc-content-filter-wrap','body'])

    async def test_original_adgroups_pagination_and_text_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            p,context,worker=await pc.extension_browser([], 'adgroups', str(Path(temp)/'profile'))
            try:
                calls=[]
                async def route(request_route):
                    request=request_route.request
                    if '/fixture-api' in request.url:
                        page=int(json.loads(request.post_data)['page'])
                        calls.append(page)
                        record={'campaignGroupId':str(12345678901234567890000+page),'campaignGroupName':'组'+str(page),'enable':1}
                        await request_route.fulfill(json={'data':{'list':[record],'totalCount':2,'totalPage':2,'currentPage':page}})
                    else:
                        await request_route.fulfill(content_type='text/html; charset=utf-8',body='''<html><body><div style="position:absolute;right:10px;top:10px">TEST_FEEDS</div>
                        <p>合计 2 条记录</p><table><thead><tr><th>广告组</th><th>广告组ID</th><th>广告组状态</th></tr></thead><tbody><tr><td>组1</td><td>12345678901234567890001</td><td>有效</td></tr></tbody></table>
                        <script>setTimeout(()=>fetch('/fixture-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:1})}),300)</script></body></html>''')
                await context.route('https://ad.xiaohongshu.com/**', route)
                page=context.pages[0]
                await page.goto('https://ad.xiaohongshu.com/fixture')
                await asyncio.sleep(1)
                run={'processed':0,'total':1}
                output=Path(temp)/'output.xlsx'
                inspection={'params':{'mode':'inspect'},'processed':0,'total':1}
                inspect_output=Path(temp)/'inspect.xlsx'
                await pc.collect_adgroups(inspection,page,worker,inspect_output,lambda _:None)
                self.assertEqual(inspection['adgroupState']['websiteTotal'],2)
                self.assertEqual(inspection['adgroupState']['currentPageCount'],1)
                self.assertEqual(inspection['adgroupState']['collectedCount'],0)
                self.assertFalse(inspect_output.exists())
                self.assertEqual(calls,[1])
                current={'params':{'mode':'current'},'processed':0,'total':1}
                current_output=Path(temp)/'current.xlsx'
                await pc.collect_adgroups(current,page,worker,current_output,lambda _:None)
                self.assertEqual(current['adgroupState']['collectedCount'],1)
                self.assertFalse(current['adgroupState']['allCollected'])
                wb=load_workbook(current_output);self.assertEqual(len(list(wb.active.values)),2);wb.close()
                self.assertEqual(calls,[1])
                diagnostic={'params':{'mode':'diagnostics'}}
                await pc.collect_adgroups(diagnostic,page,worker,Path(temp)/'diagnostics.xlsx',lambda _:None)
                self.assertTrue(diagnostic['diagnostics'])
                self.assertEqual(diagnostic['status'],'complete')
                await pc.collect_adgroups(run,page,worker,output,lambda _:None)
                wb=load_workbook(output);rows=list(wb.active.values);wb.close()
                self.assertEqual(len(rows),3)
                self.assertIn('12345678901234567890001',str(rows))
                self.assertEqual(calls,[1,1,2])
                # A changed page total must block any subsequent incomplete export.
                await page.locator('p').evaluate("e=>e.textContent='合计 3 条记录'")
                with self.assertRaises(RuntimeError):
                    await pc.collect_adgroups(run,page,worker,Path(temp)/'blocked.xlsx',lambda _:None)
                self.assertFalse((Path(temp)/'blocked.xlsx').exists())
            finally:
                await context.close();await p.stop()

    async def test_plaza_original_engine_export_and_audit(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            assets=root/'assets';shutil.copytree(pc.ASSETS,assets)
            # A deterministic site adapter replaces only third-party DOM controls.
            # The source workbook parser, capture, Collector, controller and writer are real.
            (assets/'plaza/site-adapter.js').write_text('''globalThis.XHSSiteAdapter={available:()=>true,apply:async t=>{if(t.关键词==='__FAIL__')throw Error('筛选控件定位失败');return {button:document.querySelector('#search'),validate:async()=>({关键词:t.关键词})};}};''')
            with patch.object(pc,'ASSETS',assets):
                p,context,worker=await pc.extension_browser([], 'plaza', str(root/'profile'))
                try:
                    async def route(request_route):
                        if '/fixture-api' in request_route.request.url:
                            await request_route.fulfill(json={'success':True,'code':0,'data':{'cooperationCodeNoteDtoList':[{'noteId':'abcdef123456789012345678','title':'测试笔记','cmtNum':0}],'pageRespDTO':{'totalCount':1,'pageIndex':1}}})
                        else:
                            await request_route.fulfill(content_type='text/html; charset=utf-8',body='''<html><body><div class="ugc-content-filter-wrap">筛选条件</div><button id="search" onclick="fetch('/fixture-api').then(r=>r.json())">搜索</button></body></html>''')
                    await context.route('https://ad.xiaohongshu.com/**',route)
                    page=context.pages[0]
                    await page.goto('https://ad.xiaohongshu.com/microapp/creativity/ugc')
                    (root/'筛选条件.xlsx').write_bytes(workbook())
                    run={'params':{'collectComments':True},'total':1}
                    output=root/'output.xlsx'
                    await pc.collect_plaza(run,page,root,output,lambda _:None)
                    result={'failures':[]}
                    pc.import_result(result,output,200000)
                    self.assertEqual(result['status'],'complete')
                    self.assertEqual(result['rowCount'],1)
                    self.assertEqual([s['name'] for s in result['sheets']],['data','评论明细','评论词云','评论采集记录','采集记录'])
                    self.assertIn('abcdef123456789012345678',str(result['rows']))
                    await page.reload()
                    (root/'筛选条件.xlsx').write_bytes(workbook(**{'关键词':'__FAIL__'}))
                    failed={'params':{'collectComments':False},'total':1}
                    blocked=root/'failed.xlsx'
                    with self.assertRaisesRegex(RuntimeError,'筛选控件定位失败'):
                        await pc.collect_plaza(failed,page,root,blocked,lambda _:None)
                    self.assertFalse(blocked.exists())
                    self.assertEqual(failed['collectionAudit'][0]['state'],'失败')

                finally:
                    await context.close();await p.stop()


if __name__=='__main__':unittest.main()
