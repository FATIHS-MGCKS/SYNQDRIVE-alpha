import { CreditCard, TrendingUp, Building2, CheckCircle, AlertTriangle, DollarSign, FileText, Clock, ArrowUpRight, Download, Plus, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

interface SubscriptionsViewProps {
  isDarkMode: boolean;
}

const plans = [
  { name: 'Starter', price: 490, interval: '/mo', vehicles: 'Up to 25', features: ['Basic fleet tracking', 'Up to 3 users', 'Email support', 'Standard reports'], orgs: 8, color: 'from-gray-500 to-gray-600' },
  { name: 'Business', price: 990, interval: '/mo', vehicles: 'Up to 75', features: ['Advanced analytics', 'Up to 10 users', 'Priority support', 'Custom reports', 'API access'], orgs: 6, color: 'from-blue-500 to-indigo-600', popular: true },
  { name: 'Enterprise', price: 2490, interval: '/mo', vehicles: 'Unlimited', features: ['Full platform access', 'Unlimited users', 'Dedicated support', 'White-label', 'SLA guarantee', 'Custom integrations'], orgs: 3, color: 'from-purple-500 to-violet-600' },
];

const invoices = [
  { id: 'INV-2026-0342', org: 'AutoRent Berlin', amount: 2490, status: 'Paid', date: 'Mar 1, 2026', plan: 'Enterprise' },
  { id: 'INV-2026-0341', org: 'FleetPro Hamburg', amount: 2490, status: 'Paid', date: 'Mar 1, 2026', plan: 'Enterprise' },
  { id: 'INV-2026-0340', org: 'DriveNow Köln', amount: 990, status: 'Paid', date: 'Mar 1, 2026', plan: 'Business' },
  { id: 'INV-2026-0339', org: 'CarShare Munich', amount: 990, status: 'Overdue', date: 'Mar 1, 2026', plan: 'Business' },
  { id: 'INV-2026-0338', org: 'MobilityPlus Frankfurt', amount: 990, status: 'Paid', date: 'Mar 1, 2026', plan: 'Business' },
  { id: 'INV-2026-0337', org: 'AutoMobil Bremen', amount: 4200, status: 'Paid', date: 'Mar 1, 2026', plan: 'Custom' },
  { id: 'INV-2026-0336', org: 'RentACar Düsseldorf', amount: 990, status: 'Pending', date: 'Mar 1, 2026', plan: 'Business' },
  { id: 'INV-2026-0335', org: 'VeloFleet Leipzig', amount: 490, status: 'Paid', date: 'Mar 1, 2026', plan: 'Starter' },
];

export function SubscriptionsView({ isDarkMode }: SubscriptionsViewProps) {
  const [activeTab, setActiveTab] = useState<'plans' | 'invoices'>('plans');

  const cardClass = `rounded-2xl shadow-sm border ${
    isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'
  }`;

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Subscriptions & Billing</h1>
          <p className={`text-base mt-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage plans, subscriptions, and invoices</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Monthly Revenue', value: '€38,200', change: '+9.8%', icon: DollarSign, iconBg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50', iconColor: 'text-emerald-500' },
          { label: 'Active Subscriptions', value: '58', change: '+3', icon: CheckCircle, iconBg: isDarkMode ? 'bg-green-500/10' : 'bg-green-50', iconColor: 'text-green-500' },
          { label: 'Trial Accounts', value: '5', change: '+2', icon: Clock, iconBg: isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50', iconColor: 'text-blue-500' },
          { label: 'Overdue Invoices', value: '3', change: '', icon: AlertTriangle, iconBg: isDarkMode ? 'bg-red-500/10' : 'bg-red-50', iconColor: 'text-red-500' },
        ].map(kpi => (
          <div key={kpi.label} className={`${cardClass} p-4 flex flex-col items-center justify-center text-center`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${kpi.iconBg}`}>
              <kpi.icon className={`w-6 h-6 ${kpi.iconColor}`} />
            </div>
            <p className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{kpi.value}</p>
            <p className={`text-sm font-bold mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className={`flex gap-1 p-1.5 rounded-2xl w-fit ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'plans'
              ? isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
              : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Plans
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'invoices'
              ? isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
              : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Invoices
        </button>
      </div>

      {activeTab === 'plans' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.name} className={`${cardClass} p-4 relative ${plan.popular ? 'ring-2 ring-indigo-500/30' : ''}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full shadow-lg">Most Popular</span>
                </div>
              )}
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <h3 className={`text-base font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>€{plan.price}</span>
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{plan.interval}</span>
              </div>
              <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{plan.vehicles} vehicles</p>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-5 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                <Building2 className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{plan.orgs} organizations</span>
              </div>
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                  <th className={`text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Invoice</th>
                  <th className={`text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Organization</th>
                  <th className={`text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Plan</th>
                  <th className={`text-right px-3 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Amount</th>
                  <th className={`text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Status</th>
                  <th className={`text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Date</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className={`border-b last:border-b-0 transition-colors ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-gray-50 hover:bg-gray-50'}`}>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-mono font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{inv.id}</span>
                    </td>
                    <td className={`px-3 py-3 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{inv.org}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${
                        inv.plan === 'Enterprise' ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : inv.plan === 'Business' ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : inv.plan === 'Custom' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>{inv.plan}</span>
                    </td>
                    <td className={`px-3 py-3 text-right text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>€{inv.amount.toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        inv.status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200'
                        : inv.status === 'Overdue' ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {inv.status === 'Paid' ? <CheckCircle className="w-3 h-3" /> : inv.status === 'Overdue' ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {inv.status}
                      </span>
                    </td>
                    <td className={`px-3 py-3 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{inv.date}</td>
                    <td className="px-3 py-3">
                      <button className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}>
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
