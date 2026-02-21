#!/usr/bin/env bash
# exit on error
set -o errexit

export PYTHONPATH=$PYTHONPATH:.

pip install -r requirements.txt

# Convert static assets
python manage.py collectstatic --no-input

# Apply database migrations
python manage.py migrate

# Create superuser (if not exists)
python create_superuser.py
