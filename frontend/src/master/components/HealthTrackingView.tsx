import { useState } from 'react';
import {
  Activity,
  Battery,
  ChevronRight,
  Disc,
  Wrench,
  Droplet,
  AlertTriangle,
  Clock,
  Zap,
  Database,
  ArrowRight,
  Layers,
} from 'lucide-react';

interface HealthTrackingViewProps {
  isDarkMode: boolean;
}

const CARD = (d: boolean) =>
  `rounded-2xl shadow-sm border overflow-hidden ${
    d
      ? 'bg-neutral-900 border-neutral-800'
      : 'bg-white border-gray-200'
  }`;

const BADGE = (color: string) =>
  `inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${color}`;

type Section =
  | 'overview'
  | 'battery'
  | 'error-codes'
  | 'driving-impact'
  | 'tires'
  | 'brakes';

const SECTIONS: { id: Section; label: string; icon: React.ElementType; status: 'live' | 'placeholder' }[] = [
  { id: 'overview', label: 'Overview', icon: Activity, status: 'live' },
  { id: 'battery', label: 'Battery (LV)', icon: Battery, status: 'live' },
  { id: 'error-codes', label: 'Error Codes (DTC)', icon: Wrench, status: 'live' },
  { id: 'driving-impact', label: 'Driving Impact Engine', icon: Layers, status: 'live' },
  { id: 'tires', label: 'Tires', icon: Disc, status: 'live' },
  { id: 'brakes', label: 'Brakes', icon: Disc, status: 'live' },
];

// ── Battery detail section ──────────────────────────────────────────

