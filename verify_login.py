import os
import sys

# Add the project root directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import django
from django.contrib.auth import authenticate

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'boardgames.settings')
django.setup()

from django.contrib.auth.models import User

print("--- User Verification ---")
try:
    user = User.objects.get(username='admin')
    print(f"User 'admin' exists. Is active: {user.is_active}, Is superuser: {user.is_superuser}")
    
    # Try to authenticate
    auth_user = authenticate(username='admin', password='admin')
    if auth_user is not None:
        print("SUCCESS: Authentication with username='admin' and password='admin' worked!")
    else:
        print("FAILURE: Authentication denied. Password might be wrong.")
        
        # Force reset again to be 100% sure
        print("Force resetting password to 'admin'...")
        user.set_password('admin')
        user.save()
        print("Password reset. Try authenticating again...")
        auth_user_retry = authenticate(username='admin', password='admin')
        if auth_user_retry:
            print("SUCCESS: Authentication worked after reset!")
        else:
            print("FAILURE: Still failing after reset. Something is weird.")

except User.DoesNotExist:
    print("User 'admin' does not exist!")
