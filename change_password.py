import os
import django
import sys

# Add the project root directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'boardgames.settings')
try:
    django.setup()
except Exception as e:
    print(f"Setup Error: {e}")
    sys.exit(1)

from django.contrib.auth import get_user_model

User = get_user_model()

try:
    username = 'shubham'
    try:
        u = User.objects.get(username=username)
    except User.DoesNotExist:
        # Fallback to finding first superuser
        u = User.objects.filter(is_superuser=True).first()
        if not u:
            print("No superuser found.")
            sys.exit(1)
        username = u.username

    print(f"Changing password for user: {username}")
    u.set_password('admin123')
    u.save()
    print("Password changed successfully to 'admin123'.")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
