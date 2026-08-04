# Backend — School Management API (Django + DRF)

The REST API for the multi-tenant School Management System. It is **API-only** —
it serves no HTML/SPA — so it deploys to its own app server, independently of the
[frontend](../frontend). The SPA reaches it over HTTP and is allowed in via CORS.

For architecture, the tenancy model, the CBT engine, the data model and the full
API reference, see the [system README](../README.md). This file is just how to
**run and deploy the API**.

## Prerequisites

- Python 3.11+
- PostgreSQL 14+ (SQLite is the dev/test fallback)
- Redis 6+ (Celery broker / cache; optional locally — see below)

## Run locally

```bash
cd project/backend

# 1. Virtualenv (one already exists at ./venv; to rebuild it:)
python -m venv venv
source venv/Scripts/activate        # Git Bash on Windows
# venv\Scripts\activate             # PowerShell / cmd
# source venv/bin/activate          # macOS / Linux
pip install -r requirements.txt

# 2. Environment
cp .env.example .env                # then edit SECRET_KEY, DATABASE_URL, email…

# 3. Database
python manage.py migrate
python manage.py seed_demo          # optional: two demo schools

# 4. Serve
python manage.py runserver          # http://localhost:8000/api/
```

Prefer not to activate the venv? Call the interpreter directly:
`./venv/Scripts/python.exe manage.py migrate`.

### Celery (second terminal)

```bash
celery -A school_management worker -l info    # solo pool auto-selected on Windows
celery -A school_management beat   -l info    # expiry sweeper
```

No Redis locally? Set `CELERY_TASK_ALWAYS_EAGER=True` in `.env` to run tasks
inline — exams still auto-submit via the server-side expiry check and sweeper.

## Configuration

All config is environment-driven ([python-decouple](https://pypi.org/project/python-decouple/));
`.env` is read from this folder. See [.env.example](.env.example) for every key.
The ones that matter for a split deployment:

| Variable | Purpose |
|---|---|
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` | Standard Django |
| `DATABASE_URL` | Postgres connection |
| `CORS_ALLOWED_ORIGINS` | **Must include the SPA's origin(s)** — this is the frontend link |
| `FRONTEND_URL` | Base URL used to build invite links in emails |
| `CELERY_BROKER_URL` / `REDIS_URL` | Broker + cache |
| `EMAIL_*`, `DEFAULT_FROM_EMAIL` | SMTP for onboarding emails |
| `AWS_STORAGE_BUCKET_NAME`, `AWS_*` | S3 for uploads (required in prod) |

## Deploy (its own server)

```bash
pip install -r requirements.txt
python manage.py collectstatic --noinput      # WhiteNoise serves admin/DRF assets
python manage.py migrate
gunicorn school_management.wsgi:application --bind 0.0.0.0:8000 --workers 4
celery -A school_management worker -l info --concurrency 4
celery -A school_management beat   -l info
```

Checklist for production:

- `DEBUG=False`, a real `SECRET_KEY`, and `ALLOWED_HOSTS` set to the API host.
- `CORS_ALLOWED_ORIGINS` = the frontend's deployed origin(s).
- A managed Postgres and Redis.
- S3 configured (`AWS_STORAGE_BUCKET_NAME`) so uploaded logos/CSVs persist.
- Health check: `GET /api/health/`.

## Tests

```bash
python manage.py test --settings=tests.settings_test
```
