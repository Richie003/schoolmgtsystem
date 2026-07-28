# Proposal for a School Management System

**Prepared for:** [SCHOOL NAME]
**Prepared by:** [YOUR COMPANY / YOUR NAME]
**Date:** [DATE]
**Contact:** [EMAIL] · [PHONE]

---

## 1. Executive summary

[SCHOOL NAME] currently runs its student records, staff records, daily
attendance and examinations across a mixture of paper registers, spreadsheets
and individual memory. Each of those works in isolation. None of them talks to
the others, and every one of them depends on a specific person being present on
a specific day.

We propose to deploy a single web-based School Management System covering four
areas of the school's daily operation:

1. **Student management** — records, classes, daily attendance, and after-school checkout
2. **Staff management** — staff records, teaching assignments, and a noticeboard
3. **Computer-Based Testing (CBT)** — question banks, timed online exams, and automatic marking
4. **Data import and export** — bulk onboarding from spreadsheets, and data the school can take out at any time

The system is deliberately scoped. It does not attempt to be a finance package,
a library system or a transport tracker. It does the four things above
thoroughly, and it is built so the school's own data never mixes with any other
institution's.

The outcome we are proposing is specific: **the register is marked in under a
minute per class, examinations mark themselves the moment a student submits, and
a full term's records can be exported to a spreadsheet whenever the school
wants them.**

---

## 2. Where the time currently goes

Before describing features, it is worth naming the work the school does today
that this system is designed to absorb.

| Current practice | Cost to the school |
|---|---|
| Paper registers, later copied into a summary sheet | The same information is written twice; the summary is only as accurate as the copying |
| Attendance totals compiled at the end of term | Hours of manual counting, and no way to see a pattern until it is too late to act on it |
| Question papers typed, photocopied, distributed, collected | Reprographics cost, and papers that leak before the exam |
| Scripts marked by hand | Days of teacher time per exam; arithmetic errors in totals |
| Student records in one teacher's notebook or laptop | The record leaves when the person does |
| Roster changes re-typed into several documents | The documents disagree, and nobody is sure which is current |

None of these are failures of effort. They are the natural cost of running an
institution on tools that were never connected to each other.

---

## 3. What the system provides

### 3.1 Student management

**Student records.** Every student has one record holding names, gender, date of
birth, admission number, class, status, and parent/guardian contact details.
Admission numbers are enforced as unique within the school, so the same number
cannot be issued twice.

**Academic structure.** The school defines its own academic sessions, terms,
classes and arms — the system does not impose a structure. Exactly one session
and one term are marked current at any time, and setting a new one automatically
retires the previous one, so there is never ambiguity about which term a record
belongs to.

