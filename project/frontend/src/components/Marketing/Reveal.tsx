import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

/*
 * Reveals its children with a fade-and-rise the first time they scroll into
 * view. Uses IntersectionObserver so there is no scroll listener churn, and
 * disconnects after the first reveal (animate once, not on every pass). If the
 * browser has no IntersectionObserver, content shows immediately. Motion itself
 * is defined by the `.reveal`/`.is-visible` classes in index.css, which honour
 * prefers-reduced-motion.
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger, in ms, for sequential items in a group. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
