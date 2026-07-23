import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

export interface BookingModulePermissionConfig {
  /** Core booking list/detail and lifecycle writes (create/cancel/confirm/no-show). */
  core?: { read: boolean; write: boolean; manage?: boolean };
  /** PII, customer risk, signatures — separate from operational read. */
  sensitiveRead?: boolean;
  scheduleWrite?: boolean;
  customerWrite?: boolean;
  vehicleWrite?: boolean;
  finance?: { read: boolean; write?: boolean };
  documents?: { read: boolean; write?: boolean };
  handover?: { read: boolean; write?: boolean };
  auditRead?: boolean;
}

/**
 * Build granular booking permission modules from a structured config.
 * Used by organization role templates and backfill scripts.
 */
export function bookingModulePermissions(
  config: BookingModulePermissionConfig,
): MembershipPermissionsMap {
  const perms: MembershipPermissionsMap = {};

  if (config.core) {
    perms.bookings = all(
      config.core.read,
      config.core.write,
      config.core.manage ?? false,
    );
  }
  if (config.sensitiveRead !== undefined) {
    perms['bookings-sensitive'] = all(config.sensitiveRead, false);
  }
  if (config.scheduleWrite !== undefined) {
    perms['bookings-schedule'] = all(false, config.scheduleWrite);
  }
  if (config.customerWrite !== undefined) {
    perms['bookings-customer'] = all(false, config.customerWrite);
  }
  if (config.vehicleWrite !== undefined) {
    perms['bookings-vehicle'] = all(false, config.vehicleWrite);
  }
  if (config.finance) {
    perms['bookings-finance'] = all(
      config.finance.read,
      config.finance.write ?? false,
    );
  }
  if (config.documents) {
    perms['bookings-documents'] = all(
      config.documents.read,
      config.documents.write ?? false,
    );
  }
  if (config.handover) {
    perms['bookings-handover'] = all(
      config.handover.read,
      config.handover.write ?? false,
    );
  }
  if (config.auditRead !== undefined) {
    perms['bookings-audit'] = all(config.auditRead, false);
  }

  return perms;
}

/** Full booking access for org admins (all sub-modules at appropriate levels). */
export function bookingFullPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: true, manage: true },
    sensitiveRead: true,
    scheduleWrite: true,
    customerWrite: true,
    vehicleWrite: true,
    finance: { read: true, write: true },
    documents: { read: true, write: true },
    handover: { read: true, write: true },
    auditRead: true,
  });
}

/** Operational sub-admin — no override/complete unless manage on core. */
export function bookingSubAdminPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: true, manage: false },
    sensitiveRead: true,
    scheduleWrite: true,
    customerWrite: true,
    vehicleWrite: true,
    finance: { read: true, write: false },
    documents: { read: true, write: true },
    handover: { read: true, write: true },
    auditRead: true,
  });
}

/** Disposition desk — booking ops without sensitive/finance/audit. */
export function bookingDispositionPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: true },
    sensitiveRead: false,
    scheduleWrite: true,
    customerWrite: true,
    vehicleWrite: true,
    finance: { read: true, write: false },
    documents: { read: true, write: false },
    handover: { read: true, write: false },
    auditRead: false,
  });
}

/** Accounting — finance-focused, read-only on core booking. */
export function bookingAccountingPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: false },
    sensitiveRead: false,
    scheduleWrite: false,
    customerWrite: false,
    vehicleWrite: false,
    finance: { read: true, write: true },
    documents: { read: true, write: false },
    handover: { read: false, write: false },
    auditRead: true,
  });
}

/** Station manager — local ops + handover + documents. */
export function bookingStationManagerPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: true },
    sensitiveRead: false,
    scheduleWrite: true,
    customerWrite: true,
    vehicleWrite: true,
    finance: { read: true, write: false },
    documents: { read: true, write: true },
    handover: { read: true, write: true },
    auditRead: false,
  });
}

/** Standard worker — list/read only, no sensitive or financial data. */
export function bookingWorkerReadPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: false },
    sensitiveRead: false,
    scheduleWrite: false,
    customerWrite: false,
    vehicleWrite: false,
    finance: { read: false, write: false },
    documents: { read: false, write: false },
    handover: { read: false, write: false },
    auditRead: false,
  });
}

/**
 * Driver — minimal operational visibility, no prices/customer PII/signatures/finance.
 * Handover read only (assigned vehicle context), no writes.
 */
export function bookingDriverPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: false },
    sensitiveRead: false,
    scheduleWrite: false,
    customerWrite: false,
    vehicleWrite: false,
    finance: { read: false, write: false },
    documents: { read: false, write: false },
    handover: { read: true, write: false },
    auditRead: false,
  });
}

/** Field agent — handover perform + basic booking read, no finance/sensitive. */
export function bookingFieldAgentPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: false },
    sensitiveRead: false,
    scheduleWrite: false,
    customerWrite: false,
    vehicleWrite: false,
    finance: { read: false, write: false },
    documents: { read: true, write: false },
    handover: { read: true, write: true },
    auditRead: false,
  });
}

/** Read-only analyst — list + finance/documents/audit read, no writes. */
export function bookingReadOnlyPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: true, write: false },
    sensitiveRead: false,
    scheduleWrite: false,
    customerWrite: false,
    vehicleWrite: false,
    finance: { read: true, write: false },
    documents: { read: true, write: false },
    handover: { read: true, write: false },
    auditRead: true,
  });
}

/** No booking access (service / workshop roles). */
export function bookingNoAccessPermissions(): MembershipPermissionsMap {
  return bookingModulePermissions({
    core: { read: false, write: false },
    sensitiveRead: false,
    scheduleWrite: false,
    customerWrite: false,
    vehicleWrite: false,
    finance: { read: false, write: false },
    documents: { read: false, write: false },
    handover: { read: false, write: false },
    auditRead: false,
  });
}
