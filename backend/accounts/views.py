from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Profile
from .serializers import (
    ProfileInputSerializer,
    ProfileOutputSerializer,
    UserOutputSerializer,
    UserRegisterInputSerializer,
)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = UserRegisterInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        output = UserOutputSerializer(user)
        return Response(output.data, status=status.HTTP_201_CREATED)


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile, _ = Profile.objects.get_or_create(
            user=request.user,
            defaults={"firstname": "", "lastname": ""},
        )
        serializer = ProfileOutputSerializer(profile, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        profile, _ = Profile.objects.get_or_create(
            user=request.user,
            defaults={"firstname": "", "lastname": ""},
        )
        input_serializer = ProfileInputSerializer(
            profile, data=request.data, partial=True
        )
        input_serializer.is_valid(raise_exception=True)
        profile = input_serializer.save()
        output_serializer = ProfileOutputSerializer(
            profile, context={"request": request}
        )
        return Response(output_serializer.data)
