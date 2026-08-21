import { useEffect, useState } from 'react';
import { GraduationCap, Menu, X } from 'lucide-react';

/** The routable screens available before signing in. */
export type PublicView = 'home' | 'features' | 'about' | 'login' | 'request' | 'join';

export const PRODUCT_NAME = 'NlightR';

/** Small brand lockup, reused by the nav and footer. The marketing site is
 *  dark throughout, so the wordmark is always light. */
export function BrandMark({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-sm shadow-brand-900/40">
        <GraduationCap className="h-5 w-5 text-brand-contrast" />
      </span>
      <span className="text-lg font-bold tracking-tight text-white">
        {PRODUCT_NAME}
      </span>
    </button>
  );
}

export default function PublicNav({
  active,
  onNavigate,
}: {
  active: PublicView;
  onNavigate: (view: PublicView) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Transparent over the hero, solid once the page scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (view: PublicView) => {
    setMobileOpen(false);
    onNavigate(view);
  };

  const links: { label: string; view: PublicView }[] = [
    { label: 'Home', view: 'home' },
    { label: 'Features', view: 'features' },
    { label: 'About us', view: 'about' },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || mobileOpen
          ? 'border-b border-white/10 bg-gray-950/80 backdrop-blur'
          : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <BrandMark onClick={() => go('home')} />

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <button
              key={link.view}
              type="button"
              onClick={() => go(link.view)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active === link.view
                  ? 'text-brand-400'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => go('join')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active === 'join' ? 'text-brand-400' : 'text-gray-300 hover:text-white'
            }`}
          >
            Join a quiz
          </button>
          <button
            type="button"
            onClick={() => go('login')}
            className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:text-white"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => go('request')}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-brand-contrast shadow-sm shadow-brand-900/40 transition-transform hover:-translate-y-0.5 hover:bg-brand-500"
          >
            Get started
          </button>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-200 md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-gray-950 px-4 pb-4 pt-2 md:hidden">
          {links.map((link) => (
            <button
              key={link.view}
              type="button"
              onClick={() => go(link.view)}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => go('join')}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white"
          >
            Join a quiz
          </button>
          <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => go('login')}
              className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => go('request')}
              className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-brand-contrast"
            >
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
