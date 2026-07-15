/**
 * Stripe Sandbox E2E scenario registry (Prompt 43).
 * Source of truth for automated coverage vs manual sandbox runs.
 */

export type SandboxScenarioTier =
  | 'unit'
  | 'integration-mock'
  | 'e2e-manual'
  | 'ci-mock';

export interface BillingStripeSandboxScenario {
  id: number;
  key: string;
  title: string;
  tier: SandboxScenarioTier;
  /** Jest/Vitest spec paths (repo-relative) */
  automatedTests: string[];
  /** Manual sandbox procedure reference in docs/billing/billing-stripe-sandbox-e2e.md */
  manualSection: string;
  /** Stripe fixture file under __fixtures__/stripe-sandbox/events/ if applicable */
  fixture?: string;
  /** Requires live Stripe test mode + CLI forwarding */
  requiresLiveStripe: boolean;
  /** Safe to run in CI without Stripe network */
  ciSafe: boolean;
}

export const BILLING_STRIPE_SANDBOX_SCENARIOS: BillingStripeSandboxScenario[] = [
  {
    id: 1,
    key: 'org-without-contract',
    title: 'Organisation ohne Vertrag',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/tenant-subscription-overview.service.spec.ts',
      'backend/src/modules/billing/billing-summary.service.spec.ts',
    ],
    manualSection: '§3.1',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 2,
    key: 'rental-draft',
    title: 'Rental Draft',
    tier: 'unit',
    automatedTests: ['backend/src/modules/billing/subscription-lifecycle.service.spec.ts'],
    manualSection: '§3.2',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 3,
    key: 'rental-activate',
    title: 'Rental aktivieren',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/billing/subscription-lifecycle.service.spec.ts',
      'backend/src/modules/billing/stripe-subscription-orchestrator.service.spec.ts',
    ],
    manualSection: '§3.3',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 4,
    key: 'fleet-activate',
    title: 'Fleet aktivieren',
    tier: 'unit',
    automatedTests: ['backend/src/modules/billing/subscription-lifecycle.service.spec.ts'],
    manualSection: '§3.4',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 5,
    key: 'trial-start-end',
    title: 'Trial starten/beenden',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/billing/subscription-lifecycle.service.spec.ts',
      'backend/src/modules/billing/stripe-webhook.matrix.spec.ts',
    ],
    manualSection: '§3.5',
    fixture: 'customer.subscription.updated-trial.json',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 6,
    key: 'vehicle-add',
    title: 'Fahrzeug hinzufügen',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/billable-vehicles.service.spec.ts',
      'backend/src/modules/billing/billing-quantity.service.spec.ts',
    ],
    manualSection: '§3.6',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 7,
    key: 'vehicle-mid-month',
    title: 'Fahrzeug mitten im Monat',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/tenant-billing-tariff.service.spec.ts',
      'backend/src/modules/billing/domain/billing-quantity-ledger.spec.ts',
    ],
    manualSection: '§3.7',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 8,
    key: 'vehicle-remove',
    title: 'Fahrzeug entfernen',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/tenant-billing-tariff.service.spec.ts',
      'backend/src/modules/billing/billable-vehicles.service.spec.ts',
    ],
    manualSection: '§3.8',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 9,
    key: 'discount-add',
    title: 'Rabatt hinzufügen',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/pricebook.service.spec.ts',
      'backend/src/modules/billing/tenant-subscription-overview.service.spec.ts',
    ],
    manualSection: '§3.9',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 10,
    key: 'discount-expire',
    title: 'Rabatt ablaufen',
    tier: 'unit',
    automatedTests: ['backend/src/modules/billing/domain/billing-reconciliation.spec.ts'],
    manualSection: '§3.10',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 11,
    key: 'payment-card',
    title: 'Karte',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-payment-method.service.spec.ts',
      'backend/src/modules/billing/tenant-billing-payment-methods.service.spec.ts',
    ],
    manualSection: '§4.1',
    fixture: 'setup_intent.succeeded-card.json',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 12,
    key: 'payment-sepa',
    title: 'SEPA',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-payment-method.service.spec.ts',
      'backend/src/modules/billing/tenant-billing-payment-methods.service.spec.ts',
    ],
    manualSection: '§4.2',
    fixture: 'setup_intent.succeeded-sepa.json',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 13,
    key: 'invoice-success',
    title: 'erfolgreiche Rechnung',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-invoice-mirror.service.spec.ts',
      'backend/src/modules/billing/stripe-webhook.matrix.spec.ts',
    ],
    manualSection: '§5.1',
    fixture: 'invoice.paid.json',
    requiresLiveStripe: true,
    ciSafe: true,
  },
  {
    id: 14,
    key: 'payment-failed',
    title: 'fehlgeschlagene Zahlung',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-webhook.matrix.spec.ts',
      'backend/src/modules/billing/tenant-subscription-overview.service.spec.ts',
    ],
    manualSection: '§5.2',
    fixture: 'invoice.payment_failed.json',
    requiresLiveStripe: true,
    ciSafe: true,
  },
  {
    id: 15,
    key: 'payment-retry',
    title: 'Retry',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-webhook.service.spec.ts',
      'backend/src/modules/billing/stripe-webhook.characterization.spec.ts',
    ],
    manualSection: '§5.3',
    fixture: 'invoice.paid.json',
    requiresLiveStripe: true,
    ciSafe: true,
  },
  {
    id: 16,
    key: 'invoice-open',
    title: 'offene Rechnung',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-invoice-mirror.service.spec.ts',
      'backend/src/modules/billing/tenant-billing-invoices.service.spec.ts',
    ],
    manualSection: '§5.4',
    fixture: 'invoice.finalized.json',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 17,
    key: 'invoice-void',
    title: 'Void',
    tier: 'ci-mock',
    automatedTests: ['backend/src/modules/billing/stripe-webhook.matrix.spec.ts'],
    manualSection: '§5.5',
    fixture: 'invoice.voided.json',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 18,
    key: 'invoice-uncollectible',
    title: 'Uncollectible',
    tier: 'ci-mock',
    automatedTests: ['backend/src/modules/billing/stripe-webhook.matrix.spec.ts'],
    manualSection: '§5.6',
    fixture: 'invoice.marked_uncollectible.json',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 19,
    key: 'refund-full',
    title: 'Vollrefund',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/billing-payment-ledger.service.spec.ts',
      'backend/src/modules/billing/domain/billing-payment-ledger.spec.ts',
    ],
    manualSection: '§5.7',
    fixture: 'charge.refunded-full.json',
    requiresLiveStripe: true,
    ciSafe: true,
  },
  {
    id: 20,
    key: 'refund-partial',
    title: 'Teilrefund',
    tier: 'ci-mock',
    automatedTests: ['backend/src/modules/billing/billing-payment-ledger.service.spec.ts'],
    manualSection: '§5.8',
    fixture: 'charge.refunded-partial.json',
    requiresLiveStripe: true,
    ciSafe: true,
  },
  {
    id: 21,
    key: 'credit-note',
    title: 'Credit Note',
    tier: 'ci-mock',
    automatedTests: ['backend/src/modules/billing/stripe-webhook.matrix.spec.ts'],
    manualSection: '§5.9',
    fixture: 'credit_note.created.json',
    requiresLiveStripe: true,
    ciSafe: true,
  },
  {
    id: 22,
    key: 'rental-to-fleet',
    title: 'Rental → Fleet',
    tier: 'unit',
    automatedTests: ['backend/src/modules/billing/subscription-lifecycle.service.spec.ts'],
    manualSection: '§3.11',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 23,
    key: 'new-price-version',
    title: 'neue Price Version',
    tier: 'unit',
    automatedTests: ['backend/src/modules/billing/pricebook.service.spec.ts'],
    manualSection: '§3.12',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 24,
    key: 'cancel-period-end',
    title: 'Kündigung zum Periodenende',
    tier: 'integration-mock',
    automatedTests: [
      'backend/src/modules/billing/subscription-lifecycle.service.spec.ts',
      'backend/src/modules/billing/stripe-webhook.matrix.spec.ts',
    ],
    manualSection: '§3.13',
    fixture: 'customer.subscription.updated-cancel-at-period-end.json',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 25,
    key: 'cancel-revoke',
    title: 'Kündigung widerrufen',
    tier: 'unit',
    automatedTests: ['backend/src/modules/billing/subscription-lifecycle.service.spec.ts'],
    manualSection: '§3.14',
    requiresLiveStripe: true,
    ciSafe: false,
  },
  {
    id: 26,
    key: 'duplicate-webhook',
    title: 'doppelter Webhook',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/stripe-webhook.service.spec.ts',
      'backend/src/modules/billing/stripe-webhook.characterization.spec.ts',
    ],
    manualSection: '§6.1',
    fixture: 'invoice.paid.json',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 27,
    key: 'out-of-order-webhook',
    title: 'Out-of-order Webhook',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/domain/stripe-webhook-matrix.spec.ts',
      'backend/src/modules/billing/stripe-webhook.matrix.spec.ts',
    ],
    manualSection: '§6.2',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 28,
    key: 'stripe-outage',
    title: 'Stripe-Ausfall',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/stripe-prepared.service.spec.ts',
      'backend/src/modules/billing/stripe-subscription-orchestrator.service.spec.ts',
    ],
    manualSection: '§6.3',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 29,
    key: 'resend-outage',
    title: 'Resend-Ausfall',
    tier: 'unit',
    automatedTests: [
      'backend/src/modules/billing/email/billing-domain-event-email.processor.spec.ts',
      'backend/src/modules/outbound-email/outbound-email-infrastructure.characterization.spec.ts',
    ],
    manualSection: '§6.4',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 30,
    key: 'drift-detection',
    title: 'Drift Detection',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/billing-reconciliation.service.spec.ts',
      'backend/src/modules/billing/domain/billing-reconciliation.spec.ts',
    ],
    manualSection: '§6.5',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 31,
    key: 'cross-tenant',
    title: 'Cross-Tenant',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/billing-multi-tenant.access.characterization.spec.ts',
      'backend/src/modules/billing/billing.controller.security.characterization.spec.ts',
    ],
    manualSection: '§7',
    requiresLiveStripe: false,
    ciSafe: true,
  },
  {
    id: 32,
    key: 'role-matrix',
    title: 'Rollenmatrix',
    tier: 'ci-mock',
    automatedTests: [
      'backend/src/modules/billing/billing.permissions.matrix.spec.ts',
      'backend/src/modules/invoices/invoices.permissions.characterization.spec.ts',
    ],
    manualSection: '§8',
    requiresLiveStripe: false,
    ciSafe: true,
  },
];

export const SANDBOX_SCENARIO_COUNT = BILLING_STRIPE_SANDBOX_SCENARIOS.length;

export function scenariosByTier(tier: SandboxScenarioTier): BillingStripeSandboxScenario[] {
  return BILLING_STRIPE_SANDBOX_SCENARIOS.filter((scenario) => scenario.tier === tier);
}

export function ciSafeScenarios(): BillingStripeSandboxScenario[] {
  return BILLING_STRIPE_SANDBOX_SCENARIOS.filter((scenario) => scenario.ciSafe);
}

export function manualSandboxScenarios(): BillingStripeSandboxScenario[] {
  return BILLING_STRIPE_SANDBOX_SCENARIOS.filter((scenario) => scenario.requiresLiveStripe);
}
