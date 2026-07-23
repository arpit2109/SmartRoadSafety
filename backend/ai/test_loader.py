from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock
from ai.models import AIModel
from ai.model_loader import load_model, ModelNotFound, ModelLoadError
from ai.cache import cache

class ModelLoaderTests(TestCase):
    def setUp(self):
        dummy_file = SimpleUploadedFile("test.pt", b"file_content", content_type="application/octet-stream")
        self.model = AIModel.objects.create(
            name="Helmet v1",
            category=AIModel.Category.HELMET,
            version="1.0",
            weight_file=dummy_file
        )
        cache.clear()

    @patch("ai.model_loader._build_framework_instance")
    def test_load_model_caches_instance(self, mock_build):
        mock_instance = MagicMock()
        mock_build.return_value = mock_instance
        
        # First call should hit the build function
        instance1 = load_model("Helmet v1", AIModel.Category.HELMET)
        self.assertEqual(instance1, mock_instance)
        mock_build.assert_called_once()
        
        # Second call should hit cache
        instance2 = load_model("Helmet v1", AIModel.Category.HELMET)
        self.assertEqual(instance2, mock_instance)
        mock_build.assert_called_once() # Call count remains 1

    def test_load_nonexistent_model(self):
        with self.assertRaises(ModelNotFound):
            load_model("Nonexistent Model", AIModel.Category.HELMET)
