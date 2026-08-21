from django.contrib import admin

from .models import GameAnswer, GamePlayer, GameSession


class GamePlayerInline(admin.TabularInline):
    model = GamePlayer
    extra = 0
    fields = ('nickname', 'score', 'streak', 'joined_at')
    readonly_fields = fields


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ('pin', 'title', 'school', 'status', 'current_index', 'created_at')
    list_filter = ('status', 'school')
    search_fields = ('pin', 'title')
    inlines = [GamePlayerInline]


@admin.register(GameAnswer)
class GameAnswerAdmin(admin.ModelAdmin):
    list_display = ('player', 'question_index', 'is_correct', 'points', 'response_ms')
    list_filter = ('is_correct',)
