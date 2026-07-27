from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import (
    InvalidImageError,
    ModelLoadFailure,
    ModelNotFoundError,
)


class ImageDetectionView(APIView):
    """
    POST /api/detection/image/

    Accepts multipart/form-data:
        image   — the image file (required)
        model_id — primary key of the AIModel to use (required)

    Returns detection results with model metadata.
    """
    parser_classes = [MultiPartParser]
    permission_classes = [AllowAny]

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

        try:
            from .services import process_image
            results = process_image(
                request.FILES["image"], model_id=model_id
            )
            return Response(results, status=status.HTTP_200_OK)
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
