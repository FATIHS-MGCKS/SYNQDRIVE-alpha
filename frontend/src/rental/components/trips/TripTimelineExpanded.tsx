import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { MisuseCasesPanel } from '../MisuseCasesPanel';
import { VehicleStressPanel } from '../VehicleStressPanel';
import { getStressLevel, resolveDrivingStressScore } from '../../lib/scoreFormat';
import {
  getDrivingImpactComparabilityHint,
  getDrivingImpactModelProfileLabel,
} from '../../lib/driving-impact-model-profile.ui';
import { TripBehaviorPanel } from './TripBehaviorPanel';
import {
  deriveTripAssessability,
  hasNativeBehaviorEvents,
} from './event-context-ui';
import { resolveGesamtbewertungDisplay } from './behavior-ui.utils';
import { resolveBehaviorEventCount } from './trip-assessment-copy';
import { TripEvidencePanel } from './TripEvidencePanel';
import { TripDeviceConnectionEvidence } from './TripDeviceConnectionEvidence';
import { TripRpmCandidatesList } from './TripRpmCandidatesList';
import { TIMELINE_COPY, RENTAL_COPY, TRIPS_COPY, tv } from './trips-view-ui';
import type { TripRentalContextView } from './utils/tripRentalContext';
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
  behaviorEventsByTripId?: Record<string, TripBehaviorEvent[]>;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
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
  enriching,
  detailLoading,
  detailError,
  behaviorEvents,
  behaviorEventsByTripId,
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
}: TripTimelineExpandedProps) {
  const stressScore = resolveDrivingStressScore(trip);
  const stressLevel = trip.stressLevel ?? getStressLevel(stressScore);
  const modelProfile = trip.drivingImpactModelProfile;
  const comparabilityHint = getDrivingImpactComparabilityHint(modelProfile);
  const modelProfileLabel = getDrivingImpactModelProfileLabel(modelProfile);

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

  const actionBtnClass = isDark
    ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-white/[0.04] text-foreground hover:bg-white/[0.08]'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-muted text-foreground/90 hover:bg-muted/80';

  const primaryActionClass = isDark
    ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-brand-soft text-brand hover:bg-brand-soft/80'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all bg-status-info-soft text-status-info hover:bg-status-info-soft/80';

  const assessability = deriveTripAssessability({
    enrichmentStatus: trip.behaviorEnrichmentStatus,
    detailsLimited: trip.detailsLimited,
    behaviorReady: trip.behaviorReady,
    hasNativeEvents: hasNativeBehaviorEvents(behaviorEvents),
    analysisAssessability: trip.analysisAssessability ?? null,
    shortTermMisuseAssessable: trip.shortTermMisuseAssessable,
  });
  const gesamtbewertung = resolveGesamtbewertungDisplay(trip, behaviorEvents, {
    assessable: assessability.assessable,
  });

  return (
    <div className="px-4 pb-4 pt-0" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-5 border-t border-border/40 pt-4">
        {enriching && (
          <div
            className={`flex items-center gap-1.5 text-[11px] font-medium ${isDark ? 'text-status-ai' : 'text-status-info'}`}
          >
            <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" /> {TRIPS_COPY.enrichingInline}
          </div>
        )}

        {detailLoading && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />
            Fahrtdetails werden geladen…
          </div>
        )}

        {detailError && !detailLoading && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Zusatzdetails konnten nicht geladen werden. Basisdaten aus der Timeline werden angezeigt.
          </p>
        )}

        <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Gesamtbewertung
          </p>
          <p className="mt-1 text-[13px] font-semibold tracking-[-0.02em] text-foreground">
            {gesamtbewertung.label}
          </p>
          {gesamtbewertung.primaryReason ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{gesamtbewertung.primaryReason}</p>
          ) : !gesamtbewertung.fromBackend ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground/80">
              Vorläufige Anzeige — Gesamtbewertung wird nach Detail-Laden aktualisiert.
            </p>
          ) : null}
        </div>

        {(canReloadRoute || canCenterRoute || canAnalyzeBehavior) && (
          <div className="flex flex-wrap gap-2">
            {canReloadRoute && (
              <button type="button" onClick={onReloadRoute} className={actionBtnClass}>
                <Icon name="refresh-cw" className="h-3.5 w-3.5" />
                {TIMELINE_COPY.reloadRoute}
              </button>
            )}
            {canCenterRoute && (
              <button type="button" onClick={onCenterRoute} className={actionBtnClass}>
                <Icon name="crosshair" className="h-3.5 w-3.5" />
                {TIMELINE_COPY.centerRoute}
              </button>
            )}
            {canAnalyzeBehavior && (
              <button type="button" onClick={onEnrichBehavior} className={primaryActionClass}>
                <Icon name="activity" className="h-3.5 w-3.5" />
                {TIMELINE_COPY.analyzeBehavior}
              </button>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          <TripEvidencePanel
            trip={trip}
            rentalContext={rentalContext}
            behaviorEvents={behaviorEvents}
            routePointsCount={routePointsCount}
            routeLoading={routeLoading}
            routeError={routeError}
          />

          <VehicleStressPanel
            stressScore={stressScore}
            stressLevel={stressLevel}
            hasEnoughData={stressScore != null}
            compact={false}
            comparabilityHint={comparabilityHint}
            modelProfileLabel={modelProfileLabel}
            stressMissingContext={{
              behaviorEventCount: resolveBehaviorEventCount(
                behaviorEvents,
                trip,
                behaviorEventsByTripId,
              ),
              hasNativeBehaviorEvents: hasNativeBehaviorEvents(behaviorEvents),
            }}
          />
        </div>

        <TripDeviceConnectionEvidence vehicleId={vehicleId} tripId={trip.id} />

        <TripRpmCandidatesList vehicleId={vehicleId} tripId={trip.id} />

        <TimelineSection title={TIMELINE_COPY.sectionBehavior}>
          <TripBehaviorPanel
            trip={trip}
            isDark={isDark}
            events={behaviorEvents}
            loading={behaviorLoading}
            selectedEventId={selectedBehaviorEventId}
            onSelectEvent={onSelectBehaviorEvent}
            onShowEventOnMap={onShowBehaviorEventOnMap}
            onEnrich={onEnrichBehavior}
          />
        </TimelineSection>

        {trip.tripStatus === 'COMPLETED' && (
          <MisuseCasesPanel
            orgId={orgId}
            tripId={trip.id}
            vehicleId={vehicleId}
            bookingId={rentalContext?.booking?.id}
            title={RENTAL_COPY.misuseSectionTitle}
            emptyTitle={RENTAL_COPY.misuseEmptyTitle}
            emptyDescription={RENTAL_COPY.misuseEmptySubline}
            compact
            embedded
            limit={5}
          />
        )}
      </div>
    </div>
  );
}
