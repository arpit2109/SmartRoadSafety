import cv2
import numpy as np
from ai.detector import YOLODetector
from ai.model_selector import select_best_model
from django.core.files.uploadedfile import InMemoryUploadedFile

class DetectionService:
    @staticmethod
    def process_image(image_file: InMemoryUploadedFile, model_category: str = None):
        """
        1. Reads uploaded image.
        2. Selects model based on category.
        3. Runs inference.
        4. Returns results.
        """
        # Read the image file into an OpenCV numpy array
        image_bytes = image_file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise ValueError("Invalid image file provided.")

        # 1. Select the AI model
        yolo_model = select_best_model(model_category)
        
        # 2. Instantiate the detector
        detector = YOLODetector(yolo_model)
        
        # 3. Run inference
        results = detector.run_inference(image)
        
        # We could save the annotated_image here to media if we wanted
        # For an API response, we'll return the raw metadata and maybe skip returning 
        # a base64 string unless the frontend requests it. Let's exclude annotated_image
        # from the raw JSON, or we can base64 encode it.
        
        # We will pop annotated_image and return it separately or ignore it.
        annotated_image = results.pop("annotated_image")
        
        # Convert annotated_image to base64 so frontend can display it immediately
        import base64
        _, buffer = cv2.imencode('.jpg', annotated_image)
        encoded_image = base64.b64encode(buffer).decode('utf-8')
        
        results["annotated_image_base64"] = encoded_image
        
        return results
