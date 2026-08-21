"""Game engine for the live quiz.

Holds the PIN allocation, the state-machine transitions, the scoring rule and
the two poll payloads — one for the host's presenter screen, one for a player's
phone. The player payload never contains which choice is correct until the game
enters :attr:`GameSession.Status.REVEAL`; that is the whole point of the mode.
"""

import random

from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from cbt.models import Question
from .models import GameAnswer, GamePlayer, GameSession, generate_pin

MIN_SPEED_FRACTION = 0.5     # a correct-but-slow answer still earns half base.
STREAK_BONUS = 100           # per consecutive correct beyond the first…
MAX_STREAK_BONUS_STEPS = 5   # …capped so a hot streak cannot run away.
LATE_GRACE_MS = 1500         # tolerance past the visible timer for latency.

Status = GameSession.Status


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def unique_pin():
    """A PIN not currently held by any live (non-ended) game. Ended games
    release their PIN so the code space never fills up."""
    for _ in range(20):
        pin = generate_pin()
        if not (
            GameSession.objects.filter(pin=pin)
            .exclude(status=Status.ENDED)
            .exists()
        ):
            return pin
    raise ValidationError('Could not allocate a game PIN, please try again.')


def start_game(session):
    if session.status != Status.LOBBY:
        raise ValidationError('This game has already started.')
    ids = list(
        session.bank.questions.filter(is_active=True).values_list('id', flat=True)
    )
    if not ids:
        raise ValidationError('This question bank has no active questions.')
    random.shuffle(ids)
    session.question_ids = ids
    session.current_index = 0
    session.status = Status.QUESTION
    session.question_started_at = timezone.now()
    session.save(update_fields=[
        'question_ids', 'current_index', 'status',
        'question_started_at', 'updated_at',
    ])
    return session


def reveal(session):
    if session.status != Status.QUESTION:
        raise ValidationError('No live question to reveal.')
    session.status = Status.REVEAL
    session.save(update_fields=['status', 'updated_at'])
    return session


def next_question(session):
    if session.status != Status.REVEAL:
        raise ValidationError('Reveal the current question first.')
    if session.current_index + 1 < session.question_count:
        session.current_index += 1
        session.status = Status.QUESTION
        session.question_started_at = timezone.now()
        session.save(update_fields=[
            'current_index', 'status', 'question_started_at', 'updated_at',
        ])
    else:
        end_game(session)
    return session


def end_game(session):
    if session.status == Status.ENDED:
        return session
    session.status = Status.ENDED
    session.ended_at = timezone.now()
    session.save(update_fields=['status', 'ended_at', 'updated_at'])
    return session


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def _score(session, correct, response_ms, prev_streak):
    """Return ``(points, new_streak)`` for one answer."""
    if not correct:
        return 0, 0
    limit_ms = session.seconds_per_question * 1000
    if session.speed_bonus and limit_ms:
        fraction = 1 - (min(response_ms, limit_ms) / limit_ms) / 2
        fraction = max(MIN_SPEED_FRACTION, fraction)
        base = round(session.points_base * fraction)
    else:
        base = session.points_base
    streak = prev_streak + 1
    bonus = min(streak - 1, MAX_STREAK_BONUS_STEPS) * STREAK_BONUS
    return base + bonus, streak


def record_answer(session, player, choice_ids):
    if session.status != Status.QUESTION:
        raise ValidationError('No question is accepting answers right now.')

    now = timezone.now()
    limit_ms = session.seconds_per_question * 1000
    elapsed_ms = int((now - session.question_started_at).total_seconds() * 1000)
    if elapsed_ms > limit_ms + LATE_GRACE_MS:
        raise ValidationError("Time's up for this question.")

    if GameAnswer.objects.filter(
        player=player, question_index=session.current_index
    ).exists():
        raise ValidationError('You have already answered this question.')

    question = _get_question(session)
    valid_ids = {c.id for c in question.choices.all()}
    chosen = {int(c) for c in choice_ids}
    if not chosen <= valid_ids:
        raise ValidationError('That answer is not an option on this question.')

    correct_ids = question.correct_choice_ids()
    # All-or-nothing, mirroring the CBT marking rule: every correct option and
    # no incorrect one.
    is_correct = bool(chosen) and chosen == correct_ids

    response_ms = max(0, min(elapsed_ms, limit_ms))
    points, streak = _score(session, is_correct, response_ms, player.streak)

    GameAnswer.objects.create(
        player=player,
        session=session,
        question_index=session.current_index,
        choice_ids=sorted(chosen),
        is_correct=is_correct,
        response_ms=response_ms,
        points=points,
    )
    player.score += points
    player.streak = streak
    player.save(update_fields=['score', 'streak'])
    return {'received': True, 'response_ms': response_ms}


