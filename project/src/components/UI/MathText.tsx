import { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseSegments } from '../../utils/math';

/**
 * Renders question text, answer options and explanations, typesetting any
 * LaTeX they contain.
 *
 * Two properties matter more than anything else here, because this component
 * sits on the screen a student is being examined on:
 *
 * 1. **It cannot throw.** `throwOnError: false` makes KaTeX render a malformed
 *    formula as red source text instead of raising. An exception thrown while
 *    rendering a paper would blank the screen mid-exam.
 * 2. **It cannot inject markup.** `trust: false` (KaTeX's default, set here
 *    explicitly) refuses commands like `\href` and `\includegraphics`, so the
 *    HTML KaTeX produces is safe to insert. Prose segments never go through
 *    `dangerouslySetInnerHTML` at all — React escapes them.
 */

/*
 * KaTeX output is cached by source string. The exam runner re-renders once a
 * second as the countdown ticks, and typesetting the same formula sixty times a
 * minute is pure waste. The cache is bounded so a very long authoring session
 * cannot grow it without limit.
 */
const RENDER_CACHE = new Map<string, string>();
const CACHE_LIMIT = 500;

function renderToHtml(source: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}:${source}`;
  const cached = RENDER_CACHE.get(key);
  if (cached !== undefined) return cached;

  let html: string;
  try {
    html = katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      // Show the offending source in red rather than failing the render.
      errorColor: '#dc2626',
      trust: false,
      strict: false,
    });
  } catch {
    // Belt and braces: renderToString should not throw with throwOnError off,
    // but a student's paper must survive it if a future KaTeX ever does.
    html = '';
  }

  if (RENDER_CACHE.size >= CACHE_LIMIT) RENDER_CACHE.clear();
  RENDER_CACHE.set(key, html);
  return html;
}

export interface MathTextProps {
  children: string | null | undefined;
  className?: string;
  /** Render inside a <span> instead of a <div>, for use within a sentence. */
  inline?: boolean;
}

function MathTextImpl({ children, className = '', inline = false }: MathTextProps) {
  const segments = useMemo(() => parseSegments(children ?? ''), [children]);

  if (!children) return null;

  const Wrapper = inline ? 'span' : 'div';

  return (
    <Wrapper className={`${inline ? '' : 'whitespace-pre-wrap'} ${className}`}>
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          // Plain React child: escaped by React, never injected as HTML.
          return <span key={index}>{segment.value}</span>;
        }

        const html = renderToHtml(segment.value, segment.display);
        if (!html) {
          // Renderer unavailable — show the source so the question is still
          // answerable rather than showing nothing at all.
          return <span key={index}>{segment.value}</span>;
        }

        return (
          <span
            key={index}
            className={segment.display ? 'my-2 block overflow-x-auto' : ''}
            // Safe: this is KaTeX's own output with trust disabled, so it
            // contains no author-supplied markup.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </Wrapper>
  );
}

/**
 * Memoised on the text: the exam runner's per-second countdown re-render must
 * not re-typeset every formula on the page.
 */
const MathText = memo(MathTextImpl);
export default MathText;
