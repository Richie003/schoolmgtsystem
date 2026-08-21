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

# The test client speaks plain HTTP. Production turns on SECURE_SSL_REDIRECT
# whenever DEBUG is off, so if the deploy .env sets DEBUG=False every request in
# the suite 301-redirects to https before reaching a view. Pin it off here —
# this belongs with the DB/cache/storage overrides above: tests must not depend
# on deployment-oriented .env values.
SECURE_SSL_REDIRECT = False

# Disable throttling for the suite. The LocMem cache persists counters across
# tests in one process, so a shared limit would make unrelated tests flaky as
# the count creeps up. Throttling itself is verified in its own test with
# override_settings + an explicit cache clear.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    'DEFAULT_THROTTLE_RATES': {'school_signup': None, 'invite_accept': None},
}

STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
