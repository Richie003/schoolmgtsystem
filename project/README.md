# School Management System — Multi-Tenant MVP

A multi-school (SaaS) school management platform covering four areas and
nothing else: **Student Management**, **Staff Management**, **CBT**, and
**Data Import/Export**.

- **Backend** — Django 5.2 + Django REST Framework, PostgreSQL, Redis, Celery
- **Frontend** — React 18 + TypeScript + Vite + Tailwind
- **Auth** — JWT (SimpleJWT), role embedded in the token payload

---

## Table of contents

1. [Architecture](#architecture)
2. [Multi-tenancy](#multi-tenancy--how-isolation-is-enforced)
3. [Roles & permissions](#roles--permissions)
4. [Data model](#data-model)
5. [Local setup](#local-setup)
6. [API reference](#api-reference)
7. [Example requests & responses](#example-requests--responses)
8. [CBT engine](#cbt-engine)
9. [CSV import / export](#csv-import--export)
10. [Frontend structure](#frontend-structure)
11. [Testing](#testing)
12. [Production deployment](#production-deployment)

---

## Architecture

```
project/
├── school_management/     Django project (settings, urls, celery)
├── core/                  Tenancy primitives — School, TenantModel, permissions,
│                          base viewsets, CSV helpers
├── accounts/              User model, roles, JWT auth
├── students/              AcademicSession, Term, Classroom, Student,
│                          AttendanceRecord, CheckoutRecord
├── staff/                 StaffRole, Staff, TeacherClassAssignment, Notice
├── cbt/                   Subject, QuestionBank, Question, Choice, Exam,
│                          ExamAttempt, StudentAnswer + exam engine + Celery tasks
├── dataio/                ImportJob, importers, exporters, Celery tasks
├── tests/                 Backend test suite
└── src/                   React SPA
```

Design rule: **domain logic lives in services, not views.** The CBT engine
(`cbt/services.py`) is the only place that knows how to grade and close an
attempt, so the HTTP handler and the Celery auto-submit worker cannot drift
apart.

---

## Multi-tenancy — how isolation is enforced

Shared schema; every tenant-owned row carries a `school` foreign key. Isolation
is enforced at **four** layers, so no single mistake exposes another school's
data:

| Layer | Mechanism | File |
|---|---|---|
| Model | `TenantModel` mandates a non-null, indexed `school` FK | `core/models.py` |
| Query | `TenantScopedMixin.get_queryset` filters by the caller's school on every request | `core/viewsets.py` |
| Write | `perform_create` stamps the caller's school and **ignores any client-supplied `school`** | `core/viewsets.py` |
| Field | `TenantValidatedSerializer` rejects FKs pointing outside the caller's school | `students/serializers.py` |

Two further rules:

- **Cross-tenant reads return 404, never 403.** A 403 would confirm that the row
  exists; a 404 tells an attacker nothing.
- **`request.school` is a convenience only.** The middleware in
  `core/middleware.py` binds it lazily for view code, but the security boundary
  is the queryset and the permission classes — never the middleware alone.

A `super_admin` is the only account with no school. It acts across tenants and
must name a school explicitly; it never gets an implicit tenant.

---

## Roles & permissions

| Role | Scope |
|---|---|
| `super_admin` | Platform level. Manages schools. Not bound to a tenant. |
| `school_admin` | Full control within their own school. |
| `teacher` | Only the classes assigned via `TeacherClassAssignment`. |
| `student` | Only their own record, their own exams, their own results. |

Enforced by DRF permission classes in `core/permissions.py`, composed with
per-viewset `get_permissions()` overrides. Concretely:

- Only admins create students and staff (`IsSchoolAdmin`).
- Teachers read/write only their assigned classes — the queryset is narrowed by
  `ClassRestrictedMixin`, so it is not something a view can forget.
- Students cannot reach `/api/cbt/questions/` at all, because that payload
  contains answer keys.
- The paper a student is served omits `is_correct` entirely
  (`ChoicePublicSerializer`) — the answer key never crosses the wire.

---

## Data model

### Students
- `AcademicSession` — an academic year. At most one `is_current` per school (DB constraint).
- `Term` — a term inside a session. At most one `is_current` per school.
- `Classroom` — class + arm, unique per school.
- `Student` — unique `admission_number` per school; optional linked `User` for CBT.
- `AttendanceRecord` — one row per (student, date). Weekdays only. Term and
  session are denormalised onto the row so per-term reporting needs no date-range join.
- `CheckoutRecord` — one row per (student, date), recording after-school departure.

### Staff
- `StaffRole` — descriptive job title (e.g. "Head of Science"). **Deliberately
  separate from `accounts.Role`**, which is the security-relevant enum. Letting
  schools invent permission levels would make authorisation unauditable.
- `Staff` — profile attached one-to-one to a `User`.
- `TeacherClassAssignment` — *this table is the teacher authorisation boundary.*
- `Notice` — noticeboard entry; set `assigned_to` to turn it into a pending assignment.

### CBT
- `Subject` → `QuestionBank` → `Question` → `Choice`
- `Question.question_type` — `single` (one correct option, radio buttons) or
  `multiple` ("select all that apply", checkboxes). Two to eight options.
- `Exam` — draws `question_count` questions from a bank, with a time window.
- `ExamAttempt` — freezes the randomised question set in `question_order`.
- `StudentAnswer` — correctness is frozen at save time, so editing a question
  later never silently rewrites a student's history. Selections are stored as a
  set (`selected_choices`) for **both** question types: a separate FK for the
  single case plus an M2M for the multiple case would be two sources of truth
  that could disagree.

**Multi-answer marking is all-or-nothing** — every correct option and no
incorrect one. Partial credit would be a change to `grade_selection` and the
marks line in `save_answer` in `cbt/services.py`, and nowhere else.

---

## Local setup

### Prerequisites
- Python 3.11+
- Node 18+
- PostgreSQL 14+
- Redis 6+

### 1. Backend

A virtual environment already exists at `project/venv` (Python 3.14). Activate it:

```bash
cd project

source venv/Scripts/activate      # Git Bash on Windows
# venv\Scripts\activate           # PowerShell / cmd
# source venv/bin/activate        # macOS / Linux
```

To rebuild it from scratch:

```bash
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
```

Then configure the environment:

```bash
cp .env.example .env              # then edit DATABASE_URL / SECRET_KEY
```

> Every `python manage.py …` command below assumes the venv is active. If you'd
> rather not activate it, call the interpreter directly:
> `./venv/Scripts/python.exe manage.py migrate`

Create the database:

```bash
createdb school_management        # or: psql -c "CREATE DATABASE school_management;"
```

Migrate and seed:

```bash
python manage.py migrate
python manage.py seed_demo        # two demo schools — see credentials below
python manage.py runserver
```

The API is now at `http://localhost:8000/api/`.

### 2. Celery (second terminal)

```bash
celery -A school_management worker -l info          # Windows: add --pool=solo
celery -A school_management beat -l info            # for the expiry sweeper
```

Register the sweeper on a schedule (recommended — it catches attempts whose
countdown task was lost to a broker restart):

```python
# school_management/settings.py
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'sweep-expired-exam-attempts': {
        'task': 'cbt.tasks.sweep_expired_attempts',
        'schedule': crontab(minute='*/5'),
    },
}
```

> **No Redis locally?** Set `CELERY_TASK_ALWAYS_EAGER=True` in `.env` to run
> tasks inline. Exams still work — auto-submit falls back to the sweeper and to
> the server-side expiry check on every answer save.

### 3. Frontend

```bash
npm install
npm run dev                       # http://localhost:5173
```

Point the SPA at a non-default API host with `VITE_API_BASE_URL` in `.env.local`.

### Demo credentials

`seed_demo` creates two schools with identical structures, which makes the
isolation boundary easy to see. Password for all: `Passw0rd!2025`

| User | Role |
|---|---|
| `platformadmin` | Super admin (no school) |
| `admin1` / `admin2` | School admin — Greenfield / Sunrise |
| `teacher1` / `teacher2` | Teacher, assigned to one class only |
| `student1` / `student2` | Student with a published exam waiting |

Log in as `admin1`, note a student id from `admin2`'s school, and request it —
you get a 404.

---

## API reference

All endpoints require `Authorization: Bearer <access>` except login. All list
endpoints are paginated (`?page=`, `?page_size=`, max 200) and support
`?search=` and `?ordering=`.

### Auth
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/login/` | Returns `access`, `refresh`, `user` |
| POST | `/api/auth/refresh/` | Rotates the refresh token |
| GET/PATCH | `/api/auth/me/` | Own profile |
| POST | `/api/auth/change-password/` | |

### Students & academic structure
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/students/` | Filter: `classroom`, `status`, `gender`, `classroom_name` |
| GET/PATCH/DELETE | `/api/students/{id}/` | Write requires admin |
| POST | `/api/students/{id}/create-account/` | Provision a CBT login |
| GET | `/api/students/stats/` | Counts by status/gender |
| GET/POST | `/api/classrooms/` | |
| GET | `/api/classrooms/{id}/students/` | Class register |
| GET/POST | `/api/sessions/`, `/api/terms/` | Admin write, everyone reads |
| GET | `/api/terms/current/` | Active term + session |

### Attendance & checkouts
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/attendance/` | Filter: `student`, `classroom`, `term`, `date`, `date_from`, `date_to`, `status` |
| POST | `/api/attendance/bulk-mark/` | Mark a whole class for one day |
| GET | `/api/attendance/summary/` | Per-status counts + attendance rate |
| GET/POST | `/api/checkouts/` | Same filters |

### Staff
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/staff/` | POST creates the User **and** Staff together |
| POST | `/api/staff/{id}/deactivate/` | Disables login, keeps history |
| GET | `/api/staff/teachers/` | Teaching accounts only |
| GET/POST | `/api/staff/roles/` | Job titles |
| GET/POST | `/api/staff/assignments/` | Teacher → class binding |
| GET | `/api/staff/assignments/my-classes/` | Caller's own classes |
| GET/POST | `/api/staff/notices/` | Noticeboard |
| GET | `/api/staff/notices/pending/` | Default board view |
| POST | `/api/staff/notices/{id}/complete/` | Assignee or admin only |

### CBT
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/cbt/subjects/`, `/api/cbt/question-banks/` | |
| GET/POST | `/api/cbt/questions/` | **Staff only** — contains answer keys |
| PATCH/DELETE | `/api/cbt/questions/{id}/` | Edit or delete. Staff only |
| GET/POST | `/api/cbt/exams/` | |
| POST | `/api/cbt/exams/{id}/publish/` | Refuses if the bank is too small |
| POST | `/api/cbt/exams/{id}/close/` | |
| GET | `/api/cbt/exams/{id}/results/` | Mark sheet + summary |
| GET | `/api/cbt/exams/available/` | **Student** — exams they may sit |
| POST | `/api/cbt/attempts/start/` | Returns attempt + personalised paper |
| GET | `/api/cbt/attempts/{id}/paper/` | Resume after a disconnect |
| POST | `/api/cbt/attempts/{id}/save-answer/` | Auto-save one answer |
| POST | `/api/cbt/attempts/{id}/save-answers/` | Batched auto-save |
| POST | `/api/cbt/attempts/{id}/submit/` | Grade and close |
| GET | `/api/cbt/attempts/{id}/result/` | Score + breakdown |
| GET | `/api/cbt/attempts/{id}/timer/` | Lightweight countdown resync |

### Import / export
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/dataio/imports/upload/` | Validate + preview. **Writes nothing.** |
| GET | `/api/dataio/imports/{id}/preview/` | Re-validate the stored file |
| POST | `/api/dataio/imports/{id}/commit/` | Write the valid rows |
| GET | `/api/dataio/imports/template/?kind=` | Blank CSV template |
| GET | `/api/dataio/imports/` | Import history |
| GET | `/api/dataio/exports/preview/?kind=` | First 20 rows as JSON |
| GET | `/api/dataio/exports/download/?kind=` | Full CSV |

### Platform
| Method | Endpoint | Notes |
|---|---|---|
| GET/POST | `/api/schools/` | **Super admin only** |
| GET | `/api/health/` | Unauthenticated health check |
| GET | `/api/school/branding/` | Own school's colour and logo. Any member may read |
| PATCH | `/api/school/branding/` | Change them. **School admin only** |

---

## Example requests & responses

### Login

```http
POST /api/auth/login/
Content-Type: application/json

{"username": "admin1", "password": "Passw0rd!2025"}
```

```json
{
  "access": "eyJhbGciOiJIUzI1NiIs...",
  "refresh": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "username": "admin1",
    "full_name": "School Administrator",
    "role": "school_admin",
    "school": {"id": 1, "name": "Greenfield Academy", "code": "DEMO1"}
  }
}
```

The access token carries `role` and `school_id` claims so the SPA can route
without an extra round-trip. **The backend re-reads both from the database on
every request and never trusts the claims for access control.**

### Create a student

```http
POST /api/students/
Authorization: Bearer <access>

{
  "admission_number": "DEMO1/025",
  "first_name": "Ada", "last_name": "Lovelace",
  "gender": "female", "classroom": 1,
  "parent_name": "Mr Lovelace", "parent_phone": "08030000000"
}
```

`201 Created`. Note that a `school` field in the body is **ignored** — the row is
always stamped with the caller's school.

### Cross-tenant access

```http
GET /api/students/57/          # 57 belongs to another school
Authorization: Bearer <admin1 access>
```

```json
404 Not Found
{"detail": "No Student matches the given query."}
```

### Mark a class register

```http
POST /api/attendance/bulk-mark/

{
  "date": "2026-07-17",
  "term": 1,
  "classroom": 1,
  "entries": [
    {"student": 1, "status": "present"},
    {"student": 2, "status": "absent", "remark": "Sick"},
    {"student": 3, "status": "late"}
  ]
}
```

```json
201 Created
{"marked": 3, "date": "2026-07-17"}
```

Idempotent — re-posting the same day upserts on `(student, date)`, because
re-marking a register (a late student arrives) is routine, not an error.

Rejected cases: weekends, dates outside the term, students from another school,
and the same student twice in one payload.

### Sit an exam

```http
POST /api/cbt/attempts/start/
{"exam": 1}
```

```json
201 Created
{
  "attempt": {
    "id": 1, "status": "in_progress", "attempt_number": 1,
    "expires_at": "2026-07-19T12:20:00Z", "seconds_remaining": 1200,
    "score": null, "percentage": null
  },
  "exam": {"id": 1, "title": "Mathematics — First Term Test", "duration_minutes": 20},
  "questions": [
    {
      "id": 7, "text": "What is 3 × 3?", "marks": 2, "selected_choice": null,
      "choices": [{"id": 26, "text": "10"}, {"id": 25, "text": "9"}]
    }
  ]
}
```

`score` is `null` and no `is_correct` appears anywhere until the attempt closes.

```http
POST /api/cbt/attempts/1/save-answer/
{"question": 7, "choice": 25}
```

```json
200 OK
{"saved": true, "seconds_remaining": 1187}
```

```http
POST /api/cbt/attempts/1/submit/
```

```json
200 OK
{
  "id": 1, "status": "submitted",
  "score": "20.00", "total_marks": 20, "percentage": "100.00", "is_passed": true,
  "breakdown": [
    {"question_id": 7, "question": "What is 3 × 3?", "selected": "9",
     "is_correct": true, "marks_awarded": 2.0, "explanation": "3 × 3 = 9."}
  ]
}
```

### Import students

```http
POST /api/dataio/imports/upload/
Content-Type: multipart/form-data

kind=students
file=@students.csv
```

```json
201 Created
{
  "job": {"id": 3, "status": "validated"},
  "columns": ["admission_number", "first_name", "last_name", "gender", "..."],
  "preview": [{"admission_number": "IMP/001", "first_name": "Grace", "_line": 2}],
  "errors": [
    {"line": 4, "message": "gender: \"martian\" must be male, female or other."},
    {"line": 5, "message": "classroom: \"SS 9 Z\" does not exist. Create the class first."}
  ],
  "summary": {"total_rows": 5, "valid_rows": 2, "error_rows": 3}
}
```

Nothing has been written yet. Approve it:

```http
POST /api/dataio/imports/3/commit/
```

```json
200 OK
{"created": 2, "updated": 0, "skipped": 3, "async": false}
```

Committing again returns `409 Conflict`.

---

## CBT engine

Implemented in `cbt/services.py`. The properties that matter:

**Randomisation.** At start, `build_question_set` samples `question_count`
questions from the bank and shuffles each question's choices. The result is
frozen into `ExamAttempt.question_order` / `choice_order`, so a refresh, a
reconnect, or a Celery auto-submit all operate on exactly the paper the student
was given.

**Server-authoritative timing.** `ExamAttempt.expires_at` in Postgres is the
source of truth. Redis holds a fast-path mirror of the deadline; if Redis is
down the exam still runs correctly, it just loses the cache. The client
countdown is cosmetic and resyncs against `/timer/` every 30 seconds, so a
paused tab or a tampered client clock buys no extra time.

**Auto-save.** Every answer is upserted on `(attempt, question)`, so saving is
idempotent and safe to call on every click. The frontend batches on a 2s cadence
and re-queues failed writes, so a flaky connection degrades to a delay rather
than lost answers.

**Auto-submit — three independent guarantees**, because an exam that never
closes is a data-integrity bug:
1. A Celery task scheduled with a countdown at attempt start.
2. A server-side expiry check on *every* answer save — a late write closes the
   attempt rather than being accepted.
3. `sweep_expired_attempts`, a beat task that catches anything whose scheduled
   task was lost to a broker restart.

All three funnel into `finalise_attempt`, which locks the row and no-ops if
another caller got there first, so double submission is impossible.

**A subtlety worth preserving:** `finalise_attempt` must *commit* before the
"time expired" error is raised. `save_answer` and `start_attempt` are therefore
deliberately **not** wrapped in a single `@transaction.atomic` — doing so rolls
the close back along with the exception and leaves the attempt open forever.
There are regression tests for exactly this.

**Retakes** are blocked once `max_attempts` submitted attempts exist. Raising
`max_attempts` is the only way to allow another sitting.

---

## CSV import / export

Every importer implements a two-phase contract:

```python
validate(rows)  -> (clean_records, errors)   # no writes — drives the preview
commit(records) -> {'created': n, 'updated': n}
```

Splitting them is what makes "preview before saving" honest: the preview the
user approves is produced by the exact same validation the commit relies on.

- **Row-level errors don't block the file.** Valid rows commit; invalid rows are
  reported with line numbers. One bad row should not reject an otherwise good roster.
- **File-level problems reject the upload** (missing headers, unknown columns,
  empty file, over the row/size cap). A typo'd header is a mistake the uploader
  wants to know about, not something to silently drop.
- **Re-importing updates rather than duplicating**, keyed on `admission_number`.
- **Imports over 500 rows** are handed to Celery and the endpoint returns `202`.
- **Encoding** — UTF-8 with BOM and cp1252 are both handled, because Excel on
  Windows produces them constantly.
- **Tenancy** — importers are constructed with a school and stamp it on every
  row. A CSV naming another school's classroom simply fails to resolve.

Supported: `students`, `staff`, `questions`, `attendance`, `checkouts`.
Attendance and checkouts require a `term`.

Exports mirror the same shapes, and the question exporter **round-trips** — an
exported questions CSV re-imports cleanly, which is covered by a test.

Get a blank template for any dataset at
`/api/dataio/imports/template/?kind=students`.

---

## Frontend structure

```
src/
├── App.tsx                       Role-aware tab routing
├── context/AuthContext.tsx       JWT lifecycle, role helper `can(...)`
├── services/api.ts               Typed API client, refresh-on-401
├── types/index.ts                Shared types mirroring the API
├── utils/dates.ts                Local-calendar date helpers (never UTC)
└── components/
    ├── UI/Primitives.tsx         Button, Modal, Alert, Field, Badge, TableWrap
    ├── Auth/Login.tsx
    ├── Dashboard/Dashboard.tsx
    ├── Academics/
    │   └── AcademicsManager.tsx  Sessions, terms, classes, subjects
    ├── Students/StudentManager.tsx
    ├── Attendance/
    │   ├── AttendanceManager.tsx Daily register — bulk mark a class
    │   └── CheckoutManager.tsx
    ├── Staff/
    │   ├── StaffManager.tsx      Staff, class assignments
    │   └── Noticeboard.tsx       Top-level section, not a Staff tab
    ├── CBT/
    │   ├── CBTManager.tsx        Routes by role
    │   ├── StudentExams.tsx      Available exams, resume, results
    │   ├── ExamRunner.tsx        Timer, navigation, auto-save
    │   └── ExamAdmin.tsx         Exams, question banks, mark sheets
    └── DataIO/
        ├── ImportManager.tsx     Upload → preview → commit
        └── ExportManager.tsx     Filter → preview → download
```

The sidebar is role-filtered, and `App.tsx` only routes tabs the current role
may reach — a hand-typed hash for a forbidden tab lands on the dashboard.

### Set-up order

Academics comes first: **session → term → classes → subjects**. Attendance,
checkouts and exams all hang off a *current* term, so the register and checkout
screens link back to Academics when one isn't set rather than failing silently.

Setting a session or term current demotes the previous one automatically. That
demotion happens **before** the new row is written — the partial unique
constraint (`one_current_session_per_school`) is evaluated during the write
itself, so demoting afterwards never runs and the write fails with a 409.

### Theming

An admin sets **one** brand colour under Appearance. `src/utils/theme.ts`
derives the whole 50–950 ramp from it, plus the text colour that sits on top,
and writes them to CSS custom properties. Tailwind's `brand-*` classes read
those properties (`tailwind.config.js`), so changing the colour re-themes every
component at once.

That constraint is deliberate: an admin can change the product's hue but cannot
produce unreadable white-on-yellow buttons, because the foreground is computed
from luminance rather than configured. Use `text-brand-contrast` — never a
hardcoded `text-white` — on any brand-coloured surface.

Semantic colours (green success, red error, amber warning) stay fixed. Meaning
must never depend on the brand colour, which is also why attendance statuses use
literal colours rather than `brand-*`.

Branding travels on the `/auth/me` payload so the SPA themes itself on first
paint with no extra request and no flash of the default blue.

### Mathematical and physics notation

Question text, answer options and explanations may contain LaTeX between
delimiters — `$…$` inline, `$$…$$` centred on its own line, `\(…\)` and
`\[…\]` equivalently, and `\$` for a literal dollar sign. KaTeX typesets it in
the exam runner, the question bank and the results breakdown; the editor shows a
live "Student sees" preview plus a symbol palette so an author who does not
write LaTeX can still insert a fraction or a vector.

Nothing about storage changed — formulas are ordinary text in the existing
fields, so questions written before this feature still read back byte-for-byte,
and plain-text questions are unaffected.

Three properties are deliberate and worth preserving:

* **The tokeniser fails safe.** A formula is only recognised when its closing
  delimiter is present, and an inline `$…$` must have non-space characters just
  inside it. "It costs $5 and $10" therefore renders as currency rather than
  turning "5 and " into mathematics. An unmatched delimiter is ordinary text.
* **Rendering cannot throw.** `throwOnError: false` makes KaTeX print a
  malformed formula in red instead of raising; an exception during an exam would
  blank a student's screen.
* **Nothing executable is injected.** `trust: false` means KaTeX refuses
  `\href`, `\includegraphics` and friends, so its output carries no author
  markup. Prose segments never go through `dangerouslySetInnerHTML` at all —
  React escapes them.

KaTeX lives in the lazily-loaded CBT chunk, so anyone who never opens an exam
does not download it. See `src/utils/math.ts` and `src/components/UI/MathText.tsx`.

### Dates are local, never UTC

`src/utils/dates.ts` formats dates from local calendar fields.
`new Date().toISOString().slice(0, 10)` returns *yesterday* for the first hours
after midnight in any timezone ahead of UTC, which would file a register against
the wrong school day. Don't reintroduce `toISOString()` for calendar dates.

**Token refresh coalescing** (`services/api.ts`) is worth knowing about: the CBT
screen fires auto-saves continuously, so an expiring access token can produce a
burst of simultaneous 401s. A shared `refreshPromise` ensures one refresh call;
without it, `ROTATE_REFRESH_TOKENS` would fail all but the first and log a
student out mid-exam.

### Out-of-scope legacy modules

The pre-MVP scaffold included Timetable, Results, Memos, and Notifications.
Per the MVP scope these are **unwired from the UI** but left on disk for
reference. They are listed in `tsconfig.app.json`'s `exclude` because they
reference APIs and types that no longer exist. Delete those directories and the
`exclude` block to remove them for good.

---

## Testing

```bash
python manage.py test tests --settings=tests.settings_test
```

`tests/settings_test.py` uses SQLite, in-memory cache, and eager Celery, so the
suite runs without Postgres or Redis. **144 tests**, weighted toward the things
that would be expensive to get wrong:

- `test_isolation.py` — cross-tenant reads/writes, forged `school` fields,
  FKs pointing at other tenants, role boundaries, inactive-school lockout,
  teacher class scoping, attendance validation.
- `test_cbt.py` — attempt lifecycle, resume, randomisation, grading, idempotent
  finalisation, expiry, auto-submit, the sweeper, retake limits, and API-level
  checks that answer keys never leak.
- `test_dataio.py` — preview-writes-nothing, partial commits, duplicate
  detection, header validation, BOM handling, cross-tenant import attempts,
  export scoping, and the question export→import round trip.
- `test_academics.py` — session/term creation, the current-flag swap (which
  regressed to a 409 once and is now pinned), classroom and subject uniqueness,
  academic RBAC, and the human-readable duplicate messages.
- `test_multi_answer.py` — authoring guards for both question types, edit and
  delete, all-or-nothing marking (partial selections, extra selections,
  ordering, duplicates), resume with a multi-selection, and branding
  permissions and per-school isolation.
- `test_formulas.py` — LaTeX source survives the API, the database and the CSV
  round trip unchanged: backslashes, commas, quotes and newlines all have
  special meaning to CSV and none of them may corrupt a question.

Frontend:

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

---

## Production deployment

### Environment

Set at minimum:

```bash
SECRET_KEY=<50+ random chars>
DEBUG=False
ALLOWED_HOSTS=api.yourdomain.com
DATABASE_URL=postgres://user:pass@host:5432/school_management
REDIS_URL=redis://host:6379/0
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
AWS_STORAGE_BUCKET_NAME=your-bucket        # enables S3 for uploads
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_REGION_NAME=us-east-1
```

With `DEBUG=False`, `settings.py` turns on SSL redirect, HSTS, secure cookies,
`X-Frame-Options: DENY`, and nosniff.

### File storage

CSV uploads go to S3 whenever `AWS_STORAGE_BUCKET_NAME` is set, namespaced per
school (`imports/school-<id>/`) so a misconfigured bucket policy cannot become a
cross-tenant leak. Without it, local media is used — acceptable for development
only.

### Processes

```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput

gunicorn school_management.wsgi:application --bind 0.0.0.0:8000 --workers 4
celery -A school_management worker -l info --concurrency 4
celery -A school_management beat -l info
```

Frontend: `npm run build`, then serve `dist/` from any static host or CDN.

### Operational notes

- **Run the beat sweeper.** Without it, an attempt whose countdown task was lost
  to a broker restart stays open until someone notices.
- **Scale workers with concurrent exams.** Each in-flight attempt holds one
  scheduled task.
- **Indexes are already in place** for the hot paths: `(school, classroom)`,
  `(school, status)`, `(term, date)`, `(status, expires_at)`. Watch
  `AttendanceRecord` first as it grows fastest — one row per student per school day.
- **Back up before bulk imports.** Import commits are atomic per file, but a
  successful import of the wrong file is not something the app can undo.
