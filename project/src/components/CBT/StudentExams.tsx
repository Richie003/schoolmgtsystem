import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileText, PlayCircle, XCircle } from 'lucide-react';
import { cbtAPI, errorMessage } from '../../services/api';
import type { AttemptPaper, AttemptResult, ExamAttempt, StudentExam } from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
} from '../UI/Primitives';
import ExamRunner from './ExamRunner';
import MathText from '../UI/MathText';

export default function StudentExams() {
  const [exams, setExams] = useState<StudentExam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [paper, setPaper] = useState<AttemptPaper | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [starting, setStarting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: available }, { data: history }] = await Promise.all([
        cbtAPI.availableExams(),
        cbtAPI.attempts({ page_size: 50 }),
      ]);
      setExams(available);
      setAttempts(history.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load your exams.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const start = async (exam: StudentExam) => {
    setStarting(exam.id);
    setError('');
    try {
      const { data } = await cbtAPI.start(exam.id);
      setPaper(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not start this exam.'));
    } finally {
      setStarting(null);
    }
  };

  const resume = async (attempt: ExamAttempt) => {
    setError('');
    try {
      const { data } = await cbtAPI.paper(attempt.id);
      setPaper(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not resume this attempt.'));
    }
  };

  // The runner takes over the whole screen while an exam is in progress.
  if (paper) {
    return (
      <ExamRunner
        paper={paper}
        onFinished={(finished) => {
          setPaper(null);
          setResult(finished);
          load();
        }}
      />
    );
  }

  const inProgress = attempts.filter((a) => a.status === 'in_progress');
  const finished = attempts.filter((a) => a.status !== 'in_progress');

  return (
    <div>
      <PageHeader title="My exams" subtitle="Take your computer-based tests here" />

      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : (
        <div className="space-y-8">
          {inProgress.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                In progress
              </h2>
              <div className="space-y-3">
                {inProgress.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg
                      border border-amber-300 bg-amber-50 p-4"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{attempt.exam_title}</p>
                      <p className="text-sm text-amber-700">
                        Attempt {attempt.attempt_number} — still open, your timer is running.
                      </p>
                    </div>
                    <Button onClick={() => resume(attempt)}>
                      <PlayCircle className="h-4 w-4" />
                      Resume
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Available exams
            </h2>
            {exams.length === 0 ? (
              <EmptyState message="No exams are scheduled for you right now." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {exams.map((exam) => {
                  const exhausted = exam.attempts_used >= exam.max_attempts;
                  return (
                    <article
                      key={exam.id}
                      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{exam.title}</h3>
                          <p className="text-sm text-gray-500">{exam.subject_name}</p>
                        </div>
                        {exam.is_open ? (
                          <Badge tone="green">Open</Badge>
                        ) : (
                          <Badge tone="gray">Closed</Badge>
                        )}
                      </div>

                      {exam.instructions && (
                        <p className="mb-3 line-clamp-2 text-sm text-gray-600">
                          {exam.instructions}
                        </p>
                      )}

                      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-gray-400" />
                          {exam.question_count} questions
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-gray-400" />
                          {exam.duration_minutes} minutes
                        </div>
                      </dl>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          Attempt {Math.min(exam.attempts_used + 1, exam.max_attempts)} of{' '}
                          {exam.max_attempts}
                        </span>
                        <Button
                          onClick={() => start(exam)}
                          disabled={!exam.is_open || exhausted}
                          loading={starting === exam.id}
                        >
                          <PlayCircle className="h-4 w-4" />
                          {exhausted ? 'No attempts left' : 'Start exam'}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {finished.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Past results
              </h2>
              <div className="space-y-2">
                {finished.map((attempt) => (
                  <button
                    key={attempt.id}
                    onClick={async () => {
                      const { data } = await cbtAPI.result(attempt.id);
                      setResult(data);
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-4
                      rounded-lg border border-gray-200 bg-white p-4 text-left
                      transition-colors hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{attempt.exam_title}</p>
                      <p className="text-xs text-gray-500">
                        Attempt {attempt.attempt_number}
                        {attempt.status === 'auto_submitted' && ' — auto-submitted at time-up'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-gray-700">
                        {attempt.score ?? 0} / {attempt.total_marks}
                      </span>
                      {attempt.is_passed ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-700">
                          <CheckCircle2 className="h-4 w-4" />
                          {attempt.percentage}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-red-700">
                          <XCircle className="h-4 w-4" />
                          {attempt.percentage}%
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ResultModal result={result} onClose={() => setResult(null)} />
    </div>
  );
}

function ResultModal({
  result,
  onClose,
}: {
  result: AttemptResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <Modal open title={result.exam_title} onClose={onClose} wide>
      <div className="space-y-6">
        <div
          className={`rounded-lg p-6 text-center ${
            result.is_passed ? 'bg-green-50' : 'bg-red-50'
          }`}
        >
          <p className="text-4xl font-bold text-gray-900">{result.percentage}%</p>
          <p className="mt-1 text-sm text-gray-600">
            {result.score} out of {result.total_marks} marks
          </p>
          <p
            className={`mt-2 font-semibold ${
              result.is_passed ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {result.is_passed ? 'Passed' : 'Did not pass'}
          </p>
        </div>

        {result.breakdown ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Question breakdown
            </h3>
            <ol className="space-y-3">
              {result.breakdown.map((row, i) => (
                <li
                  key={row.question_id}
                  className={`rounded-lg border p-4 ${
                    row.is_correct
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-1.5 text-sm font-medium text-gray-900">
                      <span className="shrink-0">{i + 1}.</span>
                      <MathText className="min-w-0">{row.question}</MathText>
                    </div>
                    {row.is_correct ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    Your answer:{' '}
                    {row.selected ? (
                      <MathText inline>{row.selected}</MathText>
                    ) : (
                      <em>not answered</em>
                    )}
                  </p>
                  {!row.is_correct && row.correct_answer && (
                    <p className="mt-1 text-sm text-gray-600">
                      Correct answer:{' '}
                      <strong>
                        <MathText inline>{row.correct_answer}</MathText>
                      </strong>
                    </p>
                  )}
                  {row.explanation && (
                    <MathText className="mt-1 text-xs text-gray-500">
                      {row.explanation}
                    </MathText>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <Alert kind="info">
            Detailed results for this exam have not been released yet.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
