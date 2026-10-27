import { useLanguage } from '../../../i18n/LanguageContext';
import type { TireHealthSummaryResponse } from '../../../lib/api';

function verificationKey(status: string | undefined): string {
  switch (status) {
    case 'INSUFFICIENT_EVIDENCE':
      return 'tire.wearV3.verification.insufficient';
    case 'OVERDUE':
      return 'tire.wearV3.verification.overdue';
    case 'DUE':
      return 'tire.wearV3.verification.due';
    case 'DUE_SOON':
      return 'tire.wearV3.verification.dueSoon';
    default:
      return 'tire.wearV3.verification.current';
  }
}

function evidenceKey(className: string): string {
  switch (className) {
    case 'MEASURED':
      return 'tire.wearV3.evidence.measured';
    case 'CALIBRATED_ESTIMATE':
      return 'tire.wearV3.evidence.calibrated';
    case 'BASELINE_ESTIMATE':
      return 'tire.wearV3.evidence.baseline';
    default:
      return 'tire.wearV3.evidence.insufficient';
  }
}

export function TireWearV3CustomerPanel({
  summary,
}: {
  summary: TireHealthSummaryResponse | null | undefined;
}) {
  const { t } = useLanguage();
  const wearV3 = summary?.wearV3;
  if (!wearV3) return null;

  return (
    <div className="rounded-xl p-3 mb-3 border border-border bg-card/40">
      <p className="text-[11px] font-semibold text-foreground mb-2">
        {t('tire.wearV3.sectionTitle' as never)}
      </p>
      <p className="text-[11px] text-muted-foreground mb-2">
        {t(verificationKey(wearV3.verificationStatus) as never)}
      </p>
      <ul className="space-y-1.5">
        {wearV3.wheels.map((wheel) => (
          <li key={wheel.position} className="text-[10px] text-muted-foreground">
            {wheel.treadDepthMm
              ? t('tire.wearV3.treadInterval' as never, {
                  position: wheel.position,
                  lo: wheel.treadDepthMm.lo,
                  hi: wheel.treadDepthMm.hi,
                })
              : `${wheel.position}: —`}
            {' · '}
            {t(evidenceKey(wheel.treadEvidenceClass) as never)}
          </li>
        ))}
      </ul>
      {wearV3.wheels[0]?.lastAcceptedMeasurementAt && (
        <p className="text-[10px] mt-2 text-muted-foreground">
          {t('tire.wearV3.lastMeasurement' as never, {
            date: wearV3.wheels[0].lastAcceptedMeasurementAt,
          })}
        </p>
      )}
    </div>
  );
}
