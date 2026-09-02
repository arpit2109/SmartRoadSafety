from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models

phone_validator = RegexValidator(
    regex=r"^[6-9]\d{9}$",
    message="Enter a valid 10-digit Indian mobile number.",
)


class CustomUserManager(BaseUserManager):
    """
    Custom manager for CustomUser where email is the unique identifier
    (in addition to username) and contact_no is required for auth helpers.
    """

    def create_user(self, username, email, contact_no, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")

        email = self.normalize_email(email)

        user = self.model(
            username=username,
            email=email,
            contact_no=contact_no,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, contact_no, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(
            username,
            email,
            contact_no,
            password,
            **extra_fields,
        )


class CustomUser(AbstractUser):
    email = models.EmailField(unique=True)
    contact_no = models.CharField(
        max_length=10,
        unique=True,
        validators=[phone_validator],
    )

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email", "contact_no"]

    objects = CustomUserManager()

    def __str__(self):
        return self.username


class Profile(models.Model):
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    firstname = models.CharField(max_length=100)
    lastname = models.CharField(max_length=100)
    profile_picture = models.ImageField(
        upload_to="profile_pics/",
        blank=True,
        null=True,
    )

    def __str__(self):
        return f"{self.firstname} {self.lastname}"
