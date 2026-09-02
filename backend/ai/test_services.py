from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from ai.models import AIModel
from ai.services import set_as_default, deactivate, replace_weight_file
from ai.cache import cache

class AIServicesTests(TestCase):
    def setUp(self):
        dummy_file1 = SimpleUploadedFile("test1.pt", b"file_content", content_type="application/octet-stream")
        dummy_file2 = SimpleUploadedFile("test2.pt", b"file_content", content_type="application/octet-stream")
        
        self.model1 = AIModel.objects.create(
            name="Model 1", category=AIModel.Category.HELMET, version="1.0", weight_file=dummy_file1
        )
        self.model2 = AIModel.objects.create(
            name="Model 2", category=AIModel.Category.HELMET, version="2.0", weight_file=dummy_file2
        )

    def test_set_as_default(self):
        set_as_default(self.model1)
        self.model1.refresh_from_db()
        self.assertTrue(self.model1.is_default)
        
        # Setting model2 as default should unset model1
        set_as_default(self.model2)
        self.model1.refresh_from_db()
        self.model2.refresh_from_db()
        
        self.assertTrue(self.model2.is_default)
        self.assertFalse(self.model1.is_default)

    def test_deactivate_clears_cache(self):
        cache.set(self.model1.pk, "dummy_yolo_instance")
        deactivate(self.model1)
        self.model1.refresh_from_db()
        self.assertFalse(self.model1.is_active)
        self.assertIsNone(cache.get(self.model1.pk))

    def test_replace_weight_file(self):
        old_file_name = self.model1.weight_file.name
        new_file = SimpleUploadedFile("new.pt", b"new_content", content_type="application/octet-stream")
        replace_weight_file(self.model1, new_file)
        
        self.model1.refresh_from_db()
        self.assertNotEqual(self.model1.weight_file.name, old_file_name)
        # Note: In a real environment, we'd also assert the old file is deleted from storage,
        # but Django's default storage doesn't delete files automatically in tests unless configured.
