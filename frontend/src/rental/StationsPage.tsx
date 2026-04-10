import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Station } from '../lib/api';
import { PageHeader, Badge, Loader, EmptyState, statusColor } from '../components/ui';
import { useRentalOrg } from './RentalContext';

export default function StationsPage() {
  const { orgId } = useRentalOrg();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    api.rental.stations(orgId).then((res) => {
      if (!cancelled) {
        setStations(res.data);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) return <Loader />;

  return (
    <>
      <PageHeader title="Stations" subtitle={`${stations.length} stations`} />

      {stations.length === 0 ? (
        <EmptyState message="No stations found" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((s) => (
            <div key={s.id} className="bg-white border rounded-xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{s.name}</h3>
                <Badge color={statusColor(s.status)}>{s.status}</Badge>
              </div>
              <p className="text-sm text-gray-600">{s.address}</p>
              <p className="text-sm text-gray-500">{s.city}</p>
              {s.vehicleCount != null && (
                <p className="text-xs text-gray-400 mt-1">{s.vehicleCount} vehicles</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
