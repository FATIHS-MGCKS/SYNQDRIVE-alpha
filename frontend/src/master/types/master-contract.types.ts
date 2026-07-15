export type MasterContractSyncStatus = 'NONE' | 'MISSING' | 'PARTIAL' | 'SYNCED';

export interface MasterContractPreviewDto {
  organizationId: string;
  mutating: boolean;
  effectiveAt: string;
  current: {
    productKey: string | null;
    priceBookId: string | null;
    priceVersionId: string | null;
    priceVersionLabel: string | null;
    quantity: number;
    baseAmountCents: number | null;
    amountAfterDiscountCents: number | null;
    discounts: Array<{ label?: string; amountCents?: number }>;
  };
  proposed: {
    productKey: string | null;
    priceVersionId: string | null;
    anchorDay: number | null;
    quantity: number;
    baseAmountCents: number | null;
    amountAfterDiscountCents: number | null;
    discounts: Array<{ label?: string; amountCents?: number }>;
  };
  proration: {
    proratedBillableQuantity: number;
    proratedSubtotalCents: number;
  };
  warnings: string[];
}

export interface MasterContractStateDto {
  organizationId: string;
  subscription: {
    id: string;
    status: string;
    lockVersion: number;
    trialEndAt: string | null;
    startedAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
    cancelAtPeriodEnd: boolean;
    billingAnchorDay: number | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null;
  contract: {
    subscription: Record<string, unknown>;
    domainStatus: string;
    baseItem: {
      id: string;
      priceVersionId: string | null;
      priceBookId: string | null;
      billingProduct?: { key: string; name: string };
      priceVersion?: { id: string; versionNumber: number; versionLabel: string | null; status: string };
    } | null;
    items: Array<Record<string, unknown>>;
    lockVersion: number;
  } | null;
}

export interface MasterContractHistoryDto {
  organizationId: string;
  subscription: Record<string, unknown> | null;
  items: Array<Record<string, unknown>>;
  auditEntries: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    beforeJson: unknown;
    afterJson: unknown;
  }>;
}

export interface MasterContractMutationResult {
  organizationId: string;
  contract?: MasterContractStateDto['contract'];
  result?: unknown;
}

export type MasterContractActionKind =
  | 'draft'
  | 'assign-rental'
  | 'assign-fleet'
  | 'select-price-version'
  | 'trial'
  | 'activate'
  | 'pause'
  | 'reactivate'
  | 'schedule-cancel'
  | 'revoke-cancel'
  | 'schedule-tariff-change'
  | 'schedule-price-version-change'
  | 'add-discount'
  | 'end-discount'
  | 'billing-anchor'
  | 'preview'
  | 'sync-stripe';
