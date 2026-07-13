import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';

const OPERATOR_INSIGHT_TYPES = new Set([
  'PICKUP_OVERDUE',
  'RETURN_OVERDUE',
  'BATTERY_CRITICAL',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
  'SERVICE_OVERDUE',
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
  'TIGHT_HANDOVER',
  'RETURN_NEEDS_INSPECTION',
]);

export interface OperatorOperationalAlert {
  id: string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  bookingId?: string | null;
}

export function useOperatorOperationalAlerts(limit = 5) {
  const { orgId } = useRentalOrg();
  const [alerts, setAlerts] = useState<OperatorOperationalAlert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setAlerts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.dashboardInsights
      .get(orgId)
      .then((response) => {
        if (cancelled) return;
        const rows = (response.insights ?? [])
          .filter(
            (insight) =>
              OPERATOR_INSIGHT_TYPES.has(insight.type) &&
              (insight.severity === 'CRITICAL' || insight.severity === 'WARNING'),
          )
          .slice(0, limit)
          .map((insight) => ({
            id: insight.id,
            title: insight.title,
            message: insight.message,
            severity: insight.severity as OperatorOperationalAlert['severity'],
            bookingId:
              typeof insight.metrics?.bookingId === 'string'
                ? insight.metrics.bookingId
                : insight.entityIds?.[0] ?? null,
          }));
        setAlerts(rows);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, limit]);

  return { alerts, loading };
}
