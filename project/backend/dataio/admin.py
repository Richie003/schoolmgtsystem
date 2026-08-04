from django.contrib import admin

from dataio.models import ImportJob


@admin.register(ImportJob)
class ImportJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'kind', 'school', 'status', 'total_rows', 'created_count',
                    'error_count', 'created_at')
    list_filter = ('school', 'kind', 'status')
    readonly_fields = ('errors', 'context')
