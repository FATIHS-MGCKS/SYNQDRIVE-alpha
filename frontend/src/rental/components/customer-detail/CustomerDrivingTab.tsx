import { Icon } from '../ui/Icon';

import { EmptyState, StatusChip } from '../../../components/patterns';

import { MisuseCasesPanel } from '../MisuseCasesPanel';

import type { DrivingAggregateMeta } from './customerDetailTypes';

import { RentalStressAnalysisCard } from '../RentalStressAnalysisCard';

import { VehicleStressPanel } from '../VehicleStressPanel';

import { formatDate } from './customerDetailUtils';

import {

  formatStressScore,

  getDataConfidenceLabel,

  type DataConfidence,

} from '../../lib/scoreFormat';

import type { RentalDrivingAnalysisItem } from '../../../lib/api';



interface CustomerDrivingTabProps {

  orgId: string | undefined;

  customerId: string;

  drivingAgg: DrivingAggregateMeta;

  drivingStressScore: number | null;

  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;

  hasEnoughData: boolean;

  dataConfidence?: string | null;

  scoredTripCount?: number | null;

  totalDistanceKm?: number | null;

  latestAnalysis?: RentalDrivingAnalysisItem | null;

  analysisLoading?: boolean;

}



export function CustomerDrivingTab({

  orgId,

  customerId,

  drivingAgg,

  drivingStressScore,

  stressLevel,

  hasEnoughData,

  dataConfidence,

  scoredTripCount,

  totalDistanceKm,

  latestAnalysis,

  analysisLoading,

}: CustomerDrivingTabProps) {

  const noData = drivingAgg.analysisCount === 0 && drivingStressScore == null;



  if (noData) {

    return (

      <EmptyState

        icon={<Icon name="activity" className="w-6 h-6" />}

        title="Noch keine Fahrdaten"

        description="Nach abgeschlossenen Mieten mit Telemetrie erscheinen hier Fahrbelastung und Verdachtshinweise."

      />

    );

  }



  const aggregateDisplay = formatStressScore(drivingStressScore, {

    hasEnoughData,

    level: stressLevel ?? undefined,

  });



  return (

    <div className="space-y-4">

      <VehicleStressPanel

        title="Fahrbelastung (Kunde)"

        stressScore={drivingStressScore}

        stressLevel={stressLevel}

        hasEnoughData={hasEnoughData}

        dataConfidence={(dataConfidence as DataConfidence) ?? null}

        footnote="Aggregiert nur aus explizit verknüpften Mietfahrten (BOOKING_ASSIGNED). Private, nicht zugeordnete oder Zeitfenster-Hinweise fließen nicht ein."

      />



      {hasEnoughData && (

        <p className="text-[10px] text-muted-foreground px-1">

          Datenqualität: {getDataConfidenceLabel(dataConfidence as DataConfidence)}

          {scoredTripCount != null ? ` · ${scoredTripCount} bewertete Trips` : ''}

          {totalDistanceKm != null ? ` · ${Math.round(totalDistanceKm)} km` : ''}

          {drivingAgg.lastAnalysisAt ? ` · zuletzt ${formatDate(drivingAgg.lastAnalysisAt)}` : ''}

        </p>

      )}



      {!hasEnoughData && (

        <StatusChip tone="warning" className="text-[10px]">

          Nicht genügend bewertete Trips

        </StatusChip>

      )}



      {(latestAnalysis || analysisLoading) && (

        <RentalStressAnalysisCard

          analysis={latestAnalysis ?? null}

          loading={analysisLoading}

          title="Letzte Miet-Auswertung"

        />

      )}



      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <div className="rounded-lg border border-border surface-premium p-4">

          <p className="text-[10px] uppercase text-muted-foreground">Fahrereignisse gesamt</p>

          <p className="text-2xl font-bold">{drivingAgg.drivingEvents}</p>

        </div>

        <div className="rounded-lg border border-border surface-premium p-4">

          <p className="text-[10px] uppercase text-muted-foreground">Missbrauchsereignisse</p>

          <p className="text-2xl font-bold">{drivingAgg.abuseEvents}</p>

          <p className="text-[10px] text-muted-foreground mt-1">Separat von Fahrbelastung</p>

        </div>

      </div>



      {aggregateDisplay.isMissing && drivingAgg.analysisCount > 0 && (

        <p className="text-xs text-muted-foreground px-1">

          {drivingAgg.analysisCount} Analyse(n) vorhanden, aber ohne aggregierten Belastungswert.

        </p>

      )}



      {orgId && (

        <MisuseCasesPanel

          orgId={orgId}

          customerId={customerId}

          title="Nutzungsauffälligkeiten / Missbrauchs-/Schadensverdacht"

          limit={15}

        />

      )}

    </div>

  );

}

