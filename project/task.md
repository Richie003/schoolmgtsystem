You are a senior software architect and Django + React engineer.

Your task is to review the current system and add, design and implement a production-ready MVP for a multi-tenant School Management System focused ONLY on:

1. Student Management(includes week days attendance marking and check out markings per day for students going home)
2. Staff Management
3. CBT (Computer-Based Testing) System
4. Data Import Functionality

Do NOT include any other modules such as finance, messaging, library, transport, etc.

---

## SYSTEM OVERVIEW

* Multi-school (multi-tenant) SaaS system
* Each school’s data must be completely isolated
* Backend: Django + Django REST Framework
* Frontend: React (SPA)
* Database: PostgreSQL
* Cache/Queue: Redis
* Background jobs: Celery

---

## CORE REQUIREMENTS

### 1. MULTI-TENANCY

* Create a School model
* Every entity (students, staff, exams, etc.) must be linked to a School
* Ensure all queries are scoped to the authenticated user’s school
* Prevent cross-school data access

---

## 2. STUDENT MANAGEMENT MODULE

### Models:

* Student
* Classroom (class + arm)
* AcademicSession
* Term
* Attendance/term and session
* Checkouts/term and session

### Features:

* Create, update, delete student
* Assign student to class
* Store basic info (name, gender, DOB, parent contact)
* List students by class
* Bulk upload students via CSV
* Mark students attendance per day in a term and session
* Mark students check outs after school per day in a term and session

---

## 3. STAFF MANAGEMENT MODULE

### Models:

* Staff
* Role (Admin, Teacher, etc.)
* TeacherClassAssignment
* Noticeboard

### Features:

* Create and manage staff accounts
* Assign roles (Admin, Teacher)
* Assign teachers to specific classes
* Authentication system (JWT-based)
* Noticeboard for pending assignments

---

## 4. ROLE & PERMISSION SYSTEM

Implement RBAC:

Roles:

* Super Admin (platform level)
* School Admin
* Teacher
* Student

Requirements:

* Only Admin can create students/staff
* Teachers can only access assigned classes
* Students can only access their own data and exams
* Enforce permissions at backend level (DRF permission classes)

---

## 5. CBT SYSTEM

### Models:

* Subject
* QuestionBank
* Question (MCQ only for MVP)
* Choice
* Exam
* ExamAttempt
* StudentAnswer

### Features:

* Teachers/Admin can create questions
* Create exam by selecting subject and number of questions
* Randomize questions per student
* Timer-based exam
* Auto-save answers (important)
* Auto-submit when time expires
* Auto-marking
* Store score
* Prevent retakes unless allowed

---

## CBT LOGIC DETAILS

* When student starts exam:

  * Generate a unique question set
  * Store in ExamAttempt
* Use Redis for:

  * Timer tracking
  * Auto-submit triggers
* Use Celery for:

  * Forced submission when time expires

---

## 6. DATA IMPORT SYSTEM

### Requirements:

Allow CSV upload for:

* Students
* Staff
* Questions
* Students Attendance and check outs

### Features:

* Upload CSV file
* Validate structure (headers, required fields)
* Show preview before saving
* Handle errors (invalid rows)
* Bulk insert into database
* Ensure imported data is linked to correct school

---

## 6. DATA EXPORT SYSTEM

### Requirements:

Allow CSV upload for:

* Students
* Staff
* Questions
* Students Attendance and check outs

### Features:

* Download CSV file
* Show preview before export
* Ensure exported data is linked to correct school

## AUTHENTICATION

* JWT-based authentication
* Login endpoint
* Role included in token payload
* Middleware to enforce:

  * Authenticated user
  * School isolation

---

## API DESIGN

Use RESTful endpoints:

Examples:

* /api/students/
* /api/staff/
* /api/cbt/exams/
* /api/cbt/attempts/
* /api/import/students/

Include:

* Pagination
* Filtering (by class, subject)
* Proper status codes

---

## FRONTEND (REACT)

### Pages:

* Login page
* Dashboard (basic)
* Student management
* Staff management
* CBT exam interface
* CSV upload interface

### CBT UI:

* Timer countdown
* Question navigation
* Auto-save answers
* Submit button

---

## 🗄 DATABASE

* Use PostgreSQL
* Proper foreign key relationships
* Index frequently queried fields
* Ensure referential integrity

---

## FILE STORAGE

* Use cloud storage (e.g., S3) for CSV uploads
* Do not store files locally

---

## BACKGROUND TASKS

Use Celery for:

* CBT auto-submit
* Bulk import processing

---

## SECURITY REQUIREMENTS

* Validate all inputs
* Prevent unauthorized access
* Ensure students cannot access others’ data
* Enforce school-level isolation everywhere

---

## DELIVERABLES

Provide:

1. Django models
2. DRF serializers
3. API views/viewsets
4. Permission classes
5. React component structure
6. CBT logic implementation
7. CSV import logic
8. Example API requests/responses
9. Setup instructions (local + production-ready)

---

## IMPORTANT

* Write clean, modular, scalable code
* Use best practices
* Avoid unnecessary complexity
* Focus on MVP but keep extensibility in mind

---

End of instructions.
