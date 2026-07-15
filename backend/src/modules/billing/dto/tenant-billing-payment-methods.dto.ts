import { IsIn, IsOptional } from 'class-validator';

export class TenantCreateSetupIntentDto {
  @IsOptional()
  @IsIn(['card', 'sepa_debit'])
  paymentMethodType?: 'card' | 'sepa_debit';
}

export class TenantCustomerPortalDto {
  @IsOptional()
  returnUrl?: string;
}

export type TenantPaymentMethodBillingState =
  | 'READY'
  | 'MISSING'
  | 'REQUIRES_ACTION'
  | 'FAILED';

export interface TenantPaymentMethodDto {
  id: string;
  type: 'CARD' | 'SEPA_DEBIT' | 'OTHER';
  typeLabel: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  bankName: string | null;
  mandateStatusLabel: string | null;
  isDefault: boolean;
  statusLabel: string;
  billingState: TenantPaymentMethodBillingState;
}

export interface TenantPaymentMethodsDto {
  configured: boolean;
  defaultMethodId: string | null;
  paymentMethods: TenantPaymentMethodDto[];
}

export interface TenantDefaultPaymentMethodDto {
  configured: boolean;
  status: TenantPaymentMethodBillingState;
  statusLabel: string;
  defaultMethod: TenantPaymentMethodDto | null;
}

export interface TenantSetupIntentDto {
  clientSecret: string;
}

export interface TenantCustomerPortalSessionDto {
  url: string;
  returnUrl: string;
}
