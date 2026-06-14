import { ArrowLeft, Building2, Users, Car, Link2, CreditCard, Package, CheckCircle, XCircle, AlertTriangle, Clock, Edit2, Trash2, Plus, MoreHorizontal, Wifi, WifiOff, RefreshCw, Zap, Download } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, DataTable, MetricCard, DataCard, EmptyState, StatusChip, SectionHeader } from '../../components/patterns';
import type { Organization, OrgProduct, OrgIntegration, PlatformUser, RegisteredVehicle, ProductId, SubscriptionPlan } from '../data/platform-data';

/* ── Design-system token helpers ── */
const CARD = 'sq-card overflow-hidden';
const INPUT =
  'w-full px-4 py-2.5 rounded-xl border border-border bg-muted/50 text-sm text-foreground transition-colors outline-none focus:border-[color:var(--brand)] placeholder:text-muted-foreground';
const LABEL = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
const HEAD = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-2xl overflow-x-auto w-fit';
const TAB_ACTIVE = 'sq-tab-active flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
const TAB_IDLE = 'sq-tab flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap text-muted-foreground hover:text-foreground';


interface OrganizationDetailViewProps {
  org: Organization;
  orgUsers: PlatformUser[];
  orgVehicles: RegisteredVehicle[];
  onBack: () => void;
  onUpdateOrg: (org: Organization) => void;
}

type OrgTab = 'overview' | 'users' | 'vehicles' | 'integrations' | 'billing' | 'products';

