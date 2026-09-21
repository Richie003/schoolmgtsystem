"""Stable, teacher-visible live-quiz API contracts.

The reliability specification in ``docs/live-quiz-reliability-spec.md`` records
the complete user journeys; these constants are the server messages that its
joining tests pin.  Keeping the values here prevents views and tests from
copying slightly different versions of the same contract.
"""

NO_LIVE_GAME_WITH_PIN = 'No live game with that PIN.'
DUPLICATE_NICKNAME = 'That nickname is taken — try another.'
PIN_ALLOCATION_FAILED = 'Could not allocate a game PIN, please try again.'
