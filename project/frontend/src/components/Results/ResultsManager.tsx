import { useEffect, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, FileText, Plus, RefreshCw, Send, Settings2,
  Sparkles, Wand2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  academicAPI, cbtAPI, errorMessage, resultsAPI,
} from '../../services/api';
import type {
  Classroom, ReportCardData, ReportRow, ResultGrid, ResultSheet,
  ReportTemplateSettings, SheetStatus, Subject, Term,
} from '../../types';
import {
  Alert, Badge, Button, EmptyState, Field, Modal, PageHeader, Spinner,
  inputClass,
} from '../UI/Primitives';
import ReportCard from './ReportCard';

const STATUS_TONE: Record<SheetStatus, 'gray' | 'amber' | 'brand' | 'green'> = {
  open: 'gray', submitted: 'amber', cumulated: 'brand', published: 'green',
};
const STATUS_LABEL: Record<SheetStatus, string> = {
  open: 'Open — entering', submitted: 'Submitted', cumulated: 'Under review',
  published: 'Published',
};

export default function ResultsManager() {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentReports />;
  return <StaffConsole isAdmin={user?.role === 'school_admin' || user?.role === 'super_admin'} />;
}

// ---------------------------------------------------------------------------
// Student: my published reports
// ---------------------------------------------------------------------------

