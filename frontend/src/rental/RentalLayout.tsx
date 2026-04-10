import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Loader } from '../components/ui';
import { RentalProvider, useRentalOrg } from './RentalContext';

const navItems = [
  {
    label: 'Dashboard',
    to: '/rental',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-5h2v5h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
      </svg>
    ),
  },
  {
    label: 'Bookings',
    to: '/rental/bookings',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    to: '/rental/customers',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm8 0a3 3 0 11-6 0 3 3 0 016 0zm-4.07 11c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
    ),
  },
  {
    label: 'Vehicles',
    to: '/rental/vehicles',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 4a1 1 0 00-.894 1.447L4 10l-1.894 4.553A1 1 0 003 16h14a1 1 0 00.894-1.447L16 10l1.894-4.553A1 1 0 0017 4H3zm2 3a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" />
      </svg>
    ),
  },
  {
    label: 'Stations',
    to: '/rental/stations',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
      </svg>
    ),
  },
];

function InnerLayout() {
  const { orgName, loading } = useRentalOrg();

  if (loading) return <Loader />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        title={orgName || 'Rental'}
        subtitle="Rental Management"
        items={navItems}
        accentColor="emerald"
      />
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function RentalLayout() {
  return (
    <RentalProvider>
      <InnerLayout />
    </RentalProvider>
  );
}