# ---------------------------------------------------------------------------
# Reads / payloads
# ---------------------------------------------------------------------------
def _get_question(session):
    qid = session.current_question_id
    if qid is None:
        raise NotFound('No active question.')
    return Question.objects.prefetch_related('choices').get(id=qid)


def _abs(request, url):
    if url and request is not None:
        return request.build_absolute_uri(url)
    return url


def _question_public(question, request=None):
    """The question as a player may see it — no ``is_correct`` anywhere."""
    return {
        'id': question.id,
        'type': question.question_type,
        'multiple': question.is_multiple,
        'text': question.text,
        'image': _abs(request, question.image.url) if question.image else None,
        'choices': [{'id': c.id, 'text': c.text} for c in question.choices.all()],
    }


def _distribution(session, question):
    counts = {c.id: 0 for c in question.choices.all()}
    rows = GameAnswer.objects.filter(
        session=session, question_index=session.current_index
    ).values_list('choice_ids', flat=True)
    for choice_ids in rows:
        for cid in choice_ids:
            if cid in counts:
                counts[cid] += 1
    # JSON object keys are strings; keep it explicit for the client.
    return {str(cid): n for cid, n in counts.items()}


def scoreboard(session, limit=5):
    rows = session.players.order_by('-score', 'joined_at')[:limit]
    return [
        {'rank': i + 1, 'nickname': p.nickname, 'score': p.score}
        for i, p in enumerate(rows)
    ]


def _rank_of(session, player):
    higher = session.players.filter(score__gt=player.score).count()
    return higher + 1


def host_state(session, request=None):
    players = list(session.players.order_by('-score', 'joined_at'))
    data = {
        'id': session.id,
        'status': session.status,
        'pin': session.pin,
        'title': session.title or str(session.bank),
        'accent': session.school.brand_color,
        'question_index': session.current_index,
        'question_count': session.question_count,
        'seconds_per_question': session.seconds_per_question,
        'player_count': len(players),
        'players': [
            {'nickname': p.nickname, 'score': p.score, 'streak': p.streak}
            for p in players
        ],
    }

    if session.status in (Status.QUESTION, Status.REVEAL):
        question = _get_question(session)
        data['question'] = _question_public(question, request)
        data['answered_count'] = GameAnswer.objects.filter(
            session=session, question_index=session.current_index
        ).count()

    if session.status == Status.QUESTION:
        data['deadline'] = session.deadline().isoformat()
        data['server_time'] = timezone.now().isoformat()

    if session.status == Status.REVEAL:
        question = _get_question(session)
        data['correct_choice_ids'] = sorted(question.correct_choice_ids())
        data['distribution'] = _distribution(session, question)
        data['scoreboard'] = scoreboard(session, limit=8)

    if session.status == Status.ENDED:
        data['podium'] = scoreboard(session, limit=5)

    return data


def player_state(session, player, request=None):
    now = timezone.now()
    data = {
        'status': session.status,
        'pin': session.pin,
        'title': session.title or str(session.bank),
        'accent': session.school.brand_color,
        'question_index': session.current_index,
        'question_count': session.question_count,
        'you': {
            'nickname': player.nickname,
            'score': player.score,
            'streak': player.streak,
            'rank': _rank_of(session, player),
        },
    }

    if session.status == Status.LOBBY:
        data['players_count'] = session.players.count()
        return data

    if session.status == Status.QUESTION:
        question = _get_question(session)
        answered = GameAnswer.objects.filter(
            player=player, question_index=session.current_index
        ).first()
        data.update(
            deadline=session.deadline().isoformat(),
            server_time=now.isoformat(),
            seconds_per_question=session.seconds_per_question,
            question=_question_public(question, request),
            answered=bool(answered),
            your_choices=answered.choice_ids if answered else [],
        )
        return data

    if session.status == Status.REVEAL:
        question = _get_question(session)
        answered = GameAnswer.objects.filter(
            player=player, question_index=session.current_index
        ).first()
        data.update(
            question=_question_public(question, request),
            correct_choice_ids=sorted(question.correct_choice_ids()),
            result={
                'answered': bool(answered),
                'is_correct': bool(answered and answered.is_correct),
                'points': answered.points if answered else 0,
                'your_choices': answered.choice_ids if answered else [],
            },
            scoreboard=scoreboard(session, limit=5),
        )
        return data

    # ENDED
    data['podium'] = scoreboard(session, limit=5)
    return data
