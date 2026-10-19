"""Temporary disable blocks execution but preserves definitions, grants and history."""
import asyncio
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import main, auth

class ToolAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'ZHICAI_DEPLOYMENT':'local'});self.env.start()
        self.client=TestClient(main.app,base_url='http://127.0.0.1:8765',client=('127.0.0.1',50000))
    def tearDown(self):self.env.stop()

    def test_plaza_is_retained_but_unavailable(self):
        data=self.client.get('/api/meta').json()
        self.assertIn('plaza',data['tools']);self.assertIn('plaza',data['disabledTools'])
        self.assertIn('plaza',auth.TOOLS)
        self.assertTrue((main.ROOT/'tool_assets/plaza/controller.js').is_file())
        self.assertTrue((main.ROOT/'tool_assets/plaza-template.xlsx').is_file())
        main.require_tool_available('adgroups')

    def test_plaza_entrypoints_fail_before_upload_account_or_run_writes(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(main,'RUNS',Path(folder)), \
             patch.object(auth,'require_tool',return_value={'id':'u','team_id':'t'}), \
             patch.object(main,'account_get') as account,patch.object(main,'submit_run') as submit, \
             patch.object(main,'read_plaza_upload',new=AsyncMock()) as upload:
            responses=[self.client.get('/api/plaza/template'),
                self.client.post('/api/plaza/inspect',files={'file':('bad.xlsx',b'bad')}),
                self.client.post('/api/plaza/runs',data={'account_id':'test'},files={'file':('bad.xlsx',b'bad')}),
                self.client.post('/api/runs',json={'tool':'plaza','params':{}})]
            for response in responses:
                self.assertEqual(response.status_code,503,response.text)
                self.assertIn('尚未接入',response.json()['detail'])
            account.assert_not_called();submit.assert_not_called();upload.assert_not_awaited()
            self.assertEqual(list(Path(folder).iterdir()),[])
            with self.assertRaises(HTTPException):main.enqueue_platform_collection({'id':'u'},'a','plaza',{})

    def test_historical_plaza_runs_remain_readable(self):
        record={'id':'f'*32,'tool':'plaza','params':{},'status':'failed','rows':[],'columns':[],
                'sheets':[],'failures':[],'created':'2026-10-19','ended':'2026-10-19','processed':0,'total':1}
        with patch.object(main,'read_run',return_value=record):
            response=self.client.get('/api/runs/'+record['id'])
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json()['tool'],'plaza')

    def test_already_queued_plaza_job_does_not_start_browser(self):
        record={'id':'f'*32,'tool':'plaza','params':{},'failures':[]}
        with patch.object(main,'check_disk_space'),patch.object(main,'read_run',return_value=record), \
             patch.object(main,'save_run') as save,patch.object(main,'execute_platform_collection',new=AsyncMock()) as execute:
            asyncio.run(main.execute(record['id']))
            execute.assert_not_awaited();self.assertEqual(record['status'],'failed')
            self.assertIn('尚未接入',record['failures'][0]['error']);save.assert_called_once()

if __name__=='__main__':unittest.main()
