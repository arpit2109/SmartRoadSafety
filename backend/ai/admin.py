"""
Django admin for the `ai` app.

Mirrors the API surface so admins can do everything from the UI
that the API allows, and vice-versa.
"""
from django.contrib import admin
from django.utils.html import format_html

from . import services
from .models import AIModel
from .utils import (
    validate_accuracy,
    validate_confidence,
    validate_iou,
    validate_weight_extension,
)


@admin.register(AIModel)
class AIModelAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "category",
        "version",
        "weight_format",
        "is_active",
        "is_default",
        "accuracy",
        "uploaded_by",
        "created_at",
    )
    list_display_links = ("id", "name")
    list_filter = (
        "category",
        "is_active",
        "is_default",
        "weight_format",
    )
    search_fields = ("name", "version", "uploaded_by__username")
    ordering = ("category", "-is_default", "-created_at")
    readonly_fields = ("created_at", "updated_at", "uploaded_by", "weight_file_preview")
    list_per_page = 25
    list_select_related = ("uploaded_by",)

    fieldsets = (
        (None, {
            "fields": ("name", "category", "version"),
        }),
        ("Weight file", {
            "fields": ("weight_file", "weight_file_preview", "weight_format"),
        }),
        ("Inference defaults", {
            "fields": ("default_confidence", "default_iou", "accuracy"),
        }),
        ("State", {
            "fields": ("is_active", "is_default"),
        }),
        ("Audit", {
            "classes": ("collapse",),
            "fields": ("uploaded_by", "created_at", "updated_at"),
        }),
    )

    # ----- form-level validation hooks -----

    def save_model(self, request, obj, form, change):
        # Run the same validators the API uses.
        validate_confidence(obj.default_confidence)
        validate_iou(obj.default_iou)
        if obj.accuracy is not None:
            validate_accuracy(obj.accuracy)
        if obj.weight_file:
            validate_weight_extension(obj.weight_file)

        if not change:
            obj.uploaded_by = request.user

        super().save_model(request, obj, form, change)

        # Promote to default if the box was ticked on creation/save.
        if obj.is_default:
            services.set_as_default(obj)

    # ----- list-page actions -----

    @admin.action(description="Activate selected models")
    def activate_selected(self, request, queryset):
        n = services.bulk_activate(queryset)
        self.message_user(request, f"Activated {n} model(s).")

    @admin.action(description="Deactivate selected models")
    def deactivate_selected(self, request, queryset):
        n = services.bulk_deactivate(queryset)
        self.message_user(request, f"Deactivated {n} model(s).")

    @admin.action(description="Set selected models as default for their category")
    def make_default(self, request, queryset):
        n = services.bulk_set_default(queryset)
        self.message_user(request, f"Set {n} model(s) as default.")

    actions = ["activate_selected", "deactivate_selected", "make_default"]

    # ----- helpers -----

    @admin.display(description="File")
    def weight_file_preview(self, obj: AIModel) -> str:
        if not obj.weight_file:
            return "—"
        try:
            size_mb = round(obj.weight_file.size / (1024 * 1024), 2)
        except (FileNotFoundError, ValueError, OSError):
            size_mb = None
        size_str = f"{size_mb} MB" if size_mb is not None else "missing"
        return format_html(
            "<code>{}</code><br><small>{}</small>",
            obj.weight_file.name,
            size_str,
        )
