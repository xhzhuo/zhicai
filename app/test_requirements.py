import base64
import os
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main, requirements


PNG_1X1 = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/q9sAAAAASUVORK5CYII='
)


class RequirementFlowTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'ZHICAI_DEPLOYMENT': 'local'})
        self.environment.start()
        self.original_db = requirements.DB_PATH
        requirements.DB_PATH = main.DATA / f'test-requirements-{uuid.uuid4().hex}.sqlite3'
        self.local_guard = patch.object(requirements, 'local_only')
        self.local_guard.start()
        self.client = TestClient(main.app, base_url='http://127.0.0.1:8765')

    def tearDown(self):
        self.local_guard.stop()
        for suffix in ('', '-wal', '-shm'):
            Path(str(requirements.DB_PATH) + suffix).unlink(missing_ok=True)
        requirements.DB_PATH = self.original_db
        self.environment.stop()

    def test_new_tool_requires_real_source_location(self):
        payload = {
            'kind': 'new_tool', 'title': '获取行业指标', 'contact': 'owner@example.com',
            'description': '每周整理行业表现', 'expected_result': '每行业每周一行 Excel',
            'platform': 'xhs', 'service': '灵犀', 'desired_data': '搜索量与阅读量'
        }
        response = self.client.post('/api/requirements', data=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn('页面路径', response.json()['detail'])
        self.assertEqual(self.client.get('/api/requirements').json(), [])

    def test_submit_attachment_track_status_and_comment(self):
        payload = {
            'kind': 'new_tool', 'title': '获取行业指标', 'contact': 'owner@example.com',
            'description': '每周整理行业表现', 'expected_result': '每行业每周一行 Excel',
            'platform': 'xhs', 'service': '灵犀', 'desired_data': '搜索量与阅读量',
            'usage_frequency': '每周'
        }
        created = self.client.post('/api/requirements', data=payload,
                                   files=[('attachments', ('location.png', PNG_1X1, 'image/png'))])
        self.assertEqual(created.status_code, 200)
        request_id = created.json()['id']
        self.assertEqual(created.json()['attachmentCount'], 1)
        listing = self.client.get('/api/requirements').json()
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0]['id'], request_id)
        detail = self.client.get(f'/api/requirements/{request_id}').json()
        self.assertEqual(detail['status'], 'submitted')
        self.assertEqual(detail['desired_data'], '搜索量与阅读量')
        attachment_id = detail['attachments'][0]['id']
        download = self.client.get(f'/api/requirements/{request_id}/attachments/{attachment_id}')
        self.assertEqual(download.content, PNG_1X1)
        self.assertEqual(download.headers['x-content-type-options'], 'nosniff')
        self.assertIn('no-store', download.headers['cache-control'])
        changed = self.client.patch(f'/api/requirements/{request_id}/status',
                                    json={'status': 'needs_info', 'note': '请确认日期粒度'})
        self.assertEqual(changed.status_code, 200)
        commented = self.client.post(f'/api/requirements/{request_id}/comments',
                                     json={'content': '需要按周汇总'})
        self.assertEqual(commented.status_code, 200)
        updated = self.client.get(f'/api/requirements/{request_id}').json()
        self.assertEqual(updated['status'], 'needs_info')
        self.assertEqual(len(updated['events']), 2)
        self.assertEqual(updated['comments'][0]['content'], '需要按周汇总')

    def test_existing_requests_do_not_require_contact(self):
        for kind, fields in (
            ('enhancement', {'description': '希望增加筛选', 'expected_result': '支持筛选'}),
            ('problem', {'description': '运行后出现错误'}),
        ):
            with self.subTest(kind=kind):
                response = self.client.post('/api/requirements', data={
                    'kind': kind, 'title': '工具反馈', 'tool_id': 'keywords', **fields
                })
                self.assertEqual(response.status_code, 200, response.text)
                detail = self.client.get(f"/api/requirements/{response.json()['id']}").json()
                self.assertEqual(detail['contact'], '')
                self.assertEqual(detail['description'], fields['description'])

    def test_existing_tool_request_reuses_tool_identity(self):
        payload = {
            'kind': 'enhancement', 'title': '扩展导出列', 'contact': 'owner@example.com',
            'description': '缺少词根归属', 'expected_result': '增加词根列',
            'tool_id': 'keywords', 'platform': 'xhs', 'service': '聚光'
        }
        response = self.client.post('/api/requirements', data=payload)
        self.assertEqual(response.status_code, 200)
        detail = self.client.get(f"/api/requirements/{response.json()['id']}").json()
        self.assertEqual(detail['tool_id'], 'keywords')
        self.assertEqual(detail['platform'], 'xhs')


if __name__ == '__main__':
    unittest.main()
