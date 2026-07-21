from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import CustomUser, Profile


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "id",
        "username",
        "email",
        "contact_no",
        "is_staff",
        "is_active",
    )
    search_fields = (
        "username",
        "email",
        "contact_no",
    )
    list_filter = (
        "is_staff",
        "is_active",
        "date_joined",
    )
    ordering = ("id",)

    # Keep the built-in UserAdmin password / permission fieldsets,
    # and add our custom `contact_no` field to the change + add forms.
    fieldsets = UserAdmin.fieldsets + (
        ("Extra Info", {"fields": ("contact_no",)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Extra Info", {"fields": ("email", "contact_no")}),
    )


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "firstname",
        "lastname",
    )
    search_fields = (
        "user__username",
        "user__email",
        "firstname",
        "lastname",
    )
    list_filter = (
        "user__is_active",
    )
    ordering = ("id",)