**Daily attendance.** A teacher opens their class, sees the full register on one
screen, and marks the whole class in a single action. Statuses are Present,
Absent, Late and Excused, with an optional remark ("Sick", "Hospital
appointment"). Three details matter in practice:

- The register only accepts weekdays, and only dates that fall inside the term
  being marked. A register cannot be filed against a Saturday or against last
  term by accident.
- **Re-marking is safe.** A student who arrives late after the register has been
  filed is simply updated — re-submitting the register corrects it rather than
  creating a duplicate entry.
- Each attendance record carries its term and session, so a per-term attendance
  report is immediate rather than a manual date-range count.

**After-school checkout.** A separate daily log records departure after school —
who left, when, and with whom. This is the record that matters on the day a
parent asks what time their child left, and it is the record that is hardest to
reconstruct from memory a week later.

**Attendance reporting.** Present/absent/late/excused counts and an attendance
rate are available for any class, any student, and any date range, without
anyone compiling them by hand.

### 3.2 Staff management

**Staff records and accounts.** Creating a staff member creates their login at
the same time — one step, not two. Records hold names, contact details,
employment date and job title.

**Job titles are separate from system permissions.** The school can create any
job title it likes ("Head of Science", "Games Master") without that title
granting access to anything. What a person can *do* in the system is governed by
a small, fixed set of roles. This is deliberate: it means the school can never
accidentally grant administrative access by naming someone's position.

**Teaching assignments.** Teachers are assigned to specific classes. That
assignment is the boundary of what they can see — a teacher assigned to JSS 2A
sees JSS 2A's students and register, and nothing else. This is enforced by the
system itself rather than by convention.

**Deactivation preserves history.** When a staff member leaves, their account is
deactivated rather than deleted. They can no longer log in, but the registers
they marked and the exams they set remain intact and attributable.

**Noticeboard.** A shared board for announcements and pending assignments. A
notice can be addressed to a specific member of staff, at which point it becomes
a tracked task that they mark complete — useful for "submit your scheme of work"
and similar follow-ups that otherwise live in a WhatsApp group.

### 3.3 Computer-Based Testing

**Question banks.** Questions are organised by subject into reusable banks.
Every question can carry an explanation, shown to the student after marking, so
an exam doubles as a teaching moment. Two question types are supported:
single-answer multiple choice, and "select all that apply" with between two and
eight options.

**Exam creation.** A teacher creates an exam by choosing a bank, a number of
questions, a duration, a pass mark and a time window. The system refuses to
publish an exam whose bank does not hold enough questions — a failure mode
caught at setup rather than on exam morning.

**Every student sits a different paper.** Questions are drawn at random from the
bank for each student, and the options within each question are shuffled. Two
students sitting side by side see different questions in a different order,
which substantially reduces copying without any additional invigilation.

**The clock is kept by the server.** The countdown a student sees on screen is
cosmetic and re-synchronises with the server continuously. Changing the device
clock, closing the tab, or refreshing the page buys no extra time. The exam ends
when the school's clock says it ends.

**Answers save continuously.** Every selection is saved as it is made. If a
laptop dies, the power goes out, or a browser crashes, the student logs back in
and resumes on the same paper with the same questions and their answers intact,
and the clock reflects the time genuinely elapsed. A flaky internet connection
delays a save rather than losing an answer.

**Exams close themselves.** When time expires the attempt is submitted and
marked automatically, whether or not the student clicked submit, and whether or
not their device was still connected. There are three independent mechanisms
that guarantee this, because an exam that stays open indefinitely is a records
problem the school should never have to think about.

**Marking is instant.** Scores, percentages, pass/fail and a per-question
breakdown are available the moment an attempt closes. For "select all that
apply" questions the default is all-or-nothing marking — every correct option
and no incorrect one.

**Answer keys never reach the student's device.** The paper a student is served
contains no indication of which option is correct — not hidden, not greyed out,
not present in the underlying data at all. Students cannot reach the question
management area, and correctness is only revealed after the attempt closes.

**Results are frozen at the time of marking.** If a question is later edited or
deleted, past students' results do not silently change. What the school recorded
is what the school keeps.

**Retakes are controlled.** An exam specifies how many attempts are permitted.
Once used, a further sitting requires a deliberate decision by a teacher or
administrator — it cannot happen by a student reloading the page.

### 3.4 Data import and export

**Bulk onboarding.** Students, staff, questions, attendance and checkout records
can all be loaded from a CSV spreadsheet. A blank template is available for each
one, so the school is never guessing at the required columns.

**Preview before anything is saved.** An uploaded file is validated and
displayed for approval first. Nothing is written to the school's records until
someone reviews the preview and confirms it. Errors are reported per row with
the line number and a plain-English explanation — *"line 5: class 'SS 9 Z' does
not exist. Create the class first."*

**One bad row does not reject the file.** Valid rows are imported; problem rows
are listed for correction. A roster of 400 students is not rejected because
three have a typo.

**Re-importing updates rather than duplicates.** Uploading a corrected version
of a roster updates the existing students rather than creating a second copy of
every child.

**Spreadsheets from Excel work.** The specific file encodings Microsoft Excel
produces on Windows are handled directly. The school does not need to know what
"UTF-8 with BOM" means.

**Export at any time.** Students, staff, questions, attendance and checkout data
can all be previewed and downloaded as CSV for reporting, archiving, or for the
school's own records. The school's data belongs to the school and can be
retrieved without our involvement.

---

## 4. Access control — who can see what

Four roles, enforced by the system rather than by policy:

| Role | What they can do |
|---|---|
| **School Administrator** | Full control within the school — students, staff, classes, exams, imports, reports |
| **Teacher** | Their assigned classes only. Marks registers, authors questions, sets and reviews exams |
| **Student** | Their own record, the exams they are eligible for, and their own results |
| **Platform Administrator** | Technical account for provisioning and support. Not a school role |

Two properties are worth stating plainly to the school:

- **A teacher cannot browse a class they are not assigned to.** Not "should
  not" — the data is not returned to them.
- **A student cannot see another student's results, or their own results before
  the exam closes.**

These are checked automatically as part of our test suite on every change to the
system, rather than being re-verified by hand.

---

## 5. Data protection and isolation

The system is multi-tenant: it serves more than one school from one deployment.
That makes the isolation boundary the single most important property of the
product, and it is built in four independent layers, so that no single mistake
can expose one school's data to another.

A request from [SCHOOL NAME] for a record belonging to another institution does
not return an error saying "access denied" — it returns "not found", because
even confirming that a record exists is more than an outsider should learn.

Additional protections:

- Encrypted connections throughout, with strict transport security enforced in production
- Password-protected accounts with session tokens that expire and renew automatically
- Uploaded files stored in a per-school partition, never in a shared location
- A staff member's school membership is re-verified from the database on every single request, never taken on trust from the browser
- **129 automated tests**, weighted deliberately toward isolation, examination integrity and import correctness — the areas where an error would be expensive rather than merely inconvenient

---

## 6. How this makes the school's operations more efficient

### 6.1 Attendance: from a term of counting to a screen

A class register that today is marked on paper and totalled at the end of term
is marked in one screen and totalled continuously. The attendance rate for a
class, a student, or the whole school is a page the head teacher opens, not a
task assigned to someone.

The practical effect: **a pattern of absence becomes visible in week three
rather than at the end of term**, when the school can still do something about
it. That is the difference between a report and an intervention.

### 6.2 Examinations: days of marking become zero

For a 40-question objective test across 200 students, the school currently pays
for: typing, photocopying, distribution, collection, marking, totalling,
recording, and reconciling disputed totals.

With CBT, the school pays for: authoring the questions once.

Marking happens at submission. Mark sheets are ready before students have left
the hall. Question banks are reused and grown each term, so the second year is
cheaper than the first. Arithmetic disputes disappear, because no arithmetic is
done by hand.

### 6.3 Records: one place, not several

Every record is entered once and read everywhere. A student moved to a different
class is moved once — the register, the class list, and their exam eligibility
all follow. There is no second document to update and no possibility of the two
disagreeing.

Crucially, the record does not live on any individual's laptop. Staff turnover
stops being a data-loss event.

### 6.4 Onboarding: a term's setup in an afternoon

The school's existing student roster, wherever it lives now, becomes the
starting point. Export it to a spreadsheet, upload it, review the preview,
approve. The same applies at the start of each session for new intakes, and to
historical attendance if the school wants prior terms in the system.

The preview step is what makes this safe to do quickly: the school sees exactly
what will be created before anything is created.

### 6.5 Accountability: questions that currently take a phone call

- *"Was this child in school on the 14th?"* — one search.
- *"What time did she leave on Tuesday?"* — the checkout log.
- *"Who marked this register?"* — recorded.
- *"What did this student score in the second CBT?"* — with the per-question breakdown.
- *"How many students are in JSS 2 this term?"* — the dashboard.

Each of these currently costs somebody's time and someone else's patience. None
of them should.

### 6.6 Delegation without risk

Because a teacher's access is bounded by their class assignments, the school can
push data entry down to the people closest to the data — the class teachers —
without the risk that comes from giving everybody access to everything. The
person who knows whether a child was present is the person who marks the
register.

---

## 7. The school's own identity

The system carries [SCHOOL NAME]'s name, logo and colour. An administrator sets
a single brand colour and the entire interface adopts it. Staff and students see
their school's system, not a generic product with someone else's branding.

---

## 8. What the school needs

**Devices.** Any computer, tablet or phone with a modern web browser. There is
nothing to install and no minimum specification beyond that. Administration and
register marking work on a phone; CBT is best on a laptop or tablet.

**Connectivity.** An internet connection at the school. For CBT specifically, a
stable local connection during exam windows — though answers are saved
continuously and attempts resume cleanly after a disconnection, so a brief drop
does not invalidate a sitting.

**People.** One administrator per school who owns setup — sessions, terms,
classes, and staff accounts. Everyone else uses the system without training
beyond a short walkthrough.

**Data.** The school's current student and staff lists in any spreadsheet
format. We will handle conversion.

---

## 9. What is deliberately not included

We would rather be clear about scope than discover a mismatch after signing.
The system does not currently include: fees and finance, library management,
transport or vehicle tracking, hostel management, SMS or email messaging to
parents, timetable generation, or a parent-facing portal.

These are real needs for many schools, and several are natural extensions of
what is already built. They are simply not part of what we are proposing today,
and we would rather deliver four modules the school will use every day than
twelve it will use once.

---

## 10. Why this system

**It is built for the way the school actually works.** Terms and sessions,
classes with arms, admission numbers, after-school checkout, weekday registers —
these are not adaptations of a foreign product. They are the model.

**It is honest about failure.** Exams that lose connection resume. Registers
that are re-marked correct themselves. Imports show you what will happen before
it happens. The interesting engineering in this system is in what happens when
something goes wrong, because that is when a school actually needs software to
behave.

**It is scoped, not bloated.** Four modules, each complete. Staff will not spend
their first month navigating around features the school does not use.

**The school's data remains the school's.** Full export, at any time, in a
format any spreadsheet can open.

---

## 11. Next steps

1. **Demonstration** — a walkthrough with the school's leadership and one or two
   class teachers, using sample data, at a time that suits the school.
2. **Pilot** — one class, one term, one CBT assessment. Real data, limited
   scope, no commitment beyond it.
3. **Rollout** — remaining classes onboarded from the school's existing
   spreadsheets, staff accounts created, and administrator training completed.

We would welcome the opportunity to demonstrate the system to [SCHOOL NAME] and
to answer any questions the school's leadership may have.

---

**[YOUR NAME]**
[TITLE], [YOUR COMPANY]
[EMAIL] · [PHONE]
