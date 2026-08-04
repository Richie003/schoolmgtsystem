import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Cloud, CloudOff, ListChecks,
} from 'lucide-react';
import { cbtAPI, errorMessage } from '../../services/api';
import type { AttemptPaper, AttemptResult } from '../../types';
import { Alert, Button, Modal, Spinner } from '../UI/Primitives';
import MathText from '../UI/MathText';

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'offline';

export default function ExamRunner({
  paper,
  onFinished,
}: {
  paper: AttemptPaper;
  onFinished: (result: AttemptResult) => void;
}) {
  const attemptId = paper.attempt.id;

  // Selections are held as an array for every question, single or multiple —
  // one shape means one save path and no branching in the flush loop.
  const [answers, setAnswers] = useState<Record<number, number[]>>(() =>
    Object.fromEntries(paper.questions.map((q) => [q.id, q.selected_choices ?? []])),
  );
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(paper.attempt.seconds_remaining);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  /** Answers that failed to reach the server, retried on the next flush. */
  const pending = useRef<Map<number, number[]>>(new Map());
  const submitted = useRef(false);

  const question = paper.questions[index];
  const selection = answers[question.id] ?? [];
  const isMultiple = question.question_type === 'multiple';
  const answeredCount = Object.values(answers).filter((v) => v.length > 0).length;

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      setSubmitting(true);

      try {
        // Flush anything still queued before closing the paper, so a final
        // click is never lost to a submit race.
        if (pending.current.size > 0) {
          const queued = Array.from(pending.current, ([q, choices]) => ({
            question: q,
            choices,
          }));
          pending.current.clear();
          await cbtAPI.saveAnswers(attemptId, queued).catch(() => undefined);
        }

        const { data } = await cbtAPI.submit(attemptId);
        onFinished(data);
      } catch (err) {
        if (!auto) {
          submitted.current = false;
          setError(errorMessage(err, 'Could not submit your exam. Try again.'));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, onFinished],
  );

  // Countdown. Ticks locally; the server deadline remains authoritative and is
  // reconciled by the poll below.
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(timer);
          submit(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [submit]);

  // Resync with the server every 30s so a paused tab, a sleeping laptop, or a
  // tampered client clock cannot buy extra time.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const { data } = await cbtAPI.timer(attemptId);
        setRemaining(data.seconds_remaining);
        if (data.status !== 'in_progress' && !submitted.current) {
          submitted.current = true;
          const { data: result } = await cbtAPI.result(attemptId);
          onFinished(result);
        }
      } catch {
        // A failed poll is not fatal — the local countdown keeps running.
      }
    }, 30_000);
    return () => clearInterval(poll);
  }, [attemptId, onFinished]);

  const flush = useCallback(async () => {
    if (pending.current.size === 0) return;

    const queued = Array.from(pending.current, ([q, choices]) => ({
      question: q,
      choices,
    }));
    pending.current.clear();
    setSaveState('saving');

    try {
      await cbtAPI.saveAnswers(attemptId, queued);
      setSaveState('saved');
    } catch {
      // Put them back so the next tick retries rather than dropping answers.
      queued.forEach((entry) => pending.current.set(entry.question, entry.choices));
      setSaveState('offline');
    }
  }, [attemptId]);

  // Auto-save loop. Batching on a 2s cadence keeps a 60-question paper from
  // issuing 60 separate requests while a student clicks quickly.
  useEffect(() => {
    const timer = setInterval(flush, 2000);
    return () => clearInterval(timer);
  }, [flush]);

  // Best-effort flush if the tab is closed or backgrounded mid-exam.
  useEffect(() => {
    const handler = () => { flush(); };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [flush]);

  /**
   * Toggle a choice.
   *
   * Single-answer questions replace the selection; multi-answer questions add
   * or remove it, so a student can correct a mis-click without restarting.
   */
  const choose = (questionId: number, choiceId: number, multiple: boolean) => {
    setAnswers((current) => {
      const existing = current[questionId] ?? [];
      let next: number[];

      if (!multiple) {
        next = existing[0] === choiceId ? [] : [choiceId];
      } else if (existing.includes(choiceId)) {
        next = existing.filter((id) => id !== choiceId);
      } else {
        next = [...existing, choiceId];
      }

      pending.current.set(questionId, next);
      return { ...current, [questionId]: next };
    });
    setSaveState('saving');
  };

  const isCritical = remaining <= 60;
  const isWarning = remaining <= 300;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-0 z-10 mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-gray-900">
              {paper.exam.title}
            </h1>
            <p className="text-sm text-gray-500">
              {answeredCount} of {paper.questions.length} answered
            </p>
          </div>

          <div className="flex items-center gap-4">
            <SaveIndicator state={saveState} />

            <div
              role="timer"
              aria-live={isCritical ? 'assertive' : 'off'}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold
                ${
                  isCritical
                    ? 'animate-pulse bg-red-100 text-red-700'
                    : isWarning
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-700'
                }`}
            >
              <Clock className="h-5 w-5" aria-hidden="true" />
              {formatClock(remaining)}
            </div>

            <Button onClick={() => setConfirming(true)} loading={submitting}>
              Submit
            </Button>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: `${(answeredCount / paper.questions.length) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">
              Question {index + 1} of {paper.questions.length}
            </span>
            <span className="text-sm text-gray-500">
              {question.marks} mark{question.marks === 1 ? '' : 's'}
            </span>
          </div>

          <MathText className="mb-4 text-base text-gray-900">
            {question.text}
          </MathText>

          {isMultiple && (
            <p className="mb-4 inline-flex items-center gap-2 rounded-lg bg-brand-50
              px-3 py-1.5 text-sm font-medium text-brand-800">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Select all that apply
              {question.correct_count ? ` — choose ${question.correct_count}` : ''}
            </p>
          )}

          {question.image && (
            <img
              src={question.image}
              alt=""
              className="mb-6 max-h-64 max-w-full rounded-lg border border-gray-200"
            />
          )}

          <div
            className="space-y-3"
            role={isMultiple ? 'group' : 'radiogroup'}
            aria-label={`Options for question ${index + 1}`}
          >
            {question.choices.map((choice, choiceIndex) => {
              const selected = selection.includes(choice.id);
              return (
                <button
                  key={choice.id}
                  type="button"
                  role={isMultiple ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  onClick={() => choose(question.id, choice.id, isMultiple)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left
                    transition-colors
                    ${
                      selected
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center
                      border text-xs font-semibold
                      ${isMultiple ? 'rounded' : 'rounded-full'}
                      ${
                        selected
                          ? 'border-brand-600 bg-brand-600 text-brand-contrast'
                          : 'border-gray-300 text-gray-500'
                      }`}
                  >
                    {selected && isMultiple ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      String.fromCharCode(65 + choiceIndex)
                    )}
                  </span>
                  <MathText inline className="text-sm text-gray-900">
                    {choice.text}
                  </MathText>
                </button>
              );
            })}
          </div>

          {isMultiple && selection.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              {selection.length} selected. Click a selected option again to
              deselect it.
            </p>
          )}

          <div className="mt-8 flex justify-between">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={index === paper.questions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <nav
          aria-label="Question navigation"
          className="h-fit rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Questions
          </p>
          <div className="grid grid-cols-5 gap-2 lg:grid-cols-4">
            {paper.questions.map((q, i) => {
              const answered = (answers[q.id] ?? []).length > 0;
              const current = i === index;
              return (
                <button
                  key={q.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Question ${i + 1}${answered ? ', answered' : ', unanswered'}`}
                  aria-current={current ? 'true' : undefined}
                  className={`aspect-square rounded-lg text-xs font-semibold transition-colors
                    ${
                      current
                        ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                        : answered
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-green-100" />Answered</p>
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-gray-100" />Unanswered</p>
          </div>
        </nav>
      </div>

      <Modal open={confirming} title="Submit your exam?" onClose={() => setConfirming(false)}>
        <div className="space-y-4">
          {answeredCount < paper.questions.length && (
            <Alert kind="info">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                You have {paper.questions.length - answeredCount} unanswered question(s).
                They will be scored as zero.
              </span>
            </Alert>
          )}
          <p className="text-sm text-gray-600">
            Once submitted your answers are final and cannot be changed.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
            <Button onClick={() => { setConfirming(false); submit(false); }} loading={submitting}>
              <Check className="h-4 w-4" />
              Submit now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;

  const config = {
    saving: { icon: Spinner, text: 'Saving…', tone: 'text-gray-500' },
    saved: { icon: Cloud, text: 'Saved', tone: 'text-green-600' },
    offline: { icon: CloudOff, text: 'Retrying…', tone: 'text-amber-600' },
  }[state];

  const Icon = config.icon;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`hidden items-center gap-1.5 text-xs sm:flex ${config.tone}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.text}
    </span>
  );
}
