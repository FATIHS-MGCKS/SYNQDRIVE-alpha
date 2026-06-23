import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { MisuseCasesPanel } from '../MisuseCasesPanel';
import { VehicleStressPanel } from '../VehicleStressPanel';
import { getStressLevel, resolveDrivingStressScore } from '../../lib/scoreFormat';
import { TripBehaviorPanel } from './TripBehaviorPanel';
import { TripEvidencePanel } from './TripEvidencePanel';
import { TripRentalContextPanel } from './TripRentalContextPanel';
import { TripAddresses, TripTechnicalData } from './trip-timeline-shared';
import { TripAssignmentBadge } from './TripAssignmentBadge';
import { TIMELINE_COPY, RENTAL_COPY, TRIPS_COPY, tv } from './trips-view-ui';
import { assignmentLabel, assignmentSubjectTypeLabel, routeStatusLabel } from './utils/tripLabels';
import { isEvidenceWorthyTrip, type TripRentalContextView } from './utils/tripRentalContext';
import type { TripBehaviorEvent, TripEnrichment, TripTimelineTrip } from './timeline.types';

export interface TripTimelineExpandedProps {
  trip: TripTimelineTrip;
  isDark: boolean;
  orgId?: string;
  vehicleId?: string;
  enrichment?: TripEnrichment;
  enriching?: boolean;
  detailLoading?: boolean;
  detailError?: boolean;
  behaviorEvents: TripBehaviorEvent[];
  behaviorLoading: boolean;
  selectedBehaviorEventId: string | null;
  onSelectBehaviorEvent: (event: TripBehaviorEvent) => void;
  onShowBehaviorEventOnMap: (event: TripBehaviorEvent) => void;
  onEnrichBehavior: () => void;
  routePointsCount: number;
  routeLoading: boolean;
  routeError: string | null;
  onReloadRoute?: () => void;
  onCenterRoute?: () => void;
  rentalContext?: TripRentalContextView;
  rentalBookingsLoading?: boolean;
  rentalDetailLoading?: boolean;
  rentalBookingsError?: string | null;
  onOpenBooking?: (bookingId: string) => void;
}

