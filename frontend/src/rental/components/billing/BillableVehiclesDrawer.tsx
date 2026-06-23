import { useState } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { EmptyState } from '../../../components/patterns/states';
import type { BillableVehiclesResponseDto } from '../../types/billing.types';
import { exclusionReasonLabel } from './billing.utils';
import { Icon } from '../ui/Icon';

interface BillableVehiclesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BillableVehiclesResponseDto | null;
}

type TabKey = 'billable' | 'excluded';

export function BillableVehiclesDrawer({ open, onOpenChange, data }: BillableVehiclesDrawerProps) {
  const [tab, setTab] = useState<TabKey>('billable');

  const billable = data?.billableVehicles ?? [];
  const excluded = data?.excludedVehicles ?? [];
  const activeList = tab === 'billable' ? billable : excluded;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Abgerechnete Fahrzeuge"
      description="Übersicht aller verbundenen Fahrzeuge und Ausschlüsse für die monatliche Abrechnung."
      widthClassName="sm:max-w-2xl"
      status={
        data ? (
          <span className="sq-tone-brand px-2 py-0.5 rounded-md text-[10px] font-semibold">
            {data.billableVehicleCount} abrechenbar
          </span>
        ) : undefined
      }
    >
      <div className="flex gap-2 mb-4">
        {(
          [
            { key: 'billable' as const, label: 'Abrechenbar', count: billable.length },
            { key: 'excluded' as const, label: 'Ausgeschlossen', count: excluded.length },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === item.key
                ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      {!data ? (
        <EmptyState compact title="Keine Fahrzeugdaten geladen" />
      ) : activeList.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="car" className="w-5 h-5" />}
          title={
            tab === 'billable'
              ? billable.length === 0 && excluded.length > 0
                ? 'Keine abrechenbaren Fahrzeuge'
                : 'Keine verbundenen Fahrzeuge'
              : 'Keine ausgeschlossenen Fahrzeuge'
          }
          description={
            tab === 'billable'
              ? 'Verbinde Fahrzeuge über Telematik oder DIMO, damit sie abrechenbar werden.'
              : 'Alle verbundenen Fahrzeuge sind aktuell abrechenbar.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Kennzeichen
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Fahrzeug
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Connectivity
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Billing
                </th>
                {tab === 'excluded' && (
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Grund
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeList.map((v) => (
                <tr key={v.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-xs font-medium text-foreground">
                    {v.licensePlate ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    <div>{v.make} {v.model}</div>
                    <div className="font-mono text-[10px] mt-0.5">{v.vin}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span
                      className={
                        v.connectivityStatus === 'CONNECTED'
                          ? 'sq-tone-success px-2 py-0.5 rounded-md text-[10px] font-semibold'
                          : 'sq-tone-neutral px-2 py-0.5 rounded-md text-[10px] font-semibold'
                      }
                    >
                      {v.connectivityStatus === 'CONNECTED' ? 'Verbunden' : 'Nicht verbunden'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span
                      className={
                        v.billingStatus === 'BILLABLE'
                          ? 'sq-tone-brand px-2 py-0.5 rounded-md text-[10px] font-semibold'
                          : 'sq-tone-warning px-2 py-0.5 rounded-md text-[10px] font-semibold'
                      }
                    >
                      {v.billingStatus === 'BILLABLE' ? 'Abrechenbar' : 'Ausgeschlossen'}
                    </span>
                  </td>
                  {tab === 'excluded' && 'reason' in v && (
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {exclusionReasonLabel((v as { reason: string }).reason)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DetailDrawer>
  );
}
