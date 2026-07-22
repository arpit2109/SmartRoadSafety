from django.urls import path
from .views import ImageDetectionView

urlpatterns = [
    path('image/', ImageDetectionView.as_view(), name='detect-image'),
]
