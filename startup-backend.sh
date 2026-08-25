#!/usr/bin/env bash

set -e

cd "$(dirname "$0")/backend"
source venv/Scripts/activate
python manage.py runserver