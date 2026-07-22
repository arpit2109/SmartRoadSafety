import os
import requests
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from ai.models import AIModel
from django.conf import settings

class Command(BaseCommand):
    help = 'Downloads standard YOLOv8 models and registers them in the database.'

    def handle(self, *args, **options):
        # We'll use yolov8n.pt as a default model for various categories
        model_url = "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt"
        
        self.stdout.write("Downloading yolov8n.pt...")
        response = requests.get(model_url, stream=True)
        response.raise_for_status()
        
        content = response.content

        categories = [
            ("Vehicle Detector", AIModel.Category.VEHICLE),
            ("Helmet Detector", AIModel.Category.HELMET),
            ("Bike Detector", AIModel.Category.BIKE)
        ]

        for name, category in categories:
            self.stdout.write(f"Registering {name} ({category})...")
            
            # Check if it already exists
            if AIModel.objects.filter(name=name, version="1.0", category=category).exists():
                self.stdout.write(f"Model {name} already exists. Skipping.")
                continue
                
            model = AIModel(
                name=name,
                category=category,
                version="1.0",
                weight_format=AIModel.WeightFormat.PYTORCH,
                default_confidence=0.25,
                default_iou=0.45,
                is_active=True,
                is_default=True
            )
            
            # This triggers model_upload_path and saves the file in media/models/...
            model.weight_file.save(f"yolov8n_{category}.pt", ContentFile(content))
            model.save()
            
            self.stdout.write(self.style.SUCCESS(f"Successfully registered {name}."))
