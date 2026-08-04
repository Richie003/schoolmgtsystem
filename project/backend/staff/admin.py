from django.contrib import admin

from staff.models import Notice, Staff, StaffRole, TeacherClassAssignment


@admin.register(StaffRole)
class StaffRoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'is_teaching_role')
    list_filter = ('school', 'is_teaching_role')


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ('staff_number', 'user', 'role', 'school', 'employment_status')
    list_filter = ('school', 'employment_status', 'role')
    search_fields = ('staff_number', 'user__first_name', 'user__last_name')
    raw_id_fields = ('user',)


@admin.register(TeacherClassAssignment)
class TeacherClassAssignmentAdmin(admin.ModelAdmin):
    list_display = ('teacher', 'classroom', 'session', 'term', 'is_form_teacher',
                    'is_active')
    list_filter = ('school', 'session', 'is_active', 'is_form_teacher')
    raw_id_fields = ('teacher', 'classroom')


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ('title', 'school', 'priority', 'audience', 'assigned_to',
                    'due_date', 'is_completed')
    list_filter = ('school', 'priority', 'audience', 'is_completed')
    search_fields = ('title', 'body')
