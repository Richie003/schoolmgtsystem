"""Staff attaching / removing a question's image via the multipart action."""

import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from tests.test_cbt import CbtFixtureMixin

_MEDIA = tempfile.mkdtemp(prefix='qimg-test-')


def _png(name='q.png'):
    buf = BytesIO()
    Image.new('RGB', (12, 12), 'red').save(buf, 'PNG')
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/png')


@override_settings(MEDIA_ROOT=_MEDIA)
class QuestionImageTests(CbtFixtureMixin, TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.question = self.questions[0]

    def _url(self):
        return f'/api/cbt/questions/{self.question.id}/image/'

    def test_upload_then_remove(self):
        self.client.force_authenticate(self.admin)

        resp = self.client.post(self._url(), {'image': _png()}, format='multipart')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['image'])
        self.question.refresh_from_db()
        self.assertTrue(self.question.image)

        resp = self.client.delete(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['image'])
        self.question.refresh_from_db()
        self.assertFalse(self.question.image)

    def test_rejects_non_image(self):
        self.client.force_authenticate(self.admin)
        bad = SimpleUploadedFile('x.txt', b'not an image', content_type='text/plain')
        resp = self.client.post(self._url(), {'image': bad}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    def test_student_cannot_upload(self):
        self.client.force_authenticate(self.student_user)
        resp = self.client.post(self._url(), {'image': _png()}, format='multipart')
        self.assertEqual(resp.status_code, 403)

    def test_other_school_question_is_not_found(self):
        from accounts.models import Role, User

        outsider = User.objects.create_user(
            username='outstaff', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.other_school,
        )
        self.client.force_authenticate(outsider)
        resp = self.client.post(self._url(), {'image': _png()}, format='multipart')
        self.assertEqual(resp.status_code, 404)
