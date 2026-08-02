import {
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Home,
  LogOut,
  LogOutIcon,
  Palette,
  Pin,
  Users,
  UserSquare2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { Role } from '../../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

/** Nav entries, each gated by the roles allowed to see it. */
export const menuItems: {
  id: string;
  label: string;
  icon: typeof Home;
  roles: Role[];
}[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    roles: ['super_admin', 'school_admin', 'teacher', 'student'],
  },
  {
    // Platform operator's home: review school signups and manage invitations.
    id: 'onboarding',
    label: 'Onboarding',
    icon: Building2,
    roles: ['super_admin'],
  },
  {
    id: 'students',
    label: 'Students',
    icon: Users,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: ClipboardCheck,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'checkouts',
    label: 'Checkouts',
    icon: LogOutIcon,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'staff',
    label: 'Staff',
    icon: UserSquare2,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'noticeboard',
    label: 'Noticeboard',
    icon: Pin,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'cbt',
    label: 'CBT Exams',
    icon: GraduationCap,
    roles: ['super_admin', 'school_admin', 'teacher', 'student'],
  },
  {
    id: 'academics',
    label: 'Academics',
    icon: CalendarRange,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'import',
    label: 'Import Data',
    icon: FileSpreadsheet,
    roles: ['super_admin', 'school_admin'],
  },
  {
    id: 'export',
    label: 'Export Data',
    icon: Download,
    roles: ['super_admin', 'school_admin', 'teacher'],
  },
  {
    id: 'settings',
    label: 'Appearance',
    icon: Palette,
    roles: ['super_admin', 'school_admin'],
  },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  isMobileOpen,
  setIsMobileOpen,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const { logo, schoolName } = useTheme();

  const visibleItems = menuItems.filter(
    (item) => user && item.roles.includes(user.role),
  );

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    setIsMobileOpen(false);
  };

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-white shadow-lg
          transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center border-b border-gray-200 px-6 py-5">
            {logo ? (
              <img
                src={logo}
                alt=""
                className="h-9 w-9 shrink-0 rounded object-contain"
              />
            ) : (
              <BookOpen className="h-8 w-8 shrink-0 text-brand-600" />
            )}
            <div className="ml-3 min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">
                {schoolName || user?.school?.name || 'School MS'}
              </p>
              {user?.school?.code && (
                <p className="text-xs text-gray-500">{user.school.code}</p>
              )}
            </div>
          </div>

          <div className="border-b border-gray-200 px-6 py-4">
            <p className="truncate text-sm font-medium text-gray-900">
              {user?.full_name}
            </p>
            <p className="text-xs capitalize text-gray-500">
              {user?.role.replace('_', ' ')}
            </p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-sm
                    font-medium transition-colors
                    ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <Icon className="mr-3 h-5 w-5" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-gray-200 p-4">
            <button
              onClick={logout}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm
                font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="mr-3 h-5 w-5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
