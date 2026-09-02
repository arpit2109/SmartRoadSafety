from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from django.utils.html import format_html

from .models import CustomUser, Profile

@admin.action(description="Deactivate selected users")
def deactivate_users(modeladmin, request, queryset):
    queryset.update(is_active=False)

@admin.action(description="Activate selected users")
def activate_users(modeladmin, request, queryset):
    queryset.update(is_active=True)


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "id",
        "username",
        "email",
        "get_firstname",
        "get_lastname",
        "contact_no",
        "is_staff",
        "is_active",
        "date_joined",
    )
    list_select_related = ("profile",)
    actions = [activate_users, deactivate_users]
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

    @admin.display(description='First Name', ordering='profile__firstname')
    def get_firstname(self, obj):
        return obj.profile.firstname if hasattr(obj, 'profile') else '-'

    @admin.display(description='Last Name', ordering='profile__lastname')
    def get_lastname(self, obj):
        return obj.profile.lastname if hasattr(obj, 'profile') else '-'


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "firstname",
        "lastname",
        "profile_picture_thumbnail",
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

    @admin.display(description="Profile Picture")
    def profile_picture_thumbnail(self, obj):
        if obj.profile_picture:
            return format_html('<img src="{}" width="50" height="50" style="border-radius: 50%; object-fit: cover;" />', obj.profile_picture.url)
        return "-"
