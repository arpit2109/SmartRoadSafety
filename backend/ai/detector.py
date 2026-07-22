import cv2
import numpy as np
from typing import Dict, Any, List

class YOLODetector:
    def __init__(self, model):
        """
        Initializes the detector with a loaded YOLO model (from model_loader).
        """
        self.model = model

    def run_inference(self, image: np.ndarray, conf_threshold: float = 0.25, iou_threshold: float = 0.45) -> Dict[str, Any]:
        """
        Runs inference on a numpy array image (e.g. from OpenCV).
        Returns a dict with structured results.
        """
        # The YOLO predict method expects BGR images (which cv2 reads)
        results = self.model.predict(
            source=image, 
            conf=conf_threshold, 
            iou=iou_threshold,
            verbose=False
        )
        
        # We only pass a single image, so results is a list of length 1
        result = results[0]
        
        detections = []
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            class_id = int(box.cls[0])
            class_name = self.model.names[class_id]
            
            detections.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": conf,
                "class_id": class_id,
                "class_name": class_name
            })
            
        annotated_image = result.plot()
            
        return {
            "detections": detections,
            "object_count": len(detections),
            "annotated_image": annotated_image
        }
