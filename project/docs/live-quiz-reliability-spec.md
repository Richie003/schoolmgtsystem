# Live quiz reliability spec

This is the baseline for future live-quiz reliability work: it records current behaviour and known gaps only, without assigning a design to any gap.

## Verification record

| Situation | Automated coverage | Host-and-player browser walkthrough |
| --- | --- | --- |
| Joining | Listed in Situation 1 | Not performed |
| Mid-game connection loss | None | Not performed |
| Answering at the edges | Listed in Situation 3 | Not performed |
| Host device dying | None | Not performed |
| Abandonment | None | Not performed |
| Two games in one room | None | Not performed |
| Whole class answering at once | None | Not performed |
| Fairness | Listed in Situation 8 | Not performed |

1. **Joining — gap (automated coverage: `JoinTests.test_join_returns_token`, `test_bad_pin_is_404`, and `test_duplicate_nickname_rejected`):** a player with a valid PIN and available nickname sees “You're in”, a repeated nickname sees “That nickname is taken — try another.”, but the same person can join the same game again under a different nickname and no identity or duplicate-join rule is specified for the teacher or player.
2. **Mid-game connection loss — gap (automated coverage: none):** when a player's state poll fails for any reason, that player sees “That's a wrap” and “Thanks for playing.”, so temporary connection loss is not distinguished from a game that is actually unavailable and no retry or resume behaviour is specified.
3. **Answering at the edges — gap (automated coverage: `GameplayTests.test_cannot_answer_twice`, `test_cannot_answer_before_start`, and `test_foreign_choice_rejected`):** if a submission reaches the server after the host has advanced, the server evaluates it against the new current question and may record it there, so the student is not told which question or scoreboard owns the answer and no transition rule is specified.
4. **The host's device dying — gap (automated coverage: none):** if the host’s device goes dark mid-question, the game stays on that question and every student sees the unanswered screen with no explanation until the host returns or someone ends the game.
5. **Abandonment — gap (automated coverage: none):** when a player stops polling or leaves without submitting, the game retains that player and the host continues to see the player in the room or standings, with no timeout, removal, or absence indication specified for either audience.
6. **Two games in one room — gap (automated coverage: none):** if two teachers create games at the same moment, the check-then-save PIN allocation can give both games one PIN and a student entering it joins whichever game the server returns first, while neither teacher nor student is told about the collision.
7. **The whole class answering at once — gap (automated coverage: none):** simultaneous submissions have no documented capacity or contention guarantee, although each player can only create one answer per question, so neither the host nor players are promised what happens if the room overloads the service.
8. **Fairness — gap (automated coverage: `GameplayTests.test_question_never_leaks_correct_answer`, `test_score_stays_hidden_until_reveal`, `test_speed_bonus_rewards_faster_answers`, and `test_streak_adds_bonus`):** the API prevents answer-key and score leakage before reveal and uses server time for scoring, but the player screen does not show the correct answer at reveal and a player who disconnects and returns has no specified way to continue without gaining an advantage or losing more opportunity than classmates.
