import os
import sys

# Add the project root directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'boardgames.settings')
import django
django.setup()

from django.contrib.auth.models import User

user, created = User.objects.get_or_create(username='admin', defaults={'email': 'admin@example.com'})
if created:
    print("Created new superuser 'admin'")
else:
    print("Found existing superuser 'admin'")

user.set_password('admin')
user.save()
print("Password for 'admin' has been set to 'admin'")
