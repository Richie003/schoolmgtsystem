import { useCallback, useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { academicAPI, dataioAPI, errorMessage } from '../../services/api';
import type { Classroom, ExportPreview, ImportKind, Term } from '../../types';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Spinner,
  TableWrap,
  inputClass,
} from '../UI/Primitives';

const KINDS: { value: ImportKind; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'staff', label: 'Staff' },
  { value: 'questions', label: 'Questions' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'checkouts', label: 'Checkouts' },
];

const DATE_FILTERED: ImportKind[] = ['attendance', 'checkouts'];

export default function ExportManager() {
  const [kind, setKind] = useState<ImportKind>('students');
  const [classroom, setClassroom] = useState('');
  const [term, setTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    academicAPI.classrooms({ page_size: 200 })
      .then(({ data }) => setClassrooms(data.results)).catch(() => undefined);
    academicAPI.terms({ page_size: 100 })
      .then(({ data }) => setTerms(data.results)).catch(() => undefined);
  }, []);

  const filters = useCallback(() => {
    const result: Record<string, unknown> = {};
    if (classroom) result.classroom = classroom;
    if (DATE_FILTERED.includes(kind)) {
      if (term) result.term = term;
      if (dateFrom) result.date_from = dateFrom;
      if (dateTo) result.date_to = dateTo;
    }
    return result;
  }, [kind, classroom, term, dateFrom, dateTo]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await dataioAPI.exportPreview(kind, filters());
      setPreview(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not build the preview.'));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [kind, filters]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      await dataioAPI.download(kind, filters());
    } catch (err) {
      setError(errorMessage(err, 'Could not download the file.'));
    } finally {
      setDownloading(false);
    }
  };

  const showsClassroom = kind === 'students' || DATE_FILTERED.includes(kind);

  return (
    <div>
      <PageHeader
        title="Export data"
        subtitle="Preview what will be exported, then download it as CSV."
      />

      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dataset">
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as ImportKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </Field>

          {showsClassroom && (
            <Field label="Class">
              <select
                className={inputClass}
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
              >
                <option value="">All classes</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </Field>
          )}

          {DATE_FILTERED.includes(kind) && (
            <>
              <Field label="Term">
                <select
                  className={inputClass}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option value="">All terms</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {t.session_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="From">
                <input
                  type="date"
                  className={inputClass}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={inputClass}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={loadPreview} loading={loading}>
            <Eye className="h-4 w-4" />
            Refresh preview
          </Button>
          <Button
            onClick={download}
            loading={downloading}
            disabled={!preview || preview.total_rows === 0}
          >
            <Download className="h-4 w-4" />
            Download CSV
            {preview && preview.total_rows > 0 && ` (${preview.total_rows} rows)`}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : !preview || preview.total_rows === 0 ? (
        <EmptyState message="No rows match these filters." />
      ) : (
        <div>
          <p className="mb-2 text-sm text-gray-500">
            Showing the first {preview.preview.length} of {preview.total_rows} row(s).
          </p>
          <TableWrap>
            <thead className="bg-gray-50">
              <tr>
                {preview.columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {column.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {preview.preview.map((row, i) => (
                <tr key={i}>
                  {preview.columns.map((column) => (
                    <td key={column} className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {String(row[column] ?? '') || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}
    </div>
  );
}
