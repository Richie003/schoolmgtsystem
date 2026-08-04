import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Lock,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cbtAPI, cbtGenAPI, errorMessage, staffAPI } from '../../services/api';
import type {
  CreateJobParams,
  DraftQuestion,
  GenClassBand,
  GenerationJob,
  GenerationSettings,
  GenOptions,
  QuestionBank,
  Staff,
  Subject,
} from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Spinner,
  inputClass,
} from '../UI/Primitives';
import MathText from '../UI/MathText';

const CALC_KEYWORDS = [
  'math', 'physics', 'chemistry', 'economics', 'quantitative', 'account',
  'book keeping', 'data processing', 'technical drawing', 'further',
];
const isCalcSubject = (name: string) =>
  CALC_KEYWORDS.some((k) => name.toLowerCase().includes(k));

type DraftEdit = DraftQuestion & { include: boolean };

const REASON_COPY: Record<string, string> = {
  disabled: 'AI question generation is turned off for your school by an administrator.',
  disabled_for_you: 'An administrator has disabled AI question generation for your account.',
  trial_exhausted:
    'Your school has used all of its free AI generations. Upgrade to premium for unlimited generation.',
};

export default function QuestionGenerator() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'school_admin' || user?.role === 'super_admin';

  const [options, setOptions] = useState<GenOptions | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = () => {
    cbtGenAPI
      .options()
      .then(({ data }) => setOptions(data))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load the generator.')));
  };
  useEffect(load, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert>{loadError}</Alert>
      </div>
    );
  }
  if (!options) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="AI Question Generator"
        subtitle="Generate exam-style questions, review them, then save the ones you approve."
      />
      {isAdmin && <AdminSettingsPanel onChanged={load} />}
      <GeneratorWorkspace options={options} onUsedTrial={load} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: enable / disable + per-staff control + trial allowance
// ---------------------------------------------------------------------------