function BatterySection({ d }: { d: boolean }) {
  const mono = `text-[11px] font-mono ${d ? 'text-violet-400' : 'text-violet-600'}`;
  const code = (s: string) => (
    <code className={`px-1 py-0.5 rounded ${d ? 'surface-premium' : 'bg-gray-100'} ${mono}`}>
      {s}
    </code>
  );
  const h2 = `text-sm font-semibold mb-2 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const body = `text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`;

  const FlowStep = ({ label, sub }: { label: string; sub: string }) => (
    <div className={`flex-1 min-w-0 rounded-xl p-3 text-center ${d ? 'surface-premium' : 'bg-gray-50'}`}>
      <div className={`text-[11px] font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{label}</div>
      <div className={`text-[10px] mt-0.5 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{sub}</div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Architecture Principles */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Architecture Principles</h3>
        <ul className={`${body} space-y-1.5 list-disc list-inside`}>
          <li>No dedicated scheduler — all battery logic hooks into existing 30 s Snapshot Worker and V2 trip-start events.</li>
          <li>Rest capture uses {code('VehicleTripDetectionState.state')} and {code('lastActivityAt')} — the V2 trip state machine already tracks inactivity.</li>
          <li>Crank capture is a fire-and-forget call triggered alongside the existing temperature and route fetch at every confirmed trip start.</li>
          <li>One row per vehicle in {code('battery_features')} (upsert pattern) — always the latest known features.</li>
          <li>SOC is only computed from resting voltage — never from engine-running readings.</li>
        </ul>
      </div>

      {/* Data Flow */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Data Flow</h3>
        <div className="flex items-stretch gap-2 flex-wrap">
          <FlowStep label="DIMO signalsLatest (30 s)" sub="lowVoltageBatteryCurrentVoltage" />
          <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="DimoSnapshotProcessor" sub="writes VehicleLatestState" />
          <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="BatteryV2Service.onSnapshot" sub="checks rest window" />
          <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="battery_features (upsert)" sub="rest60m / rest6h captured" />
          <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="Scoring" sub="SOC · SOH · badge" />
        </div>
        <div className={`mt-3 pt-3 border-t ${d ? 'border-neutral-800' : 'border-gray-100'}`}>
          <p className={body}>Crank path (parallel, fire-and-forget):</p>
          <div className="flex items-stretch gap-2 flex-wrap mt-2">
            <FlowStep label="V2 trip confirmed" sub="TripDetectionOrchestration" />
            <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
            <FlowStep label="DIMO signals (5 s)" sub="[tripStart−30 s, +120 s]" />
            <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
            <FlowStep label="Crank feature extraction" sub="drop · recovery" />
            <ArrowRight size={14} className={`self-center shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
            <FlowStep label="battery_features (upsert)" sub="+ re-score" />
          </div>
        </div>
      </div>

      {/* Rest Logic */}
      <div className={`${CARD(d)} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-cyan-400" />
          <h3 className={h2.replace('mb-2', '')}>Rest Window Logic</h3>
        </div>
        <ol className={`${body} space-y-2 list-decimal list-inside`}>
          <li>
            After each {code('vehicleLatestState')} upsert, {code('BatteryV2Service.onSnapshot')} reads
            {' '}{code('VehicleTripDetectionState.state')} and {code('lastActivityAt')}.
          </li>
          <li>
            If state is not {code('RESTING')} or {code('lastActivityAt')} is null → return immediately (no capture).
          </li>
          <li>
            If a new rest window is detected (i.e. {code('lastActivityAt')} differs from stored
            {' '}{code('restWindowStartedAt')} by &gt; 2 min) → record new window start, reset 60 m and 6 h flags.
          </li>
          <li>
            If rest duration ≥ 60 min and {code('rest60mCapturedAt')} is null → store {code('v_off_60m')} = current voltage.
          </li>
          <li>
            If rest duration ≥ 6 h and {code('rest6hCapturedAt')} is null → store {code('v_off_6h')} = current voltage,
            compute {code('delta_v_rest')} = {code('v_off_6h − v_off_60m')}.
          </li>
          <li>After any capture, re-score SOC / SOH / confidence / badge and write a {code('BatteryHealthSnapshot')} record.</li>
        </ol>
        <div className={`mt-3 p-3 rounded-xl text-[11px] ${d ? 'surface-premium text-neutral-400' : 'bg-amber-50 text-amber-700'}`}>
          <AlertTriangle size={12} className="inline mr-1" />
          Voltage plausibility guard: only values between 9.0 V and 16.0 V are accepted. Implausible readings are silently ignored.
        </div>
      </div>

      {/* Crank Logic */}
      <div className={`${CARD(d)} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} className="text-yellow-400" />
          <h3 className={h2.replace('mb-2', '')}>Start / Crank Logic</h3>
        </div>
        <p className={`${body} mb-3`}>
          When {code('processPossibleStart')} confirms an {code('ACTIVE_TRIP')}, it fires a non-blocking call to
          {' '}{code('BatteryV2Service.onTripStart')}. This:
        </p>
        <ol className={`${body} space-y-2 list-decimal list-inside`}>
          <li>Queries DIMO for {code('lowVoltageBatteryCurrentVoltage')} at 5 s resolution over {code('[tripStart − 30 s, tripStart + 120 s]')}.</li>
          <li>
            Extracts:{' '}
            <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>v_pre_crank</span>{' '}
            <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>v_min_crank</span>{' '}
            <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>crank_drop</span>{' '}
            <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>v_recovery_5s</span>{' '}
            <span className={BADGE('bg-cyan-500/15 text-cyan-500')}>v_recovery_30s</span>
          </li>
          <li>Upserts {code('battery_features')} and triggers re-scoring.</li>
        </ol>
      </div>

      {/* SOC */}
      <div className={`${CARD(d)} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Battery size={15} className="text-emerald-400" />
          <h3 className={h2.replace('mb-2', '')}>SOC Estimation</h3>
        </div>
        <p className={body}>
          SOC is derived exclusively from resting voltage via the standard 12 V lead-acid / AGM lookup table.
          The 6 h reading is preferred over the 60 min reading (more stable open-circuit voltage).
          If neither is available, {code('estimatedSocPct')} is {code('null')} and the UI shows{' '}
          <span className={BADGE('bg-amber-500/15 text-amber-500')}>insufficient data</span>.
        </p>
        <div className={`mt-3 grid grid-cols-6 gap-1 text-center`}>
          {[['12.73+', '100%'], ['12.62', '90%'], ['12.50', '80%'], ['12.37', '70%'], ['12.24', '60%'], ['12.10', '50%'],
            ['11.96', '40%'], ['11.81', '30%'], ['11.66', '20%'], ['11.51', '10%'], ['≤11.30', '0%']].map(([v, s]) => (
            <div key={v} className={`rounded-lg p-1.5 text-[10px] ${d ? 'surface-premium' : 'bg-gray-50'}`}>
              <div className={`font-mono font-semibold ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{v} V</div>
              <div className={`${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SOH */}
      <div className={`${CARD(d)} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} className="text-status-info" />
          <h3 className={h2.replace('mb-2', '')}>SOH Scoring Formula</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {[
            { label: 'Resting voltage', weight: '35 %', color: 'text-cyan-400', detail: 'Normalised 11.0 V → 0, 12.73 V → 100' },
            { label: 'Crank drop', weight: '35 %', color: 'text-yellow-400', detail: '≤ 0.3 V → 100, ≥ 2.5 V → 0' },
            { label: '5 s recovery', weight: '20 %', color: 'text-emerald-400', detail: 'vRecovery5s / vPreCrank ratio' },
            { label: 'ΔV stability', weight: '10 %', color: 'text-violet-400', detail: 'vOff6h − vOff60m (small = good)' },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl p-3 ${d ? 'surface-premium' : 'bg-gray-50'}`}>
              <div className={`text-lg font-bold ${c.color}`}>{c.weight}</div>
              <div className={`text-[11px] font-semibold mt-0.5 ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{c.label}</div>
              <div className={`text-[10px] mt-1 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{c.detail}</div>
            </div>
          ))}
        </div>
        <p className={body}>
          Only components with available data contribute. {code('weightSum')} tracks how much of the formula is covered.
          If {code('weightSum')} = 0, no score is computed.
        </p>
      </div>

      {/* Confidence + Badge */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Confidence & Badge</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>Confidence</p>
            {[
              ['high', '≥ 85 % weight covered', 'bg-emerald-500/15 text-emerald-500'],
              ['medium', '50 – 85 % weight covered', 'bg-amber-500/15 text-amber-500'],
              ['low', '0 – 50 % weight covered', 'bg-orange-500/15 text-orange-500'],
              ['insufficient_data', 'no features at all', 'bg-neutral-500/15 text-neutral-500'],
            ].map(([l, d2, c]) => (
              <div key={l} className="flex items-center gap-2 mb-1.5">
                <span className={BADGE(c)}>{l}</span>
                <span className={`text-[11px] ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{d2}</span>
              </div>
            ))}
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>Badge</p>
            {[
              ['healthy', 'SOH ≥ 70 %', 'bg-emerald-500/15 text-emerald-500'],
              ['attention', 'SOH 50 – 70 %', 'bg-amber-500/15 text-amber-500'],
              ['critical', 'SOH < 50 %', 'bg-red-500/15 text-red-500'],
              ['unknown', 'no score or no confidence', 'bg-neutral-500/15 text-neutral-500'],
            ].map(([l, d2, c]) => (
              <div key={l} className="flex items-center gap-2 mb-1.5">
                <span className={BADGE(c)}>{l}</span>
                <span className={`text-[11px] ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{d2}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Storage Model */}
      <div className={`${CARD(d)} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Database size={15} className={d ? 'text-neutral-400' : 'text-gray-500'} />
          <h3 className={h2.replace('mb-2', '')}>Storage Model</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>battery_features (1 row / vehicle)</p>
            {[
              'restWindowStartedAt', 'rest60mCapturedAt', 'rest6hCapturedAt',
              'vOff60m', 'vOff6h', 'deltaVRest',
              'crankTripId', 'crankAt',
              'vPreCrank', 'vMinCrank', 'crankDrop', 'vRecovery5s', 'vRecovery30s',
              'estimatedSocPct', 'estimatedSohPct', 'confidence', 'badge', 'scoredAt',
            ].map((f) => (
              <span key={f} className={`inline-block text-[10px] font-mono mr-1 mb-1 px-1.5 py-0.5 rounded ${d ? 'surface-premium text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>{f}</span>
            ))}
          </div>
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>battery_health_snapshots (still used)</p>
            <p className={`${body} mb-2`}>Formal snapshot records are written at every rest capture (60 m or 6 h) to keep the existing trend / history API populated.</p>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>API contract</p>
            {[
              { path: 'GET /battery-health/latest', note: 'includes v2 block' },
              { path: 'GET /battery-health/v2', note: 'structured V2 summary + features' },
            ].map((e) => (
              <div key={e.path} className="mb-1.5">
                <code className={`text-[10px] font-mono ${d ? 'text-cyan-400' : 'text-cyan-600'}`}>{e.path}</code>
                <span className={`text-[10px] ml-1.5 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{e.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Extension Strategy */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Extension Strategy</h3>
        <ul className={`${body} space-y-1.5 list-disc list-inside`}>
          <li>Add charge-phase features (v_charge_start, v_charge_end, charge rate) when charging detection is available.</li>
          <li>Adjust SOH weights via env vars without code changes.</li>
          <li>Battery type (AGM / EFB / Li) can adjust voltage thresholds in {code('VOLTAGE_SOC')} table.</li>
          <li>Temperature correction factor can be applied to resting voltage before SOC lookup.</li>
          <li>All scoring is deterministic — easy to unit-test by injecting synthetic {code('BatteryFeaturesLike')} objects.</li>
        </ul>
      </div>

    </div>
  );
}

// ── Error Codes (DTC) section ───────────────────────────────────────

function ErrorCodesSection({ d }: { d: boolean }) {
  const mono = `text-[11px] font-mono ${d ? 'text-violet-400' : 'text-violet-600'}`;
  const code = (s: string) => (
    <code className={`px-1 py-0.5 rounded ${d ? 'surface-premium' : 'bg-gray-100'} ${mono}`}>{s}</code>
  );
  const h2 = `text-sm font-semibold mb-2 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const body = `text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`;

  const FlowStep = ({ label, sub }: { label: string; sub: string }) => (
    <div className={`flex-1 min-w-0 rounded-xl p-3 text-center ${d ? 'surface-premium' : 'bg-gray-50'}`}>
      <div className={`text-[11px] font-semibold ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{label}</div>
      <div className={`text-[10px] mt-0.5 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{sub}</div>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Architecture Principles */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Architecture Principles</h3>
        <ul className={`${body} space-y-1.5 list-disc list-inside`}>
          <li>Reuses existing {code('DimoDtcScheduler')} + {code('DimoDtcProcessor')} pipeline — no new scheduler or polling path.</li>
          <li>Poll interval: every 3 hours via {code('dimo.dtc.poll')} BullMQ queue.</li>
          <li>Signal source: {code('obdDTCList')} from DIMO {code('signalsLatest')} query.</li>
          <li>One-row-per-event model: {code('vehicle_dtc_events')} — codes are never deleted, only transitioned between active/cleared.</li>
          <li>Freshness is tracked separately via {code('lastDtcSuccessfulCheckAt')} — poll failures do not corrupt the last known successful state.</li>
          <li>Stale threshold: 6 hours (2× the poll interval). UI surface renders a distinct stale state — never shows "no faults" when data is outdated.</li>
        </ul>
      </div>

      {/* Data Flow */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Data Flow</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <FlowStep label="DIMO signalsLatest" sub="obdDTCList" />
          <ArrowRight className={`w-4 h-4 shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="DimoDtcProcessor" sub="normalize + diff" />
          <ArrowRight className={`w-4 h-4 shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="DtcService" sub="upsert / clear" />
          <ArrowRight className={`w-4 h-4 shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="vehicle_dtc_events" sub="persistent history" />
          <ArrowRight className={`w-4 h-4 shrink-0 ${d ? 'text-neutral-600' : 'text-gray-300'}`} />
          <FlowStep label="getSummary / getDetail" sub="UI-ready DTOs" />
        </div>
        <p className={`${body} mt-3`}>
          Every poll, {code('DimoDtcProcessor')} computes the diff between the previous active set in {code('vehicle_dtc_events')} and the new DIMO response.
          Codes present in the new response are upserted (updating {code('lastSeenAt')} and {code('occurrenceCount')}).
          Codes that were previously active but absent from the new response are cleared ({code('isActive = false')}, {code('clearedAt')} set).
        </p>
      </div>

      {/* Poll Failure Handling */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Poll Failure Handling</h3>
        <p className={`${body} mb-3`}>
          If a DTC poll fails (JWT error, DIMO API unavailable, network timeout), the processor:
        </p>
        <ul className={`${body} space-y-1 list-disc list-inside`}>
          <li>Updates {code('lastDtcPollAt')} and {code('dtcPollStatus = "failure"')} with the error message.</li>
          <li>Does NOT update {code('lastDtcSuccessfulCheckAt')} — the last known good timestamp is preserved.</li>
          <li>Does NOT touch {code('vehicle_dtc_events')} — active codes remain active, cleared codes remain cleared.</li>
          <li>The UI receives {code('status: "stale"')} from {code('getSummary()')} once the stale threshold is crossed, making the data gap visible.</li>
        </ul>
      </div>

      {/* Current vs Historical State */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Current vs Historical State</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl p-4 ${d ? 'surface-premium' : 'bg-gray-50'}`}>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-red-400' : 'text-red-500'}`}>Active</div>
            <p className={body}>{code('isActive = true')} — code is present in the latest successful poll. Updated on every tick where the code appears.</p>
          </div>
          <div className={`rounded-xl p-4 ${d ? 'surface-premium' : 'bg-gray-50'}`}>
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${d ? 'text-green-400' : 'text-green-600'}`}>Cleared</div>
            <p className={body}>{code('isActive = false')} + {code('clearedAt')} set. Code was active in a previous poll but absent from the current one. Permanently stored in history.</p>
          </div>
        </div>
        <p className={`${body} mt-3`}>
          A DTC code is never deleted. Once written to {code('vehicle_dtc_events')}, it remains in the historical record regardless of subsequent polls.
          This ensures the History section of the UI always shows a complete timeline.
        </p>
      </div>

      {/* Stale / Freshness Logic */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Freshness Model</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { status: 'clean', desc: 'Fresh check, no active codes', color: d ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600' },
            { status: 'active_faults', desc: 'Fresh check, faults present', color: d ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600' },
            { status: 'stale', desc: 'Last success > 6h ago', color: d ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600' },
            { status: 'unavailable', desc: 'No check yet', color: d ? 'surface-premium text-neutral-400' : 'bg-gray-50 text-gray-400' },
          ].map((s) => (
            <div key={s.status} className={`rounded-xl p-3 ${d ? 'surface-premium' : 'bg-gray-50'}`}>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.status}</span>
              <p className={`${body} mt-2`}>{s.desc}</p>
            </div>
          ))}
        </div>
        <p className={body}>
          {code('stale')} is returned when {code('lastDtcSuccessfulCheckAt')} is older than 6 hours or null.
          Only {code('clean')} and {code('active_faults')} represent trustworthy current readings.
          The Quick View box never shows "No active faults" when {code('status')} is {code('stale')} or {code('unavailable')}.
        </p>
      </div>

      {/* Decoding & Severity */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>DTC Decoding & Severity</h3>
        <p className={`${body} mb-3`}>
          Category is derived from the first character of the DTC code:
        </p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { prefix: 'P', cat: 'Powertrain' },
            { prefix: 'B', cat: 'Body' },
            { prefix: 'C', cat: 'Chassis' },
            { prefix: 'U', cat: 'Network' },
          ].map((c) => (
            <div key={c.prefix} className={`rounded-xl p-3 text-center ${d ? 'surface-premium' : 'bg-gray-50'}`}>
              <div className={`text-lg font-bold font-mono mb-1 ${d ? 'text-violet-400' : 'text-violet-600'}`}>{c.prefix}xxxx</div>
              <div className={`text-[11px] ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{c.cat}</div>
            </div>
          ))}
        </div>
        <p className={`${body} mb-2`}>
          Severity is stored in {code('DtcSeverity')} enum ({code('INFO')} / {code('WARNING')} / {code('CRITICAL')}) and mapped to display levels (low / medium / high).
          If no severity mapping is available, {code('WARNING')} is the default. Severity is stored on the event row and can be enriched later with a decoder service without schema changes.
        </p>
      </div>

      {/* Storage Model */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>Storage Model</h3>
        <div className="space-y-3">
          <div className={`rounded-xl p-4 ${d ? 'surface-premium' : 'bg-gray-50'}`}>
            <div className={`text-[11px] font-bold mb-2 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{code('vehicle_latest_states')} — per-vehicle DTC poll state</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {[
                ['obdDtcList', 'Json — raw code array from last successful poll'],
                ['lastDtcPollAt', 'DateTime — any poll attempt (success or failure)'],
                ['lastDtcSuccessfulCheckAt', 'DateTime — last poll that returned data'],
                ['dtcPollStatus', 'String — "success" | "failure"'],
                ['dtcPollError', 'String? — error message if last poll failed'],
              ].map(([field, desc]) => (
                <div key={field}>
                  <div className={mono}>{field}</div>
                  <div className={`text-[10px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={`rounded-xl p-4 ${d ? 'surface-premium' : 'bg-gray-50'}`}>
            <div className={`text-[11px] font-bold mb-2 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>{code('vehicle_dtc_events')} — persistent per-code history</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {[
                ['dtcCode', 'String — OBD DTC code (e.g. P0301)'],
                ['description', 'String? — decoded label if available'],
                ['severity', 'DtcSeverity enum (INFO/WARNING/CRITICAL)'],
                ['isActive', 'Boolean — true = present in latest poll'],
                ['firstSeenAt', 'DateTime — when first observed'],
                ['lastSeenAt', 'DateTime — most recent observation'],
                ['clearedAt', 'DateTime? — when code disappeared from poll'],
                ['occurrenceCount', 'Int — number of times code was seen in polls'],
              ].map(([field, desc]) => (
                <div key={field}>
                  <div className={mono}>{field}</div>
                  <div className={`text-[10px] ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* API Contract */}
      <div className={`${CARD(d)} p-5`}>
        <h3 className={h2}>API Contract</h3>
        <div className="space-y-4">
          <div>
            <div className={`text-[11px] font-bold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>GET /vehicles/:id/dtc/summary</div>
            <p className={`${body} mb-1`}>UI-ready status for the Quick View box. Includes: {code('status')}, {code('activeFaultCount')}, {code('activeFaultPreview')}, {code('lastCheckedAt')}, {code('lastSuccessfulCheckAt')}, {code('isStale')}, {code('message')}.</p>
          </div>
          <div>
            <div className={`text-[11px] font-bold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>GET /vehicles/:id/dtc/detail</div>
            <p className={`${body} mb-1`}>Full detail for the modal. Three sections: {code('currentFaults')} (active codes with decoded fields), {code('history')} (all events), {code('monitoring')} (poll metadata, freshness, error info).</p>
          </div>
          <div>
            <div className={`text-[11px] font-bold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>GET /vehicles/:id/dtc</div>
            <p className={body}>Raw list of all {code('VehicleDtcEvent')} rows for the vehicle (legacy, kept for backwards compatibility).</p>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Placeholder section ─────────────────────────────────────────────

function PlaceholderSection({ name, d }: { name: string; d: boolean }) {
  return (
    <div className={`${CARD(d)} p-10 text-center`}>
      <div className={`text-sm font-semibold mb-2 ${d ? 'text-neutral-400' : 'text-gray-500'}`}>{name} — documentation coming soon</div>
      <div className={`text-xs ${d ? 'text-neutral-600' : 'text-gray-300'}`}>This module is tracked but not yet fully documented in this view.</div>
    </div>
  );
}

// ── Brake Health V2 section ─────────────────────────────────────────

function BrakeHealthSection({ d }: { d: boolean }) {
  const h2 = `text-base font-bold mb-3 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const h3 = `text-sm font-semibold mb-2 ${d ? 'text-neutral-300' : 'text-gray-700'}`;
  const p = `text-sm leading-relaxed mb-3 ${d ? 'text-neutral-400' : 'text-gray-600'}`;
  const code = `text-xs font-mono px-1.5 py-0.5 rounded ${d ? 'surface-premium text-amber-300' : 'bg-gray-100 text-amber-700'}`;
  const li = `text-sm ${d ? 'text-neutral-400' : 'text-gray-600'}`;
  const th = `text-xs font-semibold uppercase tracking-wider px-3 py-2 text-left ${d ? 'text-neutral-500 surface-premium' : 'text-gray-400 bg-gray-50'}`;
  const td = `text-xs px-3 py-2 ${d ? 'text-neutral-400' : 'text-gray-600'}`;

  return (
    <div className="space-y-8">
      {/* Purpose */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Purpose</h2>
        <p className={p}>
          The Brake Health V2 module estimates brake pad condition (front + rear) and brake disc condition (front + rear) for each vehicle. It uses an
          <strong> anchor-based, achsweise (per-axle)</strong> deterministic wear model fed by the Driving Impact Engine V1, vehicle master data, and brake service history.
        </p>
        <p className={p}>
          <strong>Critical rule:</strong> Brake Health does NOT produce estimates until a valid brake service anchor exists. Pre-anchor driving data is collected but intentionally ignored for wear calculation — estimation starts clean from the anchor odometer.
        </p>
      </div>

      {/* Data Flow */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Data Flow</h2>
        <ol className="list-decimal list-inside space-y-1 mb-3">
          <li className={li}>Trip finalized → HF enrichment → Driving Impact Engine V1 computes trip impact</li>
          <li className={li}>Trip-level rows are persisted in <code className={code}>TripDrivingImpact</code>; rolling aggregate remains in <code className={code}>VehicleDrivingImpactCurrent</code></li>
          <li className={li}>Brake Health V2 accumulates wear per trip since anchor (canonical path)</li>
          <li className={li}>Rolling aggregate is used only for uncovered odometer gap fallback, never retroactively for full anchor distance</li>
          <li className={li}>Recalculation computes per-axle pad mm, disc mm, health %, remaining km + modeled coverage metadata</li>
          <li className={li}>Results persisted in <code className={code}>BrakeHealthCurrent</code> (one row per vehicle)</li>
        </ol>
      </div>

      {/* Pad Model */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Pad Wear Model</h2>
        <p className={p}>
          <code className={code}>base_pad_wear = (anchor_pad_mm − 2.0) / 70 000</code>
        </p>
        <p className={p}>
          <code className={code}>effective_rate = base × (bias / default_bias) × usage × stopDensity × hardBrake × fullBraking × reku × k</code>
        </p>
        <h3 className={h3}>Pad Usage Factors (from DI Engine city/highway/country split)</h3>
        <table className="w-full mb-3"><thead><tr><th className={th}>Profile</th><th className={th}>Factor</th></tr></thead><tbody>
          <tr><td className={td}>City</td><td className={td}>1.35</td></tr>
          <tr><td className={td}>Highway</td><td className={td}>0.78</td></tr>
          <tr><td className={td}>Country Road</td><td className={td}>1.00</td></tr>
        </tbody></table>
        <h3 className={h3}>Reku Factors (Pads)</h3>
        <table className="w-full mb-3"><thead><tr><th className={th}>Powertrain</th><th className={th}>Factor</th></tr></thead><tbody>
          <tr><td className={td}>ICE (Gasoline/Diesel)</td><td className={td}>1.00</td></tr>
          <tr><td className={td}>Hybrid (HEV)</td><td className={td}>0.88</td></tr>
          <tr><td className={td}>Plug-in Hybrid (PHEV)</td><td className={td}>0.82</td></tr>
          <tr><td className={td}>Electric (EV)</td><td className={td}>0.72</td></tr>
        </tbody></table>
        <h3 className={h3}>Thresholds</h3>
        <p className={p}>Warning: ≤ 3.0 mm · Critical: ≤ 2.0 mm</p>
      </div>

      {/* Disc Model */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Disc Wear Model</h2>
        <p className={p}>
          <code className={code}>base_disc_wear = 2.0 / 90 000</code>
        </p>
        <p className={p}>
          <code className={code}>effective_rate = base × (bias / default_bias) × usage × highSpeedBrake × hardBrake × fullBraking × thermal × reku × k</code>
        </p>
        <h3 className={h3}>Disc-Specific Factors</h3>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li className={li}>High-speed brake factor: driven by <code className={code}>highSpeedBrakeShare</code> (0–5%→1.00 … &gt;20%→1.18)</li>
          <li className={li}>Thermal factor: interpolated from <code className={code}>thermalBrakeStressScore</code> (20→1.00 … 100→1.20)</li>
          <li className={li}>Reku: ICE=1.00, HEV=0.94, PHEV=0.90, EV=0.86</li>
        </ul>
        <h3 className={h3}>Thresholds</h3>
        <p className={p}>Max wear: 2.0 mm · Warning: anchor − 1.5 mm · Critical: anchor − 2.0 mm</p>
      </div>

      {/* Brake Bias */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Brake Bias</h2>
        <p className={p}>
          If <code className={code}>brakeForceFrontPercent</code> is available numerically → use it.
          Otherwise assume EBD default: front = 0.72, rear = 0.28.
        </p>
      </div>

      {/* Calibration */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>k-Factor Calibration</h2>
        <p className={p}>
          EMA update: <code className={code}>k_new = (1 − α) × k_old + α × target_k</code>
        </p>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li className={li}>α = 0.12 (1st measurement), 0.18 (2–3), 0.24 (4+)</li>
          <li className={li}>Pad k clamped [0.70 … 1.35]</li>
          <li className={li}>Disc k clamped [0.75 … 1.30]</li>
        </ul>
      </div>

      {/* Confidence */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Confidence Scoring (0–100)</h2>
        <table className="w-full mb-3"><thead><tr><th className={th}>Component</th><th className={th}>Points</th></tr></thead><tbody>
          {[
            ['Pad anchors', '+20'], ['Rotor anchors', '+10'], ['Service events', '+12'],
            ['Driving Impact data', '+15'], ['Braking metrics', '+10'], ['Usage data', '+8'],
            ['Odometer available', '+10'], ['Measurement exists', '+8'], ['Calibration stabilized', '+5'],
          ].map(([c, pts]) => <tr key={c}><td className={td}>{c}</td><td className={td}>{pts}</td></tr>)}
        </tbody></table>
        <p className={p}>
          Labels: ≥ 80 → High · 55–79 → Medium · &lt; 55 → Low. Coverage quality (trip coverage ratio + modeled trip count) can add or subtract confidence; rolling-gap-only estimates are explicitly downgraded.
        </p>
      </div>

      {/* Set-Level Health */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Set-Level Health</h2>
        <p className={p}>
          <code className={code}>pads_health = 0.60 × min(front, rear) + 0.40 × avg(front, rear)</code>
        </p>
        <p className={p}>Same formula for discs. Estimated remaining km = min(front_km, rear_km).</p>
      </div>

      {/* Alerts */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Alerts</h2>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li className={li}>Pad ≤ 3.0 mm → warning · ≤ 2.0 mm → critical</li>
          <li className={li}>Disc at warning / critical threshold → warning / critical</li>
          <li className={li}>Remaining km ≤ 3000 → warning · ≤ 1000 → critical</li>
          <li className={li}>High brake stress (brakingStressScore &gt; 70) → warning</li>
          <li className={li}>Low confidence (&lt; 55) → info</li>
        </ul>
      </div>

      {/* Driving Impact Integration */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Driving Impact Engine V1 Integration</h2>
        <p className={p}>
          Brake Health consumes trip-level metrics from <code className={code}>TripDrivingImpact</code> since anchor. The rolling aggregate
          <code className={code}>VehicleDrivingImpactCurrent</code> is only a controlled fallback for uncovered distance.
        </p>
        <ul className="list-disc list-inside space-y-1 mb-3">
          <li className={li}><code className={code}>brakingStressScore</code> — general braking stress score</li>
          <li className={li}><code className={code}>stopGoStressScore</code> — stop-and-go traffic stress</li>
          <li className={li}><code className={code}>highSpeedStressScore</code> — high-speed braking stress</li>
          <li className={li}><code className={code}>thermalBrakeStressScore</code> — thermal load on discs</li>
          <li className={li}><code className={code}>hardBrakePer100Km</code>, <code className={code}>fullBrakingPer100Km</code>, <code className={code}>brakesPer100Km</code></li>
          <li className={li}><code className={code}>stopDensity</code>, <code className={code}>highSpeedBrakeShare</code>, <code className={code}>meanBrakeEnergyPerKm</code></li>
          <li className={li}><code className={code}>citySharePct</code>, <code className={code}>highwaySharePct</code>, <code className={code}>countryRoadSharePct</code> — for usage factor</li>
        </ul>
      </div>

      {/* Known Limitations */}
      <div className={CARD(d) + ' p-6'}>
        <h2 className={h2}>Known Limitations</h2>
        <ul className="list-disc list-inside space-y-1">
          <li className={li}>No per-wheel tracking — model is achsweise (front/rear)</li>
          <li className={li}>No estimation without brake service anchor — by design</li>
          <li className={li}>Disc thickness is rotor WIDTH, not diameter</li>
          <li className={li}>Pre-anchor braking data is intentionally ignored for wear calculation</li>
          <li className={li}>Low trip-impact coverage reduces confidence and can require rolling-gap fallback warnings</li>
        </ul>
      </div>
    </div>
  );
}

// ── Tire Health V2 section ──────────────────────────────────────────

function TireHealthSection({ d }: { d: boolean }) {
  const h2 = `text-base font-bold mb-3 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const h3 = `text-sm font-semibold mb-2 ${d ? 'text-neutral-300' : 'text-gray-700'}`;
  const p = `text-sm leading-relaxed mb-3 ${d ? 'text-neutral-400' : 'text-gray-600'}`;
  const code = (t: string) => <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${d ? 'surface-premium text-amber-400' : 'bg-gray-100 text-amber-700'}`}>{t}</code>;
  const mono = `text-xs font-mono ${d ? 'text-amber-400' : 'text-amber-700'}`;

  return (
    <div className="space-y-6">
      <div className={`${CARD(d)} p-6`}>
        <h2 className={h2}>Tire Health Tracking Module V2</h2>
        <p className={p}>
          Production-ready, deterministic, rule-based tire wear model with a canonical lifecycle/write pipeline.
          Uses the <strong>Driving Impact Engine V1</strong> as the normalized behavior and usage source, supports
          multiple tire sets, per-tire tracking, staggered setups, season-aware thresholds, and adaptive k-factor
          calibration from measurements.
        </p>
        <p className={p}>
          The module does NOT duplicate telemetry polling, trip detection, or DI normalization. It consumes those shared
          layers, applies tire-specific wear math, and exposes an operational read model
          ({code('remaining%')}, {code('remainingKm')}, {code('actionState')}, {code('measurementState')},
          {code('pressureContext')}, {code('dataQualityWarnings')}).
        </p>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Data Flow</h3>
        <div className="space-y-1">
          {[
            'Lifecycle command (install / rotate / replace / activate-stored / record-measurement) enters TireLifecycleService',
            '→ Canonical write path persists setup/measurement/event/history and triggers recalculate',
            '→ TireWearModelService.computeWearAnalysis() reads ACTIVE setup + DI + telemetry pressure freshness',
            '→ Effective wear computed with model factors (axle/usage/behavior/temp/pressure/load/season/regen/k/interaction)',
            '→ Read model adds actionState + measurementState + confidence overlay + pressure/data warnings',
          ].map((step, i) => (
            <div key={i} className={`flex items-start gap-2 ${p}`}>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${d ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>{i + 1}</span>
              <span className="text-xs">{step}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Wear Formula (spec §15)</h3>
        <div className={`${d ? 'surface-premium' : 'bg-gray-50'} rounded-lg p-4 text-xs font-mono leading-relaxed space-y-1`}>
          <div className={d ? 'text-amber-400' : 'text-amber-700'}>base_wear_mm_per_km = usable_tread / expected_life_km</div>
          <div className={d ? 'text-amber-400' : 'text-amber-700'}>effective_wear = base × axleFactor × usageFactor × behaviorFactor × temperatureFactor × pressureFactor × loadFactor × seasonMismatchFactor × regenFactor × kFactor × interactionPenalty</div>
          <div className={d ? 'text-amber-400' : 'text-amber-700'}>estimated_tread = anchor_tread - (distance_since_anchor × effective_wear)</div>
          <div className={d ? 'text-amber-400' : 'text-amber-700'}>health% = (estimated_tread - replaceThreshold) / (initial_tread - replaceThreshold) × 100</div>
          <div className={d ? 'text-amber-400' : 'text-amber-700'}>set_health = 0.55 × min(tire%) + 0.45 × avg(tire%)</div>
        </div>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Factor Details</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { label: 'Axle Factor', desc: 'dampedLoadFactor × drivetrainBias × steeringBias, clamped [0.88..1.22]. Uses driveType (FWD/RWD/AWD) and optional frontWeightDistributionPct.' },
            { label: 'Usage Factor', desc: 'From DI Engine: city×1.12 + highway×0.95 + country×1.03, clamped [0.93..1.15].' },
            { label: 'Behavior Factor', desc: 'From DI Engine: 0.50×longitudinalStress + 0.35×brakingStress + 0.15×drivingStyle → piecewise-linear anchor curve → factor, clamped [0.97..1.35].' },
            { label: 'Temperature Factor', desc: 'Trip-start temp bands: <0°C→1.03, 0–5→1.02, 5–28→1.00, 28–35→1.03, >35→1.06.' },
            { label: 'k-Factor (Calibration)', desc: 'EMA from measurements: α=0.12 (1st), 0.18 (2–3), 0.24 (4+). Clamped [0.75..1.30]. Skips if predictedWear < 0.3 mm.' },
            { label: 'Regen Factor', desc: 'EV/PHEV only. Positional: FWD→front=0.80, AWD→both=0.84. ICE=1.0.' },
          ].map(f => (
            <div key={f.label} className={`${d ? 'surface-premium' : 'bg-gray-50'} rounded-lg p-3`}>
              <div className={`text-xs font-bold mb-1 ${d ? 'text-amber-400' : 'text-amber-700'}`}>{f.label}</div>
              <div className={`text-[11px] leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-600'}`}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Confidence Scoring (base points + pressure freshness overlay)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {[
            ['Initial tread exists', '+20'], ['Tire size complete', '+10'], ['Brand/model exists', '+8'],
            ['Load/speed index', '+6'], ['DOT exists', '+4'], ['Odometer consistent', '+12'],
            ['DI usage split', '+10'], ['DI behavior data', '+10'], ['≥500 km observed', '+5'],
            ['≥2000 km observed', '+5'], ['≥1 measurement', '+5'], ['≥2 measurements', '+5'],
            ['k-factor stabilized', '+5'], ['Pressure freshness/completeness', '+3'],
          ].map(([label, pts]) => (
            <div key={label} className={`flex justify-between ${d ? 'surface-premium' : 'bg-gray-50'} rounded px-2 py-1`}>
              <span className={d ? 'text-neutral-400' : 'text-gray-600'}>{label}</span>
              <span className={`font-bold ${d ? 'text-amber-400' : 'text-amber-700'}`}>{pts}</span>
            </div>
          ))}
        </div>
        <p className={`${p} mt-3`}>≥80 = High confidence, 55–79 = Medium, {'<'}55 = Low (measurement recommended).</p>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Health Status Thresholds</h3>
        <div className="grid grid-cols-5 gap-2 text-xs text-center">
          {[
            { label: 'Excellent', range: '≥85%', color: 'text-emerald-400' },
            { label: 'Good', range: '70–84%', color: 'text-status-info' },
            { label: 'Moderate', range: '50–69%', color: 'text-amber-400' },
            { label: 'Poor', range: '25–49%', color: 'text-orange-400' },
            { label: 'Replace', range: '<25% or ≤threshold', color: 'text-red-400' },
          ].map(h => (
            <div key={h.label} className={`${d ? 'surface-premium' : 'bg-gray-50'} rounded p-2`}>
              <div className={`font-bold ${h.color}`}>{h.label}</div>
              <div className={d ? 'text-neutral-500' : 'text-muted-foreground'}>{h.range}</div>
            </div>
          ))}
        </div>
        <p className={`${p} mt-3`}>Replace thresholds are season-aware: summer=3.0mm, winter=4.0mm, all-season=3.0mm.</p>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Alerts</h3>
        <div className="space-y-1 text-xs">
          {[
            'CRITICAL_TREAD: tread ≤ replace threshold',
            'LOW_TREAD: tread ≤ threshold + 0.3mm',
            'CRITICAL_REMAINING_KM: ≤1000 km remaining',
            'LOW_REMAINING_KM: ≤3000 km remaining',
            'UNEVEN_WEAR_ATTENTION: L/R delta ≥ 0.6mm',
            'UNEVEN_WEAR_CRITICAL: L/R delta ≥ 1.0mm',
            'AXLE_WEAR_IMBALANCE: front/rear delta ≥ 1.2mm',
            'ROTATION_OVERDUE: ≥15000 km since last rotation',
            'ROTATION_RECOMMENDED: ≥12000 km + ≥0.8mm axle delta',
            'LOW_CONFIDENCE: confidence < 55',
          ].map(a => <div key={a} className={d ? 'text-neutral-400' : 'text-gray-600'}>• {a}</div>)}
        </div>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Rotation Review Logic</h3>
        <p className={p}>
          Rotation is NOT modeled as a fixed hard interval. Review thresholds: {code('normalReviewKm=12000')},{' '}
          {code('urbanHeavyReviewKm=10000')}, {code('overdueKm=15000')}. Recommendation requires both km threshold
          AND wear imbalance (≥0.8mm axle delta) — except overdue which triggers at 15000 km regardless. Staggered setups
          only recommend rotation if a valid template exists ({code('side_swap_only')}, {code('same_axle_swap')}).
        </p>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Tire Config Reference</h3>
        <p className={p}>
          All values are centralized in {code('tire-health.config.ts')} and documented here. No scattered literals.
        </p>
        <div className="grid md:grid-cols-2 gap-3 text-xs">
          {[
            { cat: 'Replace Thresholds', items: 'Summer=3.0, Winter=4.0, AllSeason=3.0, Track=3.0' },
            { cat: 'Expected Life', items: 'Summer=40k, Winter=30k, AllSeason=35k, Perf=28k, Van=40k, Taxi=25k' },
            { cat: 'Usage Factors', items: 'city=1.12, highway=0.95, country=1.03' },
            { cat: 'Temp Factors', items: '<0°C=1.03, 0–5=1.02, 5–28=1.00, 28–35=1.03, >35=1.06' },
            { cat: 'Factor Caps', items: 'axle[0.88..1.22], usage[0.93..1.15], behavior[0.97..1.35]' },
            { cat: 'Calibration', items: 'k∈[0.75..1.30], α=0.12/0.18/0.24, minWear=0.3mm' },
            { cat: 'Rotation Review', items: 'normal=12000km, urbanHeavy=10000km, overdue=15000km' },
            { cat: 'Uneven Wear', items: 'attention=0.6mm, critical=1.0mm, axle=1.2mm' },
          ].map(c => (
            <div key={c.cat} className={`${d ? 'surface-premium' : 'bg-gray-50'} rounded p-2`}>
              <div className={`font-bold mb-0.5 ${d ? 'text-amber-400' : 'text-amber-700'}`}>{c.cat}</div>
              <div className={d ? 'text-neutral-400' : 'text-gray-500'}>{c.items}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD(d)} p-6`}>
        <h3 className={h3}>Known Limitations & Extension Strategy</h3>
        <div className="space-y-1 text-xs">
          {[
            'No cornering stress score yet (requires lateral telemetry not available from DIMO)',
            'Pressure signals are used conservatively: stale/incomplete pressure falls back to neutral wear factor',
            'Temperature factor uses trip-start temp only (no mid-trip temperature tracking)',
            'Regression model requires ≥8 data points — most vehicles will use formula-only initially',
            'ML-ready: anchor + factor architecture makes it straightforward to replace factors with learned models',
          ].map(l => <div key={l} className={d ? 'text-neutral-400' : 'text-gray-600'}>• {l}</div>)}
        </div>
      </div>
    </div>
  );
}

// ── Driving Impact Engine section ───────────────────────────────────

function DrivingImpactSection({ d }: { d: boolean }) {
  const h2 = `text-sm font-semibold mb-1 ${d ? 'text-neutral-200' : 'text-gray-800'}`;
  const p = `text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`;
  const mono = `text-[11px] font-mono ${d ? 'text-orange-400' : 'text-orange-600'}`;
  const code = (s: string) => (
    <code className={`px-1 py-0.5 rounded ${d ? 'surface-premium' : 'bg-gray-100'} ${mono}`}>
      {s}
    </code>
  );
  const badge = (label: string, color: string) => (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${color} mr-1 mb-1`}>
      {label}
    </span>
  );
  const section = (title: string, content: React.ReactNode) => (
    <div className={`${CARD(d)} p-5`}>
      <h3 className={h2}>{title}</h3>
      {content}
    </div>
  );

  return (
    <div className="space-y-3">

      {section('Purpose & Position', (
        <>
          <p className={p}>
            The <strong>Driving Impact Engine V1</strong> is a shared backend normalization layer — not a
            customer-facing health score module. It sits between HF post-trip enrichment and the Tire Health /
            Brake Health modules, providing a single normalized view of driving behavior that both can consume
            without duplicating logic.
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {badge('Shared Layer', d ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700')}
            {badge('Backend Only', d ? 'bg-neutral-700 text-neutral-300' : 'bg-gray-200 text-gray-600')}
            {badge('Trip-Finalized Only', d ? 'bg-neutral-700 text-neutral-300' : 'bg-gray-200 text-gray-600')}
            {badge('No New Telemetry Polling', d ? 'bg-neutral-700 text-neutral-300' : 'bg-gray-200 text-gray-600')}
          </div>
        </>
      ))}

      {section('Pipeline Position', (
        <div className={`mt-2 text-xs space-y-1 ${d ? 'text-neutral-400' : 'text-gray-500'} font-mono`}>
          {[
            'Trip finalized (TripStatus.COMPLETED)',
            '→ HF enrichment (trip.behavior.enrichment queue)',
            '→ TripBehaviorEvent rows persisted, VehicleTrip counts updated',
            '→ DrivingImpactProcessor triggered (trip.driving-impact.compute queue)',
            '→ DrivingImpactService.computeForTrip()',
            '→ TripDrivingImpact row persisted',
            '→ VehicleDrivingImpactCurrent rolling aggregate updated',
            '→ Tire Health V2 / Brake Health V2 read from these tables',
          ].map((step, i) => (
            <div key={i} className={step.startsWith('→') ? 'pl-4' : ''}>{step}</div>
          ))}
        </div>
      ))}

      {section('Inputs', (
        <div className="mt-2 space-y-3">
          <div>
            <div className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>From VehicleTrip</div>
            <div className="flex flex-wrap gap-1">
              {['distanceKm', 'citySharePercent', 'highwaySharePercent', 'countrySharePercent',
                'hardAccelerationCount', 'hardBrakingCount', 'fullBrakingCount',
                'kickdownCount', 'brakingEventCount'].map(f => (
                <span key={f} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${d ? 'surface-premium text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div className={`text-[11px] font-semibold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>From TripBehaviorEvent (queried)</div>
            <div className="flex flex-wrap gap-1">
              {['EXTREME classification counts', 'LAUNCH_CONTROL event count',
                'peakValue (peakDecelMs2)', 'startSpeedKmh', 'endSpeedKmh'].map(f => (
                <span key={f} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${d ? 'surface-premium text-neutral-300' : 'bg-gray-100 text-gray-600'}`}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {section('Computed Outputs — Per Trip', (
        <div className="mt-2 space-y-3 text-xs">
          <div>
            <div className={`font-semibold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>Usage Split</div>
            <p className={p}>{code('citySharePct')} · {code('highwaySharePct')} · {code('countryRoadSharePct')} (inherited from VehicleTrip)</p>
          </div>
          <div>
            <div className={`font-semibold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>Per-100 km Event Rates</div>
            <p className={p}>{code('hardAccelPer100Km')} · {code('extremeAccelPer100Km')} · {code('hardBrakePer100Km')} · {code('extremeBrakePer100Km')} · {code('fullBrakingPer100Km')} · {code('kickdownPer100Km')} · {code('launchLikePer100Km')} · {code('brakesPer100Km')}</p>
          </div>
          <div>
            <div className={`font-semibold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>Braking Statistics (from event rows)</div>
            <p className={p}>{code('p95NegativeDecel')} (m/s²) · {code('highSpeedBrakeShare')} (0–1, above 80 km/h) · {code('stopDensity')} (stops/km, endSpeed &lt; 5 km/h) · {code('meanBrakeEnergyPerKm')} (0.5×Δv² per km, m²/s²/km)</p>
          </div>
          <div>
            <div className={`font-semibold mb-1 ${d ? 'text-neutral-300' : 'text-gray-700'}`}>Stress Scores (0–100 each)</div>
            <div className="space-y-1">
              {[
                ['longitudinalStressScore', '1.0×hardAccelPer100 + 1.8×extremeAccelPer100 + 1.2×kickdownPer100 + 2.0×launchLikePer100 → cap at 20 raw'],
                ['brakingStressScore', '1.0×hardBrakePer100 + 1.8×extremeBrakePer100 + 2.2×fullBrakingPer100 + 0.4×brakesPer100 + 0.8×p95Decel → cap at 30 raw'],
                ['stopGoStressScore', '0.40×cityFactor + 0.35×stopDensityFactor + 0.25×brakesFactor (all 0–1 saturated)'],
                ['highSpeedStressScore', '0.50×highwayFactor + 0.50×highSpeedBrakeShare'],
                ['thermalBrakeStressScore', '0.30×highSpeedBrakeShare + 0.30×fullBrakingFactor + 0.25×energyFactor + 0.15×p95Factor'],
                ['drivingStyleScore', '0.30×longitudinal + 0.35×braking + 0.20×stopGo + 0.15×highSpeed'],
              ].map(([name, formula]) => (
                <div key={name} className={`${d ? 'surface-premium' : 'bg-gray-50'} rounded px-3 py-2`}>
                  <div className={mono}>{name}</div>
                  <div className={`text-[10px] mt-0.5 ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>{formula}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {section('Rolling Aggregate — VehicleDrivingImpactCurrent', (
        <div className="mt-2 space-y-2 text-xs">
          <p className={p}>
            After each trip impact row is persisted, {code('VehicleDrivingImpactCurrent')} is upserted
            (one row per vehicle) with distance-weighted averages of all metrics across the last{' '}
            <strong>30 days</strong> of trips. This is the table Tire Health V2 and Brake Health V2 read from.
          </p>
          <p className={p}>
            If a vehicle has fewer than 30 days of data, all available trips are included.
            Distance-weighting ensures long highway trips don't get diluted by many short urban trips.
          </p>
          <div className={`${d ? 'surface-premium' : 'bg-gray-50'} rounded px-3 py-2 font-mono text-[10px] ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
            windowDays · windowStartedAt · windowEndedAt · distanceKmWindow · [all metric columns]
          </div>
        </div>
      ))}

      {section('Consumer Contract', (
        <div className="mt-2 space-y-4 text-xs">
          <div>
            <div className={`font-semibold mb-1 ${d ? 'text-orange-400' : 'text-orange-600'}`}>Tire Health V2 reads</div>
            <div className="flex flex-wrap gap-1">
              {['citySharePct', 'highwaySharePct', 'countryRoadSharePct',
                'longitudinalStressScore', 'brakingStressScore', 'drivingStyleScore'].map(f => (
                <span key={f} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${d ? 'surface-premium text-orange-300' : 'bg-orange-50 text-orange-700'}`}>{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div className={`font-semibold mb-1 ${d ? 'text-orange-400' : 'text-orange-600'}`}>Brake Health V2 reads</div>
            <div className="flex flex-wrap gap-1">
              {['brakingStressScore', 'stopGoStressScore', 'highSpeedStressScore',
                'thermalBrakeStressScore', 'hardBrakePer100Km', 'fullBrakingPer100Km',
                'brakesPer100Km', 'stopDensity', 'highSpeedBrakeShare',
                'meanBrakeEnergyPerKm', 'p95NegativeDecel'].map(f => (
                <span key={f} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${d ? 'surface-premium text-orange-300' : 'bg-orange-50 text-orange-700'}`}>{f}</span>
              ))}
            </div>
          </div>
          <p className={p}>
            Access via {code('DrivingImpactService.getVehicleImpactForTire(vehicleId)')} and
            {' '}{code('DrivingImpactService.getVehicleImpactForBrake(vehicleId)')} — both return typed DTOs.
            The engine does NOT know about tire rotation, brake pad thickness, or wear thresholds.
            Those remain in their respective health modules.
          </p>
        </div>
      ))}

      {section('Data Quality & Safety', (
        <div className="mt-2 space-y-2 text-xs">
          <p className={p}>
            <strong>Minimum trip distance:</strong> 2 km. Shorter trips are skipped — per-100 km rates become
            unstable at very short distances. Skipped trips are logged; pipeline continues normally.
          </p>
          <p className={p}>
            <strong>Missing HF data:</strong> If TripBehaviorEvent has no rows for the trip (e.g. DIMO returned
            no HF points), extreme counts, p95, and braking metrics default to 0. Scores will be low but valid.
          </p>
          <p className={p}>
            <strong>Idempotency:</strong> {code('TripDrivingImpact')} uses upsert on {code('tripId')} — safe to
            re-run if the job is retried. Rolling aggregate is always recomputed from persisted rows.
          </p>
          <p className={p}>
            <strong>Formula traceability:</strong> {code('modelVersion')} ({code('v1.0.0')}) is persisted in both
            tables. Bump {code('DRIVING_IMPACT_CONFIG.MODEL_VERSION')} in {code('driving-impact.config.ts')} when
            weights change.
          </p>
        </div>
      ))}

      {section('Config Reference (driving-impact.config.ts)', (
        <div className={`mt-2 ${d ? 'surface-premium' : 'bg-gray-50'} rounded px-3 py-2 font-mono text-[10px] leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
          <div>ROLLING_WINDOW_DAYS: 30</div>
          <div>MINIMUM_RELIABLE_TRIP_KM: 2</div>
          <div>HIGH_SPEED_BRAKE_THRESHOLD_KMH: 80</div>
          <div>STOP_SPEED_THRESHOLD_KMH: 5</div>
          <div>LONGITUDINAL_RAW_MAX: 20 · BRAKING_RAW_MAX: 30</div>
          <div>STOP_DENSITY_REFERENCE: 3/km · BRAKES_PER_100_REFERENCE: 30</div>
          <div>BRAKE_ENERGY_REFERENCE: 500 m²/s²/km · P95_DECEL_REFERENCE: 9 m/s²</div>
        </div>
      ))}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────

function OverviewSection({ d }: { d: boolean }) {
  return (
    <div className="space-y-3">
      <div className={`${CARD(d)} p-5`}>
        <h3 className={`text-sm font-semibold mb-2 ${d ? 'text-neutral-200' : 'text-gray-800'}`}>Health Tracking Module</h3>
        <p className={`text-xs leading-relaxed ${d ? 'text-neutral-400' : 'text-gray-500'}`}>
          The Health Tracking module provides physics-based, data-driven health assessments for vehicle components.
          It is designed to integrate passively into existing data streams — no new schedulers, no additional DIMO API load beyond
          what the existing workers already produce.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { name: 'Battery (LV)', status: 'Live', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { name: 'Error Codes', status: 'Live', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { name: 'Driving Impact Engine', status: 'Live', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { name: 'Tires', status: 'Live', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { name: 'Brakes', status: 'Live', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map((m) => (
          <div key={m.name} className={`${CARD(d)} p-4 text-center`}>
            <div className={`text-sm font-bold mb-1 ${d ? 'text-neutral-200' : 'text-gray-700'}`}>{m.name}</div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}>{m.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Root component ──────────────────────────────────────────────────

export function HealthTrackingView({ isDarkMode }: HealthTrackingViewProps) {
  const [active, setActive] = useState<Section>('overview');
  const d = isDarkMode;
  const activeSec = SECTIONS.find((s) => s.id === active)!;

  const renderContent = () => {
    switch (active) {
      case 'overview': return <OverviewSection d={d} />;
      case 'battery': return <BatterySection d={d} />;
      case 'error-codes': return <ErrorCodesSection d={d} />;
      case 'driving-impact': return <DrivingImpactSection d={d} />;
      case 'tires': return <TireHealthSection d={d} />;
      case 'brakes': return <BrakeHealthSection d={d} />;
    }
  };

  return (
    <div className="flex h-full gap-6">
      {/* Left nav */}
      <nav className={`w-52 shrink-0 ${CARD(d)} p-2 self-start sticky top-4`}>
        <div className="px-3 pt-2 pb-3">
          <span className={`text-xs font-bold uppercase tracking-widest ${d ? 'text-neutral-500' : 'text-muted-foreground'}`}>Health Tracking</span>
        </div>
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = sec.id === active;
          return (
            <button
              key={sec.id}
              onClick={() => setActive(sec.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-sm transition-all ${
                isActive
                  ? d ? 'surface-premium text-white' : 'bg-gray-100 text-gray-900'
                  : d ? 'text-neutral-400 hover:surface-premium hover:text-neutral-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className={isActive ? (d ? 'text-cyan-400' : 'text-brand') : ''} />
                <span className="font-medium text-[13px] truncate">{sec.label}</span>
              </div>
              {sec.status === 'live' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">LIVE</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="mb-5 flex items-center gap-3">
          <h2 className={`text-xl font-bold ${d ? 'text-neutral-100' : 'text-gray-900'}`}>{activeSec.label}</h2>
          {activeSec.status === 'live' && (
            <span className={BADGE('bg-emerald-500/15 text-emerald-500')}>Live</span>
          )}
          {activeSec.status === 'placeholder' && (
            <span className={BADGE('bg-amber-500/15 text-amber-500')}>Placeholder</span>
          )}
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
