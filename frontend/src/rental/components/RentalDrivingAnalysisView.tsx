import { useState, useEffect, useCallback } from 'react';
import {
  Car,
  User,
  Calendar,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Gauge,
  Shield,
  Sparkles,
  X,
  Filter,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

interface RentalDrivingAnalysisViewProps {
  isDarkMode: boolean;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  good: { bg: 'bg-green-500/10', text: 'text-green-700', border: 'border-green-500/30' },
  watch: { bg: 'bg-amber-500/10', text: 'text-amber-700', border: 'border-amber-500/30' },
  attention: { bg: 'bg-red-500/10', text: 'text-red-700', border: 'border-red-500/30' },
};

const LEVEL_COLORS_DARK: Record<string, { bg: string; text: string; border: string }> = {
  good: { bg: 'bg-green-500/10', text: 'text-green-300', border: 'border-green-500/30' },
  watch: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30' },
  attention: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/30' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function RentalDrivingAnalysisView({ isDarkMode }: RentalDrivingAnalysisViewProps) {
  const { orgId } = useRentalOrg();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number } | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [filterVehicle, setFilterVehicle] = useState<string>('');
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const loadList = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    api.rentalDrivingAnalyses
      .list(orgId, {
        page,
        limit: 20,
        vehicleId: filterVehicle || undefined,
        driverId: filterDriver || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      })
      .then((res: any) => {
        setList(Array.isArray(res?.data) ? res.data : []);
        setMeta(res?.meta ?? null);
      })
      .catch(() => {
        setList([]);
        setMeta(null);
      })
      .finally(() => setLoading(false));
  }, [orgId, page, filterVehicle, filterDriver, filterFrom, filterTo]);

  useEffect(() => {
    if (!orgId) return;
    api.vehicles.listByOrg(orgId, { limit: 200 }).then((r: any) => setVehicles(r?.data ?? r ?? [])).catch(() => setVehicles([]));
    api.customers.list(orgId).then((r: any) => setCustomers(Array.isArray(r) ? r : r?.data ?? [])).catch(() => setCustomers([]));
  }, [orgId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!orgId || !detailId) {
      setDetail(null);
      return;
    }
    api.rentalDrivingAnalyses.get(orgId, detailId).then(setDetail).catch(() => setDetail(null));
  }, [orgId, detailId]);

  const cardClass = `rounded-lg p-4 shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;

  const levelColors = isDarkMode ? LEVEL_COLORS_DARK : LEVEL_COLORS;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Rental Driving Analysis
          </h1>
          <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Stored driving analyses per completed rental period
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Filter className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Vehicle</label>
            <select
              value={filterVehicle}
              onChange={(e) => {
                setFilterVehicle(e.target.value);
                setPage(1);
              }}
              className={`w-full rounded-lg border px-3 py-2 text-xs ${
                isDarkMode ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              <option value="">All vehicles</option>
              {(vehicles as any[]).map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.vehicleName || `${v.make} ${v.model}`} {v.licensePlate ? `(${v.licensePlate})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Driver</label>
            <select
              value={filterDriver}
              onChange={(e) => {
                setFilterDriver(e.target.value);
                setPage(1);
              }}
              className={`w-full rounded-lg border px-3 py-2 text-xs ${
                isDarkMode ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}
            >
              <option value="">All drivers</option>
              {(customers as any[]).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setPage(1);
              }}
              className={`w-full rounded-lg border px-3 py-2 text-xs ${
                isDarkMode ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setPage(1);
              }}
              className={`w-full rounded-lg border px-3 py-2 text-xs ${
                isDarkMode ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className={cardClass}>
        {loading ? (
          <div className="py-12 text-center">
            <div className={`inline-block h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${isDarkMode ? 'border-indigo-400' : 'border-indigo-600'}`} />
            <p className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Loading analysesâ€¦</p>
          </div>
        ) : list.length === 0 ? (
          <div className={`py-12 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Sparkles className="w-5 h-5 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No rental driving analyses yet.</p>
            <p className="text-xs mt-1">Analyses are generated automatically when a booking is marked completed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((item: any) => {
              const payload = item.payload || {};
              const assessment = payload.overallAssessment || {};
              const behavior = payload.drivingBehavior || {};
              const styleScore = behavior.drivingStyleScore ?? item.drivingScore ?? null;
              const safetyScore = behavior.safetyScore ?? null;
              const level = (assessment.level || item.overallLevel || 'good') as string;
              const colors = levelColors[level] || levelColors.good;
              const driverName = item.driver ? `${item.driver.firstName} ${item.driver.lastName}` : 'â€â€ÂÂ';
              const vehicleLabel = item.vehicle ? `${item.vehicle.make} ${item.vehicle.model}` : 'â€â€ÂÂ';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDetailId(item.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-all hover:shadow-md ${colors.border} ${colors.bg} ${
                    isDarkMode ? 'hover:bg-neutral-800/50' : 'hover:bg-gray-50/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {formatDate(item.periodStart)} â€“ {formatDate(item.periodEnd)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Car className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{vehicleLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{driverName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${colors.text} ${colors.bg}`}>
                        {assessment.title || level}
                      </span>
                      {(styleScore != null || safetyScore != null) && (
                        <span className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          <Gauge className="w-3.5 h-3.5" />
                          {styleScore != null ? `Style ${Math.round(styleScore)}` : ''}
                          {safetyScore != null ? ` · Safety ${Math.round(safetyScore)}` : ''}
                        </span>
                      )}
                      <ChevronRight className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    </div>
                  </div>
                  {assessment.shortSummary && (
                    <p className={`mt-2 text-xs leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {assessment.shortSummary}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t pt-4 border-neutral-700">
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Page {meta.page} of {meta.totalPages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
                  isDarkMode ? 'bg-neutral-700 text-white' : 'bg-gray-200 text-gray-800'
                }`}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
                  isDarkMode ? 'bg-neutral-700 text-white' : 'bg-gray-200 text-gray-800'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setDetailId(null)}
          role="presentation"
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-8 shadow-2xl ${
              isDarkMode ? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className={`absolute top-4 right-5 p-1 rounded-full ${isDarkMode ? 'text-gray-500 hover:bg-neutral-800' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <X className="w-5 h-5" />
            </button>

            {detail ? (
              <RentalAnalysisDetailContent detail={detail} isDarkMode={isDarkMode} />
            ) : (
              <div className="py-8 text-center">Loadingâ€¦</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RentalAnalysisDetailContent({ detail, isDarkMode }: { detail: any; isDarkMode: boolean }) {
  const p = detail.payload || {};
  const assessment = p.overallAssessment || {};
  const driverStyle = p.driverStyle || {};
  const risk = p.riskAnalysis || {};
  const behavior = p.drivingBehavior || {};
  const eventSummary = p.eventSummary || {};
  const wear = p.wearImpactAssessment || {};
  const levelColors = isDarkMode ? LEVEL_COLORS_DARK : LEVEL_COLORS;
  const level = (assessment.level || 'good') as string;
  const colors = levelColors[level] || levelColors.good;

  const section = (title: string, children: React.ReactNode) => (
    <section className="mb-3">
      <h3 className={`text-base font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        {title}
      </h3>
      {children}
    </section>
  );

  return (
    <div className="pr-8">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-indigo-500/20' : 'bg-indigo-50'}`}>
          <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Rental Driving Analysis</h2>
          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {detail.vehicle?.make} {detail.vehicle?.model} â€¢ {detail.driver?.firstName} {detail.driver?.lastName} â€¢{' '}
            {formatDate(detail.periodStart)} â€“ {formatDate(detail.periodEnd)}
          </p>
        </div>
      </div>

      {section('Overall assessment', (
        <div className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
          <p className={`font-semibold ${colors.text}`}>{assessment.title}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{assessment.shortSummary}</p>
        </div>
      ))}

      {section('Driver style', (
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
          <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{driverStyle.label}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{driverStyle.summary}</p>
        </div>
      ))}

      {section('Risk analysis', (
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
          <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Level: {risk.level}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{risk.summary}</p>
          {risk.keyRisks?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {risk.keyRisks.map((k: string, i: number) => (
                <li key={i} className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                  {k}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {section('Driving behavior', (
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
          {(behavior.drivingStyleScore != null || behavior.drivingScore != null) && (
            <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Driving style score:{' '}
              <strong>{Math.round(behavior.drivingStyleScore ?? behavior.drivingScore)}</strong>
            </p>
          )}
          {behavior.safetyScore != null && (
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Safety score: <strong>{Math.round(behavior.safetyScore)}</strong>
            </p>
          )}
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{behavior.safetyStyle}</p>
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Acceleration: {behavior.accelerationBehavior?.summary} â€¢ Braking: {behavior.brakingBehavior?.summary}
          </p>
        </div>
      ))}

      {section('Event summary', (
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
          <div className="flex flex-wrap gap-3 text-xs">
            {eventSummary.drivingEventsCount != null && (
              <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Driving events: {eventSummary.drivingEventsCount}</span>
            )}
            {eventSummary.abuseDetectionCount != null && (
              <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Abuse signals: {eventSummary.abuseDetectionCount}</span>
            )}
            {eventSummary.errorCodeOccurred && (
              <span className="text-amber-600">Error code during period</span>
            )}
          </div>
          {eventSummary.eventHighlights?.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {eventSummary.eventHighlights.map((h: string, i: number) => (
                <li key={i} className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>â€¢ {h}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {section('Wear impact', (
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
          <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{wear.overallWearImpact}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{wear.summary}</p>
        </div>
      ))}

      {p.positiveSignals?.length > 0 && section('Positive signals', (
        <ul className="space-y-2">
          {p.positiveSignals.map((s: string, i: number) => (
            <li key={i} className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              {s}
            </li>
          ))}
        </ul>
      ))}

      {p.recommendations?.length > 0 && section('Recommendations', (
        <ul className="space-y-2">
          {p.recommendations.map((r: string, i: number) => (
            <li key={i} className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>â€¢ {r}</li>
          ))}
        </ul>
      ))}
    </div>
  );
}
