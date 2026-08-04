import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { brandingAPI, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  contrastRatio,
  DEFAULT_BRAND,
  hexToRgb,
  readableTextOn,
} from '../../utils/theme';
import type { SchoolBranding } from '../../types';
import {
  Alert,
  Badge,
  Button,
  Field,
  PageHeader,
  Spinner,
  inputClass,
} from '../UI/Primitives';

/** Ready-made colours, so an admin doesn't have to know hex codes. */
const PRESETS = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Slate', value: '#475569' },
];

export default function AppearanceSettings() {
  const { user, can } = useAuth();
  const { setBranding, previewBrandColor } = useTheme();
  const canManage = can('school_admin', 'super_admin');

  const [branding, setLocalBranding] = useState<SchoolBranding | null>(null);
  const [colour, setColour] = useState(DEFAULT_BRAND);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    brandingAPI
      .get()
      .then(({ data }) => {
        setLocalBranding(data);
        setColour(data.brand_color || DEFAULT_BRAND);
        setDisplayName(data.display_name || '');
      })
      .catch((err) => setError(errorMessage(err, 'Could not load appearance settings.')))
      .finally(() => setLoading(false));
  }, []);

  // Live preview: paint the whole app as the admin drags the picker, and put
  // the saved colour back if they navigate away without saving.
  useEffect(() => {
    previewBrandColor(colour);
    return () => previewBrandColor(null);
  }, [colour, previewBrandColor]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await brandingAPI.update({
        brand_color: colour,
        display_name: displayName,
      });
      setLocalBranding(data);
      setBranding(data);
      setNotice('Appearance saved. Everyone in your school sees this immediately.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save appearance settings.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be smaller than 2 MB.');
      if (logoInput.current) logoInput.current.value = '';
      return;
    }

    setUploading(true);
    setError('');
    try {
      const { data } = await brandingAPI.updateLogo(file);
      setLocalBranding(data);
      setBranding(data);
      setNotice('Logo updated.');
    } catch (err) {
      setError(errorMessage(err, 'Could not upload the logo.'));
    } finally {
      setUploading(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!window.confirm('Remove the school logo?')) return;
    setUploading(true);
    try {
      const { data } = await brandingAPI.removeLogo();
      setLocalBranding(data);
      setBranding({ ...data, logo: null });
      setNotice('Logo removed.');
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the logo.'));
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  const rgb = hexToRgb(colour);
  const textOn = rgb ? readableTextOn(rgb) : '#ffffff';
  const ratio = rgb ? contrastRatio(rgb, hexToRgb(textOn)!) : 0;
  const dirty =
    branding !== null &&
    (colour !== branding.brand_color || displayName !== (branding.display_name || ''));

  return (
    <div>
      <PageHeader
        title="Appearance"
        subtitle="Your school's colour and logo. Changes apply to every staff and student account."
      />

      {!canManage && (
        <div className="mb-4">
          <Alert kind="info">
            Only a school administrator can change appearance settings.
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form
          onSubmit={save}
          className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <fieldset disabled={!canManage} className="space-y-6">
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">
                Brand colour
              </span>
              <div className="mb-3 flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setColour(preset.value)}
                    aria-label={preset.name}
                    aria-pressed={colour.toLowerCase() === preset.value}
                    title={preset.name}
                    className={`h-9 w-9 rounded-full border-2 transition
                      ${
                        colour.toLowerCase() === preset.value
                          ? 'border-gray-900 scale-110'
                          : 'border-white shadow ring-1 ring-gray-200'
                      }`}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  aria-label="Custom brand colour"
                  className="h-10 w-16 cursor-pointer rounded border border-gray-300"
                />
                <input
                  className={`${inputClass} max-w-[140px] font-mono`}
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  aria-label="Brand colour hex value"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setColour(DEFAULT_BRAND)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Every shade in the interface is derived from this one colour, and
                text on it is chosen automatically for readability.
              </p>

              {rgb && ratio < 4.5 && (
                <div className="mt-3">
                  <Alert kind="info">
                    This colour is unusual for text backgrounds (contrast{' '}
                    {ratio.toFixed(1)}:1). It will still be readable — the label
                    colour flips automatically — but a deeper shade usually looks
                    better.
                  </Alert>
                </div>
              )}
            </div>

            <Field label="Display name">
              <input
                className={inputClass}
                placeholder={branding?.name ?? ''}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <span className="mt-1 block text-xs text-gray-500">
                Short name for the sidebar. Leave blank to use “{branding?.name}”.
              </span>
            </Field>

            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">
                School logo
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
                  {branding?.logo ? (
                    <img
                      src={branding.logo}
                      alt="Current school logo"
                      className="h-14 w-14 object-contain"
                    />
                  ) : (
                    <BookOpen className="h-7 w-7 text-gray-300" />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={uploadLogo}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    loading={uploading}
                    onClick={() => logoInput.current?.click()}
                  >
                    <ImageUp className="h-4 w-4" />
                    {branding?.logo ? 'Replace logo' : 'Upload logo'}
                  </Button>
                  {branding?.logo && (
                    <Button type="button" variant="ghost" onClick={removeLogo}>
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                PNG, JPG, SVG or WebP, up to 2 MB. Square images look best.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              {dirty && (
                <span className="text-xs text-amber-700">Unsaved changes</span>
              )}
              <Button type="submit" loading={saving} disabled={!dirty}>
                Save appearance
              </Button>
            </div>
          </fieldset>
        </form>

        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Live preview
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              {branding?.logo ? (
                <img src={branding.logo} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <BookOpen className="h-7 w-7 text-brand-600" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">
                  {displayName || branding?.name}
                </p>
                <p className="text-xs text-gray-500">{user?.school?.code}</p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                Active nav item
              </div>
              <div className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600">
                Inactive nav item
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button">Primary</Button>
              <Button type="button" variant="secondary">Secondary</Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">Brand</Badge>
              <Badge tone="green">Success</Badge>
              <Badge tone="red">Error</Badge>
              <Badge tone="amber">Warning</Badge>
            </div>

            <Alert kind="info">Informational message.</Alert>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-1 text-xs text-gray-500">Sample input</p>
              <input className={inputClass} placeholder="Focus me to see the ring" />
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Semantic colours — green for success, red for errors, amber for
            warnings — stay fixed so meaning never depends on the brand colour.
          </p>
        </aside>
      </div>
    </div>
  );
}
