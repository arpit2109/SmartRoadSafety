"""
Views for the `ai` app — Module 3.

`AIModelViewSet` is the public surface; it delegates to `services` for
all write operations and to the cache for the debug endpoint.
"""
from __future__ import annotations

from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .cache import cache
from .models import AIModel
from .serializers import (
    AIModelDetailSerializer,
    AIModelListSerializer,
    AIModelUpdateSerializer,
    AIModelUploadSerializer,
    CategoryStatSerializer,
)


class AIModelViewSet(viewsets.ModelViewSet):
    """
    CRUD for AIModel.

    - list / retrieve: any authenticated user.
    - create / update / destroy / *-actions: admin only.
    - delete is implemented as soft-delete (is_active=False).
    """

    queryset = AIModel.objects.all().order_by(
        "category", "-is_default", "-created_at"
    )
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_permissions(self):
        if self.action in {
            "list", "retrieve", "categories", "cache_stats",
        }:
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action == "list":
            return AIModelListSerializer
        if self.action == "create":
            return AIModelUploadSerializer
        if self.action in {"partial_update", "update"}:
            return AIModelUpdateSerializer
        return AIModelDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        category = params.get("category")
        is_active = params.get("is_active")
        is_default = params.get("is_default")
        if category:
            qs = qs.filter(category=category)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in {"1", "true", "yes"})
        if is_default is not None:
            qs = qs.filter(is_default=is_default.lower() in {"1", "true", "yes"})
        return qs

    # ----- create -----

    def create(self, request, *args, **kwargs):
        """
        POST /api/models/upload/ — accept multipart upload, persist
        via the services layer, return the detail serializer.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        instance = services.create_model(
            name=data["name"],
            category=data["category"],
            version=data["version"],
            weight_file=data["weight_file"],
            uploaded_by=request.user if request.user.is_authenticated else None,
            default_confidence=data.get("default_confidence", 0.25),
            default_iou=data.get("default_iou", 0.45),
            accuracy=data.get("accuracy"),
            weight_format=data.get("weight_format", AIModel.WeightFormat.PYTORCH),
            is_active=data.get("is_active", True),
            is_default=data.get("is_default", False),
        )
        out = AIModelDetailSerializer(instance, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    # ----- update -----

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        new_file = serializer.validated_data.get("weight_file")
        if new_file is not None:
            services.replace_weight_file(instance, new_file)
            # Pop the file from the validated data so the ModelSerializer
            # doesn't try to re-save it (services already wrote it).
            serializer.validated_data.pop("weight_file", None)

        # Apply remaining field updates.
        for field, value in serializer.validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if serializer.validated_data.get("is_default"):
            services.set_as_default(instance)
        elif instance.is_default and not serializer.validated_data.get(
            "is_default", True
        ):
            instance.is_default = False
            instance.save(update_fields=["is_default", "updated_at"])

        out = AIModelDetailSerializer(instance, context={"request": request})
        return Response(out.data)

    # ----- destroy (soft) -----

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        services.deactivate(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ----- custom actions -----

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def activate(self, request, pk=None):
        instance = self.get_object()
        services.activate(instance)
        return Response(AIModelDetailSerializer(instance, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def deactivate(self, request, pk=None):
        instance = self.get_object()
        services.deactivate(instance)
        return Response(AIModelDetailSerializer(instance, context={"request": request}).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminUser],
        url_path="set-default",
    )
    def set_default(self, request, pk=None):
        instance = self.get_object()
        instance = services.set_as_default(instance)
        return Response(AIModelDetailSerializer(instance, context={"request": request}).data)

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def categories(self, request):
        """
        GET /api/models/categories/ — canonical list of categories
        with per-category counts and a `has_default` flag.
        """
        canonical = [c[0] for c in AIModel.Category.choices]
        qs = AIModel.objects.all()
        aggregates = qs.values("category").annotate(
            count=Count("id"),
            active_count=Count("id", filter=Q(is_active=True)),
        )
        by_cat = {row["category"]: row for row in aggregates}
        defaults = set(
            AIModel.objects.filter(is_default=True, is_active=True)
            .values_list("category", flat=True)
        )

        payload = []
        for cat in canonical:
            row = by_cat.get(cat, {})
            payload.append(
                {
                    "category": cat,
                    "count": row.get("count", 0),
                    "active_count": row.get("active_count", 0),
                    "has_default": cat in defaults,
                }
            )
        # Any DB categories not in the canonical list (shouldn't happen,
        # but defensively include them).
        for cat, row in by_cat.items():
            if cat in canonical:
                continue
            payload.append(
                {
                    "category": cat,
                    "count": row["count"],
                    "active_count": row["active_count"],
                    "has_default": cat in defaults,
                }
            )

        return Response(CategoryStatSerializer(payload, many=True).data)

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsAdminUser],
        url_path="cache-stats",
    )
    def cache_stats(self, request):
        return Response(cache.stats())

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsAdminUser],
        url_path="cache-clear",
    )
    def cache_clear(self, request):
        cache.clear()
        return Response(cache.stats())


# ---------------------------------------------------------------------------
# Standalone debug endpoint — pre-warm the cache.
# ---------------------------------------------------------------------------


class WarmCacheView(APIView):
    """
    POST /api/models/cache-warm/ — load every active model into memory.
    Admin-only. Useful right after a deploy or for cold-start mitigation.
    """

    permission_classes = [IsAdminUser]

    def post(self, request):
        from .model_loader import warm_cache

        loaded = warm_cache()
        return Response({"loaded": loaded, **cache.stats()})
