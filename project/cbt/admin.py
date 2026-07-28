from django.contrib import admin

from cbt.models import (
    Choice,
    Exam,
    ExamAttempt,
    Question,
    QuestionBank,
    StudentAnswer,
    Subject,
)


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 4


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'school', 'is_active')
    list_filter = ('school', 'is_active')
    search_fields = ('name', 'code')


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    list_display = ('name', 'subject', 'school', 'is_active')
    list_filter = ('school', 'subject', 'is_active')


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'bank', 'question_type', 'marks', 'difficulty',
                    'is_active')
    list_filter = ('school', 'bank', 'question_type', 'difficulty', 'is_active')
    search_fields = ('text',)
    inlines = [ChoiceInline]


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ('title', 'subject', 'school', 'status', 'starts_at', 'ends_at')
    list_filter = ('school', 'status', 'subject', 'term')
    search_fields = ('title',)
    filter_horizontal = ('classrooms',)


@admin.register(ExamAttempt)
class ExamAttemptAdmin(admin.ModelAdmin):
    list_display = ('student', 'exam', 'attempt_number', 'status', 'score',
                    'percentage', 'submitted_at')
    list_filter = ('school', 'status', 'exam')
    raw_id_fields = ('student', 'exam')
    readonly_fields = ('question_order', 'choice_order')


@admin.register(StudentAnswer)
class StudentAnswerAdmin(admin.ModelAdmin):
    list_display = ('attempt', 'question', 'answer_summary', 'is_correct')
    list_filter = ('is_correct',)
    raw_id_fields = ('attempt', 'question')
    filter_horizontal = ('selected_choices',)

    @admin.display(description='Selected')
    def answer_summary(self, obj):
        return obj.selected_text() or '—'
