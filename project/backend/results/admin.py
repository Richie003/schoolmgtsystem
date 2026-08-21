from django.contrib import admin

from results.models import (
    AssessmentComponent,
    ClassResultSheet,
    GradeBand,
    GradingScheme,
    ReportTemplateSettings,
    StudentReport,
    SubjectResult,
)


class ComponentInline(admin.TabularInline):
    model = AssessmentComponent
    extra = 0


class BandInline(admin.TabularInline):
    model = GradeBand
    extra = 0


@admin.register(GradingScheme)
class GradingSchemeAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'is_default', 'is_active')
    inlines = [ComponentInline, BandInline]


@admin.register(ClassResultSheet)
class ClassResultSheetAdmin(admin.ModelAdmin):
    list_display = ('classroom', 'term', 'status', 'school')
    list_filter = ('status',)


admin.site.register(SubjectResult)
admin.site.register(StudentReport)
admin.site.register(ReportTemplateSettings)
