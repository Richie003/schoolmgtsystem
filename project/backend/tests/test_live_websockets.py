"""WebSocket delivery tests for Live quiz state invalidations."""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings

from live.models import GameSession
from tests.test_live import LiveFixtureMixin
from school_management.asgi import application


class LiveWebSocketTests(LiveFixtureMixin, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.pin = self.host_session()['pin']
        self.player_token = self.join(self.pin, 'Ada').data['token']
        self.session_id = GameSession.objects.get(pin=self.pin).id

    @override_settings(
        LIVE_WEBSOCKETS_ENABLED=True,
        LIVE_WS_ALLOWED_ORIGINS=['http://localhost:5173'],
        CHANNEL_LAYERS={
            'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
        },
    )
    def test_player_authenticates_and_receives_state_invalidation(self):
        async def exercise():
            communicator = WebsocketCommunicator(
                application,
                f'/ws/live/player/{self.pin}/',
                headers=[(b'origin', b'http://localhost:5173')],
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            await communicator.send_json_to({
                'type': 'authenticate',
                'token': self.player_token,
            })
            self.assertEqual(
                await communicator.receive_json_from(),
                {'type': 'ready'},
            )

            layer = get_channel_layer()
            await layer.group_send(
                f'live_{self.session_id}_players',
                {'type': 'live.state_changed'},
            )
            self.assertEqual(
                await communicator.receive_json_from(),
                {'type': 'state_changed'},
            )
            await communicator.disconnect()

        async_to_sync(exercise)()

    @override_settings(LIVE_WEBSOCKETS_ENABLED=False)
    def test_socket_is_disabled_by_default(self):
        async def exercise():
            communicator = WebsocketCommunicator(
                application,
                f'/ws/live/player/{self.pin}/',
                headers=[(b'origin', b'http://localhost:5173')],
            )
            connected, _ = await communicator.connect()
            self.assertFalse(connected)

        async_to_sync(exercise)()

    @override_settings(
        LIVE_WEBSOCKETS_ENABLED=True,
        CHANNEL_LAYERS={
            'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
        },
    )
    def test_host_staff_token_joins_the_host_group(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        access = str(RefreshToken.for_user(self.admin).access_token)

        async def exercise():
            communicator = WebsocketCommunicator(
                application,
                f'/ws/live/host/{self.session_id}/',
                headers=[(b'origin', b'http://localhost:5173')],
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to({
                'type': 'authenticate',
                'token': access,
            })
            self.assertEqual(
                await communicator.receive_json_from(),
                {'type': 'ready'},
            )

            layer = get_channel_layer()
            await layer.group_send(
                f'live_{self.session_id}_hosts',
                {'type': 'live.state_changed'},
            )
            self.assertEqual(
                await communicator.receive_json_from(),
                {'type': 'state_changed'},
            )
            await communicator.disconnect()

        async_to_sync(exercise)()
