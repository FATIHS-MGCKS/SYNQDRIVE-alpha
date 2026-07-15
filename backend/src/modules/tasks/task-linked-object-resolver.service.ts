import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { displayInvoiceNumber } from '../invoices/invoice-domain.util';
import { invoiceBookingRef } from '../invoices/utils/invoice-booking-ref.util';
import {
  TASK_LINKED_OBJECT_ICON_KEYS,
  TASK_LINKED_OBJECT_ORDER,
  TASK_LINKED_OBJECT_UNAVAILABLE,
  TASK_LINKED_OBJECT_UNAVAILABLE_REASON,
  TaskLinkedObject,
  TaskLinkedObjectActionType,
  TaskLinkIds,
} from './task-linked-object.types';

const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ausstehend',
  CONFIRMED: 'Bestätigt',
  ACTIVE: 'Aktiv',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
  NO_SHOW: 'No-Show',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf',
  ISSUED: 'Ausgestellt',
  SENT: 'Versendet',
  PARTIALLY_PAID: 'Teilweise bezahlt',
  PAID: 'Bezahlt',
  OVERDUE: 'Überfällig',
  CANCELLED: 'Storniert',
  CREDITED: 'Gutgeschrieben',
  VOID: 'Ungültig',
  UPLOADED: 'Hochgeladen',
  NEEDS_REVIEW: 'Prüfung erforderlich',
  APPROVED: 'Freigegeben',
  BOOKED: 'Gebucht',
  REJECTED: 'Abgelehnt',
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  AUTO: 'Fahrzeugdokument',
  SERVICE: 'Werkstattbeleg',
  OIL_CHANGE: 'Ölwechsel',
  TIRE: 'Reifen',
  BRAKE: 'Bremsen',
  BATTERY: 'Batterie',
  VEHICLE_CONDITION: 'Fahrzeugzustand',
  TUV_REPORT: 'TÜV/HU',
  BOKRAFT_REPORT: 'Bokraft',
  INVOICE: 'Rechnung',
  ACCIDENT: 'Unfall',
  DAMAGE: 'Schaden',
  FINE: 'Bußgeld',
  OTHER: 'Dokument',
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ausstehend',
  QUEUED: 'In Warteschlange',
  PROCESSING: 'In Verarbeitung',
  AWAITING_DOCUMENT_TYPE: 'Dokumenttyp offen',
  AWAITING_REVIEW: 'Prüfung offen',
  COMPLETED: 'Abgeschlossen',
  APPLIED: 'Übernommen',
  FAILED: 'Fehlgeschlagen',
  CANCELLED: 'Abgebrochen',
};

const FINE_STATUS_LABELS: Record<string, string> = {
  NEW: 'Neu',
  UNDER_REVIEW: 'In Prüfung',
  MATCHED: 'Zugeordnet',
  FORWARDED: 'Weitergeleitet',
  PENDING_RESPONSE: 'Rückmeldung offen',
  RESOLVED: 'Erledigt',
  CLOSED: 'Geschlossen',
};

const SERVICE_CASE_CATEGORY_LABELS: Record<string, string> = {
  SERVICE: 'Service',
  REPAIR: 'Reparatur',
  INSPECTION: 'Inspektion',
  TUV_HU: 'TÜV/HU',
  TIRES: 'Reifen',
  BRAKES: 'Bremsen',
  BATTERY: 'Batterie',
  DAMAGE: 'Schaden',
  DIAGNOSTIC: 'Diagnose',
};

const SERVICE_CASE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Offen',
  SCHEDULED: 'Geplant',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING_VENDOR: 'Wartet Partner',
  WAITING_PARTS: 'Wartet Teile',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Storniert',
};

function formatMoney(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100);
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function customerContactLabel(email?: string | null, phone?: string | null): string | null {
  const mail = email?.trim();
  if (mail) return mail;
  const tel = phone?.trim();
  return tel || null;
}

