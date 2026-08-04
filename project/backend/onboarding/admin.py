from django.contrib import admin

from onboarding.models import SchoolInvitation, SchoolSignupRequest


@admin.register(SchoolSignupRequest)
class SchoolSignupRequestAdmin(admin.ModelAdmin):
    list_display = ('school_name', 'contact_email', 'status', 'reviewed_by',
                    'created_at')
    list_filter = ('status',)
    search_fields = ('school_name', 'contact_email', 'contact_name')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(SchoolInvitation)
class SchoolInvitationAdmin(admin.ModelAdmin):
    list_display = ('email', 'school_name', 'status', 'created_by', 'expires_at',
                    'school')
    search_fields = ('email', 'school_name')
    # token_hash is deliberately not shown; there is no admin action that needs it.
    readonly_fields = ('token_hash', 'consumed_at', 'created_at', 'updated_at')
