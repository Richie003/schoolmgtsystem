from django.contrib import admin

from students.models import (
    AcademicSession,
    AttendanceRecord,
    CheckoutRecord,
    Classroom,
    Student,
    Term,
)


@admin.register(AcademicSession)
class AcademicSessionAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'start_date', 'end_date', 'is_current')
    list_filter = ('school', 'is_current')


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ('name', 'session', 'school', 'start_date', 'end_date', 'is_current')
    list_filter = ('school', 'session', 'is_current')


@admin.register(Classroom)
class ClassroomAdmin(admin.ModelAdmin):
    list_display = ('name', 'arm', 'school', 'capacity', 'is_active')
    list_filter = ('school', 'is_active')
    search_fields = ('name', 'arm')


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        'admission_number', 'first_name', 'last_name', 'classroom', 'school', 'status',
    )
    list_filter = ('school', 'classroom', 'status', 'gender')
    search_fields = ('first_name', 'last_name', 'admission_number')
    raw_id_fields = ('user',)


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('student', 'date', 'status', 'term', 'school')
    list_filter = ('school', 'term', 'status', 'date')
    raw_id_fields = ('student', 'marked_by')
    date_hierarchy = 'date'


@admin.register(CheckoutRecord)
class CheckoutRecordAdmin(admin.ModelAdmin):
    list_display = ('student', 'date', 'checked_out_at', 'released_to', 'school')
    list_filter = ('school', 'term', 'date')
    raw_id_fields = ('student', 'recorded_by')
    date_hierarchy = 'date'