function resolveVehicleLabel(row: {
  vehicleName?: string | null;
  make: string;
  model: string;
}): string | null {
  const named = row.vehicleName?.trim();
  if (named) return named;
  const base = [row.make, row.model].filter(Boolean).join(' ').trim();
  return base || null;
}

function resolveCustomerLabel(row: {
  company?: string | null;
  firstName: string;
  lastName: string;
}): string | null {
  const company = row.company?.trim();
  if (company) return company;
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

function unavailableObject(
  type: TaskLinkedObject['type'],
  id: string,
  action: TaskLinkedObject['action'],
): TaskLinkedObject {
  return {
    type,
    id,
    primaryLabel: TASK_LINKED_OBJECT_UNAVAILABLE[type],
    secondaryLabel: null,
    statusLabel: null,
    iconKey: TASK_LINKED_OBJECT_ICON_KEYS[type],
    action,
    isAvailable: false,
    unavailableReason: TASK_LINKED_OBJECT_UNAVAILABLE_REASON,
  };
}

@Injectable()
export class TaskLinkedObjectResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForTask(orgId: string, links: TaskLinkIds): Promise<TaskLinkedObject[]> {
    const [
      vehicleById,
      bookingById,
      customerById,
      invoiceById,
      documentById,
      alertById,
      serviceCaseById,
      fineById,
      vendorById,
    ] = await Promise.all([
      this.loadVehicles(orgId, links.vehicleId),
      this.loadBookings(orgId, links.bookingId),
      this.loadCustomers(orgId, links.customerId),
      this.loadInvoices(orgId, links.invoiceId),
      this.loadDocuments(orgId, links.documentId),
      this.loadAlerts(orgId, links.alertId),
      this.loadServiceCases(orgId, links.serviceCaseId),
      this.loadFines(orgId, links.fineId),
      this.loadVendors(orgId, links.vendorId),
    ]);

    const objects: TaskLinkedObject[] = [];

    if (links.vehicleId) {
      objects.push(this.buildVehicle(links.vehicleId, vehicleById.get(links.vehicleId)));
    }
    if (links.bookingId) {
      objects.push(this.buildBooking(links.bookingId, bookingById.get(links.bookingId)));
    }
    if (links.customerId) {
      objects.push(this.buildCustomer(links.customerId, customerById.get(links.customerId)));
    }
    if (links.serviceCaseId) {
      objects.push(this.buildServiceCase(links.serviceCaseId, serviceCaseById.get(links.serviceCaseId)));
    }
    if (links.invoiceId) {
      objects.push(this.buildInvoice(links.invoiceId, invoiceById.get(links.invoiceId)));
    }
    if (links.documentId) {
      objects.push(this.buildDocument(links.documentId, documentById.get(links.documentId)));
    }
    if (links.fineId) {
      objects.push(this.buildFine(links.fineId, fineById.get(links.fineId)));
    }
    if (links.vendorId) {
      objects.push(this.buildVendor(links.vendorId, vendorById.get(links.vendorId)));
    }
    if (links.alertId) {
      objects.push(this.buildAlert(links.alertId, alertById.get(links.alertId)));
    }

    return objects.sort(
      (a, b) => TASK_LINKED_OBJECT_ORDER.indexOf(a.type) - TASK_LINKED_OBJECT_ORDER.indexOf(b.type),
    );
  }

  private async loadVehicles(orgId: string, vehicleId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchVehicles>>[number]>();
    if (!vehicleId) return map;
    for (const row of await this.fetchVehicles(orgId, [vehicleId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchVehicles(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.vehicle.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        vehicleName: true,
        status: true,
        homeStation: { select: { name: true } },
      },
    });
  }

  private async loadBookings(orgId: string, bookingId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchBookings>>[number]>();
    if (!bookingId) return map;
    for (const row of await this.fetchBookings(orgId, [bookingId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchBookings(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.booking.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        vehicle: { select: { licensePlate: true } },
        customer: { select: { firstName: true, lastName: true, company: true } },
      },
    });
  }

  private async loadCustomers(orgId: string, customerId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchCustomers>>[number]>();
    if (!customerId) return map;
    for (const row of await this.fetchCustomers(orgId, [customerId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchCustomers(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.customer.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        email: true,
        phone: true,
      },
    });
  }

  private async loadInvoices(orgId: string, invoiceId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchInvoices>>[number]>();
    if (!invoiceId) return map;
    for (const row of await this.fetchInvoices(orgId, [invoiceId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchInvoices(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.orgInvoice.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        title: true,
        status: true,
        totalCents: true,
        currency: true,
        invoiceNumberDisplay: true,
        legacyInvoiceNumber: true,
        invoiceNumber: true,
        sequenceYear: true,
        sequenceNumber: true,
      },
    });
  }

  private async loadDocuments(orgId: string, documentId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchDocuments>>[number]>();
    if (!documentId) return map;
    for (const row of await this.fetchDocuments(orgId, [documentId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchDocuments(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.vehicleDocumentExtraction.findMany({
      where: { id: { in: ids }, organizationId: orgId },
      select: {
        id: true,
        effectiveDocumentType: true,
        documentType: true,
        status: true,
        sourceFileName: true,
      },
    });
  }

  private async loadAlerts(orgId: string, alertId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchAlerts>>[number]>();
    if (!alertId) return map;
    for (const row of await this.fetchAlerts(orgId, [alertId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchAlerts(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.dashboardInsight.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        title: true,
        isActive: true,
        severity: true,
        type: true,
      },
    });
  }

  private async loadServiceCases(orgId: string, serviceCaseId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchServiceCases>>[number]>();
    if (!serviceCaseId) return map;
    for (const row of await this.fetchServiceCases(orgId, [serviceCaseId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchServiceCases(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.serviceCase.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
      },
    });
  }

  private async loadFines(orgId: string, fineId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchFines>>[number]>();
    if (!fineId) return map;
    for (const row of await this.fetchFines(orgId, [fineId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchFines(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.fine.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        title: true,
        fineNumber: true,
        status: true,
        amountCents: true,
        currency: true,
      },
    });
  }

  private async loadVendors(orgId: string, vendorId?: string | null) {
    const map = new Map<string, Awaited<ReturnType<typeof this.fetchVendors>>[number]>();
    if (!vendorId) return map;
    for (const row of await this.fetchVendors(orgId, [vendorId])) {
      map.set(row.id, row);
    }
    return map;
  }

  private fetchVendors(orgId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.vendor.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: {
        id: true,
        name: true,
        category: true,
        isActive: true,
        city: true,
      },
    });
  }

  private buildVehicle(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchVehicles>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_VEHICLE, vehicleId: id };
    if (!row) return unavailableObject('VEHICLE', id, action);

    const makeModel = resolveVehicleLabel(row);
    const station = row.homeStation?.name?.trim();
    const secondaryParts = [makeModel, station].filter(Boolean);

    return {
      type: 'VEHICLE',
      id,
      primaryLabel: row.licensePlate?.trim() || makeModel || 'Fahrzeug',
      secondaryLabel: secondaryParts.length ? secondaryParts.join(' · ') : null,
      statusLabel: row.status,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.VEHICLE,
      action,
      isAvailable: true,
    };
  }

  private buildBooking(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchBookings>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_BOOKING, bookingId: id };
    if (!row) return unavailableObject('BOOKING', id, action);

    const customer = resolveCustomerLabel(row.customer);
    const plate = row.vehicle?.licensePlate?.trim();
    const secondaryParts = [customer, plate, formatDateRange(row.startDate, row.endDate)].filter(Boolean);

    return {
      type: 'BOOKING',
      id,
      primaryLabel: invoiceBookingRef(id),
      secondaryLabel: secondaryParts.join(' · ') || null,
      statusLabel: BOOKING_STATUS_LABELS[row.status] ?? row.status,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.BOOKING,
      action,
      isAvailable: true,
    };
  }

  private buildCustomer(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchCustomers>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_CUSTOMER, customerId: id };
    if (!row) return unavailableObject('CUSTOMER', id, action);

    return {
      type: 'CUSTOMER',
      id,
      primaryLabel: resolveCustomerLabel(row) || 'Kunde',
      secondaryLabel: customerContactLabel(row.email, row.phone),
      statusLabel: null,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.CUSTOMER,
      action,
      isAvailable: true,
    };
  }

  private buildInvoice(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchInvoices>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_INVOICE, invoiceId: id };
    if (!row) return unavailableObject('INVOICE', id, action);

    const number = displayInvoiceNumber(row);
    const amount = formatMoney(row.totalCents, row.currency);

    return {
      type: 'INVOICE',
      id,
      primaryLabel: number,
      secondaryLabel: row.title?.trim() || amount,
      statusLabel: INVOICE_STATUS_LABELS[row.status] ?? row.status,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.INVOICE,
      action,
      isAvailable: true,
    };
  }

  private buildDocument(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchDocuments>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_DOCUMENT, documentId: id };
    if (!row) return unavailableObject('DOCUMENT', id, action);

    const docType = row.effectiveDocumentType ?? row.documentType;
    const typeLabel = docType ? DOCUMENT_TYPE_LABELS[docType] ?? docType : 'Dokument';
    const fileName = row.sourceFileName?.trim();

    return {
      type: 'DOCUMENT',
      id,
      primaryLabel: typeLabel,
      secondaryLabel: fileName || null,
      statusLabel: DOCUMENT_STATUS_LABELS[row.status] ?? row.status,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.DOCUMENT,
      action,
      isAvailable: true,
    };
  }

  private buildAlert(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchAlerts>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_ALERT, alertId: id };
    if (!row) return unavailableObject('ALERT', id, action);

    return {
      type: 'ALERT',
      id,
      primaryLabel: row.title?.trim() || 'Betriebshinweis',
      secondaryLabel: row.type,
      statusLabel: row.isActive ? 'Aktiv' : 'Inaktiv',
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.ALERT,
      action,
      isAvailable: true,
    };
  }

  private buildServiceCase(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchServiceCases>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_SERVICE_CASE, serviceCaseId: id };
    if (!row) return unavailableObject('SERVICE_CASE', id, action);

    return {
      type: 'SERVICE_CASE',
      id,
      primaryLabel: row.title?.trim() || 'Servicefall',
      secondaryLabel: SERVICE_CASE_CATEGORY_LABELS[row.category] ?? row.category,
      statusLabel: SERVICE_CASE_STATUS_LABELS[row.status] ?? row.status,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.SERVICE_CASE,
      action,
      isAvailable: true,
    };
  }

  private buildFine(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchFines>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_FINE, fineId: id };
    if (!row) return unavailableObject('FINE', id, action);

    return {
      type: 'FINE',
      id,
      primaryLabel: row.fineNumber?.trim() || row.title?.trim() || 'Bußgeld',
      secondaryLabel: formatMoney(row.amountCents, row.currency),
      statusLabel: FINE_STATUS_LABELS[row.status] ?? row.status,
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.FINE,
      action,
      isAvailable: true,
    };
  }

  private buildVendor(
    id: string,
    row?: Awaited<ReturnType<typeof this.fetchVendors>>[number],
  ): TaskLinkedObject {
    const action = { type: TaskLinkedObjectActionType.OPEN_VENDOR, vendorId: id };
    if (!row) return unavailableObject('VENDOR', id, action);

    const location = row.city?.trim();

    return {
      type: 'VENDOR',
      id,
      primaryLabel: row.name?.trim() || 'Partner',
      secondaryLabel: location || row.category,
      statusLabel: row.isActive ? 'Aktiv' : 'Inaktiv',
      iconKey: TASK_LINKED_OBJECT_ICON_KEYS.VENDOR,
      action,
      isAvailable: true,
    };
  }
}
