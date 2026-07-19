from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import CustomUser, Profile


class UserRegisterInputSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = CustomUser
        fields = ("username", "email", "contact_no", "password")

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserOutputSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ("id", "username", "email", "contact_no", "date_joined")
        read_only_fields = fields


class ProfileInputSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ("firstname", "lastname", "profile_picture")


class ProfileOutputSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = ("id", "firstname", "lastname", "profile_picture")

    def get_profile_picture(self, obj):
        if obj.profile_picture:
            request = self.context.get("request")
            url = obj.profile_picture.url
            return request.build_absolute_uri(url) if request else url
        return None
