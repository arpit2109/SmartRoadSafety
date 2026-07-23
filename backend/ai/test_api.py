from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from ai.models import AIModel

User = get_user_model()

class AIModelAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'admin@example.com', '9999999999', 'password')
        self.user = User.objects.create_user('user', 'user@example.com', '8888888888', 'password')
        self.list_url = reverse('ai-model-list')
        
        dummy_file = SimpleUploadedFile("test.pt", b"file_content", content_type="application/octet-stream")
        self.model1 = AIModel.objects.create(
            name="Helmet v1",
            category=AIModel.Category.HELMET,
            version="1.0",
            weight_file=dummy_file
        )
        self.detail_url = reverse('ai-model-detail', args=[self.model1.id])

    def test_list_models_anonymous(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_models_authenticated(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_upload_model_regular_user_forbidden(self):
        self.client.force_authenticate(user=self.user)
        dummy_file = SimpleUploadedFile("new.pt", b"file_content", content_type="application/octet-stream")
        data = {
            "name": "Helmet v2",
            "category": "helmet",
            "version": "2.0",
            "weight_file": dummy_file
        }
        # In this API, maybe we only allow admins to upload?
        # The prompt says: "anonymous=401, regular user=403 on upload, admin=201"
        # Wait, did we actually implement 403 for regular users? The view probably has IsAdminUser for upload.
        # Let's assume it should be 403 or we need to add the permission class if it fails.
        # We will write the test and see.
        response = self.client.post(self.list_url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_upload_model_admin(self):
        self.client.force_authenticate(user=self.admin)
        dummy_file = SimpleUploadedFile("new.pt", b"file_content", content_type="application/octet-stream")
        data = {
            "name": "Helmet v2",
            "category": "helmet",
            "version": "2.0",
            "weight_file": dummy_file,
            "classes": '["helmet", "no_helmet"]'
        }
        response = self.client.post(self.list_url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AIModel.objects.count(), 2)

    def test_patch_model(self):
        self.client.force_authenticate(user=self.admin)
        data = {"description": "Updated desc"}
        response = self.client.patch(self.detail_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.model1.refresh_from_db()
        self.assertEqual(self.model1.description, "Updated desc")
