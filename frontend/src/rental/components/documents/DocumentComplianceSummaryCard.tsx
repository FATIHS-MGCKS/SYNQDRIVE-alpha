import { StatusChip, StatusDot } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import {
  uiStatusLabel,
  uiStatusTone,
  type ComplianceDisplayItem,
  type VehicleFileSummary,
} from '../../lib/vehicle-file-summary.types';

function complianceChipTone(item: ComplianceDisplayItem): StatusTone {
  return uiStatusTone(item.uiStatus);
}

function complianceShortLabel(item: ComplianceDisplayItem | null): string {
  if (!item) return '—';
  return uiStatusLabel(item.uiStatus, true);
}

function CompliancePill({
  prefix,
  item,
}: {
  prefix: string;
  item: ComplianceDisplayItem | null;
}) {
  if (!item) {
    return (
      <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        {prefix} · —
      </span>
    );
  }
  const tone = complianceChipTone(item);
  const toneClass =
    tone === 'success'
      ? 'sq-chip-success'
      : tone === 'watch' || tone === 'warning'
        ? 'sq-chip-watch'
        : tone === 'critical'
          ? 'sq-chip-critical'
          : 'sq-chip-neutral';
  return (
    <span
      className={`inline-flex items-center rounded-md border border-border/50 px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}
    >
      {prefix} · {complianceShortLabel(item)}
    </span>
  );
}

function ComplianceStatusLine({
  prefix,
  item,
}: {
  prefix: string;
  item: ComplianceDisplayItem | null;
}) {
  if (!item) {
    return (
      <p className="text-[13px] font-semibold leading-[1.3] text-muted-foreground">
        {prefix}: —
      </p>
    );
  }
  return (
    <StatusChip tone={complianceChipTone(item)} className="!text-[11px] !py-0.5">
      {prefix}: {uiStatusLabel(item.uiStatus, true)}
    </StatusChip>
  );
}

export function DocumentComplianceSummaryCard({
  summary,
  compact = false,
}: {
  summary: VehicleFileSummary;
  compact?: boolean;
}) {
  const tuv = summary.canonicalStatus.serviceCompliance.tuv;
  const bok = summary.canonicalStatus.serviceCompliance.bokraft;
  const hasAny = Boolean(tuv || bok);

  if (compact) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/15 px-2.5 py-2 sm:col-span-2">
        <p className="text-[11px] font-semibold text-muted-foreground">Compliance</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {hasAny ? (
            <>
              <CompliancePill prefix="TÜV" item={tuv} />
              <CompliancePill prefix="BOKraft" item={bok} />
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Keine Daten</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="surface-premium flex h-full flex-col p-3.5 sm:p-4">
      <div className="flex items-center gap-1.5">
        <StatusDot tone="neutral" />
        <span className="text-[12px] font-medium text-muted-foreground">Compliance</span>
      </div>
      <div className="mt-2 flex flex-1 flex-col justify-center gap-1.5">
        {hasAny ? (
          <>
            <ComplianceStatusLine prefix="TÜV" item={tuv} />
            <ComplianceStatusLine prefix="BOKraft" item={bok} />
          </>
        ) : (
          <p className="text-[13px] font-semibold leading-[1.3] text-muted-foreground">
            Keine Daten
          </p>
        )}
      </div>
    </div>
  );
}
