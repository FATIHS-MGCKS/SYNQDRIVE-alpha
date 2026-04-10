import { ArrowLeft, Building2, Users, Car, Link2, CreditCard, Package, CheckCircle, XCircle, AlertTriangle, Clock, Edit2, Trash2, Plus, MoreHorizontal, Wifi, WifiOff, RefreshCw, Zap, Download } from 'lucide-react';
import { useState } from 'react';
import type { Organization, OrgProduct, OrgIntegration, PlatformUser, RegisteredVehicle, ProductId, SubscriptionPlan } from '../data/platform-data';

interface OrganizationDetailViewProps {
  isDarkMode: boolean;
  org: Organization;
  orgUsers: PlatformUser[];
  orgVehicles: RegisteredVehicle[];
  onBack: () => void;
  onUpdateOrg: (org: Organization) => void;
}

type OrgTab = 'overview' | 'users' | 'vehicles' | 'integrations' | 'billing' | 'products';

export function OrganizationDetailView({ isDarkMode, org, orgUsers, orgVehicles, onBack, onUpdateOrg }: OrganizationDetailViewProps) {
  const [activeTab, setActiveTab] = useState<OrgTab>('overview');

  const cardClass = `rounded-2xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;

  const planColors: Record<string, string> = { Starter: 'bg-gray-100 text-gray-700 border-gray-200', Business: 'bg-blue-50 text-blue-700 border-blue-200', Enterprise: 'bg-purple-50 text-purple-700 border-purple-200', Custom: 'bg-amber-50 text-amber-700 border-amber-200' };
  const statusColors: Record<string, string> = { Active: 'bg-green-50 text-green-700', Trial: 'bg-blue-50 text-blue-700', Suspended: 'bg-red-50 text-red-700', Churned: 'bg-gray-100 text-gray-500' };

  const toggleProduct = (productId: ProductId) => {
    const updated = { ...org, products: org.products.map(p => p.id === productId ? { ...p, status: p.status === 'Active' ? 'Inactive' as const : 'Active' as const } : p) };
    onUpdateOrg(updated);
  };

  const toggleIntegration = (intId: string) => {
    const updated = {
      ...org,
      integrations: org.integrations.map(i =>
        i.id === intId
          ? { ...i, status: i.status === 'Connected' ? 'Disconnected' as const : 'Connected' as const, lastSync: i.status === 'Connected' ? i.lastSync : 'Just now', syncStatus: 'Synced' as const, apiKey: i.status === 'Connected' ? '' : `${i.id}_key_••••••••` }
          : i
      ),
    };
    onUpdateOrg(updated);
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className={`p-3 rounded-2xl border transition-all duration-200 hover:shadow-md ${isDarkMode ? 'bg-neutral-800 border-neutral-700/50 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-white'}`}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{org.company_name}</h1>
            <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${planColors[org.plan]}`}>{org.plan}</span>
            <span className={`px-3 py-1 rounded-xl text-xs font-bold ${statusColors[org.status]}`}>{org.status}</span>
          </div>
          <p className={`text-base mt-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{org.business_type} · {org.city}, {org.country} · Since {org.created_at}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1.5 rounded-2xl overflow-x-auto w-fit ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100/80'}`}>
        {([['overview', 'Overview'], ['users', 'Users'], ['vehicles', 'Vehicles'], ['integrations', 'Integrations'], ['billing', 'Billing'], ['products', 'Products']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === id ? (isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}>{label}</button>
        ))}
      </div>

      {/* === OVERVIEW === */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${cardClass} p-8`}>
            <h3 className={`text-base font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Organization Details</h3>
            <div className="space-y-4">
              {[['Company', org.company_name], ['Short Code', (org as any).short_code || '—'], ['Business Type', org.business_type], ['City', org.city], ['Country', org.country], ['Email', org.contactEmail], ['Created', org.created_at], ['Last Active', org.lastActive]].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-1">
                  <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`${cardClass} p-8`}>
            <h3 className={`text-base font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Quick Stats</h3>
            <div className="grid grid-cols-2 gap-5">
              {[
                { label: 'Fleet Size', value: org.fleet_size.toString(), icon: Car, color: 'text-indigo-500', bg: isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-50' },
                { label: 'Users', value: org.users.toString(), icon: Users, color: 'text-purple-500', bg: isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50' },
                { label: 'MRR', value: `€${org.mrr.toLocaleString()}`, icon: CreditCard, color: 'text-emerald-500', bg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50' },
                { label: 'Products', value: org.products.filter(p => p.status === 'Active').length.toString(), icon: Package, color: 'text-blue-500', bg: isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50' },
              ].map(stat => (
                <div key={stat.label} className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center ${isDarkMode ? 'bg-neutral-800 border-neutral-700/50' : 'bg-gray-50/80 border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <p className={`text-2xl font-extrabold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stat.value}</p>
                  <p className={`text-xs font-bold mt-1 uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === USERS === */}
      {activeTab === 'users' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
            <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{orgUsers.length} users</span>
          </div>
          <table className="w-full">
            <thead><tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
              <th className={`text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>User</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Role</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Status</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Last Login</th>
            </tr></thead>
            <tbody>
              {orgUsers.map(u => (
                <tr key={u.id} className={`border-b last:border-b-0 ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-gray-50 hover:bg-gray-50'}`}>
                  <td className="px-6 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-[10px] font-semibold">{u.avatar}</div><div><p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{u.name}</p><p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{u.email}</p></div></div></td>
                  <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{u.role}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${u.status === 'Active' ? 'bg-green-50 text-green-700' : u.status === 'Invited' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{u.status}</span></td>
                  <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{u.last_login}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* === VEHICLES === */}
      {activeTab === 'vehicles' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
            <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{orgVehicles.length} vehicles</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <th className={`text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Vehicle</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Status</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Health</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Station</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Signal</th>
              </tr></thead>
              <tbody>
                {orgVehicles.map(v => (
                  <tr key={v.id} className={`border-b last:border-b-0 ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-gray-50 hover:bg-gray-50'}`}>
                    <td className="px-6 py-3"><p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{v.vehicleName}</p><p className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{v.vin}</p></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${v.status === 'Available' ? 'bg-green-50 text-green-700' : v.status === 'Rented' ? 'bg-blue-50 text-blue-700' : v.status === 'Maintenance' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>{v.status}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${v.health === 'Good' ? 'bg-green-50 text-green-700' : v.health === 'Warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{v.health}</span></td>
                    <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{v.station}</td>
                    <td className="px-4 py-3">{(() => {
                      const os = v.onlineStatus ?? (v.online ? 'ONLINE' : 'OFFLINE');
                      const dc = os === 'ONLINE' ? 'bg-green-500' : os === 'STANDBY' ? 'bg-amber-500' : 'bg-gray-400';
                      return <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${dc}`} /><span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{v.lastSignal}</span></div>;
                    })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === INTEGRATIONS === */}
      {activeTab === 'integrations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {org.integrations.map(integration => (
            <div key={integration.id} className={`${cardClass} p-4`}>
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${integration.status === 'Connected' ? 'bg-green-50' : isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                    {integration.status === 'Connected' ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{integration.name}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${integration.status === 'Connected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{integration.status}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 mb-5">
                <div className="flex justify-between"><span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>API Key</span><span className={`text-sm font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{integration.apiKey || '—'}</span></div>
                <div className="flex justify-between"><span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Last Sync</span><span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{integration.lastSync}</span></div>
                <div className="flex justify-between"><span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sync Status</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${integration.syncStatus === 'Synced' ? 'bg-green-50 text-green-700' : integration.syncStatus === 'Failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{integration.syncStatus}</span></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleIntegration(integration.id)} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${integration.status === 'Connected' ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white hover:shadow-lg'}`}>
                  {integration.status === 'Connected' ? 'Disconnect' : 'Connect'}
                </button>
                {integration.status === 'Connected' && (
                  <button className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                    <RefreshCw className="w-4 h-4" /> Test
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === BILLING === */}
      {activeTab === 'billing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`${cardClass} p-5`}>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Current Plan</p>
              <p className={`text-2xl font-bold mt-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{org.plan}</p>
            </div>
            <div className={`${cardClass} p-5`}>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Monthly Revenue</p>
              <p className={`text-2xl font-bold mt-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>€{org.mrr.toLocaleString()}</p>
            </div>
            <div className={`${cardClass} p-5`}>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Payment Status</p>
              <p className={`text-2xl font-bold mt-1 ${org.invoices.some(i => i.status === 'Overdue') ? 'text-red-600' : 'text-green-600'}`}>{org.invoices.some(i => i.status === 'Overdue') ? 'Overdue' : 'Current'}</p>
            </div>
          </div>
          <div className={`${cardClass} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-gray-100"><h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Invoices</h3></div>
            <table className="w-full">
              <thead><tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <th className={`text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Invoice</th>
                <th className={`text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Amount</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Status</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Date</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {org.invoices.map(inv => (
                  <tr key={inv.id} className={`border-b last:border-b-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-50'}`}>
                    <td className={`px-6 py-3 text-sm font-mono font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{inv.id}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>€{inv.amount.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${inv.status === 'Paid' ? 'bg-green-50 text-green-700' : inv.status === 'Overdue' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{inv.status}</span></td>
                    <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{inv.date}</td>
                    <td className="px-4 py-3"><button className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}><Download className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === PRODUCTS === */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {org.products.map(product => (
            <div key={product.id} className={`${cardClass} p-4 ${product.status === 'Active' ? 'ring-2 ring-green-500/20' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${product.status === 'Active' ? 'bg-green-50' : isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                  <Package className={`w-6 h-6 ${product.status === 'Active' ? 'text-green-500' : 'text-gray-400'}`} />
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${product.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{product.status}</span>
              </div>
              <h3 className={`text-lg font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{product.name}</h3>
              <p className={`text-xs mb-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {product.id === 'rental' ? 'Vehicle rental operations & booking management' : product.id === 'fleet' ? 'Fleet analytics, monitoring & maintenance' : 'Taxi dispatch, routing & driver management'}
              </p>
              <button
                onClick={() => toggleProduct(product.id)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${product.status === 'Active' ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gradient-to-br from-green-500 to-green-600 text-white hover:shadow-lg'}`}
              >
                {product.status === 'Active' ? <><XCircle className="w-4 h-4" /> Disable Product</> : <><CheckCircle className="w-4 h-4" /> Enable Product</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