function TimelineSection({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className={tv.sectionTitle}>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function TripTimelineExpanded({
  trip,
  isDark,
  orgId,
  vehicleId,
  enrichment,
  enriching,
  detailLoading,
  detailError,
  behaviorEvents,
  behaviorLoading,
  selectedBehaviorEventId,
  onSelectBehaviorEvent,
  onShowBehaviorEventOnMap,
  onEnrichBehavior,
  routePointsCount,
  routeLoading,
  routeError,
  onReloadRoute,
  onCenterRoute,
  rentalContext,
  rentalBookingsLoading,
  rentalDetailLoading,
  rentalBookingsError,
  onOpenBooking,
}: TripTimelineExpandedProps) {
  const stressScore = resolveDrivingStressScore(trip);
  const stressLevel = trip.stressLevel ?? getStressLevel(stressScore);
  const mapMatchConfidence = enrichment?.mapMatchConfidence ?? 0;

  const behaviorIsReady = trip.behaviorReady ?? !!trip.behaviorEnrichedAt;
  const enrichStatus = trip.behaviorEnrichmentStatus;
  const canAnalyzeBehavior =
    !behaviorLoading &&
    !behaviorIsReady &&
    enrichStatus !== 'PENDING' &&
    enrichStatus !== 'IN_PROGRESS' &&
    enrichStatus !== 'SKIPPED_NO_HF_DATA' &&
    enrichStatus !== 'FAILED_PERMANENT';

  const canReloadRoute = !!onReloadRoute && !routeLoading;
  const canCenterRoute = !!onCenterRoute && routePointsCount > 0 && !routeError;
  const showEvidence = rentalContext && isEvidenceWorthyTrip(trip);

  const actionBtnClass = isDark
    ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-white/[0.04] text-foreground hover:bg-white/[0.08]'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-slate-100 text-slate-700 hover:bg-slate-200';

  const primaryActionClass = isDark
    ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-indigo-50 text-indigo-600 hover:bg-indigo-100';

  return (
    <div className="px-4 pb-4 pt-0" onClick={(e) => e.stopPropagation()}>
      <div className="pt-4 border-t border-border/40 space-y-5">
        {enriching && (
          <div
            className={`flex items-center gap-1.5 text-[11px] font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}
          >
            <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> {TRIPS_COPY.enrichingInline}
          </div>
        )}

        {detailLoading && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
            Fahrtdetails werden geladen…
          </div>
        )}

        {detailError && !detailLoading && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Zusatzdetails konnten nicht geladen werden. Basisdaten aus der Timeline werden angezeigt.
          </p>
        )}

        {(canReloadRoute || canCenterRoute || canAnalyzeBehavior) && (
          <div className="flex flex-wrap gap-2">
            {canReloadRoute && (
              <button type="button" onClick={onReloadRoute} className={actionBtnClass}>
                <Icon name="refresh-cw" className="w-3.5 h-3.5" />
                {TIMELINE_COPY.reloadRoute}
              </button>
            )}
            {canCenterRoute && (
              <button type="button" onClick={onCenterRoute} className={actionBtnClass}>
                <Icon name="crosshair" className="w-3.5 h-3.5" />
                {TIMELINE_COPY.centerRoute}
              </button>
            )}
            {canAnalyzeBehavior && (
              <button type="button" onClick={onEnrichBehavior} className={primaryActionClass}>
                <Icon name="activity" className="w-3.5 h-3.5" />
                {TIMELINE_COPY.analyzeBehavior}
              </button>
            )}
          </div>
        )}

        {showEvidence && (
          <TripEvidencePanel
            trip={trip}
            rentalContext={rentalContext}
            behaviorEvents={behaviorEvents}
            enrichment={enrichment}
            routePointsCount={routePointsCount}
            routeLoading={routeLoading}
            routeError={routeError}
          />
        )}

        {rentalContext && (
          <TimelineSection title={TIMELINE_COPY.sectionRental}>
            <TripRentalContextPanel
              trip={trip}
              context={rentalContext}
              loading={rentalBookingsLoading}
              detailLoading={rentalDetailLoading}
              bookingsError={rentalBookingsError}
              onOpenBooking={onOpenBooking}
              onReview={
                onOpenBooking && rentalContext.needsReview
                  ? () => {
                      if (rentalContext.booking) onOpenBooking(rentalContext.booking.id);
                    }
                  : undefined
              }
            />
          </TimelineSection>
        )}

        <TimelineSection title={TIMELINE_COPY.sectionOverview}>
          <TripAddresses trip={trip} isDark={isDark} />
          <VehicleStressPanel
            stressScore={stressScore}
            stressLevel={stressLevel}
            hasEnoughData={stressScore != null}
            compact={false}
          />
        </TimelineSection>

        <TimelineSection title={TIMELINE_COPY.sectionBehavior}>
          <TripBehaviorPanel
            trip={trip}
            isDark={isDark}
            events={behaviorEvents}
            loading={behaviorLoading}
            enrichment={enrichment}
            selectedEventId={selectedBehaviorEventId}
            onSelectEvent={onSelectBehaviorEvent}
            onShowEventOnMap={onShowBehaviorEventOnMap}
            onEnrich={onEnrichBehavior}
          />
        </TimelineSection>

        {orgId && trip.tripStatus === 'COMPLETED' && (
          <TimelineSection title={TIMELINE_COPY.sectionEvents}>
            <MisuseCasesPanel
              orgId={orgId}
              tripId={trip.id}
              vehicleId={vehicleId}
              bookingId={rentalContext?.booking?.id}
              title={RENTAL_COPY.misuseSectionTitle}
              compact
              limit={5}
            />
          </TimelineSection>
        )}

        <TimelineSection title={TIMELINE_COPY.sectionRouteQuality}>
          <div className="rounded-xl border p-3 bg-card border-border space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">Routenstatus</span>
              <span className="font-semibold text-foreground tabular-nums">
                {routeStatusLabel(routeLoading, routeError, routePointsCount)}
              </span>
            </div>
            {routePointsCount > 0 && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">Routenpunkte</span>
                <span className="font-semibold text-foreground tabular-nums">{routePointsCount}</span>
              </div>
            )}
            {mapMatchConfidence > 0 && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">{TRIPS_COPY.mapMatchConfidence}</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {Math.round(mapMatchConfidence * 100)}%
                </span>
              </div>
            )}
            {trip.detailsLimited && (
              <p className="text-[10px] text-muted-foreground">
                Einige Trip-Details sind aufgrund der Datenqualität eingeschränkt.
              </p>
            )}
            {trip.gapEnded && (
              <p className="text-[10px] text-muted-foreground">Die Fahrt endete mit einer Datenlücke.</p>
            )}
          </div>
        </TimelineSection>

        <TimelineSection title={TIMELINE_COPY.sectionAssignment}>
          <div className="rounded-xl border p-3 bg-card border-border space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <TripAssignmentBadge trip={trip} />
              <span className="text-[11px] font-medium text-foreground">{assignmentLabel(trip)}</span>
            </div>
            {trip.assignmentSubjectType && (
              <p className="text-[10px] text-muted-foreground">
                Subjekttyp: {assignmentSubjectTypeLabel(trip.assignmentSubjectType)}
              </p>
            )}
          </div>
        </TimelineSection>

        <TimelineSection title={TIMELINE_COPY.sectionTechnical}>
          <div
            className={`rounded-xl border p-3 ${isDark ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-slate-50/50 border-slate-100'}`}
          >
            <div className="flex items-center gap-1.5 mb-2.5">
              <Icon name="activity" className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-cyan-500'}`} />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {TRIPS_COPY.engine}
              </span>
            </div>

            {trip.avgEngineLoad != null || trip.avgThrottlePosition != null ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                {trip.avgEngineLoad != null && (
                  <span className="text-muted-foreground">
                    Motorlast{' '}
                    <span className="text-foreground font-bold tabular-nums">
                      {trip.avgEngineLoad.toFixed(0)}%
                    </span>
                  </span>
                )}
                {trip.avgThrottlePosition != null && (
                  <span className="text-muted-foreground">
                    Gasstellung{' '}
                    <span className="text-foreground font-bold tabular-nums">
                      {trip.avgThrottlePosition.toFixed(0)}%
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{TRIPS_COPY.noEngineTelemetry}</p>
            )}
          </div>

          <TripTechnicalData trip={trip} />
        </TimelineSection>
      </div>
    </div>
  );
}
