from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny # Or IsAuthenticated based on requirements
from .services import DetectionService

class ImageDetectionView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [AllowAny] # Keeping it open for now for easier testing

    def post(self, request, *args, **kwargs):
        if 'image' not in request.FILES:
            return Response({"error": "No image uploaded."}, status=status.HTTP_400_BAD_REQUEST)
            
        image_file = request.FILES['image']
        category = request.data.get('category') # e.g. 'helmet', 'vehicle'
        
        try:
            results = DetectionService.process_image(image_file, category)
            return Response(results, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
