import { useEffect, useState } from 'react';
import { DetailDrawer, StatusChip } from '../../../../components/patterns';
import { api } from '../../../../lib/api';
import type { EffectiveRentalRulesDto } from './rental-rules.types';
import { effectiveRulesRows, parseApiError } from './rental-rules.utils';
import {
  EffectiveRulesListSkeleton,
  RentalRuleSourceBadge,
} from '../../shared/rental-requirements-ui';

interface EffectiveRulesPreviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  vehicleId: string | null;
  vehicleLabel?: string;
}

export function EffectiveRulesPreviewDrawer({
  open,
  onOpenChange,
  orgId,
  vehicleId,
  vehicleLabel,
}: EffectiveRulesPreviewDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effective, setEffective] = useState<EffectiveRentalRulesDto | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setEffective(null);
      setError(null);
      setLoading(false);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open || !orgId || !vehicleId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.rentalRules
      .getVehicleEffective(orgId, vehicleId)
      .then((data) => {
        if (!cancelled) setEffective(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(parseApiError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId, vehicleId]);

  const rows = effective ? effectiveRulesRows(effective) : [];

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      eyebrow="Effective requirements"
      title={vehicleLabel ?? 'Vehicle requirements'}
      description="Merged organization defaults, category rules, and vehicle overrides."
      status={
        effective ? (
          <StatusChip tone={effective.rulesActive ? 'success' : 'neutral'} dot>
            {effective.rulesActive ? 'Enforcement active' : 'Enforcement inactive'}
          </StatusChip>
        ) : undefined
      }
      widthClassName="sm:max-w-lg"
    >
      {loading && <EffectiveRulesListSkeleton />}

      {error && (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && !error && effective && (
        <div className="space-y-4">
          {effective.activation?.informationalWarnings?.length ? (
            <div className="space-y-1 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
              {effective.activation.informationalWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5">
            <span className="text-[12px] text-muted-foreground">Category</span>
            <span className="text-[12px] font-medium text-foreground">
              {effective.rentalCategoryName ?? 'None assigned'}
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className={`rounded-xl border border-border/60 surface-premium px-3 py-2.5 transition-colors hover:bg-muted/10 ${
                  row.sourceKey === 'VEHICLE_OVERRIDE' ? 'border-l-[3px] border-l-[color:var(--brand)]/40' : ''
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-foreground">{row.label}</p>
                    <RentalRuleSourceBadge
                      source={row.sourceKey}
                      sourceName={row.sourceName}
                      className="mt-1.5 !text-[10px]"
                    />
                  </div>
                  <p className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground sm:text-right">
                    {row.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && !effective && open && orgId && vehicleId && (
        <p className="py-6 text-center text-[12px] text-muted-foreground">No effective rules available.</p>
      )}
    </DetailDrawer>
  );
}
