from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.utils import IntegrityError
from ai.models import AIModel

class AIModelTests(TestCase):
    def test_create_model(self):
        # Create a dummy file
        dummy_file = SimpleUploadedFile("test.pt", b"file_content", content_type="application/octet-stream")
        model = AIModel.objects.create(
            name="Helmet v1",
            category=AIModel.Category.HELMET,
            version="1.0",
            weight_file=dummy_file,
            classes=["helmet", "no_helmet"],
            description="Test model",
            imgsz=640
        )
        self.assertEqual(model.name, "Helmet v1")
        self.assertEqual(model.classes, ["helmet", "no_helmet"])
        self.assertEqual(model.description, "Test model")
        self.assertEqual(model.imgsz, 640)

    def test_unique_constraint(self):
        dummy_file = SimpleUploadedFile("test.pt", b"file_content", content_type="application/octet-stream")
        AIModel.objects.create(
            name="Helmet v1",
            category=AIModel.Category.HELMET,
            version="1.0",
            weight_file=dummy_file
        )
        with self.assertRaises(IntegrityError):
            AIModel.objects.create(
                name="Helmet v1",
                category=AIModel.Category.HELMET,
                version="1.0",
                weight_file=dummy_file
            )

    def test_defaults(self):
        dummy_file = SimpleUploadedFile("test.pt", b"file_content", content_type="application/octet-stream")
        model = AIModel.objects.create(
            name="Default Model",
            category=AIModel.Category.VEHICLE,
            version="1.0",
            weight_file=dummy_file
        )
        self.assertEqual(model.default_confidence, 0.25)
        self.assertEqual(model.default_iou, 0.45)
        self.assertTrue(model.is_active)
        self.assertFalse(model.is_default)
        self.assertEqual(model.classes, [])
