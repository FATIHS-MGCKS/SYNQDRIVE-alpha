import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Clock,
  Cpu,
  Gauge,
  GitBranch,
  Info,
  MapPin,
  Radio,
  Repeat,
  Shield,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

interface Props {
  isDarkMode: boolean;
}

const CARD = (d: boolean) =>
  `rounded-2xl shadow-sm border overflow-hidden ${
    d ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'
  }`;
const BADGE = (color: string) =>
  `inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`;

type SectionId = 'signals' | 'states' | 'start' | 'tick' | 'end' | 'finalize' | 'profiles';

const SECTIONS = [
  { id: 'signals' as SectionId, label: 'Signal Groups', icon: Radio },
  { id: 'states' as SectionId, label: 'State Machine', icon: GitBranch },
  { id: 'start' as SectionId, label: 'Trip Start Logic', icon: Zap },
  { id: 'tick' as SectionId, label: 'Active Tick', icon: Repeat },
  { id: 'end' as SectionId, label: 'Trip End Logic', icon: TrendingDown },
  { id: 'finalize' as SectionId, label: 'Finalize / Cancel / Merge', icon: CheckCircle },
  { id: 'profiles' as SectionId, label: 'Profile Weighting', icon: Gauge },
];

export function TripDetectionLogicView({ isDarkMode: d }: Props) {
  const [section, setSection] = useState<SectionId>('signals');

  const h2 = `text-base font-bold mb-1 ${d ? 'text-neutral-100' : 'text-gray-900'}`;
  const h3 = `text-sm font-semibold mb-2 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const body = `text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-600'}`;
  const code = `px-1 py-0.5 rounded text-[11px] font-mono ${d ? 'bg-card text-violet-400' : 'bg-gray-100 text-violet-600'}`;
  const li = `text-xs ${d ? 'text-neutral-400' : 'text-gray-600'}`;
  const sub = `text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`;

  return (
    <div className={`min-h-screen ${d ? 'bg-neutral-950' : 'bg-gray-50/80'}`}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className={`${CARD(d)} p-6`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
              <MapPin size={20} className="text-violet-500" />
            </div>
            <div>
              <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Trip Detection Logic</h1>
            <p className={sub}>SynqDrive V3.0 — Full Architecture Reference</p>
          </div>
          <span className={`ml-auto ${BADGE('bg-violet-500/15 text-violet-400')}`}>V3.0 Architecture</span>
        </div>
        <p className={`${body} mb-3`}>
          This page is the definitive technical reference for the SynqDrive V3 Trip Detection system.
          It covers all signal groups, the state machine, start / end detection logic, CUSUM validation,
          finalization rules, profile-specific weighting, and the V3 hardware-aware driving event source split.
        </p>

        {/* V3 hardware note */}
        <div className={`p-3 rounded-xl text-[11px] leading-relaxed ${d ? 'bg-status-info-soft text-status-info border border-border' : 'bg-status-info-soft text-status-info border border-border'}`}>
          <strong>V3 HARDWARE-AWARE SOURCE SPLIT:</strong> Trip detection itself remains local and state-machine driven for both hardware types. However, after trip finalization, the Driving Event source differs:
          <strong> LTE_R1</strong> → Driving Events from DIMO Telemetry API Events (native harsh-event signals, LteR1BehaviorEnrichmentService);
          <strong> SMART5/UNKNOWN</strong> → Driving Events reconstructed from HF time-series (TripBehaviorEnrichmentService, existing path).
          Abuse detection (FULL_BRAKING, cold-engine, RPM-based, etc.) runs from HF data for BOTH hardware types.
          No Vehicle Triggers API is used.
        </div>

        <div className={`p-3 rounded-xl text-[11px] leading-relaxed ${d ? 'bg-amber-900/20 text-amber-300 border border-amber-800/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          <strong>⚠ LEGACY V1 NOTICE:</strong> The methods <code>DimoSegmentsService.detectTrips()</code>,
          <code>fetchAndDetectTrips()</code>, and <code>TripsService.syncTripsFromSegments()</code> are the
          old V1 ignition-based trip detection path. They are NOT the live trip engine. They are called only
          by the manual admin endpoint <code>POST /vehicles/:id/trips/sync</code> for historical back-fill.
          The live V3 engine runs entirely through <code>DimoSnapshotProcessor → TripDetectionOrchestrationService</code>.
          </div>
        </div>

        {/* Section Tabs */}
        <div className={`${CARD(d)} p-2`}>
          <div className="flex flex-wrap gap-1">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? d ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-100 text-violet-700'
                      : d ? 'text-neutral-400 hover:text-neutral-200 hover:bg-card' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={13} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── SIGNALS ─────────────────────────────────────────── */}
        {section === 'signals' && (
          <div className="space-y-4">
            {[
              {
                name: 'Group A — TripDetectionCore',
                interval: '20-second aggregation buckets',
                purpose: 'Primary source for trip start detection and trip end evaluation. Evaluated on every ACTIVE_TICK and POSSIBLE_END_CHECK.',
                color: 'text-violet-400',
                borderColor: d ? 'border-violet-800/40' : 'border-violet-200',
                signals: [
                  { name: 'isIgnitionOn', agg: 'MAX', use: 'Trip Start: primary for ICE/HYBRID. Trip End: bonus signal only — NOT required. Stale ON state deliberately ignored for end.' },
                  { name: 'speed (km/h)', agg: 'AVG', use: 'Primary movement evidence for both start and end detection. Used in CUSUM stopped-indicator.' },
                  { name: 'powertrainTransmissionTravelledDistance (km)', agg: 'MAX', use: 'Odometer progress: strong trip start signal. Also used to confirm no movement at end.' },
                  { name: 'powertrainFuelSystemAbsoluteLevel (L)', agg: 'AVG', use: 'Fuel change: weak evidence for start. Energy activity check at end.' },
                  { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy (kWh)', agg: 'AVG', use: 'EV/HYBRID energy change: strong evidence for start. Also used to detect EV charging/discharging at end.' },
                ],
              },
              {
                name: 'Group B — RouteEnrichment',
                interval: '7-second aggregation buckets',
                purpose: 'GPS route data. Stored as VehicleTripWaypoint records during ACTIVE_TRIP. Not used for start/end state decisions.',
                color: 'text-status-info',
                borderColor: d ? 'border-border' : 'border-border',
                signals: [
                  { name: 'currentLocationCoordinates', agg: 'RAND (any sample)', use: 'Raw GPS coordinate → stored as waypoint latitude/longitude.' },
                  { name: 'speed (km/h)', agg: 'AVG', use: 'Speed recorded with each waypoint for later speed profile analysis.' },
                ],
              },
              {
                name: 'Group C — Performance',
                interval: '15-second aggregation buckets',
                purpose: 'Engine/drivetrain activity confirmation. Evaluated in ACTIVE_TICK to distinguish genuine traffic stops (IDLE) from parked vehicle (POSSIBLE_END).',
                color: 'text-orange-400',
                borderColor: d ? 'border-orange-800/40' : 'border-orange-200',
                signals: [
                  { name: 'powertrainCombustionEngineECT (°C)', agg: 'AVG', use: 'Coolant temp stored per trip. Used by HF enrichment analysis.' },
                  { name: 'powertrainCombustionEngineSpeed (RPM)', agg: 'AVG', use: 'KEY: RPM > 600 → engine running → IDLE verdict (vehicle stopped at traffic light). RPM = 0 → end evidence.' },
                  { name: 'obdThrottlePosition (%)', agg: 'AVG', use: 'Throttle > 5% → engine activity → IDLE. Also used in HF acceleration/abuse analysis.' },
                  { name: 'obdEngineLoad (%)', agg: 'AVG', use: 'Load > 10% → engine active → IDLE. Also feeds avgEngineLoad on trip record.' },
                ],
              },
              {
                name: 'Group D — HighFrequency (post-trip only)',
                interval: '1-second samples (post-trip enrichment)',
                purpose: 'NOT used for live trip detection. Fetched AFTER trip finalization for HF behavior analysis.',
                color: 'text-emerald-400',
                borderColor: d ? 'border-emerald-800/40' : 'border-emerald-200',
                signals: [
                  { name: 'speed', agg: 'raw 1s', use: 'Acceleration / braking event detection (preprocessHighFrequency → detectAccelerationEvents / detectBrakingEvents).' },
                  { name: 'powertrainCombustionEngineECT', agg: 'raw 1s', use: 'Cold engine abuse detection (cold start + high load).' },
                  { name: 'powertrainCombustionEngineSpeed', agg: 'raw 1s', use: 'RPM for abuse scoring (kickdown, cold abuse).' },
                  { name: 'obdThrottlePosition', agg: 'raw 1s', use: 'Throttle data for hard acceleration events.' },
                  { name: 'obdEngineLoad', agg: 'raw 1s', use: 'Engine load for abuse detection.' },
                ],
              },
            ].map(g => (
              <div key={g.name} className={`${CARD(d)} p-5 border-l-4 ${g.borderColor}`}>
                <div className="flex items-center gap-2 mb-1">
                  <p className={`font-bold text-sm ${g.color}`}>{g.name}</p>
                  <span className={BADGE('bg-gray-500/15 text-gray-400')}>{g.interval}</span>
                </div>
                <p className={`${body} mb-3`}>{g.purpose}</p>
                <div className="space-y-2">
                  {g.signals.map(s => (
                    <div key={s.name} className={`rounded-lg p-2.5 ${d ? 'bg-card' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <code className={code}>{s.name}</code>
                        <span className={BADGE('bg-violet-500/10 text-violet-400')}>{s.agg}</span>
                      </div>
                      <p className={sub}>{s.use}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── STATE MACHINE ────────────────────────────────────── */}
        {section === 'states' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>State Diagram</h2>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {[
                  { label: 'RESTING', color: 'bg-neutral-500/20 text-neutral-400' },
                  { label: '→ snapshot evidence', color: '' },
                  { label: 'POSSIBLE_START', color: 'bg-yellow-500/20 text-yellow-400' },
                  { label: '→ validation confirmed', color: '' },
                  { label: 'ACTIVE_TRIP', color: 'bg-emerald-500/20 text-emerald-400' },
                ].map((s, i) => s.color ? <span key={i} className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span> : <span key={i} className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{s.label}</span>)}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {[
                  { label: 'ACTIVE_TRIP', color: 'bg-emerald-500/20 text-emerald-400' },
                  { label: '⇄ short stop', color: '' },
                  { label: 'IDLE_WITHIN_TRIP', color: 'bg-brand-soft text-status-info' },
                  { label: '→ extended inactivity', color: '' },
                  { label: 'POSSIBLE_END', color: 'bg-orange-500/20 text-orange-400' },
                  { label: '→ validated', color: '' },
                  { label: 'RESTING', color: 'bg-neutral-500/20 text-neutral-400' },
                ].map((s, i) => s.color ? <span key={i} className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span> : <span key={i} className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{s.label}</span>)}
              </div>
            </div>
            {[
              {
                state: 'RESTING',
                color: 'bg-neutral-500/20 text-neutral-400',
                desc: 'Vehicle is not being tracked. No active trip. SnapshotWorker runs every 30s, comparing the latest vehicle telemetry to previous state.',
                triggers: ['Snapshot evidence check: evaluateSnapshotEvidence() triggers if strong ≥ 2, or (strong ≥ 1 AND movement), or weak ≥ 3'],
                exits: ['→ POSSIBLE_START if evidence threshold met (5-minute cooldown between trips applies)'],
                persisted: ['State reset in VehicleTripDetectionState after trip finalization'],
              },
              {
                state: 'POSSIBLE_START',
                color: 'bg-yellow-500/20 text-yellow-400',
                desc: 'Trip start evidence was detected in a snapshot. A background validation job is enqueued to confirm against Group A core data.',
                triggers: ['BullMQ: POSSIBLE_START job dispatched after snapshot evidence'],
                exits: ['→ ACTIVE_TRIP: validateTripStart() confirms (3+ consecutive active points, or 60s stable duration, or composite score ≥ 50%)', '→ RESTING: CONFIRM_MAX_WAIT_MS (3 min) exceeded without confirmation'],
                persisted: ['possibleStartAt, startOdometerKm, startFuelLevel, startEvSoc, startDetectionMode, startConfidence'],
              },
              {
                state: 'ACTIVE_TRIP',
                color: 'bg-emerald-500/20 text-emerald-400',
                desc: 'Trip is confirmed active. ACTIVE_TICK job runs every 60 seconds, fetching core + route + performance data and updating the trip record.',
                triggers: ['BullMQ: ACTIVE_TICK job loops every TRACKING_INTERVAL_MS (60s default)'],
                exits: ['→ IDLE_WITHIN_TRIP: all stopped but perf shows engine running', '→ POSSIBLE_END: no movement + no perf + no energy change', '→ (stays ACTIVE_TRIP if motion/odometer detected)'],
                persisted: ['activeTripId, lastCoreProcessedAt, lastRouteProcessedAt, lastDrivingProcessedAt, lastActivityAt, lastMeaningfulMovementAt'],
              },
              {
                state: 'IDLE_WITHIN_TRIP',
                color: 'bg-brand-soft text-status-info',
                desc: 'Vehicle stopped at a traffic light or short pause. Engine/perf signals confirm vehicle is still "alive". ACTIVE_TICK continues at the same cadence.',
                triggers: ['assessActiveContinuity() verdict = IDLE (requires perf activity OR energy change — ignition-alone is NOT sufficient)'],
                exits: ['→ ACTIVE_TRIP: speed/odometer resumes', '→ POSSIBLE_END: perf goes silent + no movement'],
                persisted: ['Same fields as ACTIVE_TRIP'],
              },
              {
                state: 'POSSIBLE_END',
                color: 'bg-orange-500/20 text-orange-400',
                desc: 'Inactivity evidence detected. Trip end candidate. Stability window → CUSUM validation → finalize. Activity resumption returns to ACTIVE_TRIP.',
                triggers: ['assessActiveContinuity() verdict = POSSIBLE_END (no motion + no odometer + no perf + no energy change)'],
                exits: ['→ ACTIVE_TRIP: activity resumed', '→ RESTING (via FINALIZE): CUSUM confirms end, or max attempts, or hard timeout'],
                persisted: ['possibleEndAt, endDetectionMode, endConfidence, endValidationAttempts, cusumValidatedAt, cusumSegmentStart, cusumSegmentEnd'],
              },
            ].map(s => (
              <div key={s.state} className={`${CARD(d)} p-5`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full ${s.color}`}>{s.state}</span>
                </div>
                <p className={`${body} mb-3`}>{s.desc}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Entry triggers', items: s.triggers },
                    { label: 'Exit transitions', items: s.exits },
                    { label: 'Persisted fields', items: s.persisted },
                  ].map(g => (
                    <div key={g.label}>
                      <p className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{g.label}</p>
                      <ul className="space-y-1">
                        {g.items.map(i => <li key={i} className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>• {i}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TRIP START ───────────────────────────────────────── */}
        {section === 'start' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-emerald-400" />
                <h2 className={h2}>Snapshot Evidence Evaluation (RESTING → POSSIBLE_START)</h2>
              </div>
              <p className={`${body} mb-4`}>
                Runs on every SnapshotWorker tick (every 30s). Compares current telemetry against previous state.
                A 5-minute cooldown applies after each trip finalization. The profile (ICE/EV/HYBRID) controls
                signal weights and thresholds.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-emerald-400`}>Strong Signals (weighted by profile)</p>
                  <ul className="space-y-1">
                    {[
                      'ignitionOn: +2 (ICE/HYBRID), +1 (EV)',
                      'speed > speedActiveKmh threshold: +1 + hasMovement=true',
                      'engineLoad > 15%: +1 (ICE), +0 (EV)',
                      'GPS moved > 50m from previous: +1 + hasMovement=true',
                      'Odometer delta > odometerMinDeltaKm: +1 + hasMovement=true',
                      'EV/HYBRID evSoc change > 0.5%: +1 strong (EV) or weak (ICE)',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                </div>
                <div>
                  <p className={`${h3} text-amber-400`}>Weak Signals</p>
                  <ul className="space-y-1">
                    {[
                      'speed > 0 AND ≤ speedActiveKmh: +1 weak + hasMovement',
                      'engineLoad > 0 AND ≤ 15% (non-EV): +1 weak',
                      'fuel level change > 0.2L: +1 weak',
                      'GPS drift 15–50m: +1 weak + hasMovement',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                  <p className={`${h3} mt-3 text-violet-400`}>Trigger condition</p>
                  <ul className="space-y-1">
                    {[
                      'strong ≥ 2 (any combination)',
                      'OR strong ≥ 1 AND hasMovement = true',
                      'OR weak ≥ 3',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                </div>
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className="text-status-info" />
                <h2 className={h2}>Start Validation (POSSIBLE_START → ACTIVE_TRIP)</h2>
              </div>
              <p className={`${body} mb-3`}>
                POSSIBLE_START job fetches Group A data from [possibleStartAt − 60s … now].
                validateTripStart() applies a weighted score to these core points.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-status-info`}>Confirmation criteria (any one)</p>
                  <ul className="space-y-1">
                    {[
                      'maxConsecutiveActive ≥ 3 (strong consecutive)',
                      'activeDurationMs ≥ 60s (stable duration)',
                      'maxConsecutiveActive ≥ 2 AND score ≥ 50% of maxScore',
                      'maxConsecutiveActive ≥ 2 AND current telemetry shows ignition+speed',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                </div>
                <div>
                  <p className={`${h3} text-emerald-400`}>Start Detection Modes</p>
                  <ul className="space-y-1">
                    {[
                      'IGNITION_PRIMARY — ignition + motion, ICE/HYBRID',
                      'MOTION_PRIMARY — speed/GPS without ignition',
                      'RPM_VALIDATED — ignition + high engine load',
                      'GPS_ODOMETER_FALLBACK — odometer progress only',
                      'FREQUENCY_FALLBACK — high signal frequency',
                      'COMPOSITE_MULTI_SIGNAL — weighted combination',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVE TICK ──────────────────────────────────────── */}
        {section === 'tick' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <Repeat size={16} className="text-cyan-400" />
                <h2 className={h2}>ACTIVE_TICK Loop</h2>
                <span className={BADGE('bg-cyan-500/15 text-cyan-400')}>Every 60 seconds</span>
              </div>
              <p className={`${body} mb-4`}>
                Runs while state is ACTIVE_TRIP or IDLE_WITHIN_TRIP. Fetches all three signal groups,
                stores waypoints, updates trip metrics, and evaluates continuity. Self-reschedules via BullMQ.
              </p>
              <div className="space-y-3">
                {[
                  { step: '1', title: 'Fetch data', desc: 'Group A (core, OVERLAP=30s), Group B (route, OVERLAP=15s), Group C (performance, OVERLAP=30s). All fetched in parallel.' },
                  { step: '2', title: 'Store waypoints', desc: 'New Group B points (after lastRouteProcessedAt cutoff) → VehicleTripWaypoint.createMany()' },
                  { step: '3', title: 'Update trip metrics', desc: 'distanceKm (from odometer delta), durationMinutes, maxSpeedKmh, avgSpeedKmh, fuelUsedLiters, energyUsedKwh, avgRpm, avgThrottlePosition, avgEngineLoad' },
                  { step: '4', title: 'Evaluate continuity', desc: 'Time-based window filter: corePoints.filter(p => now − p.timestamp ≤ TRIP_CONTINUITY_CORE_WINDOW_MS=120s). Falls back to last 3 points only when filtered window is empty. assessActiveContinuity(recentCore, perfActive, profile) → verdict: ACTIVE / IDLE / POSSIBLE_END.' },
                  { step: '5', title: 'State transition', desc: 'ACTIVE → reschedule ACTIVE_TICK. IDLE → same. POSSIBLE_END → set possibleEndAt + schedule POSSIBLE_END_CHECK.' },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${d ? 'bg-neutral-700 text-cyan-400' : 'bg-cyan-50 text-cyan-600'}`}>{s.step}</span>
                    <div>
                      <p className={`text-xs font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{s.title}</p>
                      <p className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Continuity Verdicts</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { v: 'ACTIVE', color: 'text-emerald-400', bg: d ? 'bg-emerald-900/20' : 'bg-emerald-50', conditions: ['has speed > speedActiveKmh in recent points', 'OR odometer progressed > odometerMinDeltaKm'] },
                  { v: 'IDLE', color: 'text-status-info', bg: d ? 'bg-status-info-soft' : 'bg-brand-soft', conditions: ['ICE: all stopped AND perf signals active (RPM/throttle/load)', 'ANY: all stopped AND energy/fuel actively changing (checked first — most specific)', 'EV/HYBRID: all stopped AND signal frequency still active ≥2 pt/min (v2.3 fix)'] },
                  { v: 'POSSIBLE_END', color: 'text-orange-400', bg: d ? 'bg-orange-900/20' : 'bg-orange-50', conditions: ['all stopped AND no perf AND no energy change AND frequency resting', 'OR all stopped AND frequency dropped to resting (<0.5 pt/min)', 'OR stale ignition ON but perf silent + no energy (stale-ignition guard)', 'OR zero data points returned (signal silence)'] },
                ].map(v => (
                  <div key={v.v} className={`rounded-xl p-3 ${v.bg}`}>
                    <p className={`text-xs font-bold mb-2 ${v.color}`}>{v.v}</p>
                    <ul className="space-y-1">
                      {v.conditions.map(c => <li key={c} className={`text-[11px] ${d ? 'text-neutral-400' : 'text-gray-600'}`}>• {c}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRIP END ─────────────────────────────────────────── */}
        {section === 'end' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5 border-l-4 ${d ? 'border-orange-800/60' : 'border-orange-300'}`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-orange-400" />
                <h2 className={h2}>The Problem — Why ignition-off is unreliable</h2>
              </div>
              <p className={`${body} mb-2`}>
                OBD devices (via DIMO) stop transmitting signals shortly after engine shutdown. In many real-world cases
                the final <code className={code}>isIgnitionOn=false</code> record never arrives — the device goes offline
                before sending it. This leaves the last known ignition state stuck at <code className={code}>true</code>.
                For EVs and HYBRIDs, there are no RPM/throttle/load signals at all, so the old ICE-based perf-active
                IDLE path never matched, causing all EV stops to immediately trigger POSSIBLE_END.
              </p>
              <p className={body}>
                Under the old V2 logic: ICE with stale ignition-ON would stay in IDLE_WITHIN_TRIP indefinitely (30-min timeout).
                EV/HYBRID stops at traffic lights would immediately reach POSSIBLE_END because
                <code className={code}>perfHasActivity</code> is always false for EVs.
                v2.3 fixes both with a profile-aware IDLE decision and the stale-ignition guard.
              </p>
            </div>

            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-emerald-400" />
                <h2 className={h2}>The Fix — New End Evidence Priority</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-emerald-400`}>PRIMARY — ignition-free evidence</p>
                  <ul className="space-y-1">
                    {[
                      '1. No speed (below speedMotionKmh threshold)',
                      '2. No odometer progress (delta < odometerMinDeltaKm)',
                      '3. No GPS movement (haversine < 15m)',
                      '4. Signal frequency drop (< restingFrequencyPerMin from profile = 0.5 pt/min)',
                      '5. Signal silence (0 points in time window)',
                      '6. Stale ignition-ON with no perf activity and no energy change',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                </div>
                <div>
                  <p className={`${h3} text-neutral-400`}>SECONDARY — bonus if available</p>
                  <ul className="space-y-1">
                    {[
                      '7. ignitionOff confirmed → HIGH confidence end mode',
                      '8. Energy / fuel activity ceased',
                      '9. Performance signals all inactive',
                    ].map(i => <li key={i} className={li}>• {i}</li>)}
                  </ul>
                  <div className={`mt-3 p-2 rounded-lg text-[11px] ${d ? 'bg-amber-900/20 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                    <strong>hasActivityResumed():</strong> speed must exceed speedMotionKmh to reopen a trip.
                    Stale ignition-ON alone is NOT sufficient to resume. EVs: no ignition required.
                  </div>
                </div>
              </div>
            </div>

            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <Activity size={16} className="text-cyan-400" />
                <h2 className={h2}>POSSIBLE_END Flow with CUSUM</h2>
              </div>
              <div className="space-y-3">
                {[
                  { step: '1', color: 'text-orange-400', title: 'Enter POSSIBLE_END', desc: 'possibleEndAt = now. endValidationAttempts = 0. endDetectionMode set from assessActiveContinuity verdict. POSSIBLE_END_CHECK job scheduled.' },
                  { step: '2', color: 'text-status-info', title: 'Check activity resumption', desc: 'POSSIBLE_END_CHECK fetches last 90s of core data. hasActivityResumed() → if true: cancel POSSIBLE_END, return to ACTIVE_TRIP.' },
                  { step: '3', color: 'text-amber-400', title: 'Stability window wait', desc: 'If elapsed < TRIP_END_STABILITY_WINDOW_MS (3 min default): reschedule POSSIBLE_END_CHECK. Vehicle must remain inactive.' },
                  { step: '4', color: 'text-cyan-400', title: 'Trigger CUSUM (END_VALIDATION job)', desc: 'endValidationAttempts++. END_VALIDATION job dispatched. Fetches core data: [possibleEndAt − 15min … +5min]. detectTripEndChangePoint() applied.' },
                  { step: '5a', color: 'text-emerald-400', title: 'CUSUM: change-point found', desc: 'cusumSegmentEnd = changePointAt. endDetectionMode = CUSUM_VALIDATED. FINALIZE job dispatched.' },
                  { step: '5b', color: 'text-emerald-400', title: 'CUSUM: still ongoing', desc: 'appearsOngoing=true → cancel POSSIBLE_END, return to ACTIVE_TRIP with lastMeaningfulMovementAt updated.' },
                  { step: '5c', color: 'text-neutral-400', title: 'CUSUM: inconclusive', desc: 'Reschedule POSSIBLE_END_CHECK with TRIP_END_VALIDATION_RETRY_MS delay. Retry up to TRIP_END_VALIDATION_MAX_ATTEMPTS (3).' },
                  { step: '6', color: 'text-red-400', title: 'Hard timeout fallback', desc: 'elapsed ≥ TRIP_END_TIMEOUT_MS (30 min). Force FINALIZE regardless. End time uses lastMeaningfulMovementAt or possibleEndAt.' },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${d ? 'bg-neutral-700' : 'bg-gray-100'} ${s.color}`}>{s.step}</span>
                    <div>
                      <p className={`text-xs font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{s.title}</p>
                      <p className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>CUSUM Algorithm Details</h2>
              <p className={`${body} mb-3`}>
                Implemented in <code className={code}>trip-cusum.ts</code>. Uses an upper-CUSUM on a binary
                "stopped" indicator (speed ≤ 2 km/h = 1, else = 0). Detects where the signal permanently
                transitioned from active (moving) to stopped.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-violet-400`}>Parameters (configurable)</p>
                  <ul className="space-y-1">
                    {[
                      'stoppedThresholdKmh = 2 km/h',
                      'targetActiveMean = 0.30 (30% stopped = still active)',
                      'slackK = 0.20',
                      'decisionThresholdH = 3.0',
                      'minConfirmationPoints = 3',
                      'minConfirmationFraction = 0.75',
                    ].map(p => <li key={p} className={li}>• {p}</li>)}
                  </ul>
                </div>
                <div>
                  <p className={`${h3} text-cyan-400`}>Result fields</p>
                  <ul className="space-y-1">
                    {[
                      'changePointDetected — boolean',
                      'changePointAt — Date (estimated trip end)',
                      'lastMovementAt — Date (last speed > threshold)',
                      'appearsOngoing — boolean (still active?)',
                      'confidence — LOW / MEDIUM / HIGH',
                    ].map(p => <li key={p} className={li}>• {p}</li>)}
                  </ul>
                </div>
              </div>
            </div>

            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Configuration Values</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'WORKER_TRIP_END_TIMEOUT_MS', default: '1 800 000 (30 min)', desc: 'Hard timeout fallback — last resort only' },
                  { key: 'TRIP_END_STABILITY_WINDOW_MS', default: '180 000 (3 min)', desc: 'Wait before triggering CUSUM' },
                  { key: 'TRIP_END_VALIDATION_RETRY_MS', default: '120 000 (2 min)', desc: 'Retry interval between CUSUM attempts' },
                  { key: 'TRIP_END_VALIDATION_MAX_ATTEMPTS', default: '3', desc: 'Max CUSUM attempts before fallback' },
                  { key: 'TRIP_END_SEGMENT_LOOKBACK_MS', default: '900 000 (15 min)', desc: 'How far back from possibleEndAt to query' },
                  { key: 'TRIP_END_SEGMENT_LOOKAHEAD_MS', default: '300 000 (5 min)', desc: 'How far forward from possibleEndAt to query' },
                  { key: 'TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS', default: '180 000 (3 min)', desc: 'Min stable inactivity before CUSUM runs' },
                ].map(c => (
                  <div key={c.key} className={`rounded-lg p-2.5 ${d ? 'bg-card' : 'bg-gray-50'}`}>
                    <code className={`${code} text-[10px]`}>{c.key}</code>
                    <p className={`text-[11px] mt-0.5 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>Default: {c.default}</p>
                    <p className={sub}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── FINALIZE ─────────────────────────────────────────── */}
        {section === 'finalize' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>End Time Selection Priority</h2>
              <div className="space-y-1.5">
                {[
                  { rank: '1', label: 'cusumSegmentEnd', desc: 'CUSUM-validated change-point. Most accurate — derived from actual speed data.', color: 'text-emerald-400', bg: d ? 'bg-emerald-900/20' : 'bg-emerald-50' },
                  { rank: '2', label: 'lastMeaningfulMovementAt', desc: 'Timestamp of the last ACTIVE_TICK where motion was detected.', color: 'text-status-info', bg: '' },
                  { rank: '3', label: 'lastWaypoint.recordedAt', desc: 'Last GPS fix stored in VehicleTripWaypoint.', color: 'text-amber-400', bg: '' },
                  { rank: '4', label: 'possibleEndAt', desc: 'Timestamp when POSSIBLE_END state was first entered.', color: 'text-orange-400', bg: '' },
                  { rank: '5', label: 'new Date()', desc: 'Absolute fallback if all above are null.', color: 'text-neutral-400', bg: '' },
                ].map(r => (
                  <div key={r.rank} className={`flex gap-3 rounded-lg p-3 ${r.bg}`}>
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${r.color} ${d ? 'bg-neutral-700' : 'bg-gray-100'}`}>{r.rank}</span>
                    <div>
                      <code className={code}>{r.label}</code>
                      <p className={`text-[11px] mt-0.5 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Cancellation Rules</h2>
              <ul className="space-y-2">
                {[
                  { rule: 'Duration < 60s AND distance < 0.1 km', reason: 'too_short_no_distance — spurious detection' },
                  { rule: 'Distance < 0.1 km AND maxConsecutiveActive < 2', reason: 'no_meaningful_movement — engine on but no driving' },
                ].map(r => (
                  <li key={r.rule} className="flex gap-3">
                    <ArrowRight size={13} className="flex-shrink-0 mt-0.5 text-red-400" />
                    <div>
                      <p className={`text-xs font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{r.rule}</p>
                      <p className={sub}>Reason: {r.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Merge Rules</h2>
              <p className={body}>
                At POSSIBLE_START validation time, the system checks the most recent COMPLETED trip.
                If the gap between that trip's end and the new start is &lt; 5 minutes, the previous trip is
                reopened (status back to ONGOING) and tracking continues on it — no new trip record is created.
              </p>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>HF Enrichment Trigger</h2>
              <p className={`${body} mb-3`}>After successful COMPLETED finalization:</p>
              <div className="flex flex-wrap gap-2">
                {['Trip status = COMPLETED', '→ BullMQ: hf-enrich job (5s delay)', '→ TripBehaviorEnrichmentService.enrichTrip()', '→ 1-second HF data fetched via DIMO', '→ Acceleration / Braking / Abuse events stored', '→ TripBehaviorEvent records created', '→ Driving Impact Engine V1 triggered'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${d ? 'bg-card text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>{s}</span>
                    {i < 6 && <ChevronRight size={12} className={d ? 'text-neutral-600' : 'text-muted-foreground'} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PROFILE WEIGHTING ────────────────────────────────── */}
        {section === 'profiles' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <Info size={16} className="text-violet-400" />
                <h2 className={h2}>Detection Profile Resolution</h2>
              </div>
              <p className={body}>
                Vehicle <code className={code}>fuelType</code> is mapped to a detection profile at first state creation.
                EV → EV profile (ignition low weight, speed/energy high weight).
                ICE → ICE profile (ignition primary for start, speed for continuity).
                HYBRID/PHEV → HYBRID (balanced). Unknown → UNKNOWN (conservative defaults).
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  profile: 'ICE',
                  color: 'text-orange-400',
                  desc: 'Petrol / Diesel / CNG / LPG vehicles',
                  thresholds: { speedActiveKmh: 5, speedMotionKmh: 0.5, odometerMinDeltaKm: 0.05, activeFreqPerMin: 2, restingFreqPerMin: 0.5 },
                  weights: { ignition: 3, speed: 2, odometer: 2, energy: 1, frequency: 1 },
                },
                {
                  profile: 'EV',
                  color: 'text-emerald-400',
                  desc: 'Battery Electric Vehicles',
                  thresholds: { speedActiveKmh: 3, speedMotionKmh: 0.5, odometerMinDeltaKm: 0.05, activeFreqPerMin: 2, restingFreqPerMin: 0.5 },
                  weights: { ignition: 1, speed: 3, odometer: 2, energy: 2, frequency: 2 },
                },
                {
                  profile: 'HYBRID',
                  color: 'text-status-info',
                  desc: 'HEV / PHEV vehicles',
                  thresholds: { speedActiveKmh: 4, speedMotionKmh: 0.5, odometerMinDeltaKm: 0.05, activeFreqPerMin: 2, restingFreqPerMin: 0.5 },
                  weights: { ignition: 2, speed: 3, odometer: 2, energy: 2, frequency: 1 },
                },
                {
                  profile: 'UNKNOWN',
                  color: 'text-neutral-400',
                  desc: 'Unclassified / no fuelType set',
                  thresholds: { speedActiveKmh: 5, speedMotionKmh: 0.5, odometerMinDeltaKm: 0.05, activeFreqPerMin: 2, restingFreqPerMin: 0.5 },
                  weights: { ignition: 2, speed: 3, odometer: 2, energy: 1, frequency: 2 },
                },
              ].map(p => (
                <div key={p.profile} className={`${CARD(d)} p-4`}>
                  <p className={`font-bold text-sm mb-0.5 ${p.color}`}>{p.profile}</p>
                  <p className={`${sub} mb-3`}>{p.desc}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>Speed thresholds</p>
                      <ul className={`space-y-0.5 text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>
                        <li>Active: {p.thresholds.speedActiveKmh} km/h</li>
                        <li>Motion: {p.thresholds.speedMotionKmh} km/h</li>
                        <li>Odo min: {p.thresholds.odometerMinDeltaKm} km</li>
                        <li>Freq active: ≥{p.thresholds.activeFreqPerMin} pt/min</li>
                        <li>Freq resting: &lt;{p.thresholds.restingFreqPerMin} pt/min</li>
                      </ul>
                    </div>
                    <div>
                      <p className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>Signal weights</p>
                      <ul className={`space-y-0.5 text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>
                        <li>Ignition: {p.weights.ignition}</li>
                        <li>Speed: {p.weights.speed}</li>
                        <li>Odometer: {p.weights.odometer}</li>
                        <li>Energy: {p.weights.energy}</li>
                        <li>Frequency: {p.weights.frequency}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
