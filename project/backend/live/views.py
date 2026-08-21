"""Live-quiz API.

Host side (staff, JWT):
    /api/live/sessions/                 list / create games
    /api/live/sessions/{id}/            retrieve / delete
    /api/live/sessions/{id}/state/      presenter poll (GET)
    /api/live/sessions/{id}/start|reveal|next|end/   drive the game (POST)

Player side (guests, no auth — PIN + token):
    /api/live/play/{pin}/join/          join with a nickname (POST)
    /api/live/play/{pin}/state/         player poll (GET, ?token=)
    /api/live/play/{pin}/answer/        submit an answer (POST, {token, choice_ids})
"""

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAuthenticatedAndActiveSchool, IsStaffMember
from core.viewsets import TenantScopedMixin

from . import services
from .models import GamePlayer, GameSession, generate_token
from .serializers import GameSessionSerializer


class GameSessionViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """The host's control surface. Staff only, tenant-scoped like everything
    else — a teacher can only host from their own school's banks."""

    queryset = GameSession.objects.select_related('bank', 'bank__subject', 'school')
    serializer_class = GameSessionSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['status', 'bank']

    def perform_create(self, serializer):
        user = self.request.user
        bank = serializer.validated_data['bank']
        if bank.school_id != user.school_id:
            raise PermissionDenied('That question bank belongs to another school.')
        serializer.save(
            school_id=user.school_id,
            host=user,
            pin=services.unique_pin(),
            title=serializer.validated_data.get('title') or str(bank),
        )

    @action(detail=True, methods=['get'])
    def state(self, request, pk=None):
        return Response(services.host_state(self.get_object(), request))

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        session = self.get_object()
        services.start_game(session)
        return Response(services.host_state(session, request))

    @action(detail=True, methods=['post'])
    def reveal(self, request, pk=None):
        session = self.get_object()
        services.reveal(session)
        return Response(services.host_state(session, request))

    @action(detail=True, methods=['post'])
    def next(self, request, pk=None):
        session = self.get_object()
        services.next_question(session)
        return Response(services.host_state(session, request))

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        session = self.get_object()
        services.end_game(session)
        return Response(services.host_state(session, request))


# ---------------------------------------------------------------------------
# Player (guest) endpoints — no authentication.
# ---------------------------------------------------------------------------
def _player_from(pin, token):
    """Resolve a player by their secret token, cross-checked against the PIN.

    Works for ended games too, so a player can still poll for the final podium.
    """
    if not token:
        raise NotFound('You are not in this game.')
    player = (
        GamePlayer.objects.select_related('session', 'session__bank', 'session__school')
        .filter(token=token, session__pin=pin)
        .first()
    )
    if player is None:
        raise NotFound('You are not in this game.')
    return player


class PlayerJoinView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, pin):
        session = (
            GameSession.objects.filter(pin=pin)
            .exclude(status=GameSession.Status.ENDED)
            .first()
        )
        if session is None:
            raise NotFound('No live game with that PIN.')

        nickname = (request.data.get('nickname') or '').strip()
        if not nickname or len(nickname) > 20:
            raise ValidationError({'nickname': 'Pick a nickname of 1–20 characters.'})
        if session.players.filter(nickname__iexact=nickname).exists():
            raise ValidationError({'nickname': 'That nickname is taken — try another.'})

        player = GamePlayer.objects.create(
            session=session, nickname=nickname, token=generate_token()
        )
        return Response(
            {
                'token': player.token,
                'nickname': player.nickname,
                'pin': session.pin,
                'title': session.title or str(session.bank),
                'status': session.status,
            },
            status=201,
        )


class PlayerStateView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, pin):
        player = _player_from(pin, request.query_params.get('token', ''))
        # Cheap presence ping; avoids auto_now churn on the whole row.
        GamePlayer.objects.filter(pk=player.pk).update(last_seen=timezone.now())
        return Response(services.player_state(player.session, player, request))


class PlayerAnswerView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, pin):
        player = _player_from(pin, request.data.get('token', ''))
        choice_ids = request.data.get('choice_ids') or []
        if not isinstance(choice_ids, list):
            raise ValidationError({'choice_ids': 'Expected a list of choice ids.'})
        return Response(services.record_answer(player.session, player, choice_ids))
