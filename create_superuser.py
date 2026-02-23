import os
import sys

# Add the project root directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'boardgames.settings')
import django
django.setup()

from django.contrib.auth.models import User

user, created = User.objects.update_or_create(
    username='admin',
    defaults={
        'email': 'admin@example.com',
        'is_staff': True,
        'is_superuser': True,
    }
)
user.set_password('admin789')
user.save()

if created:
    print("Created new superuser 'admin'")
else:
    print("Updated existing superuser 'admin'")

print("Password for 'admin' has been set to 'admin789'")
