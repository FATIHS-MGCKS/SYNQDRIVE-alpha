import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp, TrendingDown, DollarSign, Car, Clock,
  Zap, AlertTriangle, ArrowUpRight, ArrowDownRight,
  BarChart3, Target, Lightbulb, ShieldAlert,
  Wrench, Calendar, Activity, Percent, Award
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend
} from 'recharts';

interface AnalyticsViewProps {
  isDarkMode: boolean;
}

type RevenueRow = { month: string; revenue: number; costs: number; profit: number };
type UtilizationRow = { day: string; utilization: number; bookings: number };
type CostBreakdownRow = { name: string; value: number; color: string };
type VehiclePerformanceRow = {
  model: string;
  license: string;
  revenue: number;
  utilization: number;
  profit: number;
  trend: 'up' | 'down';
};
type StationPerformanceRow = { station: string; revenue: number; vehicles: number; avgUtil: number };
type EfficiencyRadialRow = { name: string; value: number; fill: string };
type WeeklyStationBarRow = { day: string; Munich: number; Berlin: number; Hamburg: number };
type RecommendationRow = {
  title: string;
  desc: string;
  impact: string;
  icon: LucideIcon;
  priority: 'high' | 'medium' | 'low';
};
type RiskRow = {
  title: string;
  desc: string;
  severity: 'critical' | 'warning' | 'info';
  icon: LucideIcon;
};

const revenueData: RevenueRow[] = [];
const utilizationData: UtilizationRow[] = [];
const costBreakdownData: CostBreakdownRow[] = [];
const vehiclePerformance: VehiclePerformanceRow[] = [];
const stationPerformance: StationPerformanceRow[] = [];
const efficiencyRadial: EfficiencyRadialRow[] = [];
/** Weekly utilization by station (multi-series bar chart) */
const weeklyStationBarData: WeeklyStationBarRow[] = [];
const recommendations: RecommendationRow[] = [];
const risks: RiskRow[] = [];

