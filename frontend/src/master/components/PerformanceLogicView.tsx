import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  ChevronRight,
  Cpu,
  Database,
  Gauge,
  GitBranch,
  TrendingDown,
  TrendingUp,
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

type SectionId = 'overview' | 'hf' | 'acceleration' | 'braking' | 'abuse' | 'storage' | 'downstream';

const SECTIONS = [
  { id: 'overview' as SectionId, label: 'Overview', icon: BarChart2 },
  { id: 'hf' as SectionId, label: 'HF Enrichment Pipeline', icon: Cpu },
  { id: 'acceleration' as SectionId, label: 'Acceleration', icon: TrendingUp },
  { id: 'braking' as SectionId, label: 'Braking', icon: TrendingDown },
  { id: 'abuse' as SectionId, label: 'Abuse Events', icon: AlertTriangle },
  { id: 'storage' as SectionId, label: 'Storage & Metrics', icon: Database },
  { id: 'downstream' as SectionId, label: 'Downstream Consumers', icon: GitBranch },
];

export function PerformanceLogicView({ isDarkMode: d }: Props) {
  const [section, setSection] = useState<SectionId>('overview');

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
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
              <Activity size={20} className="text-orange-500" />
            </div>
            <div>
              <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Performance Logic</h1>
              <p className={sub}>SynqDrive V3 — HF Enrichment, Hardware-Aware Driving Behavior & Abuse Analysis</p>
            </div>
            <span className={`ml-auto ${BADGE('bg-orange-500/15 text-orange-400')}`}>V3 Post-Trip Pipeline</span>
          </div>
          <p className={`${body} mb-3`}>
            The Performance module is a post-trip analysis pipeline that runs after each trip is finalized.
            In V3 it is <strong>hardware-aware</strong>: the source of Driving Events depends on the vehicle's
            hardware type (LTE_R1 vs SMART5). Abuse detection remains HF-based for both hardware types.
          </p>

          {/* V3 hardware source split banner */}
          <div className={`p-3 rounded-xl text-[11px] leading-relaxed mb-3 ${d ? 'bg-status-info-soft text-status-info border border-border' : 'bg-status-info-soft text-status-info border border-border'}`}>
            <strong>V3 HARDWARE-AWARE SOURCE SPLIT:</strong>
            <br />
            <strong>LTE_R1:</strong> Driving Events (harsh braking, extreme braking, harsh acceleration, harsh cornering) are ingested from
            DIMO Telemetry API native event signals by <code className="font-mono">LteR1BehaviorEnrichmentService</code>.
            HF pipeline runs only for Abuse detection. Events carry <code className="font-mono">source = TELEMETRY_EVENTS</code> and
            HF context enrichment: <code className="font-mono">coldEngineContext</code> badge, coolant °C, RPM, and throttle % — reducing over-reliance on isolated cold-engine heuristics.
            <br />
            <strong>SMART5 / UNKNOWN:</strong> Full HF time-series reconstruction for Driving Events and Abuse, via the existing
            <code className="font-mono"> TripBehaviorEnrichmentService</code> path (unchanged).
            Events carry <code className="font-mono">source = HF_DERIVED</code>.
            <br />
            <strong>Driving Impact</strong> uses the same canonical VehicleTrip counter fields
            (<code className="font-mono">hardBrakingCount</code>, <code className="font-mono">hardAccelerationCount</code>, <code className="font-mono">brakingEventCount</code>)
            for per-100km rates. For LTE_R1 it additionally reads <code className="font-mono">DrivingEvent</code> (TELEMETRY_EVENTS) for extreme-brake counts and braking-event shape (p95 decel, high-speed brake share, stop density), because <code className="font-mono">TripBehaviorEvent</code> on those trips is abuse-only.
          </div>

          <div className={`p-3 rounded-xl text-[11px] leading-relaxed ${d ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-800/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            <strong>Canonical Behavior Truth:</strong> The HF enrichment pipeline (
            <code className="font-mono">TripBehaviorEnrichmentService → DrivingImpactService</code>) is the
            <strong> canonical source</strong> for post-trip behavior metrics: hard acceleration, hard braking,
            abuse events, stress scores. Downstream modules (Tire Health, Brake Health, health scoring) must
            read <code className="font-mono">hardBrakingCount</code> / <code className="font-mono">hardAccelerationCount</code> from
            HF-enriched trips. The legacy <code className="font-mono">harshBrakeCount</code> field is a
            DEPRECATED alias mirrored for backward compatibility only — do NOT write new queries against it.
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
                      ? d ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'
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

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {section === 'overview' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Pipeline Position</h2>
              <p className={`${body} mb-2 font-medium`}>SMART5 / UNKNOWN path (HF-derived):</p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {[
                  'Trip finalized (COMPLETED)',
                  '→ hf-enrich BullMQ job',
                  '→ TripBehaviorEnrichmentService.enrichTrip()',
                  '→ getVehicleCapabilities() → SMART5 path',
                  '→ 1s HF data fetched',
                  '→ Accel + Braking + Abuse detected',
                  '→ TripBehaviorEvent rows created',
                  '→ VehicleTrip counters updated',
                  '→ Driving Impact Engine V1',
                  '→ Tire Health V2 / Brake Health V2',
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${d ? 'bg-card text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>{s}</span>
                    {i < 9 && <ChevronRight size={11} className={d ? 'text-neutral-600' : 'text-muted-foreground'} />}
                  </div>
                ))}
              </div>
              <p className={`${body} mb-2 font-medium`}>LTE_R1 path (Telemetry API Events + HF Abuse):</p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {[
                  'Trip finalized (COMPLETED)',
                  '→ hf-enrich BullMQ job',
                  '→ TripBehaviorEnrichmentService.enrichTrip()',
                  '→ getVehicleCapabilities() → LTE_R1 path',
                  '→ LteR1BehaviorEnrichmentService: DIMO Telemetry API Events fetched',
                  '→ DrivingEvent rows (source=TELEMETRY_EVENTS) + cold-engine badge',
                  '→ HF also fetched for Abuse detection only',
                  '→ TripBehaviorEvent rows (abuse only)',
                  '→ VehicleTrip counters updated',
                  '→ Driving Impact Engine V1',
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${d ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info'}`}>{s}</span>
                    {i < 9 && <ChevronRight size={11} className={d ? 'text-neutral-600' : 'text-muted-foreground'} />}
                  </div>
                ))}
              </div>
              <p className={body}>
                The pipeline is entirely post-trip — it does NOT run during live trip tracking.
                It is triggered exactly once per finalized trip via a BullMQ job.
                Minimum trip duration: 60 seconds (shorter trips are skipped).
              </p>
            </div>

            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Signal Sources Used</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-cyan-400`}>HF Enrichment (1-second data)</p>
                  <ul className="space-y-1">
                    {[
                      { sig: 'speed (km/h)', use: 'Acceleration & braking event detection' },
                      { sig: 'powertrainCombustionEngineSpeed (RPM)', use: 'Kickdown detection, cold-engine abuse' },
                      { sig: 'obdThrottlePosition (%)', use: 'Hard acceleration classification' },
                      { sig: 'obdEngineLoad (%)', use: 'Engine load scoring, abuse detection' },
                      { sig: 'powertrainCombustionEngineECT (°C)', use: 'Cold-engine abuse (low temp + high load)' },
                    ].map(s => (
                      <li key={s.sig} className="flex gap-2">
                        <code className={`${code} flex-shrink-0`}>{s.sig}</code>
                        <span className={sub}>{s.use}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={`${h3} text-orange-400`}>Live Tracking (15-second performance buckets)</p>
                  <ul className="space-y-1">
                    {[
                      { sig: 'avgRpm', use: 'Stored on VehicleTrip during ACTIVE_TICK' },
                      { sig: 'avgThrottlePosition', use: 'Stored on VehicleTrip during ACTIVE_TICK' },
                      { sig: 'avgEngineLoad', use: 'Stored on VehicleTrip during ACTIVE_TICK' },
                      { sig: 'outsideTemperatureStartC', use: 'Fetched once at trip start (±5 min window)' },
                    ].map(s => (
                      <li key={s.sig} className="flex gap-2">
                        <code className={`${code} flex-shrink-0`}>{s.sig}</code>
                        <span className={sub}>{s.use}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HF PIPELINE ──────────────────────────────────────── */}
        {section === 'hf' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Preprocessing (preprocessHighFrequency)</h2>
              <p className={`${body} mb-3`}>
                Raw 1-second DIMO data is cleaned before event detection runs.
                Three passes are applied:
              </p>
              <div className="space-y-2">
                {[
                  { step: '1', title: 'Speed plausibility filter', desc: 'Remove points where speed > 350 km/h or speed < 0.' },
                  { step: '2', title: 'Acceleration spike filter', desc: 'If consecutive speed delta produces |Δv/Δt| > 25 m/s² within < 3s, the point is dropped (implausible sensor spike).' },
                  { step: '3', title: 'Moving-average smoothing', desc: 'Window size = 3 points applied to the speed array. Reduces sensor jitter while preserving genuine events.' },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${d ? 'bg-neutral-700 text-cyan-400' : 'bg-cyan-50 text-cyan-600'}`}>{s.step}</span>
                    <div>
                      <p className={`text-xs font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{s.title}</p>
                      <p className={sub}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>Gap Splitting (splitByGaps)</h2>
              <p className={body}>
                After preprocessing, the time-series is split into contiguous segments.
                Any gap &gt; 5 seconds between consecutive points starts a new segment.
                Segments with fewer than 2 points are discarded.
                Each segment is passed independently to the event detectors.
              </p>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>TripBehaviorEnrichmentService.enrichTrip()</h2>
              <div className="space-y-2">
                {[
                  { step: '1', title: 'Fetch HF data', desc: 'DIMO 1-second data fetched for [trip.startTime … trip.endTime] via buildHighFrequencyQuery.' },
                  { step: '2', title: 'Preprocess', desc: 'preprocessHighFrequency() → CleanHfPoint[] (speed validated, smoothed, sorted).' },
                  { step: '3', title: 'Split by gaps', desc: 'splitByGaps(maxGapMs=5000) → contiguous segments.' },
                  { step: '4', title: 'Detect events per segment', desc: 'detectAccelerationEvents(), detectBrakingEvents(), detectAbuseEvents() applied to each gap-free segment.' },
                  { step: '5', title: 'Store TripBehaviorEvents (transaction-safe)', desc: 'Delete existing + createMany + vehicleTrip.update are wrapped in a single Prisma $transaction(). A crash can no longer leave a trip in a partially rewritten state. Idempotent: re-enrichment replaces all events atomically.' },
                  { step: '6', title: 'Update VehicleTrip counters', desc: 'accelerationEventCount, brakingEventCount, abuseEventCount, hardAccelerationCount, hardBrakingCount, fullBrakingCount, kickdownCount, coldEngineAbuseCount, longIdleCount, possibleImpactCount, abuseScore (0–100 weighted), behaviorSummaryJson (with signal availability flags) updated.' },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${d ? 'bg-neutral-700 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>{s.step}</span>
                    <div>
                      <p className={`text-xs font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{s.title}</p>
                      <p className={sub}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ACCELERATION ─────────────────────────────────────── */}
        {section === 'acceleration' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-emerald-400" />
                <h2 className={h2}>Acceleration Event Detection</h2>
              </div>
              <p className={`${body} mb-3`}>
                Algorithm: forward pass over smoothed 1-second speed series. Detects positive acceleration
                runs (speed increasing). Events are classified by peak acceleration in m/s².
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-emerald-400`}>Thresholds</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'LIGHT', range: '1.5 – 2.5 m/s²', desc: 'Gentle acceleration' },
                      { label: 'MODERATE', range: '2.5 – 3.5 m/s²', desc: 'Normal aggressive' },
                      { label: 'HARD', range: '3.5 – 5.0 m/s²', desc: 'Hard acceleration' },
                      { label: 'EXTREME', range: '≥ 5.0 m/s²', desc: 'Abuse-level event' },
                    ].map(t => (
                      <div key={t.label} className={`flex gap-2 items-center text-xs rounded-lg px-2 py-1 ${d ? 'bg-card' : 'bg-gray-50'}`}>
                        <span className="font-semibold w-20 text-emerald-400">{t.label}</span>
                        <span className={`font-mono text-[11px] w-28 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{t.range}</span>
                        <span className={sub}>{t.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`${h3} text-amber-400`}>Entry / Hysteresis / Acceptance (v2.4)</p>
                  <ul className="space-y-1">
                    {[
                      'Entry: accel ≥ 1.5 m/s² (event opens)',
                      'Hysteresis: event stays open while accel ≥ 1.2 m/s² (prevents fragmentation)',
                      'Accept: sampleCount ≥ 2 AND deltaKmh ≥ 4.0 km/h',
                      'Duration filter removed — 1s HF buckets are step-based, not time-based',
                      'Min separation between events: 2000ms (merge logic)',
                    ].map(f => <li key={f} className={li}>• {f}</li>)}
                  </ul>
                  <p className={`${h3} mt-3 text-violet-400`}>Stored per event (v2.4)</p>
                  <ul className="space-y-1">
                    {[
                      'startedAt, endedAt, durationMs',
                      'startSpeedKmh, endSpeedKmh',
                      'sampleCount, peakAccelMs2, peakAccelG',
                      'deltaKmh, mergedCount',
                      'maxThrottlePos, maxEngineRpm',
                      'startSpeedBand (urban_slow / urban / rural / highway / high_speed)',
                      'classification (LIGHT / MODERATE / HARD / EXTREME)',
                    ].map(f => <li key={f} className={li}>• {f}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── BRAKING ──────────────────────────────────────────── */}
        {section === 'braking' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={16} className="text-red-400" />
                <h2 className={h2}>Braking Event Detection</h2>
              </div>
              <p className={`${body} mb-3`}>
                Algorithm: forward pass over smoothed 1-second speed series. Detects negative deceleration
                runs (speed decreasing). Events classified by peak deceleration in m/s².
                An intensity score (0–1) is computed: intensity = peakDecelMs2 / EXTREME_MS2.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className={`${h3} text-red-400`}>Thresholds</p>
                  <div className="space-y-1.5">
                    {[
                      { label: 'LIGHT', range: '1.5 – 2.8 m/s²', desc: 'Comfortable braking' },
                      { label: 'MODERATE', range: '2.8 – 4.5 m/s²', desc: 'Firm braking' },
                      { label: 'HARD', range: '4.5 – 7.0 m/s²', desc: 'Hard braking event' },
                      { label: 'EXTREME', range: '≥ 7.0 m/s²', desc: 'Emergency / abuse level' },
                    ].map(t => (
                      <div key={t.label} className={`flex gap-2 items-center text-xs rounded-lg px-2 py-1 ${d ? 'bg-card' : 'bg-gray-50'}`}>
                        <span className="font-semibold w-20 text-red-400">{t.label}</span>
                        <span className={`font-mono text-[11px] w-28 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{t.range}</span>
                        <span className={sub}>{t.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`${h3} text-amber-400`}>Entry / Hysteresis / Acceptance (v2.4)</p>
                  <ul className="space-y-1">
                    {[
                      'Entry: decel ≥ 1.5 m/s² (event opens)',
                      'Hysteresis: event stays open while decel ≥ 1.2 m/s² (prevents fragmentation)',
                      'Accept: sampleCount ≥ 2 AND deltaKmh ≥ 3.0 km/h',
                      'Duration filter removed — 1s HF buckets are step-based, not time-based',
                      'Min separation between events: 1500ms (merge logic)',
                    ].map(f => <li key={f} className={li}>• {f}</li>)}
                  </ul>
                  <p className={`${h3} mt-3 text-violet-400`}>Stored per event (v2.4)</p>
                  <ul className="space-y-1">
                    {[
                      'startedAt, endedAt, durationMs',
                      'startSpeedKmh, endSpeedKmh',
                      'sampleCount, peakDecelMs2, peakDecelG',
                      'deltaKmh, intensity (peakDecelMs2 / 7.0, clamped 0–1)',
                      'highSpeedStart (true if startSpeedKmh ≥ 80)',
                      'classification (LIGHT / MODERATE / HARD / EXTREME)',
                    ].map(f => <li key={f} className={li}>• {f}</li>)}
                  </ul>
                  <div className={`mt-3 p-2 rounded-lg text-[11px] ${d ? 'bg-amber-900/20 text-amber-300 border border-amber-800/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    <strong>EXTREME (≥7.0 m/s²) vs FULL_BRAKING abuse:</strong> EXTREME is a braking classification label. FULL_BRAKING is a separate, stricter abuse event (≥7.5 m/s², 2+ samples, startSpeed ≥ 20 km/h, deltaKmh ≥ 6.0). They are independent — a braking event can be EXTREME without triggering FULL_BRAKING abuse.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ABUSE EVENTS ─────────────────────────────────────── */}
        {section === 'abuse' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <h2 className={h2}>Abuse Event Detection</h2>
              </div>
              <p className={`${body} mb-4`}>
                Abuse events are derived from the HF time-series and vehicle-specific RPM config
                (idleRpm, maxRpm from vehicle record). Each event type targets a specific driving behavior.
              </p>
              <div className={`mb-3 p-2 rounded-lg text-[11px] ${d ? 'bg-status-info-soft text-brand border border-border' : 'bg-brand-soft text-status-info border border-border'}`}>
                <strong>Signal availability:</strong> Coolant-dependent detectors (COLD_ENGINE_HIGH_RPM, COLD_ENGINE_FULL_THROTTLE, OVERHEATING_ENGINE) silently produce no events if ECT data is unavailable.
                RPM-dependent detectors (ENGINE_REV_IN_IDLE, HIGH_RPM_CONSTANT, LAUNCH_LIKE_START, LONG_IDLE, ENGINE_SHUTDOWN_WHILE_DRIVING) require RPM data.
                KICKDOWN requires throttle data. FULL_BRAKING and POSSIBLE_IMPACT only require speed (always available).
                The <code className="font-mono">behaviorSummaryJson.detectorCoverage</code> map shows which detectors were evaluable for each trip.
              </div>
              <div className="space-y-3">
                {[
                  {
                    type: 'KICKDOWN',
                    color: 'text-orange-400',
                    bg: d ? 'bg-orange-900/20' : 'bg-orange-50',
                    desc: 'Rapid full-pedal demand while in motion.',
                    conditions: [
                      'throttle rises from < 40% to > 90% within 3 seconds',
                      'FIX H: speed > 20 km/h (idle blips excluded)',
                      'Requires throttle data — silent if unavailable',
                    ],
                    fields: ['startedAt, endedAt', 'maxThrottlePct, maxRpm, speedAtKickdown', 'throttleRisePct (metadata)'],
                  },
                  {
                    type: 'COLD_ENGINE_HIGH_RPM',
                    color: 'text-status-info',
                    bg: d ? 'bg-status-info-soft' : 'bg-brand-soft',
                    desc: 'High RPM while engine coolant is still cold.',
                    conditions: [
                      'entry: RPM > 75% maxRpm AND coolant < 60°C',
                      'continuation: RPM > 75% maxRpm AND coolant < 60°C',
                      'duration ≥ 2s',
                      'maxCoolantTemp = max over event window (not just start)',
                      'silent if ECT data unavailable',
                    ],
                    fields: ['startedAt, endedAt', 'maxRpm, maxCoolantTemp', 'startCoolantC, maxCoolantC, maxRpmPct (metadata)'],
                  },
                  {
                    type: 'COLD_ENGINE_FULL_THROTTLE',
                    color: 'text-brand',
                    bg: d ? 'bg-status-info-soft' : 'bg-brand-soft',
                    desc: 'Full throttle application while engine is cold.',
                    conditions: [
                      'entry: throttle > 85% AND coolant < 60°C',
                      'continuation: throttle > 80% (intentional hysteresis)',
                      'duration ≥ 1.5s',
                      'silent if ECT data unavailable',
                    ],
                    fields: ['startedAt, endedAt', 'maxThrottlePos, maxCoolantTemp'],
                  },
                  {
                    type: 'ENGINE_SHUTDOWN_WHILE_DRIVING',
                    color: 'text-red-400',
                    bg: d ? 'bg-red-900/20' : 'bg-red-50',
                    desc: 'RPM drops from >500 to <100 while vehicle is still moving at speed.',
                    conditions: [
                      'preceding speed > 20 km/h (truly moving)',
                      'RPM drops > 500 → < 100',
                      'speed after > 10 km/h',
                      'FIX G: time-gap guard — comparison points must be within 3.5s',
                      'requires RPM data',
                    ],
                    fields: ['startedAt, endedAt', 'rpmBefore, speedAtShutdown (metadata)'],
                  },
                  {
                    type: 'ENGINE_REV_IN_IDLE',
                    color: 'text-purple-400',
                    bg: d ? 'bg-purple-900/20' : 'bg-purple-50',
                    desc: 'High revs while stationary (< 5 km/h).',
                    conditions: [
                      'entry: RPM > 2.5× idleRpm',
                      'continuation: RPM > 1.8× idleRpm (intentional hysteresis)',
                      'speed < 5 km/h, duration ≥ 3s',
                    ],
                    fields: ['startedAt, endedAt', 'maxRpm', 'idleRpmVehicle, entryThreshold (metadata)'],
                  },
                  {
                    type: 'HIGH_RPM_CONSTANT',
                    color: 'text-violet-400',
                    bg: d ? 'bg-violet-900/20' : 'bg-violet-50',
                    desc: 'Sustained RPM above 75% of maxRpm.',
                    conditions: [
                      'entry: RPM > 75% maxRpm',
                      'continuation: RPM > 67.5% maxRpm (90% × threshold — hysteresis)',
                      'duration ≥ 10s; SEVERE if > 30s',
                    ],
                    fields: ['startedAt, endedAt', 'maxRpm', 'sustainedSeconds (metadata)'],
                  },
                  {
                    type: 'LAUNCH_LIKE_START',
                    color: 'text-amber-400',
                    bg: d ? 'bg-amber-900/20' : 'bg-amber-50',
                    desc: 'Heuristic: aggressive standing-start acceleration. NOT proof of OEM launch-control mode.',
                    conditions: [
                      'FIX F: startSpeed ≤ 3 km/h (was < 8 km/h — was too permissive)',
                      'throttle ≥ 80%',
                      'RPM ≥ max(2× idleRpm, 45% maxRpm)',
                      'subsequent speed gain ≥ 20 km/h AND peakAccel ≥ 3.5 m/s²',
                      'requires RPM + throttle data',
                    ],
                    fields: ['startedAt, endedAt', 'peakAccelMs2, speedGainKmh', 'semanticNote (metadata)'],
                  },
                  {
                    type: 'OVERHEATING_ENGINE',
                    color: 'text-red-300',
                    bg: d ? 'bg-red-900/20' : 'bg-red-50',
                    desc: 'Coolant temperature above safe operating limit.',
                    conditions: [
                      'entry: coolant > 110°C',
                      'continuation: coolant > 107°C (3°C hysteresis)',
                      'duration ≥ 5s; CRITICAL if peak > 120°C',
                      'silent if ECT unavailable',
                    ],
                    fields: ['startedAt, endedAt', 'maxCoolantTemp', 'durationAbove110s (metadata)'],
                  },
                  {
                    type: 'LONG_IDLE',
                    color: 'text-yellow-400',
                    bg: d ? 'bg-yellow-900/20' : 'bg-yellow-50',
                    desc: 'Extended engine idling at zero speed.',
                    conditions: [
                      'speed < 3 km/h AND RPM in [0.5× idle … 1.5× idle]',
                      'continuation: RPM > 0.4× idle',
                      'duration ≥ 180s (3 min); SEVERE if > 600s (10 min)',
                    ],
                    fields: ['startedAt, endedAt', 'durationMs, idleMinutes (metadata)'],
                  },
                  {
                    type: 'FULL_BRAKING',
                    color: 'text-red-500',
                    bg: d ? 'bg-red-900/20' : 'bg-red-50',
                    desc: 'Severe sustained braking event — stricter than EXTREME braking class.',
                    conditions: [
                      'FIX E: mini-window scanner (not single-pair)',
                      'peakDecel ≥ 7.5 m/s² (vs EXTREME braking ≥ 7.0 m/s²)',
                      'startSpeed ≥ 20 km/h, sampleCount ≥ 2, deltaKmh ≥ 6.0',
                      'single GPS spike alone cannot trigger',
                    ],
                    fields: ['startedAt, endedAt', 'peakDecelG', 'peakDecelMs2, deltaKmh, sampleCount (metadata)'],
                  },
                  {
                    type: 'POSSIBLE_IMPACT',
                    color: 'text-red-600',
                    bg: d ? 'bg-red-900/20' : 'bg-red-50',
                    desc: 'Abrupt extreme deceleration — possible collision or sudden stop.',
                    conditions: [
                      'FIX E: mini-window scanner (not single-pair)',
                      'peakDecel ≥ 12.0 m/s² (1.22G)',
                      'startSpeed ≥ 25 km/h, sampleCount ≥ 2, deltaKmh ≥ 3.0',
                      'CRITICAL severity — single GPS artifact cannot trigger',
                    ],
                    fields: ['startedAt, endedAt', 'peakDecelG', 'peakDecelMs2, deltaKmh, sampleCount (metadata)'],
                  },
                ].map(e => (
                  <div key={e.type} className={`rounded-xl p-4 ${e.bg}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold ${e.color}`}>{e.type}</span>
                      <span className={`text-[11px] ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{e.desc}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>Conditions</p>
                        <ul className="space-y-0.5">
                          {e.conditions.map(c => <li key={c} className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>• {c}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>Stored fields</p>
                        <ul className="space-y-0.5">
                          {e.fields.map(f => <li key={f} className={`text-[11px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>• {f}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`mt-4 p-3 rounded-xl text-[11px] ${d ? 'bg-card text-neutral-300' : 'bg-gray-50 text-gray-600'}`}>
                <strong>Abuse Score (abuseScore, 0–100):</strong> Deterministic weighted sum of abuse events.
                Each event type has a base weight (POSSIBLE_IMPACT=20, ENGINE_SHUTDOWN=15, OVERHEATING=10, FULL_BRAKING=8, LAUNCH_LIKE_START=6, COLD_ENGINE_*=5, HIGH_RPM_CONSTANT=4, ENGINE_REV_IN_IDLE=3, KICKDOWN=3, LONG_IDLE=2).
                Severity multipliers: WARNING=1.0×, SEVERE=1.5×, CRITICAL=2.0×. Score is capped at 100.
              </div>
            </div>
          </div>
        )}

        {/* ── STORAGE ──────────────────────────────────────────── */}
        {section === 'storage' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>VehicleTrip — Behavior Counters</h2>
              <p className={`${body} mb-2`}>Updated atomically inside a single Prisma transaction after HF enrichment:</p>
              <div className={`mb-3 p-2 rounded-lg text-[11px] ${d ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-800/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                <strong>Canonical counters:</strong> <code className="font-mono">hardAccelerationCount</code> and <code className="font-mono">hardBrakingCount</code> are the canonical HF-derived behavior counters.
                <code className="font-mono ml-1">harshAccelCount</code> and <code className="font-mono">harshBrakeCount</code> are <strong>deprecated aliases</strong> mirrored from the canonical values for backward compatibility only. Do NOT write new queries against <code className="font-mono">harsh*</code> fields.
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  'accelerationEventCount', 'brakingEventCount', 'abuseEventCount',
                  'hardAccelerationCount ✓ CANONICAL', 'hardBrakingCount ✓ CANONICAL',
                  'harshAccelCount ⚠ DEPRECATED alias', 'harshBrakeCount ⚠ DEPRECATED alias',
                  'fullBrakingCount', 'possibleImpactCount',
                  'kickdownCount', 'coldEngineAbuseCount', 'longIdleCount',
                  'abuseScore (0–100 weighted)', 'behaviorSummaryJson (signal availability + coverage)',
                  'behaviorEnrichedAt (timestamp)',
                ].map(f => (
                  <code key={f} className={`${code} block text-[10px] truncate`}>{f}</code>
                ))}
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>TripBehaviorEvent — Per-Event Records</h2>
              <p className={`${body} mb-3`}>One record per detected event. Schema fields:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { field: 'vehicleId', desc: 'Vehicle reference' },
                  { field: 'tripId', desc: 'Trip reference' },
                  { field: 'category', desc: 'ACCELERATION / BRAKING / ABUSE' },
                  { field: 'classification', desc: 'LIGHT / MODERATE / HARD / EXTREME' },
                  { field: 'startedAt / endedAt', desc: 'Event time window' },
                  { field: 'startSpeedKmh / endSpeedKmh', desc: 'Speed at start/end' },
                  { field: 'durationMs', desc: 'Event duration' },
                  { field: 'peakValueMs2', desc: 'Peak accel/decel in m/s²' },
                  { field: 'peakValueG', desc: 'Peak in G force' },
                  { field: 'intensity', desc: 'Normalized 0–1 severity score' },
                  { field: 'maxThrottlePct', desc: 'For acceleration/kickdown events' },
                  { field: 'maxRpm', desc: 'For rpm-based events' },
                  { field: 'source', desc: 'hf_enrichment (always)' },
                ].map(f => (
                  <div key={f.field} className={`flex gap-2 ${d ? 'text-neutral-400' : 'text-gray-600'}`}>
                    <code className={`${code} flex-shrink-0 text-[10px]`}>{f.field}</code>
                    <span className={sub}>{f.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <h2 className={h2}>TripDrivingImpact — Per-Trip Normalization</h2>
              <p className={`${body} mb-3`}>
                After TripBehaviorEvent records are stored, Driving Impact Engine V1 computes per-100km
                normalized stress scores. These are stored in <code className={code}>TripDrivingImpact</code>.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  'longitudinalStressScore', 'brakingStressScore', 'stopGoStressScore',
                  'highSpeedStressScore', 'thermalBrakeStressScore',
                  'drivingStyleScore ✓ CANONICAL', 'safetyScore ✓ CANONICAL',
                  'hardAccelPer100km', 'hardBrakePer100km', 'fullBrakingPer100km',
                  'kickdownPer100km', 'p95DecelMs2', 'meanBrakeEnergyKjPerKm',
                  'citySharePct', 'highwaySharePct', 'countrySharePct',
                ].map(f => <code key={f} className={`${code} block text-[10px] truncate`}>{f}</code>)}
              </div>
              <div className={`mt-3 p-3 rounded-xl text-[11px] leading-relaxed ${d ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-800/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                <strong>Canonical scoring truth (V4.6.83):</strong> SynqDrive has exactly two trip-level
                driving scores. <code className="font-mono">drivingStyleScore</code> measures driving
                style / dynamic stress / wear behavior (hard accel, hard braking, stop-and-go, high-speed
                braking share, etc.). <code className="font-mono">safetyScore</code> measures
                safety / compliance behavior — in the current version intentionally primarily speeding-based
                (speeding exposure %, max / avg overspeed, section count). Both come from
                <code className="font-mono ml-1">driving-impact-scorer.ts</code> (one canonical implementation).
              </div>
              <div className={`mt-2 p-3 rounded-xl text-[11px] leading-relaxed ${d ? 'bg-status-info-soft text-brand border border-border' : 'bg-brand-soft text-status-info border border-border'}`}>
                <strong>V4.6.95 hardening:</strong> <code className="font-mono">safetyScore</code> is
                now <em>nullable</em> on <code className="font-mono">TripDrivingImpact</code>.
                Helper <code className="font-mono">hasSpeedingDataFromTrip()</code> guards
                <code className="font-mono ml-1">DrivingImpactService.computeForTrip</code> and
                <code className="font-mono ml-1">TripAnalyticsCanonicalService.deriveSafetyScoreFromTrip</code>
                — when no speed-limit / route enrichment ran, safetyScore is <code className="font-mono">null</code>,
                never coerced to 100. Rolling
                <code className="font-mono ml-1">VehicleDrivingImpactCurrent.safetyScore</code> averages
                only over rows whose <code className="font-mono">safetyScore</code> is non-null and is
                itself null when the 30-day window has no enriched trips. Subject / customer / booking
                aggregates use one canonical entry point —
                <code className="font-mono ml-1">DriverScoreService.aggregateRows</code> (distance-weighted,
                returns <code className="font-mono">tripCount</code> / <code className="font-mono">scoredTripCount</code>
                / <code className="font-mono">safetyScoredTripCount</code> / <code className="font-mono">totalDistanceKm</code>
                / <code className="font-mono">assignmentCoveragePct</code> / <code className="font-mono">hasEnoughData</code>
                / <code className="font-mono">dataConfidence</code>). USER / ASSIGNED_USER and
                <code className="font-mono ml-1">speedingSeverityScore</code> retired in migration
                <code className="font-mono ml-1">20260425000000_retire_user_assignment_and_speeding_severity</code>.
                Frontend score-render contract lives in
                <code className="font-mono ml-1">frontend/src/rental/lib/scoreFormat.ts</code> — never %, never grades,
                null → em-dash + semantic „Not enough data" / „No speed-limit data".
              </div>
            </div>
          </div>
        )}

        {/* ── DOWNSTREAM ───────────────────────────────────────── */}
        {section === 'downstream' && (
          <div className="space-y-4">
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <GitBranch size={16} className="text-violet-400" />
                <h2 className={h2}>VehicleDrivingImpactCurrent — Rolling 30-Day Aggregate</h2>
              </div>
              <p className={`${body} mb-3`}>
                After each trip's TripDrivingImpact is stored, the Driving Impact Engine V1 updates
                <code className={code}>VehicleDrivingImpactCurrent</code> — a distance-weighted rolling
                average over the last 30 days of trips. This is the single shared data source for both
                Tire Health V2 and Brake Health V2, and since V4.6.83 also carries the rolling
                <code className="font-mono ml-1">drivingStyleScore</code> AND
                <code className="font-mono ml-1">safetyScore</code> so vehicle-level cards can show the
                same two canonical scores as the individual trips they aggregate.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    title: 'Tire Health V2',
                    color: 'text-emerald-400',
                    fields: ['citySharePct → city usage multiplier', 'highwaySharePct → highway share', 'hardAccelPer100km → longitudinal stress', 'p95DecelMs2 → braking stress', 'stopGoStressScore → stop density'],
                  },
                  {
                    title: 'Brake Health V2',
                    color: 'text-orange-400',
                    fields: ['citySharePct → usage multiplier (city=1.35, highway=1.0)', 'stopGoStressScore → stop density factor', 'highSpeedStressScore → high-speed braking factor', 'p95DecelMs2 → hard braking factor', 'meanBrakeEnergyKjPerKm → full-braking factor', 'thermalBrakeStressScore → thermal wear factor'],
                  },
                ].map(c => (
                  <div key={c.title} className={`rounded-xl p-4 ${d ? 'bg-card' : 'bg-gray-50'}`}>
                    <p className={`text-sm font-bold mb-2 ${c.color}`}>{c.title}</p>
                    <ul className="space-y-1">
                      {c.fields.map(f => <li key={f} className={`text-[11px] ${d ? 'text-neutral-400' : 'text-gray-600'}`}>• {f}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <Gauge size={16} className="text-amber-400" />
                <h2 className={h2}>Per-Trip Driving Scores (canonical)</h2>
              </div>
              <p className={`${body} mb-3`}>
                Every scored trip carries two canonical 0–100 scalars on
                <code className={code}>TripDrivingImpact</code>:
              </p>
              <ul className="space-y-1 mb-3">
                <li className={li}>
                  • <code className="font-mono">drivingStyleScore</code> — reference-based deduction over the
                  stress components (longitudinal, braking, stop-and-go, high-speed, thermal-brake), clamped 0–100.
                </li>
                <li className={li}>
                  • <code className="font-mono">safetyScore</code> — speeding-centric score derived from
                  speeding exposure %, max / avg overspeed km/h, and section count via
                  <code className="font-mono ml-1">computeSafetyScore()</code>.
                </li>
              </ul>
              <div className={`p-3 rounded-xl text-[11px] leading-relaxed ${d ? 'bg-amber-900/20 text-amber-300 border border-amber-800/30' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                <strong>Legacy compatibility:</strong>
                <code className="font-mono ml-1">VehicleTrip.drivingScore</code> is kept as a
                transition-compatible mirror of <code className="font-mono">drivingStyleScore</code> only.
                New logic must read <code className="font-mono">TripDrivingImpact.drivingStyleScore</code> /
                <code className="font-mono ml-1">.safetyScore</code>. There is no separate "base-100
                minus penalties" per-trip formula anymore.
              </div>
            </div>
            <div className={`${CARD(d)} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight size={16} className="text-cyan-400" />
                <h2 className={h2}>API Endpoints — Canonical vs Legacy</h2>
              </div>
              <ul className="space-y-2 mb-4">
                {[
                  { method: 'GET', path: '/api/v1/vehicle-intelligence/trips', desc: 'Paginated trip list — reads hardBrakingCount/hardAccelerationCount (HF canonical)', canonical: true },
                  { method: 'GET', path: '/api/v1/vehicle-intelligence/trips/:id/behavior-events', desc: 'All TripBehaviorEvent records for a trip (HF canonical events)', canonical: true },
                  { method: 'POST', path: '/api/v1/vehicle-intelligence/trips/:id/behavior-enrich', desc: 'Manually trigger HF behavior enrichment (canonical behavior pipeline)', canonical: true },
                  { method: 'POST', path: '/api/v1/vehicle-intelligence/trips/:id/enrich', desc: 'Route-based enrichment: road type, speeding, temp, basic perf. Complementary — NOT behavior canonical.', canonical: false },
                  { method: 'POST', path: '/api/v1/vehicle-intelligence/trips/sync', desc: 'LEGACY V1 ignition-based manual sync. Returns warning field. NOT the live engine.', canonical: false },
                ].map(e => (
                  <li key={e.path} className="flex gap-3 items-start">
                    <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${e.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-brand-soft text-status-info'}`}>{e.method}</span>
                    <div>
                      <code className={`${code} text-[10px]`}>{e.path}</code>
                      <p className={`text-[11px] mt-0.5 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{e.desc}</p>
                    </div>
                    {!e.canonical && <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full self-start mt-0.5 ${d ? 'bg-amber-800/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>LEGACY</span>}
                  </li>
                ))}
              </ul>
              <div className={`p-3 rounded-xl text-[11px] ${d ? 'bg-status-info-soft text-brand border border-border' : 'bg-brand-soft text-status-info border border-border'}`}>
                <strong>Counter selection in health scoring:</strong> When a trip has <code className="font-mono">behaviorEnrichedAt</code> set,
                the system uses <code className="font-mono">hardBrakingCount</code> (HF canonical).
                For trips without HF enrichment, <code className="font-mono">harshBrakeCount</code> (legacy route enrichment) is the fallback.
                The two fields measure different things and must not be mixed for per-trip comparison.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
