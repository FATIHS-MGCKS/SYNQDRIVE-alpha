import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

interface SidebarProps {
  title: string;
  subtitle: string;
  items: NavItem[];
  accentColor?: string;
}

export function Sidebar({ title, subtitle, items, accentColor = 'indigo' }: SidebarProps) {
  const location = useLocation();
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-600 text-white',
    emerald: 'bg-emerald-600 text-white',
  };
  const activeColors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-600',
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      <div className={`p-5 ${colors[accentColor]}`}>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm opacity-80">{subtitle}</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const isExact = location.pathname === item.to;
          const isNested = location.pathname.startsWith(item.to + '/');
          const isActive = isExact || isNested;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-3 ${
                isActive
                  ? `${activeColors[accentColor]} border-l-3`
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-transparent'
              }`}
            >
              <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t text-xs text-gray-400">SynqDrive v0.1.0</div>
    </aside>
  );
}
