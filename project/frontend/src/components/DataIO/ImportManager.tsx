import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { academicAPI, dataioAPI, errorMessage } from '../../services/api';
import type { ImportKind, ImportPreview, Term } from '../../types';
import {
  Alert,
  Badge,
  Button,
  Field,
  PageHeader,
  Spinner,
  TableWrap,
  inputClass,
} from '../UI/Primitives';

const KINDS: { value: ImportKind; label: string; hint: string; needsTerm?: boolean }[] = [
  {
    value: 'students',
    label: 'Students',
    hint: 'admission_number, first_name, last_name, gender (+ classroom, arm, parent details)',
  },
  {
    value: 'staff',
    label: 'Staff',
    hint: 'staff_number, first_name, last_name, username (+ email, role, password)',
  },
  {
    value: 'questions',
    label: 'Questions',
    hint: 'bank, text, option_a, option_b, correct_option (+ option_c–e, marks, difficulty)',
  },
  {
    value: 'attendance',
    label: 'Attendance',
    hint: 'admission_number, date, status — requires a term',
    needsTerm: true,
  },
  {
    value: 'checkouts',
    label: 'Checkouts',
    hint: 'admission_number, date, checked_out_at — requires a term',
    needsTerm: true,
  },
];

export default function ImportManager() {
  const [kind, setKind] = useState<ImportKind>('students');
  const [term, setTerm] = useState('');
  const [terms, setTerms] = useState<Term[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const fileInput = useRef<HTMLInputElement>(null);
  const config = KINDS.find((k) => k.value === kind)!;

  useEffect(() => {
    academicAPI
      .terms({ page_size: 100 })
      .then(({ data }) => {
        setTerms(data.results);
        const current = data.results.find((t) => t.is_current);
        if (current) setTerm(String(current.id));
      })
      .catch(() => undefined);
  }, []);

  const downloadTemplate = async () => {
    setTemplateLoading(true);
    setError('');
    try {
      await dataioAPI.downloadTemplate(kind);
    } catch (err) {
      setError(errorMessage(err, 'Could not download the template.'));
    } finally {
      setTemplateLoading(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setFile(null);
    setError('');
    setDone('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const upload = async () => {
    if (!file) return;

    setUploading(true);
    setError('');
    setDone('');
    try {
      const { data } = await dataioAPI.upload(
        kind,
        file,
        config.needsTerm ? Number(term) : undefined,
      );
      setPreview(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not read this file.'));
    } finally {
      setUploading(false);
    }
  };

  const commit = async () => {
    if (!preview) return;

    setCommitting(true);
    setError('');
    try {
      const { data } = await dataioAPI.commit(preview.job.id);
      if (data.async) {
        setDone(data.detail);
      } else {
        setDone(
          `Import complete — ${data.created} created, ${data.updated} updated, ` +
            `${data.skipped} row(s) skipped.`,
        );
      }
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (err) {
      setError(errorMessage(err, 'Could not commit this import.'));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Import data"
        subtitle="Upload a CSV, review the preview, then commit. Nothing is saved until you approve it."
      />

      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}
      {done && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setDone('')}>{done}</Alert>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What are you importing?">
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => { setKind(e.target.value as ImportKind); reset(); }}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </Field>

          {config.needsTerm && (
            <Field label="Term" required>
              <select
                className={inputClass}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                required
              >
                <option value="">Select a term</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} — {t.session_name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            <strong>Expected columns:</strong> {config.hint}
          </p>
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={templateLoading}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium
              text-brand-600 hover:underline disabled:opacity-60"
          >
            {templateLoading ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download a blank template
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
            className="block w-full max-w-sm text-sm text-gray-600
              file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4
              file:py-2 file:text-sm file:font-medium file:text-brand-700
              hover:file:bg-brand-100"
          />
          <Button
            onClick={upload}
            loading={uploading}
            disabled={!file || (config.needsTerm && !term)}
          >
            <Upload className="h-4 w-4" />
            Validate &amp; preview
          </Button>
        </div>
      </div>

      {uploading && (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      )}

      {preview && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[
              ['Rows in file', preview.summary.total_rows, 'gray'],
              ['Ready to import', preview.summary.valid_rows, 'green'],
              ['Rows with errors', preview.summary.error_rows, 'red'],
            ].map(([label, value, tone]) => (
              <div
                key={label as string}
                className={`rounded-lg p-4 text-center ${
                  tone === 'green'
                    ? 'bg-green-50'
                    : tone === 'red' && Number(value) > 0
                      ? 'bg-red-50'
                      : 'bg-gray-50'
                }`}
              >
                <p className="text-2xl font-bold text-gray-900">{value as number}</p>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {label as string}
                </p>
              </div>
            ))}
          </div>

          {preview.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-red-800">
                Rows that will be skipped
              </h3>
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm text-red-700">
                {preview.errors.map((err, i) => (
                  <li key={i}>
                    {err.line !== null && (
                      <Badge tone="red">Line {err.line}</Badge>
                    )}{' '}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.preview.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Preview — first {preview.preview.length} valid row(s)
              </h3>
              <TableWrap>
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(preview.preview[0])
                      .filter((key) => key !== '_line')
                      .map((column) => (
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
                      {Object.entries(row)
                        .filter(([key]) => key !== '_line')
                        .map(([key, value]) => (
                          <td
                            key={key}
                            className="whitespace-nowrap px-3 py-2 text-gray-700"
                          >
                            {String(value) || '—'}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Cancel</Button>
            <Button
              onClick={commit}
              loading={committing}
              disabled={preview.summary.valid_rows === 0}
            >
              <CheckCircle2 className="h-4 w-4" />
              Import {preview.summary.valid_rows} row(s)
            </Button>
          </div>
        </div>
      )}

      {!preview && !uploading && !file && (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <FileUp className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            Choose a CSV file above to get started.
          </p>
        </div>
      )}
    </div>
  );
}
