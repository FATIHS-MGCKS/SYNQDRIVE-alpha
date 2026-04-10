import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Customer } from '../lib/api';
import { PageHeader, Table, Td, Badge, Loader, EmptyState, statusColor } from '../components/ui';
import { useRentalOrg } from './RentalContext';

export default function CustomersPage() {
  const { orgId } = useRentalOrg();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    api.rental.customers(orgId).then((res) => {
      if (!cancelled) {
        setCustomers(res.data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Customers" subtitle={`${customers.length} customers total`} />

      {customers.length === 0 ? (
        <EmptyState message="No customers found" />
      ) : (
        <Table headers={['Name', 'Email', 'Phone', 'License Number', 'City', 'Status', 'Bookings']}>
          {customers.map((c) => (
            <tr key={c.id}>
              <Td className="font-medium text-gray-900">{c.firstName} {c.lastName}</Td>
              <Td>{c.email}</Td>
              <Td>{c.phone}</Td>
              <Td className="font-mono text-xs">{c.licenseNumber ?? '—'}</Td>
              <Td>{c.city}</Td>
              <Td><Badge color={statusColor(c.status)}>{c.status}</Badge></Td>
              <Td>{c.bookingCount}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
