import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_management.settings')

app = Celery('school_management')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