function StudentReports() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [card, setCard] = useState<ReportCardData | null>(null);

  useEffect(() => {
    resultsAPI.myReports()
      .then(({ data }) => setRows(data))
      .catch((e) => setError(errorMessage(e, 'Could not load your reports.')))
      .finally(() => setLoading(false));
  }, []);

  const open = (id: number) => {
    resultsAPI.report(id).then(({ data }) => setCard(data)).catch(() => {});
  };

  if (card) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => setCard(null)}>
          <ArrowLeft className="h-4 w-4" /> Back to my reports
        </Button>
        <ReportCard data={card} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="My Reports" subtitle="Your published termly report cards." />
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-brand-600" /></div>
      ) : rows.length === 0 ? (
        <EmptyState message="No reports have been published for you yet." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => open(r.id)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-brand-300"
            >
              <span className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-brand-600" />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Report card</span>
                  <span className="block text-xs text-gray-500">
                    Average {r.average}% · Grade {r.grade}
                  </span>
                </span>
              </span>
              <Badge tone="brand">View</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff console
// ---------------------------------------------------------------------------

function StaffConsole({ isAdmin }: { isAdmin: boolean }) {
  const [sheets, setSheets] = useState<ResultSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ResultSheet | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  const load = () => {
    setLoading(true);
    resultsAPI.sheets()
      .then(({ data }) => setSheets(data.results))
      .catch((e) => setError(errorMessage(e, 'Could not load result sheets.')))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (selected) {
    return (
      <SheetWorkspace
        sheet={selected}
        isAdmin={isAdmin}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Results & Report Cards"
        subtitle="Enter results, cumulate, review and publish termly reports."
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setShowTemplate(true)}>
                <Settings2 className="h-4 w-4" /> Template
              </Button>
            )}
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New sheet
            </Button>
          </>
        }
      />
      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-brand-600" /></div>
      ) : sheets.length === 0 ? (
        <EmptyState message="No result sheets yet. Create one for a class and term to begin." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:border-brand-300"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{s.classroom_name}</span>
                <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
              </div>
              <p className="mt-1 text-sm text-gray-500">{s.term_name} · {s.session_name}</p>
              <p className="mt-2 text-xs text-gray-400">
                {s.subject_names.length} subjects · {s.student_count} students
                {s.report_count ? ` · ${s.report_count} reports` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <NewSheetModal onClose={() => setCreating(false)} onCreated={(sheet) => { setCreating(false); load(); setSelected(sheet); }} />
      )}
      {showTemplate && <TemplateModal onClose={() => setShowTemplate(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet workspace: entry grid + workflow + review
// ---------------------------------------------------------------------------

type DraftRows = Record<string, Record<string, { scores: Record<string, number>; teacher_remark: string }>>;

function SheetWorkspace({ sheet: initial, isAdmin, onBack }: {
  sheet: ResultSheet; isAdmin: boolean; onBack: () => void;
}) {
  const [sheet, setSheet] = useState(initial);
  const [grid, setGrid] = useState<ResultGrid | null>(null);
  const [draft, setDraft] = useState<DraftRows>({});
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [tab, setTab] = useState<'entry' | 'reports'>('entry');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadGrid = () => {
    resultsAPI.grid(sheet.id).then(({ data }) => {
      setGrid(data);
      setSheet(data.sheet);
      setDraft(JSON.parse(JSON.stringify(data.rows)) as DraftRows);
      if (data.subjects.length && subjectId === null) setSubjectId(data.subjects[0].id);
    }).catch((e) => setError(errorMessage(e, 'Could not load the sheet.')));
  };
  useEffect(loadGrid, [sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When cumulated/published, default to the reports tab.
  useEffect(() => {
    if (sheet.status === 'cumulated' || sheet.status === 'published') setTab('reports');
    else setTab('entry');
  }, [sheet.status]);

  const act = async (label: string, fn: () => Promise<{ data: ResultSheet }>) => {
    setBusy(label); setError(''); setNotice('');
    try {
      const { data } = await fn();
      setSheet(data);
      setNotice(`${label} done.`);
    } catch (e) {
      setError(errorMessage(e, `Could not ${label.toLowerCase()}.`));
    } finally {
      setBusy('');
    }
  };

  const saveScores = async () => {
    if (!grid || subjectId === null) return;
    setBusy('Save'); setError(''); setNotice('');
    try {
      const rows = grid.students.map((st) => ({
        student: st.id,
        subject: subjectId,
        scores: draft[st.id]?.[subjectId]?.scores ?? {},
      }));
      const { data } = await resultsAPI.saveScores(sheet.id, rows);
      setNotice(`Saved ${data.saved} rows.`);
    } catch (e) {
      setError(errorMessage(e, 'Could not save scores.'));
    } finally {
      setBusy('');
    }
  };

  const autofill = async () => {
    setBusy('Auto-fill'); setError(''); setNotice('');
    try {
      const { data } = await resultsAPI.autofillCbt(sheet.id);
      setNotice(`Filled ${data.filled} exam scores from CBT.`);
      loadGrid();
    } catch (e) {
      setError(errorMessage(e, 'Could not auto-fill from CBT.'));
    } finally {
      setBusy('');
    }
  };

  const setCell = (studentId: number, componentId: number, value: string) => {
    if (subjectId === null) return;
    setDraft((prev) => {
      const next = { ...prev };
      const forStudent = { ...(next[studentId] || {}) };
      const cell = { ...(forStudent[subjectId] || { scores: {}, teacher_remark: '' }) };
      const scores = { ...cell.scores };
      if (value === '') delete scores[componentId];
      else scores[componentId] = Number(value);
      forStudent[subjectId] = { ...cell, scores };
      next[studentId] = forStudent;
      return next;
    });
  };

  const locked = sheet.status !== 'open';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {sheet.classroom_name} — {sheet.term_name}
            </h1>
            <Badge tone={STATUS_TONE[sheet.status]}>{STATUS_LABEL[sheet.status]}</Badge>
          </div>
        </div>
        <WorkflowActions
          sheet={sheet} isAdmin={isAdmin} busy={busy} act={act}
        />
      </div>

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
      {notice && <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>}

      <div className="flex gap-1 border-b border-gray-200">
        {(['entry', 'reports'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-b-2 border-brand-600 text-brand-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'entry' ? 'Enter results' : 'Reports'}
          </button>
        ))}
      </div>

      {tab === 'entry' ? (
        !grid ? (
          <div className="flex justify-center py-12"><Spinner className="h-7 w-7 text-brand-600" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Subject</span>
                <select
                  className={`${inputClass} w-52`}
                  value={subjectId ?? ''}
                  onChange={(e) => setSubjectId(Number(e.target.value))}
                >
                  {grid.subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {!locked && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={autofill} loading={busy === 'Auto-fill'}>
                    <Wand2 className="h-4 w-4" /> Auto-fill exam from CBT
                  </Button>
                  <Button onClick={saveScores} loading={busy === 'Save'}>Save</Button>
                </div>
              )}
            </div>

            {locked && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Entry is locked because the sheet has been submitted. An admin can reopen it.
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Student</th>
                    {grid.components.map((c) => (
                      <th key={c.id} className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                        {c.name} <span className="text-gray-400">/{c.max_score}</span>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grid.students.map((st) => {
                    const cell = subjectId !== null ? draft[st.id]?.[subjectId] : undefined;
                    const scores = cell?.scores ?? {};
                    const total = grid.components.reduce((sum, c) => sum + (Number(scores[c.id]) || 0), 0);
                    return (
                      <tr key={st.id}>
                        <td className="px-3 py-1.5">
                          <span className="font-medium text-gray-900">{st.name}</span>
                          <span className="block text-xs text-gray-400">{st.admission_number}</span>
                        </td>
                        {grid.components.map((c) => (
                          <td key={c.id} className="px-2 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={c.max_score}
                              disabled={locked}
                              className="w-16 rounded border border-gray-300 px-1.5 py-1 text-center text-sm disabled:bg-gray-100"
                              value={scores[c.id] ?? ''}
                              onChange={(e) => setCell(st.id, c.id, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center font-semibold text-gray-700">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <ReportsPanel sheet={sheet} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function WorkflowActions({ sheet, isAdmin, busy, act }: {
  sheet: ResultSheet; isAdmin: boolean; busy: string;
  act: (label: string, fn: () => Promise<{ data: ResultSheet }>) => void;
}) {
  const b = (l: string) => busy === l;
  return (
    <div className="flex flex-wrap gap-2">
      {sheet.status === 'open' && (
        <Button onClick={() => act('Submit', () => resultsAPI.submit(sheet.id))} loading={b('Submit')}>
          <Send className="h-4 w-4" /> Submit to admin
        </Button>
      )}
      {sheet.status === 'submitted' && isAdmin && (
        <Button onClick={() => act('Cumulate', () => resultsAPI.cumulate(sheet.id))} loading={b('Cumulate')}>
          <Sparkles className="h-4 w-4" /> Cumulate results
        </Button>
      )}
      {sheet.status === 'cumulated' && (
        <>
          <Button variant="secondary" onClick={() => act('Review', () => resultsAPI.review(sheet.id))} loading={b('Review')}>
            <CheckCircle2 className="h-4 w-4" /> Mark reviewed
          </Button>
          {isAdmin && (
            <>
              <Button onClick={() => act('Recumulate', () => resultsAPI.cumulate(sheet.id))} loading={b('Recumulate')} variant="secondary">
                <RefreshCw className="h-4 w-4" /> Re-cumulate
              </Button>
              <Button onClick={() => act('Publish', () => resultsAPI.publish(sheet.id))} loading={b('Publish')}>
                Publish
              </Button>
            </>
          )}
        </>
      )}
      {sheet.status === 'published' && isAdmin && (
        <Button variant="secondary" onClick={() => act('Unpublish', () => resultsAPI.unpublish(sheet.id))} loading={b('Unpublish')}>
          Unpublish
        </Button>
      )}
      {isAdmin && (sheet.status === 'submitted' || sheet.status === 'cumulated') && (
        <Button variant="secondary" onClick={() => act('Reopen', () => resultsAPI.reopen(sheet.id))} loading={b('Reopen')}>
          Reopen entry
        </Button>
      )}
    </div>
  );
}

function ReportsPanel({ sheet, isAdmin }: { sheet: ResultSheet; isAdmin: boolean }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<ReportCardData | null>(null);

  useEffect(() => {
    resultsAPI.sheetReports(sheet.id)
      .then(({ data }) => setRows(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sheet.id]);

  if (loading) return <div className="flex justify-center py-12"><Spinner className="h-7 w-7 text-brand-600" /></div>;
  if (rows.length === 0) return <EmptyState message="No reports yet — cumulate the sheet to generate them." />;

  if (card) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => setCard(null)}>
          <ArrowLeft className="h-4 w-4" /> Back to list
        </Button>
        <RemarkEditor card={card} onSaved={setCard} />
        <ReportCard data={card} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Student</th>
            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Avg %</th>
            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Grade</th>
            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Pos.</th>
            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">Remark?</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-1.5">
                <span className="font-medium text-gray-900">{r.student_name}</span>
                <span className="block text-xs text-gray-400">{r.admission_number}</span>
              </td>
              <td className="px-2 py-1.5 text-center">{r.average}</td>
              <td className="px-2 py-1.5 text-center">{r.grade}</td>
              <td className="px-2 py-1.5 text-center">{r.position ?? '—'}</td>
              <td className="px-2 py-1.5 text-center">
                {r.class_teacher_remark ? <CheckCircle2 className="mx-auto h-4 w-4 text-green-500" /> : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-2 py-1.5 text-right">
                <button
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => resultsAPI.report(r.id).then(({ data }) => setCard(data))}
                >
                  {sheet.status === 'cumulated' || isAdmin ? 'Review' : 'View'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RemarkEditor({ card, onSaved }: { card: ReportCardData; onSaved: (c: ReportCardData) => void }) {
  const [teacher, setTeacher] = useState(card.remarks.class_teacher);
  const [principal, setPrincipal] = useState(card.remarks.principal);
  const [traits, setTraits] = useState<Record<string, string>>(card.traits || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await resultsAPI.saveRemark(card.id, {
        class_teacher_remark: teacher, principal_remark: principal, traits,
      });
      onSaved(data);
    } catch (e) {
      setError(errorMessage(e, 'Could not save remarks. Results may need cumulating first.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">Class teacher review — {card.student.name}</p>
      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
      <Field label="Class teacher's remark">
        <textarea className={inputClass} rows={2} value={teacher} onChange={(e) => setTeacher(e.target.value)} />
      </Field>
      <Field label="Principal's remark">
        <textarea className={inputClass} rows={2} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
      </Field>
      {card.template.show_traits && card.template.traits.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {card.template.traits.map((name) => (
            <Field key={name} label={name}>
              <input
                className={inputClass}
                value={traits[name] || ''}
                onChange={(e) => setTraits({ ...traits, [name]: e.target.value })}
                placeholder="e.g. A / Excellent"
              />
            </Field>
          ))}
        </div>
      )}
      <Button onClick={save} loading={saving}>Save remarks</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New sheet + template modals
// ---------------------------------------------------------------------------

function NewSheetModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: ResultSheet) => void }) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classroom, setClassroom] = useState<number | ''>('');
  const [term, setTerm] = useState<number | ''>('');
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([academicAPI.classrooms(), academicAPI.terms(), cbtAPI.subjects()])
      .then(([c, t, s]) => {
        setClassrooms(c.data.results);
        setTerms(t.data.results);
        setSubjects(s.data.results);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load options.')));
  }, []);

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    if (!classroom || !term || picked.length === 0) {
      setError('Choose a class, a term and at least one subject.');
      return;
    }
    setSaving(true); setError('');
    try {
      const { data } = await resultsAPI.createSheet({
        classroom: Number(classroom), term: Number(term), subjects: picked,
      });
      onCreated(data);
    } catch (e) {
      setError(errorMessage(e, 'Could not create the sheet (one may already exist for this class & term).'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="New result sheet" onClose={onClose} wide>
      <div className="space-y-4">
        {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" required>
            <select className={inputClass} value={classroom} onChange={(e) => setClassroom(Number(e.target.value))}>
              <option value="">Select…</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.full_name || `${c.name} ${c.arm}`}</option>)}
            </select>
          </Field>
          <Field label="Term" required>
            <select className={inputClass} value={term} onChange={(e) => setTerm(Number(e.target.value))}>
              <option value="">Select…</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">Subjects</span>
          <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2 sm:grid-cols-3">
            {subjects.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                {s.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">{picked.length} selected</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={create} loading={saving}>Create sheet</Button>
        </div>
      </div>
    </Modal>
  );
}

function TemplateModal({ onClose }: { onClose: () => void }) {
  const [t, setT] = useState<ReportTemplateSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    resultsAPI.template().then(({ data }) => setT(data)).catch((e) => setError(errorMessage(e, 'Could not load settings.')));
  }, []);

  const premium = t?.is_premium;

  const save = async () => {
    if (!t) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const { data } = await resultsAPI.updateTemplate({
        header_text: t.header_text, show_attendance: t.show_attendance,
        show_positions: t.show_positions, show_remarks: t.show_remarks,
        show_traits: t.show_traits, traits: t.traits,
      });
      setT(data); setSaved(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Report template" onClose={onClose}>
      {!t ? (
        <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-brand-600" /></div>
      ) : (
        <div className="space-y-4">
          {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
          {saved && <Alert kind="success">Saved.</Alert>}
          {!premium && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Customising the report template is a premium feature. You can preview the options below.
            </div>
          )}
          <Field label="Header line">
            <input className={inputClass} disabled={!premium} value={t.header_text}
              onChange={(e) => setT({ ...t, header_text: e.target.value })}
              placeholder="e.g. Terminal Report Sheet" />
          </Field>
          {([
            ['show_attendance', 'Show attendance summary'],
            ['show_positions', 'Show class positions'],
            ['show_remarks', 'Show remark sections'],
            ['show_traits', 'Show affective/psychomotor traits'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{label}</span>
              <input type="checkbox" disabled={!premium} checked={t[key]}
                onChange={(e) => setT({ ...t, [key]: e.target.checked })}
                className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            </label>
          ))}
          {t.show_traits && (
            <Field label="Trait names (comma-separated)">
              <input className={inputClass} disabled={!premium} value={t.traits.join(', ')}
                onChange={(e) => setT({ ...t, traits: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                placeholder="Punctuality, Neatness, Attentiveness" />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {premium && <Button onClick={save} loading={saving}>Save</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