export function AnalyticsView({ isDarkMode }: AnalyticsViewProps) {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | '6months'>('6months');

  const cardClass = `rounded-lg p-4 shadow-sm border transition-all duration-300 hover:shadow-md ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700'
      : 'bg-white border-gray-200'
  }`;

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';

  const efficiencyScoreOverall =
    efficiencyRadial.length > 0
      ? Math.round(efficiencyRadial.reduce((s, x) => s + x.value, 0) / efficiencyRadial.length)
      : null;

  const emptyBlockClass = `flex items-center justify-center text-sm ${textSecondary}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Fleet Analytics</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>Detaillierte Insights zu Effizienz, Profitabilitat und Optimierungspotenzial</p>
        </div>
        <div className={`flex items-center gap-1 p-1 rounded-lg border ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'}`}>
          {(['week', 'month', '6months'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                timeRange === range
                  ? isDarkMode
                    ? 'bg-blue-600/20 text-blue-400 shadow-sm'
                    : 'bg-blue-50 text-blue-600 shadow-sm'
                  : isDarkMode
                    ? 'text-gray-400 hover:text-gray-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {range === 'week' ? '7 Tage' : range === 'month' ? '30 Tage' : '6 Monate'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Gesamtumsatz', value: '€37.800', change: '+14.2%', trend: 'up', icon: DollarSign, color: 'blue', sub: 'vs. letzter Monat' },
          { label: 'Flottenauslastung', value: '81%', change: '+5.3%', trend: 'up', icon: Car, color: 'emerald', sub: 'Durchschnitt diese Woche' },
          { label: 'Umsatz pro Fahrzeug', value: '€3.780', change: '+8.1%', trend: 'up', icon: BarChart3, color: 'purple', sub: 'Monatsdurchschnitt' },
          { label: 'Kostenquote', value: '56.1%', change: '-2.4%', trend: 'down', icon: Percent, color: 'amber', sub: 'Kosten / Umsatz' },
        ].map((kpi) => (
          <div key={kpi.label} className={cardClass}>
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2.5 rounded-lg ${
                kpi.color === 'blue' ? 'bg-blue-100/80 text-blue-600' :
                kpi.color === 'emerald' ? 'bg-emerald-100/80 text-emerald-600' :
                kpi.color === 'purple' ? 'bg-purple-100/80 text-purple-600' :
                'bg-amber-100/80 text-amber-600'
              }`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                (kpi.trend === 'up' && kpi.label !== 'Kostenquote') || (kpi.trend === 'down' && kpi.label === 'Kostenquote')
                  ? 'bg-green-100/80 text-green-700'
                  : 'bg-red-100/80 text-red-700'
              }`}>
                {kpi.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {kpi.change}
              </div>
            </div>
            <p className={`text-xs font-bold ${textPrimary}`}>{kpi.value}</p>
            <p className={`text-xs mt-1 ${textSecondary}`}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue & Profit Chart + Cost Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`lg:col-span-2 ${cardClass}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Umsatz & Gewinn</h3>
              <p className={`text-xs ${textSecondary}`}>Monatliche Entwicklung der letzten 6 Monate</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className={`text-xs ${textSecondary}`}>Umsatz</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className={`text-xs ${textSecondary}`}>Gewinn</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <span className={`text-xs ${textSecondary}`}>Kosten</span>
              </div>
            </div>
          </div>
          {revenueData.length === 0 ? (
            <div className={`${emptyBlockClass} h-[280px]`}>Keine Umsatzdaten für diesen Zeitraum.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <defs key="analytics-area-defs">
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid key="analytics-area-grid" strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                <XAxis key="analytics-area-xaxis" dataKey="month" tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} />
                <YAxis key="analytics-area-yaxis" tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#fff',
                    border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`€${Number(value ?? 0).toLocaleString()}`, '']}
                />
                <Area key="area-revenue" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#colorRevenue)" name="Umsatz" />
                <Area key="area-costs" type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={1.5} fill="none" strokeDasharray="5 5" name="Kosten" />
                <Area key="area-profit" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.5} fill="url(#colorProfit)" name="Gewinn" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cost Breakdown Pie */}
        <div className={cardClass}>
          <h3 className={`text-base font-semibold mb-1 ${textPrimary}`}>Kostenaufschlusselung</h3>
          <p className={`text-xs mb-3 ${textSecondary}`}>Monatliche Betriebskosten</p>
          {costBreakdownData.length === 0 ? (
            <div className={`${emptyBlockClass} h-[200px]`}>Keine Kostendaten vorhanden.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPie>
                <Pie
                  data={costBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {costBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`€${Number(value ?? 0).toLocaleString()}`, '']} />
              </RechartsPie>
            </ResponsiveContainer>
          )}
          <div className="space-y-2 mt-2">
            {costBreakdownData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className={`text-xs ${textSecondary}`}>{item.name}</span>
                </div>
                <span className={`text-xs font-semibold ${textPrimary}`}>€{item.value.toLocaleString()}</span>
              </div>
            ))}
            {costBreakdownData.length > 0 && (
              <div className={`pt-2 mt-2 border-t flex justify-between ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                <span className={`text-xs font-semibold ${textPrimary}`}>Gesamt</span>
                <span className={`text-xs font-bold ${textPrimary}`}>€{costBreakdownData.reduce((s, i) => s + i.value, 0).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Utilization Chart + Efficiency Radial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`lg:col-span-2 ${cardClass}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Wochentliche Auslastung nach Standort</h3>
              <p className={`text-xs ${textSecondary}`}>Vergleich der Flottenauslastung in %</p>
            </div>
          </div>
          {weeklyStationBarData.length === 0 ? (
            <div className={`${emptyBlockClass} h-[240px]`}>Keine Auslastungsdaten nach Standort.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyStationBarData} barGap={4}>
                <CartesianGrid key="bar-grid" strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                <XAxis key="bar-xaxis" dataKey="day" tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis key="bar-yaxis" tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} axisLine={false} tickLine={false} />
                <Tooltip
                  key="bar-tooltip"
                  cursor={{ fill: isDarkMode ? '#374151' : '#f3f4f6', opacity: 0.4 }}
                  contentStyle={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#fff',
                    border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                />
                <Legend key="bar-legend" iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar key="bar-munich" dataKey="Munich" name="Munich Central" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar key="bar-berlin" dataKey="Berlin" name="Berlin Central" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar key="bar-hamburg" dataKey="Hamburg" name="Hamburg Hafen" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Efficiency Score */}
        <div className={cardClass}>
          <h3 className={`text-base font-semibold mb-1 ${textPrimary}`}>Effizienz-Score</h3>
          <p className={`text-xs mb-3 ${textSecondary}`}>Gesamtbewertung der Flottenleistung</p>
          <div className="flex flex-col items-center mb-3">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke={isDarkMode ? '#374151' : '#e5e7eb'} strokeWidth="8" />
                {efficiencyScoreOverall != null && (
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${efficiencyScoreOverall * 2.64} ${100 * 2.64}`} />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${textPrimary}`}>
                  {efficiencyScoreOverall != null ? efficiencyScoreOverall : '—'}
                </span>
                <span className={`text-xs ${textSecondary}`}>/ 100</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {efficiencyRadial.map((item) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs ${textSecondary}`}>{item.name}</span>
                  <span className={`text-xs font-semibold ${textPrimary}`}>{item.value}%</span>
                </div>
                <div className={`w-full h-1.5 rounded-full ${isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-200/80'}`}>
                  <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${item.value}%`, backgroundColor: item.fill }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vehicle Performance Table */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className={`text-base font-semibold ${textPrimary}`}>Fahrzeugleistung im Detail</h3>
            <p className={`text-xs ${textSecondary}`}>Umsatz, Auslastung und Profitabilitat pro Fahrzeug</p>
          </div>
          <div className="flex items-center gap-2">
            <Award className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
            <span className={`text-xs font-medium ${textSecondary}`}>Top Performer hervorgehoben</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                <th className={`text-left px-3 py-2 text-xs font-semibold ${textSecondary}`}>#</th>
                <th className={`text-left px-3 py-2 text-xs font-semibold ${textSecondary}`}>Fahrzeug</th>
                <th className={`text-left px-3 py-2 text-xs font-semibold ${textSecondary}`}>Kennzeichen</th>
                <th className={`text-right px-3 py-2 text-xs font-semibold ${textSecondary}`}>Umsatz</th>
                <th className={`text-right px-3 py-2 text-xs font-semibold ${textSecondary}`}>Auslastung</th>
                <th className={`text-right px-3 py-2 text-xs font-semibold ${textSecondary}`}>Gewinn</th>
                <th className={`text-right px-3 py-2 text-xs font-semibold ${textSecondary}`}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {vehiclePerformance.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`px-3 py-10 text-center text-xs ${textSecondary}`}>
                    Keine Fahrzeugdaten vorhanden.
                  </td>
                </tr>
              ) : (
                vehiclePerformance.map((v, i) => (
                  <tr key={v.license} className={`border-t ${isDarkMode ? 'border-neutral-700/30' : 'border-gray-100'} ${i < 3 ? isDarkMode ? 'bg-amber-900/5' : 'bg-amber-50/30' : ''}`}>
                    <td className={`px-3 py-2.5 text-xs font-medium ${i < 3 ? 'text-amber-500' : textTertiary}`}>
                      {i < 3 ? <Award className="w-5 h-5" /> : i + 1}
                    </td>
                    <td className={`px-3 py-2.5 text-xs font-medium ${textPrimary}`}>{v.model}</td>
                    <td className={`px-3 py-2.5 text-xs font-mono ${textSecondary}`}>{v.license}</td>
                    <td className={`px-3 py-2.5 text-xs font-semibold text-right ${textPrimary}`}>€{v.revenue.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className={`w-16 h-1.5 rounded-full ${isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-200/80'}`}>
                          <div className={`h-1.5 rounded-full ${v.utilization >= 85 ? 'bg-emerald-500' : v.utilization >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${v.utilization}%` }} />
                        </div>
                        <span className={`text-xs font-semibold ${textPrimary}`}>{v.utilization}%</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 text-xs font-semibold text-right text-emerald-600`}>€{v.profit.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      {v.trend === 'up' ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                          <TrendingUp className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-500">
                          <TrendingDown className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Station Performance */}
      <div className={cardClass}>
        <h3 className={`text-base font-semibold mb-1 ${textPrimary}`}>Standort-Performance</h3>
        <p className={`text-xs mb-3 ${textSecondary}`}>Umsatz und Auslastung nach Standort</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {stationPerformance.length === 0 ? (
            <div className={`col-span-full ${emptyBlockClass} py-10 rounded-lg border border-dashed ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-200/80'}`}>
              Keine Standortdaten vorhanden.
            </div>
          ) : (
            stationPerformance.map((s) => (
              <div key={s.station} className={`rounded-lg p-4 border ${
                isDarkMode ? 'bg-neutral-800/40 border-neutral-700/40' : 'bg-gray-50/80 border-gray-200/40'
              }`}>
                <p className={`text-xs font-semibold mb-2 ${textPrimary}`}>{s.station}</p>
                <p className={`text-base font-bold ${s.revenue > 0 ? 'text-blue-600' : textTertiary}`}>€{(s.revenue / 1000).toFixed(1)}k</p>
                <div className="flex items-center gap-2 mt-2">
                  <Car className={`w-3 h-3 ${textTertiary}`} />
                  <span className={`text-xs ${textSecondary}`}>{s.vehicles} Fzg.</span>
                  <span className={`text-xs font-semibold ${s.avgUtil >= 85 ? 'text-emerald-600' : s.avgUtil >= 70 ? 'text-blue-600' : s.avgUtil > 0 ? 'text-amber-600' : textTertiary}`}>{s.avgUtil}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* AI Insights - Recommendations & Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* What to improve */}
        <div className={`${cardClass} border-l-4 !border-l-emerald-500`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-100/80">
              <Lightbulb className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Empfehlungen</h3>
              <p className={`text-xs ${textSecondary}`}>Was Sie besser machen konnen</p>
            </div>
          </div>
          <div className="space-y-4">
            {recommendations.length === 0 && (
              <p className={`text-xs py-6 text-center ${textSecondary}`}>Keine Empfehlungen vorhanden.</p>
            )}
            {recommendations.map((item, i) => (
              <div key={i} className={`flex gap-3 p-3 rounded-lg border ${
                isDarkMode ? 'bg-neutral-800/30 border-neutral-700/30' : 'bg-white/60 border-gray-100'
              }`}>
                <div className={`p-2 rounded-lg h-fit ${
                  item.priority === 'high' ? 'bg-emerald-100/80 text-emerald-600' :
                  item.priority === 'medium' ? 'bg-blue-100/80 text-blue-600' :
                  'bg-gray-100/80 text-gray-500'
                }`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-xs font-semibold ${textPrimary}`}>{item.title}</p>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                      item.priority === 'high' ? 'bg-emerald-100 text-emerald-700' :
                      item.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {item.priority === 'high' ? 'Hoch' : item.priority === 'medium' ? 'Mittel' : 'Niedrig'}
                    </span>
                  </div>
                  <p className={`text-xs ${textSecondary} mb-1.5`}>{item.desc}</p>
                  <p className="text-xs font-semibold text-emerald-600">{item.impact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What to avoid */}
        <div className={`${cardClass} border-l-4 !border-l-red-500`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-100/80">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${textPrimary}`}>Risiken & Vermeidung</h3>
              <p className={`text-xs ${textSecondary}`}>Was Sie vermeiden sollten</p>
            </div>
          </div>
          <div className="space-y-4">
            {risks.length === 0 && (
              <p className={`text-xs py-6 text-center ${textSecondary}`}>Keine Risiken gemeldet.</p>
            )}
            {risks.map((item, i) => (
              <div key={i} className={`flex gap-3 p-3 rounded-lg border ${
                isDarkMode ? 'bg-neutral-800/30 border-neutral-700/30' : 'bg-white/60 border-gray-100'
              }`}>
                <div className={`p-2 rounded-lg h-fit ${
                  item.severity === 'critical' ? 'bg-red-100/80 text-red-600' :
                  item.severity === 'warning' ? 'bg-amber-100/80 text-amber-600' :
                  'bg-blue-100/80 text-blue-600'
                }`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-xs font-semibold ${textPrimary}`}>{item.title}</p>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                      item.severity === 'critical' ? 'bg-red-100 text-red-700' :
                      item.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {item.severity === 'critical' ? 'Kritisch' : item.severity === 'warning' ? 'Warnung' : 'Info'}
                    </span>
                  </div>
                  <p className={`text-xs ${textSecondary}`}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Box */}
          <div className={`mt-5 p-4 rounded-lg border-2 border-dashed ${
            isDarkMode ? 'border-neutral-600/50 bg-neutral-800/20' : 'border-gray-200 bg-gray-50/50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-blue-500" />
              <span className={`text-xs font-semibold ${textPrimary}`}>Zusammenfassung</span>
            </div>
            <p className={`text-xs ${textSecondary}`}>
              Zusammenfassungen und Handlungsempfehlungen erscheinen hier, sobald ausreichend Flottendaten und Analysen vorliegen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}