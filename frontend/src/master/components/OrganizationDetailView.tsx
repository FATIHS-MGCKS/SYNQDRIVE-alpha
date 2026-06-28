import { ArrowLeft, Building2, Users, Car, Link2, CreditCard, Package, CheckCircle, XCircle, AlertTriangle, Clock, Edit2, Trash2, Plus, MoreHorizontal, Wifi, WifiOff, RefreshCw, Zap, Download } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, DataTable, MetricCard, DataCard, EmptyState, StatusChip, SectionHeader, HealthStatusChip, StatusDot, fleetVehicleStatusTone, platformRoleTone, userAccountStatusTone, onlineSignalTone } from '../../components/patterns';
import { Button } from '../../components/ui/button';
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
  onOpenBillingCenter?: (orgId: string) => void;
}

type OrgTab = 'overview' | 'users' | 'vehicles' | 'integrations' | 'billing' | 'products';

export function OrganizationDetailView({ org, orgUsers, orgVehicles, onBack, onUpdateOrg, onOpenBillingCenter }: OrganizationDetailViewProps) {
  const [activeTab, setActiveTab] = useState<OrgTab>('overview');

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
        variant="full"
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
                  <td className="px-6 py-3"><div className="flex items-center gap-3"><div className="sq-tone-brand flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-[color:var(--brand)]">{u.avatar}</div><div><p className={`text-sm font-semibold text-foreground`}>{u.name}</p><p className={`text-xs text-muted-foreground`}>{u.email}</p></div></div></td>
                  <td className="px-4 py-3"><StatusChip tone={platformRoleTone(u.role)} className="!text-xs">{u.role}</StatusChip></td>
                  <td className="px-4 py-3"><StatusChip tone={userAccountStatusTone(u.status)} className="!text-xs">{u.status}</StatusChip></td>
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
                    <td className="px-4 py-3"><StatusChip tone={fleetVehicleStatusTone(v.status)} className="!text-xs">{v.status}</StatusChip></td>
                    <td className="px-4 py-3"><HealthStatusChip state={v.health} label={v.health} className="!text-xs" /></td>
                    <td className={`px-4 py-3 text-sm text-muted-foreground`}>{v.station}</td>
                    <td className="px-4 py-3">{(() => {
                      const os = v.onlineStatus ?? (v.online ? 'ONLINE' : 'OFFLINE');
                      return (
                        <div className="flex items-center gap-1.5">
                          <StatusDot tone={onlineSignalTone(os)} />
                          <span className={`text-xs text-muted-foreground`}>{v.lastSignal}</span>
                        </div>
                      );
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
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${integration.status === 'Connected' ? 'sq-tone-positive' : 'bg-muted'}`}>
                    {integration.status === 'Connected' ? <Wifi className="h-5 w-5 text-[color:var(--status-positive)]" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold text-foreground`}>{integration.name}</h3>
                    <StatusChip tone={integration.status === 'Connected' ? 'success' : 'neutral'} className="!text-xs">{integration.status}</StatusChip>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 mb-5">
                <div className="flex justify-between"><span className={`text-sm text-muted-foreground`}>API Key</span><span className={`text-sm font-mono text-foreground`}>{integration.apiKey || '—'}</span></div>
                <div className="flex justify-between"><span className={`text-sm text-muted-foreground`}>Last Sync</span><span className={`text-sm text-foreground`}>{integration.lastSync}</span></div>
                <div className="flex justify-between"><span className={`text-sm text-muted-foreground`}>Sync Status</span><StatusChip tone={integration.syncStatus === 'Synced' ? 'success' : integration.syncStatus === 'Failed' ? 'critical' : 'neutral'} className="!text-xs">{integration.syncStatus}</StatusChip></div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleIntegration(integration.id)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${integration.status === 'Connected' ? 'sq-press text-[color:var(--status-critical)]' : 'sq-cta'}`}
                >
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
        <div className={`${CARD} p-6 space-y-4`}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl sq-tone-info shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Billing Control Center</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-[52ch]">
                Abrechnung, Subscriptions, Rechnungen und Zahlungsmethoden werden zentral im
                Billing Control Center verwaltet — nicht über lokale Demo-Daten in dieser Ansicht.
              </p>
            </div>
          </div>
          {onOpenBillingCenter ? (
            <Button type="button" size="sm" onClick={() => onOpenBillingCenter(org.id)}>
              Billing für diese Organisation öffnen
            </Button>
          ) : (
            <EmptyState
              compact
              title="Billing Control Center"
              description="Öffne Billing in der Sidebar für die kanonische Master-Admin-Abrechnungsansicht."
            />
          )}
        </div>
      )}

      {/* === PRODUCTS === */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {org.products.map(product => (
            <div key={product.id} className={`${CARD} p-4 ${product.status === 'Active' ? 'ring-2 ring-[color:var(--status-positive)]/20' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${product.status === 'Active' ? 'sq-tone-positive' : 'bg-muted'}`}>
                  <Package className={`h-6 w-6 ${product.status === 'Active' ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground'}`} />
                </div>
                <StatusChip tone={product.status === 'Active' ? 'success' : 'neutral'} className="!text-xs">{product.status}</StatusChip>
              </div>
              <h3 className={`text-lg font-semibold mb-1 text-foreground`}>{product.name}</h3>
              <p className={`text-xs mb-5 text-muted-foreground`}>
                {product.id === 'rental' ? 'Vehicle rental operations & booking management' : product.id === 'fleet' ? 'Fleet analytics, monitoring & maintenance' : 'Taxi dispatch, routing & driver management'}
              </p>
              <button
                type="button"
                onClick={() => toggleProduct(product.id)}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${product.status === 'Active' ? 'sq-press text-[color:var(--status-critical)]' : 'sq-cta'}`}
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
