"""
URL configuration for the `ai` app — Module 3.

Routes (mounted under `/api/`):

    GET    /api/models/                       list
    POST   /api/models/upload/                multipart upload (create)
    GET    /api/models/<id>/                  retrieve
    PATCH  /api/models/<id>/                  partial update
    DELETE /api/models/<id>/                  soft delete (is_active=False)
    POST   /api/models/<id>/activate/         set is_active=True
    POST   /api/models/<id>/deactivate/       set is_active=False
    POST   /api/models/<id>/set-default/      mark as category default
    GET    /api/models/categories/            list categories + counts
    GET    /api/models/cache-stats/           admin debug
    POST   /api/models/cache-clear/           admin debug
    POST   /api/models/cache-warm/            admin: pre-load all active models
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AIModelViewSet, WarmCacheView

router = DefaultRouter()
router.register(r"models", AIModelViewSet, basename="ai-model")

urlpatterns = [
    path("", include(router.urls)),
    path("models/cache-warm/", WarmCacheView.as_view(), name="ai-cache-warm"),
]
