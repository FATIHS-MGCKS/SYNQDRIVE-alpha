import {
  CreditCard,
  Building2,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Clock,
  Download,
} from 'lucide-react';
import { useState } from 'react';
import {
  PageHeader,
  MetricCard,
  DataCard,
  DataTable,
  StatusChip,
  SectionHeader,
  paymentStatusTone,
  planTone,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';

interface SubscriptionsViewProps {
  /** @deprecated Theme is token-driven via CSS variables — prop kept for App.tsx compat. */
  isDarkMode?: boolean;
}

const plans = [
  {
    name: 'Starter',
    price: 490,
    interval: '/mo',
    vehicles: 'Up to 25',
    features: ['Basic fleet tracking', 'Up to 3 users', 'Email support', 'Standard reports'],
    orgs: 8,
    popular: false,
  },
  {
    name: 'Business',
    price: 990,
    interval: '/mo',
    vehicles: 'Up to 75',
    features: [
      'Advanced analytics',
      'Up to 10 users',
      'Priority support',
      'Custom reports',
      'API access',
    ],
    orgs: 6,
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 2490,
    interval: '/mo',
    vehicles: 'Unlimited',
    features: [
      'Full platform access',
      'Unlimited users',
      'Dedicated support',
      'White-label',
      'SLA guarantee',
      'Custom integrations',
    ],
    orgs: 3,
    popular: false,
  },
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

const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-xl w-fit';

export function SubscriptionsView(_props: SubscriptionsViewProps) {
  void _props;
  const [activeTab, setActiveTab] = useState<'plans' | 'invoices'>('plans');

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Subscriptions & Billing"
        eyebrow="Master Admin"
        description="Manage plans, subscriptions, and invoices"
        icon={<CreditCard className="w-4 h-4" />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Monthly Revenue"
          value="€38,200"
          icon={<DollarSign className="w-4 h-4" />}
          trend={{ label: '+9.8%', direction: 'up' }}
          status="success"
        />
        <MetricCard
          label="Active Subscriptions"
          value="58"
          icon={<CheckCircle className="w-4 h-4" />}
          trend={{ label: '+3', direction: 'up' }}
          status="success"
        />
        <MetricCard
          label="Trial Accounts"
          value="5"
          icon={<Clock className="w-4 h-4" />}
          trend={{ label: '+2', direction: 'up' }}
          status="info"
        />
        <MetricCard
          label="Overdue Invoices"
          value="3"
          icon={<AlertTriangle className="w-4 h-4" />}
          status="critical"
        />
      </div>

      <div className={TAB_BAR}>
        <button
          type="button"
          onClick={() => setActiveTab('plans')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'plans'
              ? 'sq-tab-active bg-card text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Plans
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'invoices'
              ? 'sq-tab-active bg-card text-foreground shadow-sm ring-1 ring-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Invoices
        </button>
      </div>

      {activeTab === 'plans' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <DataCard
              key={plan.name}
              className={plan.popular ? 'ring-1 ring-[color:var(--brand)]/30' : undefined}
              title={
                <div className="flex items-center gap-2">
                  <span>{plan.name}</span>
                  {plan.popular && (
                    <StatusChip tone="info">Current highlight</StatusChip>
                  )}
                </div>
              }
              description={plan.vehicles}
            >
              <div className="flex items-baseline gap-1 mb-4">
                <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
                  €{plan.price}
                </span>
                <span className="text-sm text-muted-foreground">{plan.interval}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-5 bg-muted/50 border border-border">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {plan.orgs} organizations
                </span>
              </div>
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-[color:var(--status-positive)] shrink-0" />
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </DataCard>
          ))}
        </div>
      ) : (
        <DataCard flush>
          <SectionHeader
            title="Invoices"
            description="Recent billing documents across organizations"
            className="px-4 pt-4"
          />
          <DataTable
            card={false}
            rows={invoices}
            getRowKey={(inv) => inv.id}
            columns={[
              {
                key: 'id',
                header: 'Invoice',
                cell: (inv) => (
                  <span className="text-sm font-mono font-semibold text-foreground">{inv.id}</span>
                ),
              },
              {
                key: 'org',
                header: 'Organization',
                cell: (inv) => <span className="text-xs text-foreground">{inv.org}</span>,
              },
              {
                key: 'plan',
                header: 'Plan',
                cell: (inv) => (
                  <StatusChip tone={planTone(inv.plan)}>{inv.plan}</StatusChip>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                numeric: true,
                cell: (inv) => (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    €{inv.amount.toLocaleString()}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (inv) => (
                  <StatusChip
                    tone={paymentStatusTone(inv.status)}
                    icon={
                      inv.status === 'Paid' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : inv.status === 'Overdue' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )
                    }
                    dot
                  >
                    {inv.status}
                  </StatusChip>
                ),
              },
              {
                key: 'date',
                header: 'Date',
                cell: (inv) => (
                  <span className="text-xs text-muted-foreground">{inv.date}</span>
                ),
              },
            ]}
            rowActions={() => (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                <Download className="w-4 h-4" />
              </Button>
            )}
          />
        </DataCard>
      )}
    </div>
  );
}
