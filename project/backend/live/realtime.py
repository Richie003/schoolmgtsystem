"""Best-effort realtime invalidation for Live game state.

The database remains authoritative. A Redis/channel-layer failure must never
fail a game action; connected screens fall back to their HTTP state polling.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


def _group(session_id, audience):
    return f'live_{session_id}_{audience}'


def publish_session(session_id, audience='both'):
    if not getattr(settings, 'LIVE_WEBSOCKETS_ENABLED', False):
        return

    audiences = ('hosts', 'players') if audience == 'both' else (audience,)

    def send():
        try:
            layer = get_channel_layer()
            if layer is None:
                return
            for target in audiences:
                async_to_sync(layer.group_send)(
                    _group(session_id, target),
                    {'type': 'live.state_changed'},
                )
        except Exception:
            # Realtime is an optimization; preserve the successful HTTP action.
            logger.exception('Could not publish Live state change for session %s', session_id)

    transaction.on_commit(send)
