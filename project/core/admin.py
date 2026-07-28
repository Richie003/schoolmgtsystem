from django.contrib import admin

from core.models import School


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'email', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'code', 'email')
    prepopulated_fields = {'slug': ('name',)}
