import { buildRegistryActivateBillingIdempotencyKey } from '@modules/billing/registry-lifecycle/validate-vehicle-activated-registry-event';
import { activationOutboxIdempotencyKey } from '../services/vehicle-onboarding-activation.service';

export { activationOutboxIdempotencyKey, buildRegistryActivateBillingIdempotencyKey };

/**
 * Canonical activation publishes one durable outbox row per onboarding case id.
 * Billing consumes one quantity event per registry event id (VO5B-AB1).
 */
export function describeRegistrationConvergenceIdempotencyContract(): {
  activationOutboxKeyShape: string;
  billingActivateKeyShape: string;
} {
  return {
    activationOutboxKeyShape: 'vehicle-onboarding:VEHICLE_ACTIVATED:v1:{onboardingCaseId}',
    billingActivateKeyShape: 'vehicle-registry:{eventId}:billing-activate:v1',
  };
}