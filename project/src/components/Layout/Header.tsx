import { Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { menuItems } from './Sidebar';

interface HeaderProps {
  activeTab: string;
  setIsMobileOpen: (open: boolean) => void;
}

export default function Header({ activeTab, setIsMobileOpen }: HeaderProps) {
  const { user } = useAuth();
  const title =
    menuItems.find((item) => item.id === activeTab)?.label ?? 'School Management';

  return (
    <header className="border-b border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center">
          <button
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100
              hover:text-gray-500 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="ml-2 text-xl font-bold text-gray-900 lg:ml-0">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
            <p className="text-xs capitalize text-gray-500">
              {user?.role.replace('_', ' ')}
            </p>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full
              bg-brand-100 text-sm font-semibold text-brand-700"
            aria-hidden="true"
          >
            {(user?.full_name ?? '?').slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
