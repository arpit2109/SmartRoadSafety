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

    def validate_contact_no(self, value):
        value = value.strip()

        if not value.isdigit():
            raise serializers.ValidationError(
                "Contact number should contain digits only."
            )

        if len(value) != 10:
            raise serializers.ValidationError(
                "Contact number must contain exactly 10 digits."
            )

        if value[0] not in "6789":
            raise serializers.ValidationError(
                "Contact number must start with 6, 7, 8 or 9."
            )

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
