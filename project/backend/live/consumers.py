"""Authenticated, state-free WebSocket invalidations for Live quiz screens."""
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import GamePlayer, GameSession


class LiveStateConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        if not getattr(settings, 'LIVE_WEBSOCKETS_ENABLED', False):
            await self.close(code=1013)
            return
        self.audience = self.scope['url_route']['kwargs']['audience']
        self.session_id = None
        self.group_name = None
        await self.accept()

    async def receive_json(self, content, **kwargs):
        # Browser WebSockets cannot set Authorization headers. Authenticate once
        # in the first frame, before joining any game group.
        if self.group_name is not None:
            return
        if content.get('type') != 'authenticate':
            await self.close(code=4401)
            return

        if self.audience == 'player':
            session_id = await self._player_session(
                self.scope['url_route']['kwargs']['pin'],
                content.get('token', ''),
            )
            group_audience = 'players'
        else:
            session_id = await self._host_session(
                self.scope['url_route']['kwargs']['session_id'],
                content.get('token', ''),
            )
            group_audience = 'hosts'

        if session_id is None:
            await self.close(code=4403)
            return

        self.session_id = session_id
        self.group_name = f'live_{session_id}_{group_audience}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.send_json({'type': 'ready'})

    async def disconnect(self, close_code):
        if self.group_name is not None:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def live_state_changed(self, event):
        await self.send_json({'type': 'state_changed'})

    @database_sync_to_async
    def _player_session(self, pin, token):
        if not token:
            return None
        return (
            GamePlayer.objects.filter(token=token, session__pin=pin)
            .values_list('session_id', flat=True)
            .first()
        )

    @database_sync_to_async
    def _host_session(self, session_id, raw_token):
        if not raw_token:
            return None
        try:
            token = AccessToken(raw_token)
            user_id = token['user_id']
        except (TokenError, KeyError, TypeError, ValueError):
            return None

        user = (
            get_user_model().objects
            .filter(pk=user_id, is_active=True)
            .values('role', 'school_id', 'school__is_active')
            .first()
        )
        if (
            not user
            or not user['school__is_active']
            or user['role'] not in ('school_admin', 'teacher')
        ):
            return None

        return (
            GameSession.objects
            .filter(pk=session_id, school_id=user['school_id'])
            .values_list('id', flat=True)
            .first()
        )