export function OrganizationDetailView({ org, orgUsers, orgVehicles, onBack, onUpdateOrg }: OrganizationDetailViewProps) {
  const [activeTab, setActiveTab] = useState<OrgTab>('overview');const planColors: Record<string, string> = { Starter: 'bg-gray-100 text-gray-700 border-gray-200', Business: 'bg-blue-50 text-blue-700 border-blue-200', Enterprise: 'bg-purple-50 text-purple-700 border-purple-200', Custom: 'bg-amber-50 text-amber-700 border-amber-200' };
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
      <PageHeader
        title={org.company_name}
        eyebrow="Organization"
        description={`${org.business_type} · ${org.city}, ${org.country} · Since ${org.created_at}`}
        icon={<Building2 className="w-4 h-4" />}
        status={
          <>
            <StatusChip tone="info">{org.plan}</StatusChip>
            <StatusChip tone={org.status === 'Active' ? 'success' : org.status === 'Suspended' ? 'critical' : 'watch'}>{org.status}</StatusChip>
          </>
        }
        actions={
          <button onClick={onBack} className="p-3 rounded-2xl border transition-all duration-200 hover:shadow-md bg-card border-border text-muted-foreground hover:bg-muted/50">
            <ArrowLeft className="w-5 h-5" />
          </button>
        }
      />

      {/* Tabs */}
      <div className={`flex gap-1 p-1.5 rounded-2xl overflow-x-auto w-fit bg-muted`}>
        {([['overview', 'Overview'], ['users', 'Users'], ['vehicles', 'Vehicles'], ['integrations', 'Integrations'], ['billing', 'Billing'], ['products', 'Products']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === id ? ('bg-card text-foreground shadow-sm ring-1 ring-border') : ('text-muted-foreground hover:text-foreground')}`}>{label}</button>
        ))}
      </div>

      {/* === OVERVIEW === */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${CARD} p-8`}>
            <h3 className={`text-base font-bold mb-4 text-foreground`}>Organization Details</h3>
            <div className="space-y-4">
              {[['Company', org.company_name], ['Short Code', (org as any).short_code || '—'], ['Business Type', org.business_type], ['City', org.city], ['Country', org.country], ['Email', org.contactEmail], ['Created', org.created_at], ['Last Active', org.lastActive]].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-1">
                  <span className={`text-sm font-medium text-muted-foreground`}>{label}</span>
                  <span className={`text-sm font-bold text-foreground`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`${CARD} p-8`}>
            <h3 className={`text-base font-bold mb-4 text-foreground`}>Quick Stats</h3>
            <div className="grid grid-cols-2 gap-5">
              {[
                { label: 'Fleet Size', value: org.fleet_size.toString(), icon: Car, color: 'text-indigo-500', bg: 'sq-tone-brand' },
                { label: 'Users', value: org.users.toString(), icon: Users, color: 'text-purple-500', bg: 'sq-tone-ai' },
                { label: 'MRR', value: `€${org.mrr.toLocaleString()}`, icon: CreditCard, color: 'text-emerald-500', bg: 'sq-tone-success' },
                { label: 'Products', value: org.products.filter(p => p.status === 'Active').length.toString(), icon: Package, color: 'text-blue-500', bg: 'sq-tone-info' },
              ].map(stat => (
                <div key={stat.label} className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center bg-muted/50 border-border`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <p className={`text-2xl font-extrabold text-foreground`}>{stat.value}</p>
                  <p className={`text-xs font-bold mt-1 uppercase tracking-wider text-muted-foreground`}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === USERS === */}
      {activeTab === 'users' && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
            <span className={`text-sm font-medium text-muted-foreground`}>{orgUsers.length} users</span>
          </div>
          <table className="w-full">
            <thead><tr className={`border-b border-border`}>
              <th className={`text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>User</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Role</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Status</th>
              <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Last Login</th>
            </tr></thead>
            <tbody>
              {orgUsers.map(u => (
                <tr key={u.id} className={`border-b last:border-b-0 border-border hover:bg-muted/50`}>
                  <td className="px-6 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-[10px] font-semibold">{u.avatar}</div><div><p className={`text-sm font-semibold text-foreground`}>{u.name}</p><p className={`text-xs text-muted-foreground`}>{u.email}</p></div></div></td>
                  <td className={`px-4 py-3 text-sm text-foreground`}>{u.role}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${u.status === 'Active' ? 'bg-green-50 text-green-700' : u.status === 'Invited' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{u.status}</span></td>
                  <td className={`px-4 py-3 text-sm text-muted-foreground`}>{u.last_login}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* === VEHICLES === */}
      {activeTab === 'vehicles' && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
            <span className={`text-sm font-medium text-muted-foreground`}>{orgVehicles.length} vehicles</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className={`border-b border-border`}>
                <th className={`text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Vehicle</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Status</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Health</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Station</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Signal</th>
              </tr></thead>
              <tbody>
                {orgVehicles.map(v => (
                  <tr key={v.id} className={`border-b last:border-b-0 border-border hover:bg-muted/50`}>
                    <td className="px-6 py-3"><p className={`text-sm font-semibold text-foreground`}>{v.vehicleName}</p><p className={`text-xs font-mono text-muted-foreground`}>{v.vin}</p></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${v.status === 'Available' ? 'bg-green-50 text-green-700' : v.status === 'Active Rented' ? 'bg-blue-50 text-blue-700' : v.status === 'Reserved' ? 'bg-purple-50 text-purple-700' : v.status === 'Maintenance' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>{v.status}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${v.health === 'Good' ? 'bg-green-50 text-green-700' : v.health === 'Warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{v.health}</span></td>
                    <td className={`px-4 py-3 text-sm text-muted-foreground`}>{v.station}</td>
                    <td className="px-4 py-3">{(() => {
                      const os = v.onlineStatus ?? (v.online ? 'ONLINE' : 'OFFLINE');
                      const dc = os === 'ONLINE' ? 'bg-green-500' : os === 'STANDBY' ? 'bg-amber-500' : 'bg-gray-400';
                      return <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${dc}`} /><span className={`text-xs text-muted-foreground`}>{v.lastSignal}</span></div>;
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
            <div key={integration.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${integration.status === 'Connected' ? 'bg-green-50' : 'bg-muted'}`}>
                    {integration.status === 'Connected' ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold text-foreground`}>{integration.name}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${integration.status === 'Connected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{integration.status}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 mb-5">
                <div className="flex justify-between"><span className={`text-sm text-muted-foreground`}>API Key</span><span className={`text-sm font-mono text-foreground`}>{integration.apiKey || '—'}</span></div>
                <div className="flex justify-between"><span className={`text-sm text-muted-foreground`}>Last Sync</span><span className={`text-sm text-foreground`}>{integration.lastSync}</span></div>
                <div className="flex justify-between"><span className={`text-sm text-muted-foreground`}>Sync Status</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${integration.syncStatus === 'Synced' ? 'bg-green-50 text-green-700' : integration.syncStatus === 'Failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{integration.syncStatus}</span></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleIntegration(integration.id)} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${integration.status === 'Connected' ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white hover:shadow-lg'}`}>
                  {integration.status === 'Connected' ? 'Disconnect' : 'Connect'}
                </button>
                {integration.status === 'Connected' && (
                  <button className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all border-border`}>
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
            <div className={`${CARD} p-5`}>
              <p className={`text-sm text-muted-foreground`}>Current Plan</p>
              <p className={`text-2xl font-bold mt-1 text-foreground`}>{org.plan}</p>
            </div>
            <div className={`${CARD} p-5`}>
              <p className={`text-sm text-muted-foreground`}>Monthly Revenue</p>
              <p className={`text-2xl font-bold mt-1 text-foreground`}>€{org.mrr.toLocaleString()}</p>
            </div>
            <div className={`${CARD} p-5`}>
              <p className={`text-sm text-muted-foreground`}>Payment Status</p>
              <p className={`text-2xl font-bold mt-1 ${org.invoices.some(i => i.status === 'Overdue') ? 'text-red-600' : 'text-green-600'}`}>{org.invoices.some(i => i.status === 'Overdue') ? 'Overdue' : 'Current'}</p>
            </div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-gray-100"><h3 className={`text-sm font-semibold text-foreground`}>Invoices</h3></div>
            <table className="w-full">
              <thead><tr className={`border-b border-border`}>
                <th className={`text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Invoice</th>
                <th className={`text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Amount</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Status</th>
                <th className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Date</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {org.invoices.map(inv => (
                  <tr key={inv.id} className={`border-b last:border-b-0 border-border`}>
                    <td className={`px-6 py-3 text-sm font-mono font-semibold text-foreground`}>{inv.id}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold text-foreground`}>€{inv.amount.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${inv.status === 'Paid' ? 'bg-green-50 text-green-700' : inv.status === 'Overdue' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{inv.status}</span></td>
                    <td className={`px-4 py-3 text-sm text-muted-foreground`}>{inv.date}</td>
                    <td className="px-4 py-3"><button className={`p-1.5 rounded-lg transition-colors hover:bg-muted`}><Download className="w-4 h-4" /></button></td>
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
            <div key={product.id} className={`${CARD} p-4 ${product.status === 'Active' ? 'ring-2 ring-green-500/20' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${product.status === 'Active' ? 'bg-green-50' : 'bg-muted'}`}>
                  <Package className={`w-6 h-6 ${product.status === 'Active' ? 'text-green-500' : 'text-gray-400'}`} />
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${product.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{product.status}</span>
              </div>
              <h3 className={`text-lg font-semibold mb-1 text-foreground`}>{product.name}</h3>
              <p className={`text-xs mb-5 text-muted-foreground`}>
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
