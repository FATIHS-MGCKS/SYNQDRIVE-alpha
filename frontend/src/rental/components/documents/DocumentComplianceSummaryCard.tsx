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

export function DocumentComplianceSummaryCard({ summary }: { summary: VehicleFileSummary }) {
  const tuv = summary.canonicalStatus.serviceCompliance.tuv;
  const bok = summary.canonicalStatus.serviceCompliance.bokraft;
  const hasAny = Boolean(tuv || bok);

  return (
    <div className="sq-card flex h-full flex-col p-3.5 sm:p-4">
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
