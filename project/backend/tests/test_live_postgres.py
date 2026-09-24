"""PostgreSQL-only lock integration tests for the live-quiz state machine.

SQLite intentionally ignores ``SELECT ... FOR UPDATE``.  These tests run in a
PostgreSQL test database and use two connections so the concurrency promises in
``live.services`` are tested where row locks actually exist.
"""

from queue import Queue
from threading import Event, Thread
from time import monotonic, sleep
from unittest import skipUnless
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase
from rest_framework.exceptions import ValidationError

from live import services
from live.models import GamePlayer, GameSession
from tests.test_live import LiveFixtureMixin


@skipUnless(connection.vendor == 'postgresql', 'requires PostgreSQL row locks')
class RevealAnswerLockTests(LiveFixtureMixin, TransactionTestCase):
    """Pin the answer/reveal serialization contract on PostgreSQL."""

    def setUp(self):
        super().setUp()
        hosted = self.host_session()
        self.session_id = hosted['id']
        self.pin = hosted['pin']
        self.token = self.join(self.pin, 'Ada').data['token']
        services.start_game(GameSession.objects.get(pk=self.session_id))
        self.player_id = GamePlayer.objects.get(token=self.token).id
        session = GameSession.objects.get(pk=self.session_id)
        question = services._get_question(session)
        self.choice_id = question.choices.get(is_correct=True).id

    def test_answer_waiting_on_reveal_lock_is_rejected_after_reveal(self):
        reveal_has_lock = Event()
        release_reveal = Event()
        answer_started = Event()
        outcomes = Queue()
        original_apply_answers = services.apply_answers

        def pause_after_reveal_locks(session):
            reveal_has_lock.set()
            if not release_reveal.wait(timeout=10):
                raise AssertionError('test did not release the reveal transaction')
            return original_apply_answers(session)

        def reveal_worker():
            try:
                services.reveal(GameSession.objects.get(pk=self.session_id))
                outcomes.put(('reveal', None))
            except Exception as error:  # pragma: no cover - assertions inspect it below
                outcomes.put(('reveal', error))

        def answer_worker():
            # Give the main test connection this worker's backend PID, then
            # attempt the same session lock that reveal already holds.
            from django.db import close_old_connections, connection as worker_connection

            close_old_connections()
            try:
                with worker_connection.cursor() as cursor:
                    cursor.execute('SELECT pg_backend_pid()')
                    outcomes.put(('answer_pid', cursor.fetchone()[0]))
                answer_started.set()
                services.record_answer(
                    GameSession.objects.get(pk=self.session_id),
                    GamePlayer.objects.get(pk=self.player_id),
                    [self.choice_id],
                )
                outcomes.put(('answer', None))
            except Exception as error:  # expected ValidationError after reveal
                outcomes.put(('answer', error))
            finally:
                close_old_connections()

        with patch('live.services.apply_answers', side_effect=pause_after_reveal_locks):
            reveal_thread = Thread(target=reveal_worker)
            reveal_thread.start()
            self.assertTrue(reveal_has_lock.wait(timeout=5))

            answer_thread = Thread(target=answer_worker)
            answer_thread.start()
            self.assertTrue(answer_started.wait(timeout=5))
            kind, backend_pid = outcomes.get(timeout=5)
            self.assertEqual(kind, 'answer_pid')

            # PostgreSQL exposes a blocked row-lock wait as a Lock wait event.
            deadline = monotonic() + 5
            while monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s',
                        [backend_pid],
                    )
                    row = cursor.fetchone()
                if row and row[0] == 'Lock':
                    break
                sleep(0.02)
            self.assertEqual(row[0] if row else None, 'Lock')

            release_reveal.set()
            reveal_thread.join(timeout=5)
            answer_thread.join(timeout=5)

        # Pull the two operation outcomes without depending on thread completion order.
        pending = []
        while not outcomes.empty():
            pending.append(outcomes.get())
        result_map = {kind: result for kind, result in pending}
        self.assertIsNone(result_map['reveal'])
        self.assertIsInstance(result_map['answer'], ValidationError)
        self.assertFalse(GamePlayer.objects.get(pk=self.player_id).answers.exists())
