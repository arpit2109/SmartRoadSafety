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

    # From an interactive prompt:
    python manage.py register_model --interactive
"""
from __future__ import annotations

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


class Command(BaseCommand):
    help = (
        "Register a local YOLO/ONNX weight file as an AIModel row. "
        "Copies the file into MEDIA_ROOT under models/<category>/<name>/."
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
            "--interactive",
            action="store_true",
            help="Prompt for missing fields.",
        )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
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

        # --- validate required fields ---
        missing = [
            k for k, v in {
                "name": name, "category": category, "version": version,
                "weight-file": weight_path,
            }.items() if not v
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
                is_active=is_active,
                is_default=False,  # promote via services.set_as_default below
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

        # --- summary ---
        self.stdout.write(self.style.SUCCESS("[OK] Registered AIModel"))
        self.stdout.write(f"  id          : {instance.pk}")
        self.stdout.write(f"  name        : {instance.name}")
        self.stdout.write(f"  category    : {instance.category}")
        self.stdout.write(f"  version     : {instance.version}")
        self.stdout.write(f"  format      : {instance.weight_format}")
        self.stdout.write(f"  is_active   : {instance.is_active}")
        self.stdout.write(f"  is_default  : {instance.is_default}")
        self.stdout.write(f"  accuracy    : {instance.accuracy}")
        self.stdout.write(f"  weight_file : {instance.weight_file.name}")
        try:
            size_mb = round(src.stat().st_size / (1024 * 1024), 2)
            self.stdout.write(f"  size        : {size_mb} MB")
        except OSError:
            pass
        self.stdout.write(
            f"\nLoad it later with:\n"
            f"  from ai.model_loader import load_model, load_default\n"
            f"  m = load_model({name!r}, category={category!r})  # by name\n"
            f"  m = load_default({category!r})                  # by default\n"
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

        self.stdout.write(self.style.NOTICE("Interactive mode -- press Enter to accept defaults.\n"))
        options["name"] = ask("name", "Model name", "Helmet Detector")
        options["category"] = ask("category", "Category (helmet/vehicle/bike/custom)", "helmet")
        options["version"] = ask("version", "Version", "1.0")
        options["weight_file"] = ask("weight_file", "Path to .pt / .onnx file")
        fmt = ask("weight_format", "Format (pt/onnx/engine)", "pt")
        options["weight_format"] = fmt
