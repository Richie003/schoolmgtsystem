from django.contrib import admin

from cbtgen.models import AIGenerationSettings, QuestionGenerationJob


@admin.register(AIGenerationSettings)
class AIGenerationSettingsAdmin(admin.ModelAdmin):
    list_display = ('school', 'is_enabled', 'trial_limit', 'trials_used')
    search_fields = ('school__name',)


@admin.register(QuestionGenerationJob)
class QuestionGenerationJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'school', 'subject_name', 'class_level', 'status', 'created_at')
    list_filter = ('status', 'class_level')
    search_fields = ('subject_name', 'school__name')
    readonly_fields = ('generated', 'model_used', 'input_tokens', 'output_tokens')
