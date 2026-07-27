"""
YOLODetector — wraps a loaded YOLO instance for inference.

Usage:
    from ai.model_loader import load_model_by_id
    from ai.detector import YOLODetector

    yolo = load_model_by_id(5)
    detector = YOLODetector(yolo)
    result = detector.run_inference(image_np, conf=0.25, iou=0.45)
"""
from __future__ import annotations

import logging
import time
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class YOLODetector:
    """
    Runs YOLO inference on a NumPy image and returns structured results.
    """

    def __init__(self, yolo_model) -> None:
        self.model = yolo_model

    def run_inference(
        self,
        image: np.ndarray,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
    ) -> dict[str, Any]:
        """
        Run inference on ``image`` (BGR NumPy array) and return structured results.

        Returns
        -------
        dict
            {
                "detections": [ { "bbox", "confidence", "class_id", "class_name" }, ... ],
                "object_count": int,
                "inference_time_ms": float,
                "annotated_image": np.ndarray,   # BGR, same shape as input
            }
        """
        start = time.perf_counter()
        results = self.model.predict(
            source=image,
            conf=conf_threshold,
            iou=iou_threshold,
            verbose=False,
        )
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

        result = results[0]  # single-image input → list of length 1

        detections = []
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            class_id = int(box.cls[0])
            class_name = self.model.names[class_id]

            detections.append({
                "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                "confidence": round(conf, 4),
                "class_id": class_id,
                "class_name": class_name,
            })

        annotated_image = result.plot()

        if detections:
            logger.info(
                "Detection complete: %d objects in %.1fms",
                len(detections),
                elapsed_ms,
            )
        else:
            logger.info("Detection complete: no objects detected in %.1fms", elapsed_ms)

        return {
            "detections": detections,
            "object_count": len(detections),
            "inference_time_ms": elapsed_ms,
            "annotated_image": annotated_image,
        }

    @staticmethod
    def draw_boxes(
        image: np.ndarray,
        detections: list[dict],
        color_map: dict[str, tuple[int, int, int]] | None = None,
    ) -> np.ndarray:
        """
        Draw bounding boxes and labels onto ``image``.
        Returns a copy — does not mutate the original.
        """
        if color_map is None:
            color_map = {}

        canvas = image.copy()
        h, w = canvas.shape[:2]

        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            label = det["class_name"]
            conf = det["confidence"]

            # Clamp coords to image boundaries
            x1 = max(0, min(w - 1, int(x1)))
            y1 = max(0, min(h - 1, int(y1)))
            x2 = max(0, min(w - 1, int(x2)))
            y2 = max(0, min(h - 1, int(y2)))

            color = color_map.get(label, (0, 255, 0))  # default green

            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)

            text = f"{label} {conf * 100:.0f}%"
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = max(0.4, min(0.8, w / 1200))
            thickness = 1

            (tw, th), _ = cv2.getTextSize(text, font, font_scale, thickness)
            cv2.rectangle(
                canvas,
                (x1, y1 - th - 4),
                (x1 + tw + 4, y1),
                color,
                -1,
            )
            cv2.putText(
                canvas,
                text,
                (x1 + 2, y1 - 2),
                font,
                font_scale,
                (255, 255, 255),
                thickness,
            )

        return canvas
