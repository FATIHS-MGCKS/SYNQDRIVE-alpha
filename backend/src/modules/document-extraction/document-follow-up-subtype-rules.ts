import { hasDefects, readReinspectionDeadline, readReinspectionRequired } from './document-inspection-extraction.rules';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';
import { readInvoiceNumber, readTotalGrossCents } from './document-invoice-extraction.rules';
import {
  readInsuranceReference,
  readPoliceReference,
  readThirdPartyInvolved,
} from './document-damage-extraction.rules';
import { readServiceOdometerKm } from './document-service-extraction.rules';
import {
  DOCUMENT_FOLLOW_UP_RULE_TRIGGERS,
  type DocumentFollowUpRuleTrigger,
} from './document-follow-up-subtype-rules.catalog';

export * from './document-follow-up-subtype-rules.catalog';

function readEntityLinkIds(confirmedData: Record<string, unknown>) {
  const links = readAcceptedEntityLinks(confirmedData);
  const byType = new Map(links.map((link) => [link.entityType, link.entityId]));
  return {
    vehicleId: byType.get('vehicle') ?? null,
    bookingId: byType.get('booking') ?? null,
    customerId: byType.get('customer') ?? null,
    driverCustomerId: byType.get('driver') ?? byType.get('driver_customer') ?? null,
    vendorId: byType.get('vendor') ?? byType.get('partner') ?? null,
  };
}

function hasDetectedDeadline(confirmedData: Record<string, unknown>): boolean {
  if (typeof confirmedData.dueDate === 'string' && confirmedData.dueDate.trim()) return true;
  if (Array.isArray(confirmedData.deadlines) && confirmedData.deadlines.length > 0) return true;
  if (typeof confirmedData.paymentDueDate === 'string' && confirmedData.paymentDueDate.trim()) return true;
  return false;
}

function hasNextServiceDue(confirmedData: Record<string, unknown>): boolean {
  return Boolean(
    (typeof confirmedData.nextServiceDate === 'string' && confirmedData.nextServiceDate.trim()) ||
      (typeof confirmedData.validUntil === 'string' && confirmedData.validUntil.trim()) ||
      (typeof confirmedData.nextInspectionDate === 'string' && confirmedData.nextInspectionDate.trim()),
  );
}

function hasMileageThreshold(confirmedData: Record<string, unknown>): boolean {
  const nextMileage =
    confirmedData.nextServiceMileageKm ?? confirmedData.nextServiceMileage ?? confirmedData.serviceIntervalKm;
  const odometer = readServiceOdometerKm(confirmedData);
  return nextMileage != null && odometer != null;
}

function isCustomerContactRelevant(confirmedData: Record<string, unknown>): boolean {
  const links = readEntityLinkIds(confirmedData);
  if (links.customerId || links.bookingId) return true;
  return !links.customerId && Boolean(links.vehicleId || links.driverCustomerId);
}

function isInsuranceContext(confirmedData: Record<string, unknown>): boolean {
  return Boolean(
    readInsuranceReference(confirmedData) ||
      readPoliceReference(confirmedData) ||
      confirmedData.insuranceInvolved === true ||
      readThirdPartyInvolved(confirmedData),
  );
}

function isDamageContext(confirmedData: Record<string, unknown>): boolean {
  return Boolean(
    confirmedData.damageType ||
      confirmedData.eventDate ||
      confirmedData.damageDescription ||
      readThirdPartyInvolved(confirmedData),
  );
}

export function evaluateVersionedFollowUpTrigger(
  trigger: DocumentFollowUpRuleTrigger,
  confirmedData: Record<string, unknown>,
): boolean {
  const links = readEntityLinkIds(confirmedData);
  switch (trigger) {
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_DRIVER:
      return !links.driverCustomerId;
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_CUSTOMER:
      return !links.customerId;
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_BOOKING:
      return !links.bookingId;
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MISSING_VENDOR:
      return !links.vendorId;
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEADLINE_DETECTED:
      return hasDetectedDeadline(confirmedData);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DUPLICATE_REFERENCE:
      return Boolean(confirmedData.duplicateReferenceFineId || confirmedData.duplicateVendorInvoiceId);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.DEFECT_DETECTED:
      return hasDefects(confirmedData) || isDamageContext(confirmedData);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.REINSPECTION_DUE:
      return (
        readReinspectionRequired(confirmedData) &&
        Boolean(readReinspectionDeadline(confirmedData) || confirmedData.validUntil)
      );
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.NEXT_SERVICE_DUE:
      return hasNextServiceDue(confirmedData);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.MILEAGE_THRESHOLD:
      return hasMileageThreshold(confirmedData);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.PAYMENT_APPROVAL_NEEDED:
      return Boolean(readInvoiceNumber(confirmedData) && readTotalGrossCents(confirmedData) != null);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.CUSTOMER_CONTACT_RELEVANT:
      return isCustomerContactRelevant(confirmedData);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.INSURANCE_CONTEXT:
      return isInsuranceContext(confirmedData);
    case DOCUMENT_FOLLOW_UP_RULE_TRIGGERS.ARCHIVE_READY:
      return true;
    default:
      return false;
  }
}
