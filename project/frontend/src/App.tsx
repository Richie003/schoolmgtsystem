import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ColorModeProvider, useColorMode } from './context/ColorModeContext';
import Login from './components/Auth/Login';
import RequestAccess from './components/Onboarding/RequestAccess';
import AcceptInvite from './components/Onboarding/AcceptInvite';
import Home from './components/Marketing/Home';
import type { PublicView } from './components/Marketing/PublicNav';
import Dashboard from './components/Dashboard/Dashboard';
import Header from './components/Layout/Header';
import Sidebar, { menuItems } from './components/Layout/Sidebar';
import LoadingSpinner from './components/UI/LoadingSpinner';
import { Spinner } from './components/UI/Primitives';

/*
 * Sections are code-split so the first paint stays small. This matters most for
 * CBT: KaTeX and its fonts are only needed to typeset formulas, and a student
 * opening the dashboard on a slow school connection should not pay to download
 * a maths renderer they may never use. Dashboard and the shell stay eager
 * because they are the landing screen.
 */
const StudentManager = lazy(() => import('./components/Students/StudentManager'));
const AttendanceManager = lazy(() => import('./components/Attendance/AttendanceManager'));
const CheckoutManager = lazy(() => import('./components/Attendance/CheckoutManager'));
const StaffManager = lazy(() => import('./components/Staff/StaffManager'));
const Noticeboard = lazy(() => import('./components/Staff/Noticeboard'));
const AcademicsManager = lazy(() => import('./components/Academics/AcademicsManager'));
const CBTManager = lazy(() => import('./components/CBT/CBTManager'));
const QuestionGenerator = lazy(() => import('./components/CBT/QuestionGenerator'));
const ImportManager = lazy(() => import('./components/DataIO/ImportManager'));
const ExportManager = lazy(() => import('./components/DataIO/ExportManager'));
const AppearanceSettings = lazy(() => import('./components/Settings/AppearanceSettings'));
const OnboardingConsole = lazy(() => import('./components/Onboarding/OnboardingConsole'));
// About us and Features are secondary to the landing page, so they are
// code-split. Home stays eager so the front door paints without a spinner
// flash after boot.
const AboutUs = lazy(() => import('./components/Marketing/AboutUs'));
const Features = lazy(() => import('./components/Marketing/Features'));

function MainApp() {
  const { user } = useAuth();
  const { isDark } = useColorMode();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Only tabs this role may reach are routable — a hand-typed hash for a
  // forbidden tab lands on the dashboard rather than a broken screen.
  const allowedTabs = menuItems
    .filter((item) => user && item.roles.includes(user.role))
    .map((item) => item.id);

  // A platform super admin has no school, so the school-scoped dashboard is
  // not their home — the onboarding console is.
  const defaultTab = user?.role === 'super_admin' ? 'onboarding' : 'dashboard';

  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return allowedTabs.includes(hash) ? hash : defaultTab;
  });

  useEffect(() => {
    window.history.replaceState(null, '', `#${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.replace('#', '');
      setActiveTab(allowedTabs.includes(hash) ? hash : defaultTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [allowedTabs, defaultTab]);

  const renderContent = () => {
    switch (activeTab) {
      case 'students':
        return <StudentManager />;
      case 'attendance':
        return <AttendanceManager />;
      case 'checkouts':
        return <CheckoutManager />;
      case 'staff':
        return <StaffManager />;
      case 'noticeboard':
        return <Noticeboard />;
      case 'academics':
        return <AcademicsManager />;
      case 'cbt':
        return <CBTManager />;
      case 'aiquestions':
        return <QuestionGenerator />;
      case 'import':
        return <ImportManager />;
      case 'export':
        return <ExportManager />;
      case 'settings':
        return <AppearanceSettings />;
      case 'onboarding':
        return <OnboardingConsole />;
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  return (
    // The `dark` class is scoped to the app shell so dark mode never touches the
    // marketing or auth screens (which render in a different subtree).
    <div className={`flex min-h-screen ${isDark ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header activeTab={activeTab} setIsMobileOpen={setIsMobileOpen} />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Suspense
              fallback={
                <div className="flex justify-center py-20">
                  <Spinner className="h-8 w-8 text-brand-600" />
                </div>
              }
            >
              {renderContent()}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Everything reachable without logging in: the marketing site (home, about),
 * sign in, register, and accepting an invite. It's a small view switch rather
 * than a router — the app is a single bundle and these screens share no URLs.
 */
function UnauthenticatedApp() {
  // An invite link is ?invite=<token>. Read it once on mount.
  const [inviteToken, setInviteToken] = useState(
    () => new URLSearchParams(window.location.search).get('invite'),
  );
  const [view, setView] = useState<PublicView>('home');

  const clearInvite = () => {
    setInviteToken(null);
    // Drop the token from the URL so a refresh doesn't re-open a consumed link.
    window.history.replaceState(null, '', window.location.pathname);
  };

  if (inviteToken) {
    return (
      <AcceptInvite
        token={inviteToken}
        onDone={clearInvite}
        onInvalid={clearInvite}
      />
    );
  }

  const navigate = (next: PublicView) => setView(next);

  const screen = () => {
    switch (view) {
      case 'features':
        return <Features onNavigate={navigate} />;
      case 'about':
        return <AboutUs onNavigate={navigate} />;
      case 'login':
        return (
          <Login
            onRequestAccess={() => navigate('request')}
            onHome={() => navigate('home')}
          />
        );
      case 'request':
        return (
          <RequestAccess
            onBack={() => navigate('login')}
            onHome={() => navigate('home')}
          />
        );
      case 'home':
      default:
        return <Home onNavigate={navigate} />;
    }
  };

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
          <Spinner className="h-8 w-8 text-brand-400" />
        </div>
      }
    >
      {screen()}
    </Suspense>
  );
}

function AuthWrapper() {
  const { user, isInitializing } = useAuth();

  if (isInitializing) return <LoadingSpinner />;
  return user ? <MainApp /> : <UnauthenticatedApp />;
}

export default function App() {
  return (
    <ColorModeProvider>
      <AuthProvider>
        <ThemeProvider>
          <AuthWrapper />
        </ThemeProvider>
      </AuthProvider>
    </ColorModeProvider>
  );
}
