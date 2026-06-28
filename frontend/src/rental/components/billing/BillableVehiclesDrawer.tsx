import { useState } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { EmptyState } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import type { BillableVehiclesResponseDto } from '../../types/billing.types';
import { exclusionReasonLabel } from './billing.utils';
import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';

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
      title="Abrechenbare Fahrzeuge"
      description="Verbundene Fahrzeuge mit Abrechnungsstatus. Ausgeschlossene Fahrzeuge werden nicht in Rechnung gestellt."
      widthClassName="sm:max-w-2xl"
      status={
        data ? (
          <span className="sq-tone-brand px-2 py-0.5 rounded-md text-[10px] font-semibold">
            {data.billableVehicleCount} abrechenbar · {data.connectedVehicleCount} verbunden
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            { key: 'billable' as const, label: 'Abrechenbar', count: billable.length },
            { key: 'excluded' as const, label: 'Ausgeschlossen', count: excluded.length },
          ] as const
        ).map((item) => (
          <Button
            key={item.key}
            type="button"
            variant={tab === item.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(item.key)}
            className={cn(tab === item.key && 'bg-[var(--brand-soft)] text-[var(--brand)]')}
          >
            {item.label} ({item.count})
          </Button>
        ))}
      </div>

      {tab === 'billable' && (
        <p className="text-[12px] text-muted-foreground mb-4 -mt-2">
          Abrechenbar = Telematik/DIMO verbunden, nicht ausgeschlossen (Demo, außer Betrieb,
          manuell ausgeschlossen).
        </p>
      )}

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
                  Provider
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Abrechnung
                </th>
                {tab === 'excluded' && (
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ausschlussgrund
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeList.map((v) => (
                <tr key={v.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-[12px] font-medium text-foreground">
                    {v.licensePlate ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                    <div>
                      {v.make} {v.model}
                    </div>
                    <div className="font-mono text-[10px] mt-0.5 opacity-70">{v.vin}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px]">
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
                  <td className="px-3 py-2.5 text-[12px]">
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
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
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
