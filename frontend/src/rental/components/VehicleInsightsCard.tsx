import { useState, useEffect } from 'react';
import {
  api,
  type TireHealthSummaryResponse,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
  type OilChangeStatus,
  type BrakeHealthSummary,
} from '../../lib/api';
import {
  deriveInsights,
  readinessColors,
  costOutlookColors,
  downtimeRiskColors,
} from './vehicle-insights-logic';
import {
  type PlanningItem,
  planningUrgencyBorder,
  kmDisplayIsUrgent,
} from './vehicle-forecast-engine';

// ── Props ─────────────────────────────────────────────────────────────────────

interface VehicleInsightsCardProps {
  vehicleId: string | null;
  isDarkMode: boolean;
}

// ── Status column (vertical stack for horizontal 3-col layout) ────────────────

function StatusCol({
  label, dot, value, text, dm,
}: { label: string; dot: string; value: string; text: string; dm: boolean }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className={`text-[10px] font-medium leading-none ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className={`text-[11px] font-semibold leading-tight ${text}`}>{value}</span>
      </div>
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function Divider({ dm }: { dm: boolean }) {
  return (
    <div className={`mx-4 border-t mb-3 ${dm ? 'border-border/40' : 'border-border/60'}`} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VehicleInsightsCard({ vehicleId, isDarkMode }: VehicleInsightsCardProps) {
  const [tires, setTires] = useState<TireHealthSummaryResponse | null>(null);
  const [brakes, setBrakes] = useState<BrakeHealthSummary | null>(null);
  const [battery, setBattery] = useState<BatteryHealthSummary | null>(null);
  const [service, setService] = useState<ServiceInfoStatus | null>(null);
  const [oil, setOil] = useState<OilChangeStatus | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setTires(null); setBrakes(null); setBattery(null); setService(null);
      setOil(null); setDtcCount(0); setFetchedAt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
      api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
      api.vehicleIntelligence.batteryHealthSummary(vehicleId).catch(() => null),
      api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
      api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
      api.vehicleIntelligence.oilChangeStatus(vehicleId).catch(() => null),
    ]).then(([t, b, bat, svc, dtc, oilData]) => {
      if (cancelled) return;
      setTires(t); setBrakes(b); setBattery(bat); setService(svc);
      setOil(oilData);
      setDtcCount(Array.isArray(dtc) ? dtc.length : 0);
      setFetchedAt(new Date());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [vehicleId]);

  if (!vehicleId) return null;

  const dm = isDarkMode;
  const insights = deriveInsights({ tires, brakes, battery, service, dtcCount, oil });
  const { verdict, readiness, costOutlook, downtimeRisk, forecast, nextAction, confidence, hasAnyData } = insights;

  const rc = readinessColors(readiness);
  const cc = costOutlookColors(costOutlook);
  const dc = downtimeRiskColors(downtimeRisk);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">

      {/* ── A. Header — clean title + subtle timestamp, no icon, no separator ── */}
      <div className="flex items-center px-4 pt-4 pb-3">
        <h3 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>
          Vehicle Insights
        </h3>
        {loading ? (
          <span className={`ml-auto text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Loading…</span>
        ) : fetchedAt ? (
          <span className={`ml-auto text-[10px] tabular-nums ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            {fetchedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
      </div>

      <div className={`transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>

        {/* ── B. Verdict — typography-first; box only for genuine alerts ──────── */}
        <div className="px-4 pb-3">
          {hasAnyData ? (
            readiness === 'Action Needed' ? (
              // Only state that earns a full-color alert box
              <div className={`rounded-md px-3 py-2.5 text-[13px] leading-snug font-medium ${
                dm
                  ? 'bg-red-950/30 border border-red-800/30 text-red-300'
                  : 'bg-red-50 border border-red-200/60 text-red-800'
              }`}>
                {verdict}
              </div>
            ) : readiness === 'Limited' ? (
              // Subtle left-border accent — draws the eye without a box
              <div className={`border-l-2 border-orange-400 pl-3 py-0.5 text-[13px] leading-snug font-medium ${
                dm ? 'text-orange-200' : 'text-orange-900'
              }`}>
                {verdict}
              </div>
            ) : (
              // Ready / Monitor — bare text; status strip provides color signal
              <p className={`text-[13px] leading-snug font-medium ${dm ? 'text-gray-200' : 'text-gray-800'}`}>
                {verdict}
              </p>
            )
          ) : (
            <p className={`text-[13px] leading-snug ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
              No health tracking data configured for this vehicle.
            </p>
          )}
        </div>

        {/* ── C. Status strip — horizontal 3-col, no container box ─────────── */}
        {hasAnyData && (
          <>
            <div className="px-4 pb-3">
              <div className="grid grid-cols-3 gap-x-3">
                <StatusCol label="Rental Readiness" dot={rc.dot} value={readiness}    text={rc.text} dm={dm} />
                <StatusCol label="Cost Outlook"     dot={cc.dot} value={costOutlook}  text={cc.text} dm={dm} />
                <StatusCol label="Downtime Risk"    dot={dc.dot} value={downtimeRisk} text={dc.text} dm={dm} />
              </div>
            </div>
            <Divider dm={dm} />
          </>
        )}

        {/* ── D. Planning Horizon — bare list, urgency via border accent only ── */}
        <div className="px-4 mb-3">
          <span className={`block text-[10px] font-semibold uppercase tracking-wide mb-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Planning Horizon
          </span>

          {!hasAnyData ? (
            <p className={`text-[11px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
              Connect tracking data to see upcoming planning items.
            </p>
          ) : forecast.length > 0 ? (
            <div>
              {forecast.map((item: PlanningItem, i: number) => {
                const kmUrgent = kmDisplayIsUrgent(item.displayKm);
                const timeTextCls =
                  item.urgency === 'overdue' || item.urgency === 'due'
                    ? dm ? 'text-red-400' : 'text-red-600'
                    : item.urgency === 'soon'
                    ? dm ? 'text-amber-400' : 'text-amber-600'
                    : dm ? 'text-gray-500' : 'text-gray-400';
                return (
                  <div
                    key={`${item.type}-${i}`}
                    className={`flex items-center border-l-2 ${planningUrgencyBorder(item.urgency)} pl-3 py-1.5 ${
                      i < forecast.length - 1
                        ? `border-b ${dm ? 'border-border/40' : 'border-border/60'}`
                        : ''
                    }`}
                  >
                    {/* Event label */}
                    <span className={`text-[11px] font-medium flex-1 min-w-0 ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
                      {item.title}
                    </span>
                    {/* Distance · time — right-aligned, no-wrap */}
                    <div className="flex items-center gap-1 shrink-0 whitespace-nowrap ml-3">
                      {item.displayKm && (
                        <span className={`text-[10px] tabular-nums font-medium ${
                          kmUrgent
                            ? dm ? 'text-red-400' : 'text-red-600'
                            : dm ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                          {item.displayKm}
                        </span>
                      )}
                      {item.displayKm && item.displayTime && (
                        <span className={`text-[9px] ${dm ? 'text-gray-600' : 'text-gray-300'}`}>·</span>
                      )}
                      {item.displayTime && (
                        <span className={`text-[10px] tabular-nums font-medium ${timeTextCls}`}>
                          {item.displayTime}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`text-[11px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
              Nothing urgent within the next 5 months.
            </p>
          )}
        </div>

        {/* ── E. Next Action — labeled text row, no colored box ────────────── */}
        {hasAnyData && (
          <>
            <Divider dm={dm} />
            <div className="px-4 mb-3 flex items-baseline gap-2.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                Next
              </span>
              <span className={`text-[11px] leading-snug font-medium ${dm ? 'text-gray-200' : 'text-gray-800'}`}>
                {nextAction}
              </span>
            </div>
          </>
        )}

        {/* ── F. Confidence note — bare muted text, no icon, no italic ─────── */}
        <div className="px-4 pb-4">
          {hasAnyData && (
            <p className={`text-[10px] leading-snug ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
              {confidence}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
