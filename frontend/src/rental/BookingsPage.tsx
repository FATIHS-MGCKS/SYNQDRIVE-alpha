import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Booking } from '../lib/api';
import { PageHeader, Table, Td, Badge, Loader, EmptyState, statusColor, formatDate, formatCurrency } from '../components/ui';
import { useRentalOrg } from './RentalContext';

export default function BookingsPage() {
  const { orgId } = useRentalOrg();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    api.rental.bookings(orgId).then((res) => {
      if (!cancelled) {
        setBookings(res.data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Bookings" subtitle={`${bookings.length} bookings total`} />

      {bookings.length === 0 ? (
        <EmptyState message="No bookings found" />
      ) : (
        <Table headers={['Customer', 'Vehicle', 'License Plate', 'Station', 'Start', 'End', 'Status', 'Daily Rate', 'Total', 'km driven / included']}>
          {bookings.map((b) => (
            <tr key={b.id}>
              <Td className="font-medium text-gray-900">{b.customerName}</Td>
              <Td>{b.vehicleName}</Td>
              <Td className="font-mono text-xs">{b.vehicleLicense}</Td>
              <Td>{b.station}</Td>
              <Td>{formatDate(b.startDate)}</Td>
              <Td>{formatDate(b.endDate)}</Td>
              <Td><Badge color={statusColor(b.status)}>{b.status}</Badge></Td>
              <Td>{formatCurrency(b.dailyRate)}</Td>
              <Td className="font-semibold">{formatCurrency(b.totalPrice)}</Td>
              <Td>{b.kmDriven.toLocaleString('de-DE')} / {b.kmIncluded.toLocaleString('de-DE')}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
