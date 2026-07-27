"""
Detection API endpoints.

POST /api/detection/image/  — run image detection (IsAuthenticated)
POST /api/detection/auto/   — auto-detect: select best model automatically (IsAuthenticated)
GET  /api/history/           — list detection records (IsAuthenticated, own records only)
GET  /api/history/<id>/     — retrieve single record (IsAuthenticated, own record)
DELETE /api/history/<id>/   — delete a record (IsAuthenticated, own record)
"""
from __future__ import annotations

import logging

from rest_framework import status, viewsets

logger = logging.getLogger(__name__)
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DetectionRecord
from .serializers import (
    DetectionRecordDetailSerializer,
    DetectionRecordListSerializer,
)
from .services import (
    InvalidImageError,
    ModelLoadFailure,
    ModelNotFoundError,
    process_image,
)
from ai.model_selector import select_auto
from ai.model_loader import ModelFileMissing, ModelLoadError, ModelNotFound


# ---------------------------------------------------------------------------
# Detection endpoint
# ---------------------------------------------------------------------------


class ImageDetectionView(APIView):
    """
    POST /api/detection/image/

    Accepts multipart/form-data:
        image     — the image file (required)
        model_id  — primary key of the AIModel to use (required)
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if "image" not in request.FILES:
            return Response(
                {"error": "No image uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model_id = request.data.get("model_id")
        if not model_id:
            return Response(
                {"error": "model_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            model_id = int(model_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "model_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optional detection parameters
        confidence = None
        iou = None
        try:
            if "confidence" in request.data and request.data["confidence"]:
                confidence = float(request.data["confidence"])
            if "iou" in request.data and request.data["iou"]:
                iou = float(request.data["iou"])
        except (TypeError, ValueError):
            pass  # Use model defaults

        try:
            result = process_image(
                request.FILES["image"],
                model_id=model_id,
                user=request.user,
                confidence=confidence,
                iou=iou,
                detection_mode=DetectionRecord.DetectionMode.MANUAL,
            )
            return Response(result, status=status.HTTP_200_OK)
        except ModelNotFoundError:
            return Response(
                {"error": f"No active model found with id={model_id}."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ModelLoadFailure as exc:
            return Response(
                {"error": f"Model could not be loaded: {exc}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except InvalidImageError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"error": f"Detection failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ---------------------------------------------------------------------------
# Auto-detection endpoint
# ---------------------------------------------------------------------------


class AutoDetectionView(APIView):
    """
    POST /api/detection/auto/

    Accepts multipart/form-data:
        image  — the image file (required)

    Automatically selects the best model by running a quick low-confidence
    sweep across all active cached models and picking the one with the most
    detections.
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if "image" not in request.FILES:
            return Response(
                {"error": "No image uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        import base64
        import time
        import uuid
        from pathlib import Path
        import cv2
        import numpy as np
        from django.conf import settings

        image_file = request.FILES["image"]

        # Decode image
        image_file.seek(0)
        image_bytes = image_file.read()
        image_file.seek(0)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return Response(
                {"error": "Uploaded file could not be decoded as an image."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Auto-select best model
        try:
            ai_model, detector, _ = select_auto(image)
        except ModelNotFound:
            return Response(
                {"error": "No models are registered or cached. Ask an admin to register a model."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except (ModelFileMissing, ModelLoadError) as exc:
            return Response(
                {"error": f"No models could be loaded: {exc}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # Full inference with model's default thresholds
        start = time.perf_counter()
        raw = detector.run_inference(
            image,
            conf_threshold=ai_model.default_confidence,
            iou_threshold=ai_model.default_iou,
        )
        elapsed = round(time.perf_counter() - start, 4)
        elapsed_ms = round(elapsed * 1000, 2)

        annotated = raw["annotated_image"]

        # Encode base64
        _, buffer = cv2.imencode(".jpg", annotated)

        # Save annotated image
        uid = uuid.uuid4().hex[:12]
        user_folder = f"user_{request.user.pk}"
        media_root = Path(settings.MEDIA_ROOT)
        dest_dir = media_root / "history" / "results" / user_folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / f"{uid}.jpg"
        relative = dest_path.relative_to(media_root)
        with open(dest_path, "wb") as f:
            f.write(buffer.tobytes())
        result_file_url = f"{settings.MEDIA_URL.rstrip('/')}/{relative.as_posix()}"

        # Create detection record
        record = DetectionRecord.objects.create(
            user=request.user,
            uploaded_file=image_file,
            ai_model=ai_model,
            detection_mode=DetectionRecord.DetectionMode.AUTO,
            confidence_used=ai_model.default_confidence,
            iou_used=ai_model.default_iou,
            detections=raw["detections"],
            object_count=raw["object_count"],
            inference_time_ms=elapsed_ms,
        )

        logger.info(
            "AutoDetection: selected=%s objects=%d time=%.1fms record=%d",
            ai_model.name,
            raw["object_count"],
            elapsed_ms,
            record.pk,
        )

        return Response(
            {
                "id": record.pk,
                "selected_model": {
                    "id": ai_model.pk,
                    "name": ai_model.name,
                    "version": ai_model.version,
                    "category": ai_model.category,
                },
                "detections": raw["detections"],
                "object_count": raw["object_count"],
                "processing_time": elapsed,
                "confidence_used": ai_model.default_confidence,
                "iou_used": ai_model.default_iou,
                "annotated_image_base64": base64.b64encode(buffer).decode("utf-8"),
                "result_file_url": result_file_url,
            }
        )


# ---------------------------------------------------------------------------
# Video detection endpoint
# ---------------------------------------------------------------------------

ALLOWED_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".wmv"}
FRAME_SAMPLE_RATE = 10  # process every Nth frame to keep response time reasonable


class VideoDetectionView(APIView):
    """
    POST /api/detection/video/

    Accepts multipart/form-data:
        video     — the video file (required; .mp4/.avi/.mov/.mkv/.wmv)
        model_id  — primary key of the AIModel to use (required)

    Processes every Nth frame (FRAME_SAMPLE_RATE), aggregates detections,
    and returns summary stats plus the most-detected annotated frame.
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        import tempfile
        import time
        import uuid
        from pathlib import Path
        from collections import Counter

        import cv2
        import numpy as np
        from django.conf import settings
        from ai.detector import YOLODetector
        from ai.model_loader import (
            get_ai_model_by_id,
            load_model_by_id,
        )

        if "video" not in request.FILES:
            return Response(
                {"error": "No video file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model_id = request.data.get("model_id")
        if not model_id:
            return Response(
                {"error": "model_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            model_id = int(model_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "model_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        video_file = request.FILES["video"]
        ext = "." + video_file.name.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_VIDEO_EXTS:
            return Response(
                {"error": f"Unsupported video format '{ext}'. Supported: {', '.join(sorted(ALLOWED_VIDEO_EXTS))}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Load model
        try:
            ai_model = get_ai_model_by_id(model_id)
            yolo = load_model_by_id(model_id)
        except ModelNotFound:
            return Response(
                {"error": f"No active model with id={model_id}."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except (ModelFileMissing, ModelLoadError) as exc:
            return Response(
                {"error": f"Model could not be loaded: {exc}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        detector = YOLODetector(yolo)

        # Write video to a temp file for cv2.VideoCapture
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            for chunk in video_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            cap = cv2.VideoCapture(tmp_path)
            if not cap.isOpened():
                return Response(
                    {"error": "Could not open video file."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)

            all_detections = []
            frame_count = 0
            frames_with_detections = 0
            best_frame_idx = -1
            best_frame_dets = 0
            best_annotated = None

            start = time.perf_counter()

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_count += 1

                # Sample every Nth frame
                if frame_count % FRAME_SAMPLE_RATE != 0:
                    continue

                result = detector.run_inference(
                    frame,
                    conf_threshold=ai_model.default_confidence,
                    iou_threshold=ai_model.default_iou,
                )
                dets = result.get("detections", [])
                all_detections.extend(dets)
                if dets:
                    frames_with_detections += 1
                    if len(dets) > best_frame_dets:
                        best_frame_dets = len(dets)
                        best_frame_idx = frame_count
                        best_annotated = result["annotated_image"]

            cap.release()
            elapsed = round(time.perf_counter() - start, 4)
            elapsed_ms = round(elapsed * 1000, 2)

            total_objects = len(all_detections)

            # Class summary
            class_counts = Counter(d["class_name"] for d in all_detections)
            top_classes = [
                {"class_name": cls, "count": cnt}
                for cls, cnt in class_counts.most_common(10)
            ]

            # Encode the best annotated frame as base64
            if best_annotated is not None:
                _, buffer = cv2.imencode(".jpg", best_annotated)
                encoded = base64.b64encode(buffer).decode("utf-8")
            else:
                encoded = None

            # Save annotated frame to disk
            uid = uuid.uuid4().hex[:12]
            user_folder = f"user_{request.user.pk}"
            media_root = Path(settings.MEDIA_ROOT)
            dest_dir = media_root / "history" / "results" / user_folder
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_path = dest_dir / f"{uid}.jpg"
            relative = dest_path.relative_to(media_root)
            if best_annotated is not None:
                _, buf = cv2.imencode(".jpg", best_annotated)
                with open(dest_path, "wb") as f:
                    f.write(buf.tobytes())
            result_file_url = (
                f"{settings.MEDIA_URL.rstrip('/')}/{relative.as_posix()}"
                if best_annotated is not None
                else ""
            )

            # Save video + create DetectionRecord
            video_dest_dir = media_root / "history" / "results" / user_folder
            video_dest_dir.mkdir(parents=True, exist_ok=True)
            video_dest_path = video_dest_dir / f"{uid}{ext}"
            video_relative = video_dest_path.relative_to(media_root)

            video_file.seek(0)
            with open(video_dest_path, "wb") as f:
                for chunk in video_file.chunks():
                    f.write(chunk)

            record = DetectionRecord.objects.create(
                user=request.user,
                uploaded_file=video_file,
                ai_model=ai_model,
                detection_mode=DetectionRecord.DetectionMode.VIDEO,
                confidence_used=ai_model.default_confidence,
                iou_used=ai_model.default_iou,
                detections=all_detections[:500],  # cap to 500 to keep JSON size reasonable
                object_count=total_objects,
                inference_time_ms=elapsed_ms,
            )
            record.result_file.name = str(video_relative)
            record.save(update_fields=["result_file"])

            logger.info(
                "VideoDetection: model=%s frames=%d objects=%d time=%.1fms record=%d",
                ai_model.name,
                frame_count,
                total_objects,
                elapsed_ms,
                record.pk,
            )

            return Response(
                {
                    "id": record.pk,
                    "model": {
                        "id": ai_model.pk,
                        "name": ai_model.name,
                        "version": ai_model.version,
                        "category": ai_model.category,
                    },
                    "total_frames_processed": frame_count,
                    "frames_with_detections": frames_with_detections,
                    "total_object_detections": total_objects,
                    "top_classes": top_classes,
                    "annotated_frame_base64": encoded,
                    "result_file_url": result_file_url,
                    "processing_time": elapsed,
                    "confidence_used": ai_model.default_confidence,
                    "iou_used": ai_model.default_iou,
                }
            )

        finally:
            # Clean up temp video file
            import os
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# History endpoints
# ---------------------------------------------------------------------------


class DetectionRecordViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/history/           — list user's detection records
    GET  /api/history/<id>/     — retrieve a single record
    DELETE /api/history/<id>/    — delete a record

    Users can only see and manage their own records.
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "list":
            return DetectionRecordListSerializer
        return DetectionRecordDetailSerializer

    def get_queryset(self):
        """
        Return only records belonging to the authenticated user.
        Supports filtering by detection_mode and ai_model.
        """
        qs = DetectionRecord.objects.filter(user=self.request.user)
        mode = self.request.query_params.get("mode")
        if mode:
            qs = qs.filter(detection_mode=mode)
        ai_model_id = self.request.query_params.get("ai_model")
        if ai_model_id:
            qs = qs.filter(ai_model_id=ai_model_id)
        return qs.select_related("ai_model").order_by("-created_at")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """
        GET /api/detection/history/stats/

        Returns per-user detection statistics for the dashboard.
        """
        from django.db import models
        from django.db.models import Count
        from django.db.models.functions import TruncDate
        from django.utils import timezone

        qs = DetectionRecord.objects.filter(user=request.user)
        seven_days_ago = timezone.now() - timezone.timedelta(days=7)

        total = qs.count()
        last_7_days = qs.filter(created_at__gte=seven_days_ago).count()
        total_objects = qs.aggregate(total=models.Sum("object_count"))["total"] or 0

        avg_conf = qs.aggregate(avg=models.Avg("confidence_used"))["avg"]
        avg_conf = round(avg_conf * 100, 1) if avg_conf else None

        # Most-used model
        model_counts = (
            qs.values("ai_model__name")
            .annotate(count=Count("id"))
            .order_by("-count")
            .first()
        )
        most_used_model = (
            {"name": model_counts["ai_model__name"], "count": model_counts["count"]}
            if model_counts
            else None
        )

        # Per-mode breakdown
        mode_counts = (
            qs.values("detection_mode")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_mode = {item["detection_mode"]: item["count"] for item in mode_counts}

        # Daily counts — last 7 days
        daily = (
            qs.filter(created_at__gte=seven_days_ago)
            .annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
        )
        daily_timeline = [
            {"date": str(item["date"]), "count": item["count"]} for item in daily
        ]

        return Response(
            {
                "total_detections": total,
                "detections_last_7_days": last_7_days,
                "total_objects_detected": total_objects,
                "average_confidence": avg_conf,
                "most_used_model": most_used_model,
                "by_mode": by_mode,
                "daily_timeline": daily_timeline,
            }
        )
