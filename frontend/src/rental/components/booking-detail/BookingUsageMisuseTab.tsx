import { useEffect, useState } from 'react';
import type { BookingDetailDto, RentalDrivingAnalysisItem } from '../../../lib/api';
import { api } from '../../../lib/api';
import { MisuseCasesPanel } from '../MisuseCasesPanel';
import { RentalStressAnalysisCard } from '../RentalStressAnalysisCard';
import { VehicleStressPanel } from '../VehicleStressPanel';
import { useLanguage } from '../../i18n/LanguageContext';
import { EM_DASH } from './bookingDetailUtils';
import { formatStressScore } from '../../lib/scoreFormat';
import { bd } from './booking-detail-ui';

interface BookingUsageMisuseTabProps {
  orgId: string;
  detail: BookingDetailDto;
  rentalAnalysis?: RentalDrivingAnalysisItem | null;
  analysisLoading?: boolean;
}

export function BookingUsageMisuseTab({
  orgId,
  detail,
  rentalAnalysis: rentalAnalysisProp,
  analysisLoading: analysisLoadingProp,
}: BookingUsageMisuseTabProps) {
  const { t } = useLanguage();
  const u = detail.usage;
  const [rentalAnalysis, setRentalAnalysis] = useState<RentalDrivingAnalysisItem | null>(
    rentalAnalysisProp ?? null,
  );
  const [analysisLoading, setAnalysisLoading] = useState(analysisLoadingProp ?? false);

  useEffect(() => {
    let cancelled = false;
    if (rentalAnalysisProp !== undefined) {
      void Promise.resolve().then(() => {
        if (!cancelled) setRentalAnalysis(rentalAnalysisProp);
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setAnalysisLoading(true);
      api.rentalDrivingAnalyses
        .list(orgId, { bookingId: detail.core.bookingId, limit: 1 })
        .then((res) => {
          if (cancelled) return;
          const rows = Array.isArray(res?.data) ? res.data : [];
          setRentalAnalysis(rows[0] ?? null);
        })
        .catch(() => {
          if (!cancelled) setRentalAnalysis(null);
        })
        .finally(() => {
          if (!cancelled) setAnalysisLoading(false);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, detail.core.bookingId, rentalAnalysisProp]);

  const stressDisplay = formatStressScore(u.drivingStressScore, {
    level: u.stressLevel ?? undefined,
  });

  return (
    <div className="space-y-4">
      <VehicleStressPanel
        title={t('bookings.detail.usageLoadTitle')}
        stressScore={u.drivingStressScore}
        stressLevel={u.stressLevel}
        hasEnoughData={u.hasAnalysis || stressDisplay.isMissing === false}
        compact
      />

      <div className={`${bd.card} grid grid-cols-2 sm:grid-cols-4 gap-4`}>
        <Stat label="Fahrbelastung" value={stressDisplay.isMissing ? EM_DASH : stressDisplay.label} />
        <Stat label="Fahrereignisse" value={u.drivingEventsCount ?? EM_DASH} />
        <Stat label="Missbrauchsereignisse" value={u.abuseDetectionCount ?? EM_DASH} />
        <Stat label="Verdachtshinweise" value={u.misuseCaseCount} />
        <Stat
          label="Km gefahren"
          value={detail.core.kmDriven != null ? `${detail.core.kmDriven} km` : EM_DASH}
        />
      </div>

      {(rentalAnalysis || analysisLoading) && (
        <RentalStressAnalysisCard
          analysis={rentalAnalysis ?? null}
          loading={analysisLoading}
        />
      )}

      {!u.hasAnalysis && u.misuseCaseCount === 0 && !rentalAnalysis && !analysisLoading && (
        <p className="text-xs text-muted-foreground px-1">
          {t('bookings.detail.usageAnalysisPending')}
        </p>
      )}

      <MisuseCasesPanel
        orgId={orgId}
        bookingId={detail.core.bookingId}
        title={t('bookings.detail.misuseTitle')}
        limit={15}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground mt-0.5">{value}</div>
    </div>
  );
}
