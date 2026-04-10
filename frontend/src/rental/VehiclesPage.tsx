import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Vehicle } from '../lib/api';
import { PageHeader, Table, Td, Badge, Loader, EmptyState, statusColor, formatCurrency } from '../components/ui';
import { useRentalOrg } from './RentalContext';

export default function VehiclesPage() {
  const { orgId } = useRentalOrg();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    api.rental.vehicles(orgId).then((res) => {
      if (!cancelled) {
        setVehicles(res.data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Vehicles" subtitle={`${vehicles.length} vehicles in fleet`} />

      {vehicles.length === 0 ? (
        <EmptyState message="No vehicles found" />
      ) : (
        <Table headers={['Vehicle Name', 'License Plate', 'Station', 'Status', 'Health', 'Fuel Type', 'Mileage', 'Cleaning', 'Daily Rate']}>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <Td className="font-medium text-gray-900">{v.vehicleName}</Td>
              <Td className="font-mono text-xs">{v.licensePlate}</Td>
              <Td>{v.station}</Td>
              <Td><Badge color={statusColor(v.status)}>{v.status}</Badge></Td>
              <Td><Badge color={statusColor(v.health)}>{v.health}</Badge></Td>
              <Td>{v.fuelType}</Td>
              <Td>{v.mileage.toLocaleString('de-DE')} km</Td>
              <Td><Badge color={statusColor(v.cleaningStatus)}>{v.cleaningStatus}</Badge></Td>
              <Td>{v.dailyRateEur != null ? formatCurrency(v.dailyRateEur) : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
