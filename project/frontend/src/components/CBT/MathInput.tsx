import type { RefObject } from 'react';
import { useId, useState } from 'react';
import { Eye, Sigma } from 'lucide-react';
import { MATH_PALETTE, containsMath, type MathSnippet } from '../../utils/math';
import MathText from '../UI/MathText';

/**
 * A textarea for question text that can contain formulas.
 *
 * Authors type LaTeX between `$…$`. Two affordances keep that usable by a
 * teacher who has never written LaTeX:
 *
 *  * a palette that inserts the notation at the cursor, so nothing has to be
 *    memorised, and
 *  * a live preview showing exactly what the student will see, so a mistake is
 *    caught while authoring rather than during an exam.
 */
export default function MathInput({
  value,
  onChange,
  rows = 3,
  placeholder,
  textareaRef,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  // React 18's useRef<T>(null) yields RefObject<T | null>; accept that shape
  // and narrow before use rather than forcing a non-null assertion on callers.
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  label: string;
}) {
  const [showPalette, setShowPalette] = useState(false);
  const previewId = useId();

  /**
   * Insert a snippet at the cursor, wrapping it in `$…$` when the cursor is not
   * already inside a formula — otherwise the author gets bare LaTeX that would
   * render as literal text.
   */
  const insert = (item: MathSnippet) => {
    const field = textareaRef.current;
    if (!field) return;

    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? start;

    const before = value.slice(0, start);
    const after = value.slice(end);

    // An odd number of unescaped delimiters before the cursor means we are
    // inside an open formula already.
    const dollarsBefore = (before.match(/(?<!\\)\$/g) ?? []).length;
    const insideMath = dollarsBefore % 2 === 1;

    const body = item.snippet;
    const text = insideMath ? body : `$${body}$`;
    const next = `${before}${text}${after}`;

    onChange(next);

    // Put the caret inside the first pair of braces so typing continues in the
    // right place.
    const trailing = insideMath ? 0 : 1;
    const caret = start + text.length - trailing - (item.caret ?? 0);

    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };

  const hasMath = containsMath(value);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button
          type="button"
          onClick={() => setShowPalette((open) => !open)}
          aria-expanded={showPalette}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs
            font-medium text-brand-700 hover:bg-brand-50"
        >
          <Sigma className="h-3.5 w-3.5" />
          {showPalette ? 'Hide symbols' : 'Insert symbol'}
        </button>
      </div>

      {showPalette && (
        <div className="mb-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {MATH_PALETTE.map((group) => (
            <div key={group.group}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    title={`${item.title}  —  ${item.snippet.trim()}`}
                    onClick={() => insert(item)}
                    className="min-w-[2rem] rounded border border-gray-300 bg-white px-2
                      py-1 text-sm text-gray-800 hover:border-brand-400 hover:bg-brand-50"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-gray-500">
            Formulas go between dollar signs, e.g.{' '}
            <code className="rounded bg-white px-1">$E = mc^2$</code>. Use{' '}
            <code className="rounded bg-white px-1">$$…$$</code> to centre one on
            its own line, and <code className="rounded bg-white px-1">\$</code> for
            a literal dollar sign.
          </p>
        </div>
      )}

      <textarea
        ref={textareaRef as RefObject<HTMLTextAreaElement>}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm
          focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hasMath ? previewId : undefined}
      />

      {hasMath && (
        <div
          id={previewId}
          className="mt-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3"
        >
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            <Eye className="h-3 w-3" />
            Student sees
          </p>
          <MathText className="text-sm text-gray-900">{value}</MathText>
        </div>
      )}
    </div>
  );
}
