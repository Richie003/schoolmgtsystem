"""Live quiz — the Kahoot-style game mode.

A teacher hosts a session drawn from an existing CBT question bank; players join
by a short PIN with just a nickname (no account needed) and answer on their own
devices. It is deliberately *just for fun* — scores here never touch the
gradebook or report cards.

State is driven over plain HTTP polling, so this needs no realtime
infrastructure beyond the database it already has. The host owns the clock: a
player's response time is measured server-side from
:attr:`GameSession.question_started_at`, never trusted from the client, so the
speed bonus cannot be gamed.
"""

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TenantModel


def generate_pin():
    """A 6-digit join code. No leading zero, so nothing is lost when a player
    types it and the field trims it to a number."""
    return f'{secrets.randbelow(900000) + 100000}'


def generate_token():
    """A player's secret handle. Combined with the session PIN it is the only
    thing that authorises polling and answering — players have no login."""
    return secrets.token_hex(16)


class GameSession(TenantModel):
    """One hosted game. Owned by a school; hosted by a staff member."""

    class Status(models.TextChoices):
        LOBBY = 'lobby', 'Lobby'
        QUESTION = 'question', 'Question live'
        REVEAL = 'reveal', 'Revealing answer'
        ENDED = 'ended', 'Ended'

    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='hosted_games',
        null=True,
        blank=True,
    )
    bank = models.ForeignKey(
        'cbt.QuestionBank', on_delete=models.PROTECT, related_name='live_games'
    )
    title = models.CharField(max_length=150, blank=True)
    pin = models.CharField(max_length=6, db_index=True)

    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.LOBBY, db_index=True
    )
    # The frozen, shuffled question order for this game, decided at start so
    # every player sees the same question at the same time.
    question_ids = models.JSONField(default=list, blank=True)
    current_index = models.IntegerField(default=-1)
    question_started_at = models.DateTimeField(null=True, blank=True)

    seconds_per_question = models.PositiveSmallIntegerField(default=20)
    points_base = models.PositiveIntegerField(default=1000)
    speed_bonus = models.BooleanField(
        default=True, help_text='Award more points for faster correct answers.'
    )

    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['pin', 'status'])]

    def __str__(self):
        return f'{self.title or self.bank} ({self.pin})'

    @property
    def question_count(self):
        return len(self.question_ids or [])

    @property
    def current_question_id(self):
        if 0 <= self.current_index < self.question_count:
            return self.question_ids[self.current_index]
        return None

    @property
    def is_live(self):
        return self.status != self.Status.ENDED

    def deadline(self):
        if not self.question_started_at:
            return None
        return self.question_started_at + timezone.timedelta(
            seconds=self.seconds_per_question
        )


class GamePlayer(models.Model):
    """A guest in a game.

    Not a :class:`TenantModel`: players have no account and no school. Access is
    authorised by :attr:`token` (a secret handed back at join) together with the
    session PIN — never by login.
    """

    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name='players'
    )
    nickname = models.CharField(max_length=20)
    token = models.CharField(max_length=32, unique=True, default=generate_token)
    score = models.IntegerField(default=0)
    streak = models.IntegerField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-score', 'joined_at']
        constraints = [
            models.UniqueConstraint(
                fields=['session', 'nickname'], name='unique_nickname_per_game'
            ),
        ]

    def __str__(self):
        return self.nickname


class GameAnswer(models.Model):
    """One player's answer to one question. Graded the moment it lands."""

    player = models.ForeignKey(
        GamePlayer, on_delete=models.CASCADE, related_name='answers'
    )
    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name='answers'
    )
    question_index = models.IntegerField()
    choice_ids = models.JSONField(default=list)
    is_correct = models.BooleanField(default=False)
    response_ms = models.IntegerField(default=0)
    points = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['player', 'question_index'],
                name='unique_game_answer_per_question',
            ),
        ]

    def __str__(self):
        return f'{self.player} · Q{self.question_index}'