function AdminSettingsPanel({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<GenerationSettings | null>(null);
  const [teachers, setTeachers] = useState<Staff[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || settings) return;
    Promise.all([cbtGenAPI.getSettings(), staffAPI.teachers()])
      .then(([s, t]) => {
        setSettings(s.data);
        setTeachers(t.data.results);
      })
      .catch((err) => setError(errorMessage(err, 'Could not load settings.')));
  }, [open, settings]);

  const toggleStaff = (userId: number) => {
    if (!settings) return;
    const disabled = settings.disabled_staff.includes(userId)
      ? settings.disabled_staff.filter((id) => id !== userId)
      : [...settings.disabled_staff, userId];
    setSettings({ ...settings, disabled_staff: disabled });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { data } = await cbtGenAPI.updateSettings({
        is_enabled: settings.is_enabled,
        trial_limit: settings.trial_limit,
        disabled_staff: settings.disabled_staff,
      });
      setSettings(data);
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Settings2 className="h-4 w-4 text-brand-600" />
          Admin controls
        </span>
        <span className="text-xs text-gray-500">{open ? 'Hide' : 'Manage access'}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-gray-100 px-5 py-5">
          {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
          {saved && <Alert kind="success">Settings saved.</Alert>}
          {!settings ? (
            <div className="flex justify-center py-4">
              <Spinner className="h-6 w-6 text-brand-600" />
            </div>
          ) : (
            <>
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-gray-900">
                    Enable for the whole school
                  </span>
                  <span className="block text-xs text-gray-500">
                    Off blocks AI generation for every staff member.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.is_enabled}
                  onChange={(e) => setSettings({ ...settings, is_enabled: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm">
                <Badge tone={settings.is_premium ? 'green' : 'gray'}>
                  {settings.is_premium ? 'Premium' : 'Free plan'}
                </Badge>
                {!settings.is_premium && (
                  <span className="text-gray-600">
                    {settings.remaining_trials} of {settings.trial_limit} free generations left
                    <span className="text-gray-400"> · used {settings.trials_used}</span>
                  </span>
                )}
                {settings.is_premium && (
                  <span className="text-gray-600">Unlimited generations.</span>
                )}
              </div>

              {!settings.is_premium && (
                <Field label="Free-trial allowance">
                  <input
                    type="number"
                    min={0}
                    className={`${inputClass} w-28`}
                    value={settings.trial_limit}
                    onChange={(e) =>
                      setSettings({ ...settings, trial_limit: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">
                  Disable for specific staff
                </p>
                {teachers.length === 0 ? (
                  <p className="text-xs text-gray-500">No teachers found.</p>
                ) : (
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {teachers.map((t) => (
                      <label
                        key={t.user}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={settings.disabled_staff.includes(t.user)}
                          onChange={() => toggleStaff(t.user)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-gray-700">{t.full_name}</span>
                        {settings.disabled_staff.includes(t.user) && (
                          <span className="ml-auto text-xs text-red-500">disabled</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={save} loading={saving}>
                Save controls
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate → poll → review → commit
// ---------------------------------------------------------------------------

function GeneratorWorkspace({
  options,
  onUsedTrial,
}: {
  options: GenOptions;
  onUsedTrial: () => void;
}) {
  const status = options.status;
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [phase, setPhase] = useState<'form' | 'generating' | 'review'>('form');

  const reset = () => {
    setJob(null);
    setPhase('form');
    onUsedTrial(); // refresh remaining trials
  };

  // Poll a pending/processing job until it finishes.
  const pollRef = useRef<number>();
  useEffect(() => {
    if (!job || (job.status !== 'pending' && job.status !== 'processing')) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await cbtGenAPI.getJob(job.id);
        setJob(data);
        if (data.status === 'ready') {
          setPhase('review');
          onUsedTrial();
        }
      } catch {
        /* keep polling; a transient error shouldn't kill the run */
      }
    }, 2000);
    return () => window.clearInterval(pollRef.current);
  }, [job, onUsedTrial]);

  if (!status.available) {
    return <GatedNotice reason={status.reason} />;
  }

  if (phase === 'generating' && job) {
    if (job.status === 'failed') {
      return (
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <Alert>{job.error || 'Generation failed.'}</Alert>
          <Button variant="secondary" onClick={reset} className="mt-6">
            <ArrowLeft className="h-4 w-4" /> Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Sparkles className="h-7 w-7 animate-pulse text-brand-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">Generating questions…</h3>
        <p className="mt-1 text-sm text-gray-500">
          Writing {job.question_count} {job.subject_name} questions. This can take up to a minute.
        </p>
        <div className="mt-4 flex justify-center">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      </div>
    );
  }

  if (phase === 'review' && job) {
    return <ReviewPanel job={job} onDone={reset} onDiscard={reset} />;
  }

  return (
    <GenerationForm
      options={options}
      onStarted={(created) => {
        setJob(created);
        setPhase(created.status === 'ready' ? 'review' : 'generating');
        if (created.status === 'ready') onUsedTrial();
      }}
    />
  );
}

function GatedNotice({ reason }: { reason: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <Lock className="h-6 w-6 text-amber-600" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">Not available</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
        {REASON_COPY[reason] ?? 'AI question generation is not available for your account.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The wizard form
// ---------------------------------------------------------------------------

function GenerationForm({
  options,
  onStarted,
}: {
  options: GenOptions;
  onStarted: (job: GenerationJob) => void;
}) {
  const [form, setForm] = useState<CreateJobParams>({
    class_level: options.class_levels[6]?.value ?? options.class_levels[0].value, // JSS 1 default
    exam_standard: 'general',
    subject_name: '',
    topics: '',
    complexity: 'medium',
    calculation_ratio: 50,
    question_count: 10,
    question_type: 'single',
  });
  const [customSubject, setCustomSubject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const band: GenClassBand = useMemo(() => {
    return (
      options.class_levels.find((c) => c.value === form.class_level)?.band ?? 'jss'
    );
  }, [form.class_level, options.class_levels]);

  const subjectChoices = options.subjects[band] ?? [];
  const showRatio = form.subject_name ? isCalcSubject(form.subject_name) : false;
  const remaining = options.status.remaining_trials;

  const submit = async () => {
    if (!form.subject_name.trim()) {
      setError('Choose or type a subject.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await cbtGenAPI.createJob({
        ...form,
        subject_name: form.subject_name.trim(),
        calculation_ratio: showRatio ? form.calculation_ratio : 0,
      });
      onStarted(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not start generation.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl bg-white p-6 shadow-sm">
      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

      {!options.status.is_premium && (
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">
          <Sparkles className="h-4 w-4" />
          {remaining} free generation{remaining === 1 ? '' : 's'} left on your plan.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class" required>
          <select
            className={inputClass}
            value={form.class_level}
            onChange={(e) =>
              setForm({ ...form, class_level: e.target.value, subject_name: '' })
            }
          >
            {options.class_levels.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Examination standard" required>
          <select
            className={inputClass}
            value={form.exam_standard}
            onChange={(e) => setForm({ ...form, exam_standard: e.target.value })}
          >
            {options.exam_standards.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Subject" required>
        {!customSubject ? (
          <select
            className={inputClass}
            value={form.subject_name}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomSubject(true);
                setForm({ ...form, subject_name: '' });
              } else {
                setForm({ ...form, subject_name: e.target.value });
              }
            }}
          >
            <option value="">Select a subject…</option>
            {subjectChoices.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__custom__">Other (type my own)…</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="e.g. Marketing"
              value={form.subject_name}
              onChange={(e) => setForm({ ...form, subject_name: e.target.value })}
              autoFocus
            />
            <Button
              variant="secondary"
              onClick={() => {
                setCustomSubject(false);
                setForm({ ...form, subject_name: '' });
              }}
            >
              List
            </Button>
          </div>
        )}
      </Field>

      <Field label="Topics to focus on">
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Comma-separated, e.g. Photosynthesis, Respiration, Cell division"
          value={form.topics}
          onChange={(e) => setForm({ ...form, topics: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Complexity">
          <select
            className={inputClass}
            value={form.complexity}
            onChange={(e) =>
              setForm({ ...form, complexity: e.target.value as CreateJobParams['complexity'] })
            }
          >
            {options.complexity_levels.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Answer type">
          <select
            className={inputClass}
            value={form.question_type}
            onChange={(e) =>
              setForm({ ...form, question_type: e.target.value as CreateJobParams['question_type'] })
            }
          >
            <option value="single">Single answer</option>
            <option value="multiple">Multiple answers</option>
          </select>
        </Field>

        <Field label="How many questions">
          <input
            type="number"
            min={1}
            max={40}
            className={inputClass}
            value={form.question_count}
            onChange={(e) =>
              setForm({ ...form, question_count: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })
            }
          />
        </Field>
      </div>

      {showRatio && (
        <Field label={`Calculation vs reasoning — ${form.calculation_ratio}% calculation`}>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={form.calculation_ratio}
            onChange={(e) => setForm({ ...form, calculation_ratio: Number(e.target.value) })}
            className="w-full accent-brand-600"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>All reasoning</span>
            <span>All calculation</span>
          </div>
        </Field>
      )}

      <Button onClick={submit} loading={submitting} size="lg" className="w-full">
        <Wand2 className="h-4 w-4" />
        Generate questions
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review + commit
// ---------------------------------------------------------------------------

function ReviewPanel({
  job,
  onDone,
  onDiscard,
}: {
  job: GenerationJob;
  onDone: () => void;
  onDiscard: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftEdit[]>(
    job.generated.map((q) => ({ ...q, include: true })),
  );
  const included = drafts.filter((d) => d.include);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [subjectId, setSubjectId] = useState<number | 0>(0); // 0 = new subject
  const [subjectName, setSubjectName] = useState(job.subject_name);
  const [bankId, setBankId] = useState<number | 0>(0); // 0 = new bank
  const [bankName, setBankName] = useState(`${job.subject_name} — AI set`);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; bank: { name: string; subject: string } } | null>(null);

  useEffect(() => {
    cbtAPI.subjects().then(({ data }) => setSubjects(data.results)).catch(() => {});
  }, []);
  useEffect(() => {
    if (subjectId) {
      cbtAPI.banks({ subject: subjectId }).then(({ data }) => setBanks(data.results)).catch(() => {});
    } else {
      setBanks([]);
      setBankId(0);
    }
  }, [subjectId]);

  const patch = (i: number, changes: Partial<DraftEdit>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...changes } : d)));

  const setOption = (qi: number, oi: number, changes: Partial<DraftEdit['options'][number]>) =>
    setDrafts((prev) =>
      prev.map((d, idx) => {
        if (idx !== qi) return d;
        let options = d.options.map((o, j) => (j === oi ? { ...o, ...changes } : o));
        // For single-answer, marking one correct clears the others.
        if (job.question_type === 'single' && changes.is_correct) {
          options = options.map((o, j) => ({ ...o, is_correct: j === oi }));
        }
        return { ...d, options };
      }),
    );

  const commit = async () => {
    if (included.length === 0) {
      setError('Select at least one question to save.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        questions: included.map((d) => ({
          text: d.text,
          options: d.options,
          difficulty: d.difficulty,
          category: d.category,
          explanation: d.explanation,
        })),
        ...(subjectId ? { subject_id: subjectId } : { subject_name: subjectName.trim() }),
        ...(subjectId && bankId ? { bank_id: bankId } : { bank_name: bankName.trim() }),
      };
      const { data } = await cbtGenAPI.commit(job.id, payload);
      setResult(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the questions.'));
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    try {
      await cbtGenAPI.discard(job.id);
    } catch {
      /* best effort */
    }
    onDiscard();
  };

  if (result) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Saved {result.created} question{result.created === 1 ? '' : 's'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Added to <strong>{result.bank.name}</strong> ({result.bank.subject}). They’re now
          available when you build an exam.
        </p>
        <Button onClick={onDone} className="mt-6">
          <Sparkles className="h-4 w-4" /> Generate more
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Review {drafts.length} generated question{drafts.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-gray-500">
            Edit anything, untick questions you don’t want, then save the rest.
          </p>
        </div>
        <Badge tone="brand">{included.length} selected</Badge>
      </div>

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

      {drafts.length === 0 ? (
        <EmptyState message="No questions were generated." />
      ) : (
        <div className="space-y-4">
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              index={i}
              draft={d}
              multiple={job.question_type === 'multiple'}
              onPatch={(changes) => patch(i, changes)}
              onOption={(oi, changes) => setOption(i, oi, changes)}
            />
          ))}
        </div>
      )}

      {/* Save target */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Save className="h-4 w-4 text-brand-600" /> Save approved questions
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject">
            <select
              className={inputClass}
              value={subjectId}
              onChange={(e) => setSubjectId(Number(e.target.value))}
            >
              <option value={0}>New subject: “{job.subject_name}”</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {subjectId === 0 && (
              <input
                className={`${inputClass} mt-2`}
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Subject name"
              />
            )}
          </Field>

          <Field label="Question bank">
            {subjectId !== 0 && banks.length > 0 ? (
              <select
                className={inputClass}
                value={bankId}
                onChange={(e) => setBankId(Number(e.target.value))}
              >
                <option value={0}>New bank…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : null}
            {(subjectId === 0 || bankId === 0) && (
              <input
                className={`${inputClass} ${subjectId !== 0 && banks.length > 0 ? 'mt-2' : ''}`}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="New bank name"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={commit} loading={saving}>
            <Save className="h-4 w-4" />
            Save {included.length} question{included.length === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={discard}>
            <Trash2 className="h-4 w-4" /> Discard
          </Button>
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  index,
  draft,
  multiple,
  onPatch,
  onOption,
}: {
  index: number;
  draft: DraftEdit;
  multiple: boolean;
  onPatch: (changes: Partial<DraftEdit>) => void;
  onOption: (oi: number, changes: Partial<DraftEdit['options'][number]>) => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-opacity ${
        draft.include ? 'border-gray-200' : 'border-gray-100 opacity-60'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={draft.include}
            onChange={(e) => onPatch({ include: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Question {index + 1}
        </label>
        <div className="flex items-center gap-2">
          <Badge tone={draft.category === 'calculation' ? 'amber' : 'gray'}>
            {draft.category}
          </Badge>
          <select
            className="rounded border border-gray-300 px-2 py-1 text-xs"
            value={draft.difficulty}
            onChange={(e) =>
              onPatch({ difficulty: e.target.value as DraftEdit['difficulty'] })
            }
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <textarea
        className={`${inputClass} font-medium`}
        rows={2}
        value={draft.text}
        onChange={(e) => onPatch({ text: e.target.value })}
      />
      {/\\\(|\\\[|\$/.test(draft.text) && (
        <div className="mt-1 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <MathText>{draft.text}</MathText>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {draft.options.map((o, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={`correct-${index}`}
              checked={o.is_correct}
              onChange={(e) => onOption(oi, { is_correct: e.target.checked })}
              className="h-4 w-4 shrink-0 text-brand-600 focus:ring-brand-500"
              title="Mark correct"
            />
            <input
              className={`${inputClass} ${o.is_correct ? 'border-green-400 bg-green-50' : ''}`}
              value={o.text}
              onChange={(e) => onOption(oi, { text: e.target.value })}
            />
          </div>
        ))}
      </div>

      {draft.explanation && (
        <textarea
          className={`${inputClass} mt-3 text-xs`}
          rows={2}
          value={draft.explanation}
          onChange={(e) => onPatch({ explanation: e.target.value })}
          placeholder="Explanation"
        />
      )}
    </div>
  );
}
