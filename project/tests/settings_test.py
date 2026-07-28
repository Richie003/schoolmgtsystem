"""Test settings: SQLite + in-memory cache + eager Celery.

Lets the suite run without Postgres or Redis. Production runs on PostgreSQL —
see ``school_management.settings``.
"""

from school_management.settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
