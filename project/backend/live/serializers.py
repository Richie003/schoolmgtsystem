from rest_framework import serializers

from .models import GameSession


class GameSessionSerializer(serializers.ModelSerializer):
    """Host-facing session list/detail. Players never see this — they get the
    trimmed dicts from :mod:`live.services`."""

    bank_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()
    player_count = serializers.SerializerMethodField()
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = GameSession
        fields = [
            'id', 'title', 'bank', 'bank_name', 'subject_name', 'pin', 'status',
            'current_index', 'question_count', 'player_count',
            'seconds_per_question', 'points_base', 'speed_bonus', 'created_at',
        ]
        read_only_fields = ['pin', 'status', 'current_index', 'created_at']

    def get_bank_name(self, obj):
        return str(obj.bank)

    def get_subject_name(self, obj):
        return obj.bank.subject.name

    def get_player_count(self, obj):
        return obj.players.count()

    def validate_seconds_per_question(self, value):
        if not 5 <= value <= 120:
            raise serializers.ValidationError('Choose between 5 and 120 seconds.')
        return value
