import { BookOpen } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/*
 * Full-screen boot loader: a single "beeping" logo. The brand mark holds still
 * while pulse rings radiate out from it like a radar ping — one calm focal
 * point instead of the five simultaneous animations this screen used to run
 * (a spinning badge, a second spinner by the text, a pulsing bar and bouncing
 * dots all at once). The school's own logo is used once branding has loaded;
 * during the very first boot (no user yet) it falls back to the brand mark.
 */
export default function LoadingSpinner() {
  const { logo, schoolName } = useTheme();

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-indigo-50 flex items-center justify-center">
      <div
        role="status"
        aria-label="Loading"
        className="flex flex-col items-center gap-6 text-center"
      >
        <div className="relative h-20 w-20">
          {/* The beep: expanding, fading rings. Two, staggered, so a pulse is
              always mid-flight. Hidden for users who prefer reduced motion —
              the mark itself gently pulses for them instead. */}
          <span className="absolute inset-0 rounded-full bg-brand-400/40 animate-ping motion-reduce:hidden" />
          <span
            className="absolute inset-0 rounded-full bg-brand-400/30 animate-ping motion-reduce:hidden"
            style={{ animationDelay: '0.6s' }}
          />
          {/* The steady mark. */}
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand-600 shadow-lg motion-reduce:animate-pulse">
            {logo ? (
              <img src={logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <BookOpen className="h-10 w-10 text-white" />
            )}
          </div>
        </div>

        <p className="text-lg font-semibold text-gray-900">
          {schoolName || 'NlightR School Management System'}
        </p>
      </div>
    </div>
  );
}
