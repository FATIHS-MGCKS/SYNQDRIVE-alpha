import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';

const items = [
  {
    label: 'Dashboard',
    to: '/master',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4a1 1 0 001-1v-4h2v4a1 1 0 001 1h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
      </svg>
    ),
  },
  {
    label: 'Organizations',
    to: '/master/organizations',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Users',
    to: '/master/users',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm8 0a3 3 0 11-6 0 3 3 0 016 0zm-4.07 11c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
    ),
  },
  {
    label: 'Vehicles',
    to: '/master/vehicles',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 6a1 1 0 011-1h1.535a1 1 0 01.832.445L7.5 7.5h5l1.133-2.055A1 1 0 0114.465 5H16a1 1 0 011 1v7a1 1 0 01-1 1h-1v1a1 1 0 11-2 0v-1H7v1a1 1 0 11-2 0v-1H4a1 1 0 01-1-1V6zm3 5a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    ),
  },
  {
    label: 'DIMO',
    to: '/master/dimo',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Prospects',
    to: '/master/prospects',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Billing',
    to: '/master/billing',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Support',
    to: '/master/support',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Activity Log',
    to: '/master/activity',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Integrations',
    to: '/master/integrations',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 002 0V3zm4.071 1.929a1 1 0 00-1.414 0l-.707.707a1 1 0 001.414 1.414l.707-.707a1 1 0 000-1.414zM16 10a1 1 0 011 0h1a1 1 0 110 2h-1a1 1 0 010-2zm-5 7a1 1 0 10-2 0v1a1 1 0 102 0v-1zm4.071-1.929a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM5.636 5.636a1 1 0 00-1.414-1.414l-.707.707A1 1 0 004.929 6.343l.707-.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1zm1.636 4.364l-.707.707a1 1 0 101.414 1.414l.707-.707a1 1 0 00-1.414-1.414z" />
        <path fillRule="evenodd" d="M10 14a4 4 0 100-8 4 4 0 000 8zm0-2a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Products',
    to: '/master/products',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 2l6 3.5v9L10 18l-6-3.5v-9L10 2zm-4 4.65v6.7l4 2.33 4-2.33V6.65L10 4.32 6 6.65z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function MasterLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar title="SynqDrive" subtitle="Master Admin" items={items} accentColor="indigo" />
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
