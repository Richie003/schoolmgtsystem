import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_management.settings')

# Windows has no fork(), and Celery's default "prefork" pool assumes it. On
# Windows the spawned worker children crash on every task — first with
# "ValueError: not enough values to unpack (expected 3, got 0)" in
# fast_trace_task, and (once FORKED_BY_MULTIPROCESSING papers over that) with
# "PermissionError: [WinError 5]" on the pool's shared-memory counters under
# Python 3.14. Neither is fixable from config. So on Windows we default the
# worker to the single-process "solo" pool, which doesn't fork at all and runs
# tasks reliably. This is a dev-only concern: production runs on Linux, where
# the untouched prefork pool gives real concurrency. An explicit `--pool=...`
# on the command line still overrides this default.
app = Celery('school_management')
app.config_from_object('django.conf:settings', namespace='CELERY')
if os.name == 'nt':
    app.conf.worker_pool = 'solo'
app.autodiscover_tasks()
