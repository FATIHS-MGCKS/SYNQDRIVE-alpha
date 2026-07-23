import { createHash } from 'crypto';
import type { RentalRuleRevision } from '@prisma/client';
import type { BookingEligibilityGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import type { CustomerEligibilityFact } from '@modules/customer-verification/policies/customer-fact-trust.policy';
import { BOOKING_ELIGIBILITY_DECISION_RECHECK_WINDOW_MS } from './booking-eligibility-decision.constants';

const PII_FACT_FIELDS = new Set(['dateOfBirth', 'licenseIssuedAt', 'licenseExpiry']);

export function buildRulesHashFromRevisions(revisions: RentalRuleRevision[]): string {
  const payload = revisions
    .map((revision) => ({ id: revision.id, rulesHash: revision.rulesHash, version: revision.version }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function sanitizeFactProvenance(facts: CustomerEligibilityFact[]): Array<{
  field: string;
  sourceType: string;
  verificationStatus: string;
  verifiedAt: string | null;
}> {
  return facts.map((fact) => ({
    field: fact.field,
    sourceType: fact.sourceType,
    verificationStatus: fact.verificationStatus,
    verifiedAt: fact.verifiedAt,
  }));
}

export function buildDerivedFactsFromGateResult(
  gateResult: BookingEligibilityGateResult,
): Record<string, unknown> {
  const rentalResult = gateResult.domains.rentalRules.result;
  const derived: Record<string, unknown> = {
    gateStage: gateResult.stage,
    allowed: gateResult.allowed,
    recheckRequired: gateResult.recheckRequired,
    sourceRuleIds: gateResult.sourceRuleIds,
  };

  if (rentalResult) {
    derived.rentalChecks = {
      status: rentalResult.status,
      decisionSource: rentalResult.decisionSource,
      blockingReasonCount: rentalResult.blockingReasons.length,
      warningReasonCount: rentalResult.warningReasons.length,
      missingFieldCount: rentalResult.missingFields.length,
    };
    derived.factProvenance = sanitizeFactProvenance(rentalResult.facts ?? []);
  }

  const customerResult = gateResult.domains.customer.result;
  if (gateResult.domains.customer.evaluated && customerResult) {
    derived.customer = {
      canProceedForStage: gateResult.domains.customer.canProceedForStage,
      globalBlockingReasonCount: customerResult.globalBlockingReasons.length,
      warningCount: customerResult.warnings.length,
    };
  }

  const verificationResult = gateResult.domains.verification.result;
  if (gateResult.domains.verification.evaluated && verificationResult) {
    derived.verification = {
      idDocumentStatus: verificationResult.idDocument,
      drivingLicenseStatus: verificationResult.drivingLicense,
      proofOfAddressStatus: verificationResult.proofOfAddress,
      canConfirmBooking: verificationResult.canConfirmBooking,
      canStartPickup: verificationResult.canStartPickup,
    };
  }

  if (gateResult.domains.vehicleReadiness.evaluated) {
    derived.vehicleReadiness = {
      blocked: gateResult.domains.vehicleReadiness.blocked,
      skipped: gateResult.domains.vehicleReadiness.skipped,
      healthGateStatus: gateResult.domains.vehicleReadiness.healthGateStatus ?? null,
    };
  }

  return derived;
}

export function buildDataSourcesFromGateResult(
  gateResult: BookingEligibilityGateResult,
): Record<string, unknown> {
  return {
    customer: {
      evaluated: gateResult.domains.customer.evaluated,
      canProceedForStage: gateResult.domains.customer.canProceedForStage,
      error: gateResult.domains.customer.error ?? null,
    },
    verification: {
      evaluated: gateResult.domains.verification.evaluated,
      idDocumentStatus: gateResult.domains.verification.result?.idDocument ?? null,
      drivingLicenseStatus: gateResult.domains.verification.result?.drivingLicense ?? null,
      error: gateResult.domains.verification.error ?? null,
    },
    rentalRules: {
      evaluated: gateResult.domains.rentalRules.evaluated,
      decisionSource: gateResult.domains.rentalRules.result?.decisionSource ?? null,
      error: gateResult.domains.rentalRules.error ?? null,
    },
    vehicle: {
      evaluated: gateResult.domains.vehicle.evaluated,
      vehicleFound: gateResult.domains.vehicle.vehicleFound,
      error: gateResult.domains.vehicle.error ?? null,
    },
    vehicleReadiness: {
      evaluated: gateResult.domains.vehicleReadiness.evaluated,
      skipped: gateResult.domains.vehicleReadiness.skipped,
      blocked: gateResult.domains.vehicleReadiness.blocked,
      error: gateResult.domains.vehicleReadiness.error ?? null,
    },
    pricingDeposit: {
      evaluated: gateResult.domains.pricingDeposit.evaluated,
      skipped: gateResult.domains.pricingDeposit.skipped,
      error: gateResult.domains.pricingDeposit.error ?? null,
    },
  };
}

export function resolveRecheckAt(gateResult: BookingEligibilityGateResult): Date | null {
  if (!gateResult.recheckRequired) return null;
  const evaluatedAt = new Date(gateResult.evaluatedAt);
  if (Number.isNaN(evaluatedAt.getTime())) return null;
  return new Date(evaluatedAt.getTime() + BOOKING_ELIGIBILITY_DECISION_RECHECK_WINDOW_MS);
}

export function serializeGateReasons(
  reasons: BookingEligibilityGateResult['blockingReasons'],
): Array<{ code: string; domain: string; message: string; overridable?: boolean }> {
  return reasons.map((reason) => ({
    code: reason.code,
    domain: reason.domain,
    message: reason.message,
    ...(reason.overridable != null ? { overridable: reason.overridable } : {}),
  }));
}

export function assertNoPiiInDerivedFacts(derivedFacts: Record<string, unknown>): void {
  const json = JSON.stringify(derivedFacts);
  for (const field of PII_FACT_FIELDS) {
    if (json.includes(`"${field}"`) && json.includes('factualValue')) {
      throw new Error(`Derived facts must not include factualValue for ${field}`);
    }
  }
}
