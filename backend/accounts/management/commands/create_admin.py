import os

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Create the initial superuser if it does not exist"

    def handle(self, *args, **options):
        User = get_user_model()

        username = 'admin'
        email = 'patelarpit123@gmail.com'
        password = 'patel@123'

        if not username or not password:
            self.stdout.write(
                self.style.WARNING(
                    "ADMIN_USERNAME or ADMIN_PASSWORD not configured."
                )
            )
            return

        if User.objects.filter(username=username).exists():
            self.stdout.write(
                self.style.WARNING(
                    f"Admin '{username}' already exists."
                )
            )
            return

        User.objects.create_superuser(
            username=username,
            email=email or "",
            password=password,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Superuser '{username}' created successfully."
            )
        )
