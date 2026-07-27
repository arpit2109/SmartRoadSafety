"""
`python manage.py register_model ...`

Register a YOLO/ONNX weight file as an AIModel row from the command line.
Useful when you have a .pt file on disk and don't want to go through the
admin or API (e.g. the file just landed from a training run).

Examples
--------

    # Register your Kaggle-trained helmet detector as the active default:
    python manage.py register_model \
        --name "Helmet Detector" \
        --category helmet \
        --version 1.0 \
        --weight-file "C:/path/to/best.pt" \
        --accuracy 0.77 \
        --is-default

    # Just register, don't make default:
    python manage.py register_model \
        --name "Helmet Detector" \
        --category helmet \
        --version 2.0 \
        --weight-file ./helmet-v2.pt

    # Auto-locate best.pt from Downloads and register as the helmet default:
    python manage.py register_model --helmet

    # From an interactive prompt:
    python manage.py register_model --interactive
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from ai.models import AIModel
from ai.services import set_as_default
from ai.utils import (
    ALLOWED_WEIGHT_EXTENSIONS,
    validate_accuracy,
    validate_confidence,
    validate_iou,
    validate_weight_extension,
)


# ---------------------------------------------------------------------------
# Helmet-model defaults
# ---------------------------------------------------------------------------

HELMET_NAME = "Helmet Detection"
HELMET_CATEGORY = "helmet"
HELMET_VERSION = "1.0"
HELMET_CLASSES = [
    "driver_with_helmet",
    "bike",
    "driver",
    "passenger_with_helmet",
    "passenger",
    "driver_without_helmet",
    "passenger_without_helmet",
]
HELMET_DESCRIPTION = (
    "Custom-trained YOLOv8n model for helmet and rider detection on Indian roads. "
    "Trained on helmet-data dataset (Kaggle), 50 epochs, batch 16, imgsz 640. "
    "7 classes: helmet/no-helmet for driver and passenger plus bike."
)
HELMET_ACCURACY = 0.771  # mAP50 from training log


class Command(BaseCommand):
    help = (
        "Register a local YOLO/ONNX weight file as an AIModel row. "
        "Copies the file into MEDIA_ROOT under models/<category>/. "
        "Use --helmet to auto-locate best.pt in your Downloads folder."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--name", type=str, help="Human-readable model name (e.g. 'Helmet Detector')."
        )
        parser.add_argument(
            "--category",
            type=str,
            choices=[c[0] for c in AIModel.Category.choices],
            help="Detection category.",
        )
        parser.add_argument(
            "--model-version",
            dest="version",
            type=str,
            help="Free-form version string (e.g. '1.0', '2026-07-22').",
        )
        parser.add_argument(
            "--weight-file",
            type=str,
            help="Absolute or relative path to the .pt / .onnx / .engine file.",
        )
        parser.add_argument(
            "--weight-format",
            type=str,
            choices=[f[0] for f in AIModel.WeightFormat.choices],
            default=AIModel.WeightFormat.PYTORCH,
            help="Framework format. Defaults to 'pt'.",
        )
        parser.add_argument(
            "--accuracy",
            type=float,
            default=None,
            help="Optional reported accuracy (e.g. mAP) at upload time, 0.0 - 1.0.",
        )
        parser.add_argument(
            "--default-confidence",
            type=float,
            default=0.25,
            help="Default inference confidence threshold. 0.0 - 1.0.",
        )
        parser.add_argument(
            "--default-iou",
            type=float,
            default=0.45,
            help="Default IoU threshold for NMS. 0.0 - 1.0.",
        )
        parser.add_argument(
            "--is-default",
            action="store_true",
            help="Mark this model as the default for its category.",
        )
        parser.add_argument(
            "--inactive",
            action="store_true",
            help="Register as inactive (is_active=False).",
        )
        parser.add_argument(
            "--description", type=str, default="", help="Optional description."
        )
        parser.add_argument(
            "--imgsz", type=int, default=640, help="Inference image size (e.g. 640)."
        )
        parser.add_argument(
            "--classes",
            type=str,
            default="[]",
            help='JSON string of classes, e.g. \'["helmet"]\'',
        )
        parser.add_argument(
            "--interactive",
            action="store_true",
            help="Prompt for missing fields.",
        )
        parser.add_argument(
            "--helmet",
            action="store_true",
            help=(
                "Auto-register best.pt from the current user's Downloads folder "
                "as the Helmet Detection default model.  Searches recursively for "
                "best.pt (case-insensitive).  If already registered, compares "
                "SHA-256 hashes to decide whether to replace the file."
            ),
        )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        if options["helmet"]:
            self._register_helmet(options)
            return

        if options["interactive"]:
            self._fill_interactively(options)

        name = options["name"]
        category = options["category"]
        version = options["version"]
        weight_path = options["weight_file"]
        weight_format = options["weight_format"]
        accuracy = options["accuracy"]
        default_confidence = options["default_confidence"]
        default_iou = options["default_iou"]
        is_default = options["is_default"]
        is_active = not options["inactive"]
        description = options["description"]
        imgsz = options["imgsz"]
        try:
            classes = json.loads(options["classes"])
            if not isinstance(classes, list):
                raise ValueError("Classes must be a JSON array.")
        except json.JSONDecodeError:
            raise CommandError("Invalid JSON for --classes argument.")
        except ValueError as e:
            raise CommandError(str(e))

        # --- validate required fields ---
        missing = [
            k
            for k, v in {
                "name": name,
                "category": category,
                "version": version,
                "weight-file": weight_path,
            }.items()
            if not v
        ]
        if missing:
            raise CommandError(
                f"Missing required args: {', '.join(missing)}. "
                f"Use --interactive to be prompted, or --help for full usage."
            )

        # --- validate file ---
        src = Path(weight_path).expanduser().resolve()
        if not src.is_file():
            raise CommandError(f"Weight file not found: {src}")

        ext = src.suffix.lower()
        if ext not in ALLOWED_WEIGHT_EXTENSIONS:
            raise CommandError(
                f"Unsupported file extension '{ext}'. "
                f"Allowed: {sorted(ALLOWED_WEIGHT_EXTENSIONS)}"
            )

        # --- validate numeric ranges ---
        try:
            validate_confidence(default_confidence)
            validate_iou(default_iou)
            if accuracy is not None:
                validate_accuracy(accuracy)
        except Exception as exc:
            raise CommandError(f"Invalid numeric value: {exc}")

        # --- check uniqueness early for a clearer error ---
        if AIModel.objects.filter(
            name=name, version=version, category=category,
        ).exists():
            raise CommandError(
                f"An AIModel with name={name!r}, version={version!r}, "
                f"category={category!r} already exists. Pick a different version."
            )

        # --- create the row, copying the file into MEDIA_ROOT ---
        with transaction.atomic():
            instance = AIModel(
                name=name,
                category=category,
                version=version,
                weight_format=weight_format,
                default_confidence=default_confidence,
                default_iou=default_iou,
                accuracy=accuracy,
                description=description,
                imgsz=imgsz,
                classes=classes,
                is_active=is_active,
                is_default=False,
            )
            with src.open("rb") as fh:
                instance.weight_file.save(src.name, File(fh), save=False)
            instance.save()

        # --- promote to default if requested ---
        if is_default:
            if not instance.is_active:
                raise CommandError(
                    "Cannot mark an inactive model as default. "
                    "Drop --inactive or activate the model first."
                )
            set_as_default(instance)

        self._report_success(instance, src)

    # ------------------------------------------------------------------
    # --helmet shortcut
    # ------------------------------------------------------------------

    def _register_helmet(self, options: dict) -> None:
        """
        Locate best.pt in Downloads, copy to ai_models/helmet_detection/,
        validate with Ultralytics, then create or update the AIModel row.
        """
        src = self._find_best_pt()
        dest_dir = self._ensure_dest_dir()
        dest = dest_dir / "best.pt"

        existing = AIModel.objects.filter(
            name=HELMET_NAME,
            category=HELMET_CATEGORY,
            version=HELMET_VERSION,
        ).first()

        # --- hash comparison ---
        src_hash = self._sha256(src)
        dest_hash = None
        if dest.is_file():
            dest_hash = self._sha256(dest)

        if dest_hash == src_hash:
            self.stdout.write(
                self.style.WARNING(
                    "[SKIP] Downloaded best.pt is identical to the registered "
                    "file (SHA-256 match). No changes made."
                )
            )
            if existing and existing.is_active and existing.is_default:
                self.stdout.write(
                    f"  Existing record: pk={existing.pk}, "
                    f"weight_file={existing.weight_file.name}"
                )
            return

        # --- copy the file ---
        if dest.is_file():
            self.stdout.write("[INFO] Different file detected — replacing weight file.")
        else:
            self.stdout.write("[INFO] Copying best.pt to project ai_models directory.")

        shutil.copy2(src, dest)
        self.stdout.write(f"  destination : {dest}")

        # --- validate with Ultralytics ---
        self.stdout.write("[INFO] Validating model with Ultralytics...")
        try:
            self._validate_model(str(dest))
            self.stdout.write(self.style.SUCCESS("[OK] Model validated successfully."))
        except Exception as exc:
            # Rollback: delete the copied file so we don't leave a bad file behind
            try:
                dest.unlink()
            except OSError:
                pass
            raise CommandError(
                f"Ultralytics validation failed: {exc}\n"
                f"Registration aborted — no database changes made."
            )

        # --- create or update the DB record ---
        is_default = options.get("is_default", True)
        is_active = not options.get("inactive", False)

        if existing:
            self.stdout.write(
                f"[INFO] Updating existing AIModel pk={existing.pk}."
            )
            if existing.is_active and existing.is_default:
                # It's already default — preserve that
                is_default = True
            existing.weight_format = AIModel.WeightFormat.PYTORCH
            existing.default_confidence = options.get("default_confidence", 0.25)
            existing.default_iou = options.get("default_iou", 0.45)
            existing.accuracy = HELMET_ACCURACY
            existing.description = HELMET_DESCRIPTION
            existing.imgsz = options.get("imgsz", 640)
            existing.classes = HELMET_CLASSES
            existing.is_active = is_active
            existing.is_default = False  # will be promoted below if needed
            existing.save()
            instance = existing
        else:
            self.stdout.write("[INFO] Creating new AIModel record.")
            instance = AIModel(
                name=HELMET_NAME,
                category=HELMET_CATEGORY,
                version=HELMET_VERSION,
                weight_format=AIModel.WeightFormat.PYTORCH,
                default_confidence=options.get("default_confidence", 0.25),
                default_iou=options.get("default_iou", 0.45),
                accuracy=HELMET_ACCURACY,
                description=HELMET_DESCRIPTION,
                imgsz=options.get("imgsz", 640),
                classes=HELMET_CLASSES,
                is_active=is_active,
                is_default=False,
            )
            instance.weight_file.save("best.pt", File(open(dest, "rb")), save=False)
            instance.save()

        if is_default:
            if not instance.is_active:
                raise CommandError(
                    "Cannot set an inactive model as default. "
                    "Drop --inactive or activate the model first."
                )
            instance = set_as_default(instance)

        self.stdout.write(self.style.SUCCESS("[OK] Helmet Detection model registered."))
        self._report_success(instance, dest)

    def _find_best_pt(self) -> Path:
        """
        Search the user's Downloads folder (and subfolders) for best.pt.
        Returns the first match found.
        Raises CommandError if not found.
        """
        downloads = Path.home() / "Downloads"
        if not downloads.is_dir():
            raise CommandError(
                "Downloads folder not found. Please download best.pt from "
                "Google Drive and place it in your Downloads folder, then "
                "run this command again."
            )

        matches = sorted(downloads.rglob("best.pt"))
        if not matches:
            raise CommandError(
                "best.pt not found in Downloads.\n\n"
                "Please:\n"
                "  1. Download your trained Helmet Detection model from Google Drive.\n"
                "  2. Save best.pt to your Downloads folder.\n"
                "  3. Run this command again.\n\n"
                f"Searched: {downloads}"
            )

        if len(matches) > 1:
            self.stdout.write(
                self.style.WARNING(
                    f"Multiple best.pt files found — using the first one:\n"
                    f"  {matches[0]}"
                )
            )
        chosen = matches[0]
        self.stdout.write(f"[INFO] Found best.pt at: {chosen}")
        return chosen

    def _ensure_dest_dir(self) -> Path:
        """
        Return (and create if missing) the destination directory:
        MEDIA_ROOT / models / helmet / best.pt
        """
        media_root = Path(settings.MEDIA_ROOT) if settings.MEDIA_ROOT else Path("media")
        dest = media_root / "models" / HELMET_CATEGORY
        dest.mkdir(parents=True, exist_ok=True)
        return dest

    @staticmethod
    def _sha256(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def _validate_model(path: str) -> None:
        """
        Attempt to load the model with Ultralytics.
        Raises if the file can't be loaded — callers catch and abort.
        """
        from ultralytics import YOLO
        import numpy as np

        model = YOLO(path)
        # Trigger a minimal inference to confirm the weights are sane.
        # We use a tiny placeholder (blank image) so it finishes in < 1 second.
        model.predict(source=np.zeros((64, 64, 3), dtype=np.uint8), conf=0.5, verbose=False)

    # ------------------------------------------------------------------
    # Success reporter
    # ------------------------------------------------------------------

    def _report_success(self, instance: AIModel, src: Path) -> None:
        self.stdout.write(self.style.SUCCESS("[OK] Registered AIModel"))
        self.stdout.write(f"  id           : {instance.pk}")
        self.stdout.write(f"  name         : {instance.name}")
        self.stdout.write(f"  category     : {instance.category}")
        self.stdout.write(f"  version      : {instance.version}")
        self.stdout.write(f"  format       : {instance.weight_format}")
        self.stdout.write(f"  is_active    : {instance.is_active}")
        self.stdout.write(f"  is_default   : {instance.is_default}")
        self.stdout.write(f"  accuracy     : {instance.accuracy}")
        self.stdout.write(f"  classes      : {instance.classes}")
        self.stdout.write(f"  weight_file  : {instance.weight_file.name}")
        try:
            size_mb = round(src.stat().st_size / (1024 * 1024), 2)
            self.stdout.write(f"  size         : {size_mb} MB")
        except OSError:
            pass
        self.stdout.write(
            f"\nLoad it later with:\n"
            f"  from ai.model_loader import load_model_by_id\n"
            f"  m = load_model_by_id({instance.pk})"
        )

    # ------------------------------------------------------------------
    # Interactive mode
    # ------------------------------------------------------------------

    def _fill_interactively(self, options: dict) -> None:
        """Prompt the user for any missing fields."""

        def ask(field, label, default=None):
            current = options.get(field)
            if current:
                return current
            prompt = f"  {label}"
            if default is not None:
                prompt += f" [{default}]"
            prompt += ": "
            value = input(prompt).strip()
            return value or default

        self.stdout.write(
            self.style.NOTICE(
                "Interactive mode -- press Enter to accept defaults.\n"
            )
        )
        options["name"] = ask("name", "Model name", "Helmet Detector")
        options["category"] = ask(
            "category", "Category (helmet/vehicle/bike/custom)", "helmet"
        )
        options["version"] = ask("version", "Version", "1.0")
        options["weight_file"] = ask("weight_file", "Path to .pt / .onnx file")
        fmt = ask("weight_format", "Format (pt/onnx/engine)", "pt")
        options["weight_format"] = fmt
