import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Booking } from '../lib/api';
import { PageHeader, StatCard, Table, Td, Loader, formatDateTime } from '../components/ui';
import { useRentalOrg } from './RentalContext';

export default function DashboardPage() {
  const { orgId } = useRentalOrg();
  const [stats, setStats] = useState<any>(null);
  const [pickups, setPickups] = useState<Booking[]>([]);
  const [returns, setReturns] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    Promise.all([
      api.rental.bookingStats(orgId),
      api.rental.todayPickups(orgId),
      api.rental.todayReturns(orgId),
    ]).then(([s, p, r]) => {
      if (cancelled) return;
      setStats(s);
      setPickups(p.data);
      setReturns(r.data);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Rental overview at a glance" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Bookings" value={stats?.totalBookings ?? 0} color="blue" />
        <StatCard label="Active Bookings" value={stats?.activeBookings ?? 0} color="green" />
        <StatCard label="Today Pickups" value={pickups.length} color="indigo" />
        <StatCard label="Today Returns" value={returns.length} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Heutige Pickups</h2>
          <Table headers={['Customer', 'Vehicle', 'Time']}>
            {pickups.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No pickups today</td></tr>
            ) : (
              pickups.map((b) => (
                <tr key={b.id}>
                  <Td>{b.customerName}</Td>
                  <Td>{b.vehicleName}</Td>
                  <Td>{formatDateTime(b.startDate)}</Td>
                </tr>
              ))
            )}
          </Table>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Heutige Returns</h2>
          <Table headers={['Customer', 'Vehicle', 'Time']}>
            {returns.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No returns today</td></tr>
            ) : (
              returns.map((b) => (
                <tr key={b.id}>
                  <Td>{b.customerName}</Td>
                  <Td>{b.vehicleName}</Td>
                  <Td>{formatDateTime(b.endDate)}</Td>
                </tr>
              ))
            )}
          </Table>
        </div>
      </div>
    </>
  );
}
