import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from openpyxl import load_workbook
from . import content_api as api


class ContentTests(unittest.IsolatedAsyncioTestCase):
    def params(self):
        return api.validate({'brandUserId':'181879','start':'2026-10-11','end':'2026-10-18',
                             'products':[{'id':'1562710','name':'安睡'}]})

    def test_validation(self):
        valid = self.params()
        for change in ({'brandUserId':''}, {'start':'2026-02-30'}, {'end':'2026-01-01'},
                       {'products':valid['products']*2}, {'products':[]}):
            with self.assertRaises(ValueError):
                api.validate({**valid, **change})

    async def execute_case(self, pages, products=None):
        params = self.params()
        if products:
            params['products'] = products
        run = {'params':params,'failures':[],'total':len(params['products'])}
        calls = []
        async def post(path, body):
            self.assertEqual(body['sorts'],[{'column':'pushTime','sort':'asc'}])
            calls.append((body['spuId'],body['pageNum']))
            response = pages[len(calls)-1]
            return {'code':0,'success':True,'data':response}
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)/'result.xlsx'
            with patch.object(api.asyncio, 'sleep', new=self.no_wait):
                await api.collect(run, post, output, lambda run:None, 10000000)
            wb = load_workbook(output)
            values = list(wb['内容数据'].values)
            audit = list(wb['采集记录'].values)
            self.assertIsNone(wb['内容数据']['A1'].fill.fgColor.rgb if wb['内容数据']['A1'].fill.patternType else None)
            wb.close()
        return run, calls, values, audit

    async def no_wait(self, seconds):
        pass

    def page(self, index, total, ids):
        return {'pageNum':index,'pageSize':2,'total':total,'list':[{'noteId':i,'noteTitle':'=1+1'} for i in ids]}

    async def test_all_pages_and_actual_page_size(self):
        run,calls,values,audit = await self.execute_case([self.page(1,3,['1','2']),self.page(2,3,['3'])])
        self.assertEqual(calls,[('1562710',1),('1562710',2)])
        self.assertEqual(run['status'],'complete')
        self.assertEqual(run['rowCount'],3)
        self.assertEqual(len(values),4)
        self.assertEqual(audit[1][2:5],(3,3,'完成'))

    async def test_changed_total_or_early_empty_or_missing_id_fails(self):
        for last in (self.page(2,4,['3']),self.page(2,3,[]),self.page(2,3,[''])):
            run,_,values,_ = await self.execute_case([self.page(1,3,['1','2']),last])
            self.assertEqual(run['status'],'failed')
            self.assertEqual(len(values),1)

    async def test_same_page_duplicate_keeps_different_metrics_and_marks_both(self):
        page=self.page(1,2,['same','same'])
        page['list'][0].update(impNum='2949',readNum='543',noteTitle='标题A')
        page['list'][1].update(impNum='0',readNum='0',noteTitle='标题B')
        run,_,values,audit=await self.execute_case([page])
        self.assertEqual(run['status'],'complete')
        self.assertEqual(run['rowCount'],2)
        self.assertEqual(run['duplicateIdCount'],1)
        self.assertEqual(run['duplicateRowCount'],2)
        self.assertEqual(run['uniqueNoteCount'],1)
        exposure=api.HEADERS.index('曝光量')
        self.assertEqual([row[exposure] for row in values[1:]],['2949','0'])
        self.assertEqual([row[-3:] for row in values[1:]],[(2,1,1),(2,1,2)])
        self.assertTrue(all('重复' in row[-4] for row in values[1:]))
        self.assertEqual(audit[1][6:9],(1,1,2))

    async def test_cross_page_duplicate_marks_first_occurrence_too(self):
        run,_,values,_=await self.execute_case([self.page(1,3,['1','2']),self.page(2,3,['2'])])
        self.assertEqual(run['status'],'complete')
        self.assertEqual(run['rowCount'],3)
        self.assertEqual([row[-3] for row in values[1:]],[1,2,2])
        self.assertEqual(run['duplicateRowCount'],2)

    async def test_repeated_identical_whole_page_still_fails(self):
        run,_,values,_=await self.execute_case([self.page(1,4,['1','2']),self.page(2,4,['1','2'])])
        self.assertEqual(run['status'],'failed')
        self.assertIn('一整页',run['failures'][0]['error'])
        self.assertEqual(len(values),1)

    async def test_empty_success(self):
        run,_,values,audit = await self.execute_case([self.page(1,0,[])])
        self.assertEqual(run['status'],'complete')
        self.assertEqual(len(values),1)

    async def test_partial_preserves_cross_product_notes(self):
        products=[{'id':'1','name':'A'},{'id':'2','name':'B'},{'id':'3','name':'C'}]
        run,_,values,audit = await self.execute_case([self.page(1,1,['same']),self.page(1,1,['same']),self.page(1,1,[])],products)
        self.assertEqual(run['status'],'partial')
        self.assertEqual(run['rowCount'],2)
        self.assertEqual(values[1][4],values[2][4])
        self.assertEqual(run['duplicateIdCount'],0)
        self.assertEqual(run['duplicateRowCount'],0)

    def test_parse_options(self):
        brand={'code':0,'data':{'brandList':[{'brandId':'181879','selected':True}]}}
        products={'code':0,'data':{'spuList':[{'name':'安睡','code':'1562710','enable':True}]}}
        self.assertEqual(api.parse_options(brand,products),('181879',[{'id':'1562710','name':'安睡'}]))
        with self.assertRaises(ValueError):
            api.parse_options({'code':0,'data':{'brandList':[]}},products)


class ContentRouteTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from . import main
        self.main = main
        self.client = TestClient(main.app, base_url='http://127.0.0.1:8765',client=('127.0.0.1',50000))
        session = patch.object(main.auth, 'session_from_cookie', return_value=({'id':'u','team_id':'t','status':'active','role':'member'}, 'test'))
        csrf = patch.object(main.auth, 'check_csrf', return_value=True)
        session.start();csrf.start()
        self.addCleanup(session.stop);self.addCleanup(csrf.stop)

    def test_options_rejects_other_team_without_platform_call(self):
        main = self.main
        with patch.object(main.auth,'server_mode',return_value=True), \
             patch.object(main.auth,'require_tool',return_value={'id':'u','team_id':'t'}), \
             patch.object(main,'account_get',return_value={'id':'a','teamId':'other','service':'lingxi','disabled':False}), \
             patch.object(main,'platform_post',new=AsyncMock()) as post:
            response=self.client.post('/api/content/options',json={'accountId':'a'})
            self.assertEqual(response.status_code,403)
            post.assert_not_awaited()

    def test_options_requires_tool_permission(self):
        from fastapi import HTTPException
        main = self.main
        with patch.object(main.auth,'require_tool',side_effect=HTTPException(403,'未授权')), \
             patch.object(main,'platform_post',new=AsyncMock()) as post:
            response=self.client.post('/api/content/options',json={'accountId':'a'})
            self.assertEqual(response.status_code,403)
            post.assert_not_awaited()

    def test_options_rejects_jug_account(self):
        main=self.main
        with patch.object(main.auth,'server_mode',return_value=True), \
             patch.object(main.auth,'require_tool',return_value={'id':'u','team_id':'t'}), \
             patch.object(main,'account_get',return_value={'id':'a','teamId':'t','service':'jug','disabled':False}), \
             patch.object(main,'platform_post',new=AsyncMock()) as post:
            response=self.client.post('/api/content/options',json={'accountId':'a'})
            self.assertEqual(response.status_code,422)
            post.assert_not_awaited()
