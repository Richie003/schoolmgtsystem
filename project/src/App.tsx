import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './components/Auth/Login';
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
const ImportManager = lazy(() => import('./components/DataIO/ImportManager'));
const ExportManager = lazy(() => import('./components/DataIO/ExportManager'));
const AppearanceSettings = lazy(() => import('./components/Settings/AppearanceSettings'));

function MainApp() {
  const { user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Only tabs this role may reach are routable — a hand-typed hash for a
  // forbidden tab lands on the dashboard rather than a broken screen.
  const allowedTabs = menuItems
    .filter((item) => user && item.roles.includes(user.role))
    .map((item) => item.id);

  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return allowedTabs.includes(hash) ? hash : 'dashboard';
  });

  useEffect(() => {
    window.history.replaceState(null, '', `#${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.replace('#', '');
      setActiveTab(allowedTabs.includes(hash) ? hash : 'dashboard');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [allowedTabs]);

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
      case 'import':
        return <ImportManager />;
      case 'export':
        return <ExportManager />;
      case 'settings':
        return <AppearanceSettings />;
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
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

function AuthWrapper() {
  const { user, isInitializing } = useAuth();

  if (isInitializing) return <LoadingSpinner />;
  return user ? <MainApp /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AuthWrapper />
      </ThemeProvider>
    </AuthProvider>
  );
}
