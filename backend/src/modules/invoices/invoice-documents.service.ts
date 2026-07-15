import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeneratedDocument, OrgInvoice, OrgInvoiceType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPE,
} from '@modules/documents/documents.constants';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DocumentNumberingService } from '@modules/documents/document-numbering.service';
import { DOCUMENT_RENDERER, DocumentRenderer } from '@modules/documents/renderers/render-model';
import { Inject } from '@nestjs/common';
import { buildBookingInvoiceDocument, InvoiceLineItem } from '@modules/documents/templates/booking-invoice.template';
import {
  CustomerInfo,
  OrgInfo,
  VehicleInfo,
} from '@modules/documents/templates/template-helpers';
import { displayInvoiceNumber, isOutgoingInvoiceType } from './invoice-domain.util';
import {
  buildInvoiceDocumentCapabilities,
  isActiveDocumentStatus,
  isSendableDocumentStatus,
} from './invoice-documents.capabilities';
import {
  documentStatusLabelDe,
  documentTypeLabelDe,
  formatFileSizeLabel,
  outboundEmailStatusLabelDe,
  userDisplayName,
} from './invoice-documents.labels';

export type InvoiceDocumentPanelState = 'ACTIVE' | 'EMPTY' | 'GENERATING' | 'FAILED';

export interface InvoiceDocumentCapabilityDto {
  allowed: boolean;
  reason: string | null;
}

export interface InvoiceDocumentVersionDto {
  id: string;
  fileName: string;
  documentType: string;
  documentTypeLabel: string;
  version: number;
  isActive: boolean;
  status: string;
  statusLabel: string;
  createdAt: string;
  createdByName: string | null;
  sizeBytes: number | null;
  sizeLabel: string | null;
  capabilities: {
    preview: InvoiceDocumentCapabilityDto;
    download: InvoiceDocumentCapabilityDto;
  };
}

export interface InvoiceDeliveryHistoryItemDto {
  id: string;
  recipient: string;
  channelLabel: string;
  documentVersionLabel: string;
  sentAt: string | null;
  createdAt: string;
  triggeredByName: string | null;
  status: string;
  statusLabel: string;
  errorMessage: string | null;
  capabilities: {
    retry: InvoiceDocumentCapabilityDto;
  };
}

export interface InvoiceDocumentsPanelDto {
  panelState: InvoiceDocumentPanelState;
  activeDocument: InvoiceDocumentVersionDto | null;
  versions: InvoiceDocumentVersionDto[];
  generation: {
    status: 'idle' | 'processing' | 'failed';
    lastAttemptAt: string | null;
    errorMessage: string | null;
  };
  capabilities: {
    preview: InvoiceDocumentCapabilityDto;
    download: InvoiceDocumentCapabilityDto;
    sendEmail: InvoiceDocumentCapabilityDto;
    generate: InvoiceDocumentCapabilityDto;
    regenerate: InvoiceDocumentCapabilityDto;
    retry: InvoiceDocumentCapabilityDto;
  };
  deliveryHistory: InvoiceDeliveryHistoryItemDto[];
  hasIncomingAttachment: boolean;
}

interface GenerationFailure {
  at: Date;
  message: string;
}

const TEMPLATE_VERSION = '1';

@Injectable()
export class InvoiceDocumentsService {
  private readonly logger = new Logger(InvoiceDocumentsService.name);
  private readonly generating = new Map<string, Promise<void>>();
  private readonly failures = new Map<string, GenerationFailure>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly generatedDocs: GeneratedDocumentsService,
    private readonly bundle: BookingDocumentBundleService,
    private readonly numbering: DocumentNumberingService,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
  ) {}

  private get generationEnabled(): boolean {
    return this.config.get<boolean>('documents.generationEnabled', true);
  }

  isGenerating(invoiceId: string): boolean {
    return this.generating.has(invoiceId);
  }

  async getPanel(
    orgId: string,
    invoiceId: string,
    options?: { isAdmin?: boolean },
  ): Promise<InvoiceDocumentsPanelDto> {
    const invoice = await this.requireInvoice(orgId, invoiceId);
    const isAdmin = options?.isAdmin ?? false;
    const docs = await this.generatedDocs.listForInvoice(
      orgId,
      invoiceId,
      invoice.bookingId,
      invoice.generatedDocumentId,
    );
    const versions = await this.mapVersions(orgId, docs, invoice);
    const activeDocument = versions.find((v) => v.isActive) ?? null;
    const hasActiveDocument = activeDocument != null;
    const hasSendableDocument = docs.some((d) => isSendableDocumentStatus(d.status));
    const hasIncomingAttachment = Boolean(invoice.imageUrl);
    const isGenerating = this.isGenerating(invoiceId);
    const inMemoryFailure = this.failures.get(invoiceId) ?? null;
    const persistedFailureDoc = docs
      .filter((d) => d.status === DOCUMENT_STATUS.FAILED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const persistedFailureMeta = persistedFailureDoc?.metadata as { errorMessage?: string } | null;
    const failure =
      inMemoryFailure ??
      (persistedFailureDoc
        ? {
            at: persistedFailureDoc.createdAt,
            message: persistedFailureMeta?.errorMessage ?? 'PDF-Erzeugung fehlgeschlagen',
          }
        : null);
    const lastGenerationFailed = Boolean(failure && !hasActiveDocument);

    const capabilities = buildInvoiceDocumentCapabilities({
      invoiceType: invoice.type,
      invoiceStatus: invoice.status,
      isAdmin,
      isGenerating,
      hasActiveDocument,
      hasSendableDocument,
      hasIncomingAttachment,
      lastGenerationFailed,
      canGeneratePdf: this.canGeneratePdf(invoice.type),
    });

    const panelState: InvoiceDocumentPanelState = isGenerating
      ? 'GENERATING'
      : lastGenerationFailed
        ? 'FAILED'
        : hasActiveDocument || hasIncomingAttachment
          ? 'ACTIVE'
          : 'EMPTY';

    const deliveryHistory = await this.loadDeliveryHistory(orgId, invoiceId, isAdmin);

    return {
      panelState,
      activeDocument,
      versions,
      generation: {
        status: isGenerating ? 'processing' : lastGenerationFailed ? 'failed' : 'idle',
        lastAttemptAt: failure?.at.toISOString() ?? null,
        errorMessage: failure?.message ?? null,
      },
      capabilities,
      deliveryHistory,
      hasIncomingAttachment,
    };
  }

  async generate(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    options?: { regenerate?: boolean },
  ): Promise<InvoiceDocumentsPanelDto> {
    if (this.isGenerating(invoiceId)) {
      throw new ConflictException('PDF wird bereits erzeugt');
    }

    const invoice = await this.requireInvoice(orgId, invoiceId);
    if (!isOutgoingInvoiceType(invoice.type)) {
      throw new BadRequestException('PDF-Erzeugung nur für Ausgangsrechnungen');
    }
    if (invoice.status === 'DRAFT') {
      throw new BadRequestException('Zuerst ausstellen, danach PDF erzeugen');
    }
    if (!this.canGeneratePdf(invoice.type)) {
      throw new BadRequestException('PDF-Erzeugung für diesen Rechnungstyp nicht verfügbar');
    }
    if (!this.generationEnabled) {
      throw new BadRequestException('Dokumentenerzeugung ist derzeit deaktiviert');
    }

    const regenerate = options?.regenerate === true;
    const run = this.runGeneration(orgId, invoice, userId, regenerate);
    this.generating.set(invoiceId, run);
    try {
      await run;
      this.failures.delete(invoiceId);
    } catch (err) {
      const message = this.userFacingError(err);
      this.failures.set(invoiceId, { at: new Date(), message });
      await this.generatedDocs.recordInvoiceGenerationFailure({
        organizationId: orgId,
        invoiceId: invoice.id,
        bookingId: invoice.bookingId,
        customerId: invoice.customerId,
        vehicleId: invoice.vehicleId,
        errorMessage: message,
        generatedByUserId: userId,
      });
      throw new BadRequestException(message);
    } finally {
      this.generating.delete(invoiceId);
    }

    return this.getPanel(orgId, invoiceId, { isAdmin: true });
  }

  private async runGeneration(
    orgId: string,
    invoice: OrgInvoice,
    userId: string | null,
    force: boolean,
  ): Promise<void> {
    if (invoice.bookingId && invoice.type === 'OUTGOING_BOOKING') {
      if (force) {
        await this.bundle.regenerate(orgId, invoice.bookingId, DOCUMENT_TYPE.BOOKING_INVOICE, userId);
      } else {
        const view = await this.bundle.getBundleView(orgId, invoice.bookingId);
        const hasInvoiceDoc = view.documents.some(
          (d) => d.documentType === DOCUMENT_TYPE.BOOKING_INVOICE && d.status !== DOCUMENT_STATUS.VOID,
        );
        if (!hasInvoiceDoc) {
          await this.bundle.generateInitialBundle(orgId, invoice.bookingId, userId ?? undefined);
        }
      }
      const doc = await this.findLatestInvoiceDocument(orgId, invoice);
      if (doc) {
        await this.linkInvoiceToDocument(invoice.id, doc.id);
      }
      return;
    }

    const doc = await this.generateStandaloneInvoicePdf(orgId, invoice, userId, force);
    await this.linkInvoiceToDocument(invoice.id, doc.id);
  }

  private async generateStandaloneInvoicePdf(
    orgId: string,
    invoice: OrgInvoice,
    userId: string | null,
    force: boolean,
  ): Promise<GeneratedDocument> {
    const existing = await this.findLatestInvoiceDocument(orgId, invoice);
    if (existing && !force && isActiveDocumentStatus(existing.status)) {
      return existing;
    }
    if (existing && force) {
      await this.generatedDocs.voidDocument(orgId, existing.id);
    }

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const customer = invoice.customerId
      ? await this.prisma.customer.findFirst({ where: { id: invoice.customerId, organizationId: orgId } })
      : null;
    const vehicle = invoice.vehicleId
      ? await this.prisma.vehicle.findFirst({ where: { id: invoice.vehicleId, organizationId: orgId } })
      : null;

    const lineItems = this.parseLineItems(invoice.lineItems, invoice.totalCents);
    const cur = (invoice.currency || 'EUR').toUpperCase();
    const renderable = buildBookingInvoiceDocument({
      org: this.toOrgInfo(org),
      customer: this.toCustomerInfo(customer),
      vehicle: this.toVehicleInfo(vehicle),
      booking: {
        id: invoice.bookingId ?? invoice.id,
        startDate: invoice.invoiceDate,
        endDate: invoice.dueDate ?? invoice.invoiceDate,
        totalPriceCents: invoice.totalCents,
        currency: cur,
      },
      documentNumber: await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.BOOKING_INVOICE),
      invoiceNumberLabel: displayInvoiceNumber(invoice),
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      lineItems,
      subtotalCents: invoice.subtotalCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
      currency: cur,
    });

    const invoiceLabel = displayInvoiceNumber(invoice);
    const fileName = `rechnung-${invoiceLabel.replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;
    const buffer = await this.renderer.renderPdf({
      document: renderable,
      fileName,
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      organizationId: orgId,
      bookingId: invoice.bookingId,
    });

    return this.generatedDocs.createFromPdf({
      organizationId: orgId,
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      title: `Rechnung · ${invoiceLabel}`,
      fileName,
      buffer,
      bookingId: invoice.bookingId,
      customerId: invoice.customerId,
      vehicleId: invoice.vehicleId,
      invoiceId: invoice.id,
      documentNumber: renderable.documentNumber ?? null,
      templateKey: DOCUMENT_TYPE.BOOKING_INVOICE,
      templateVersion: TEMPLATE_VERSION,
      generatedByUserId: userId,
      snapshot: { kind: 'ORG_INVOICE', invoiceId: invoice.id, totalCents: invoice.totalCents },
    });
  }

  private async findLatestInvoiceDocument(
    orgId: string,
    invoice: OrgInvoice,
  ): Promise<GeneratedDocument | null> {
    const docs = await this.generatedDocs.listForInvoice(
      orgId,
      invoice.id,
      invoice.bookingId,
      invoice.generatedDocumentId,
    );
    return (
      docs.find((d) => d.status !== DOCUMENT_STATUS.VOID && isActiveDocumentStatus(d.status)) ??
      docs.find((d) => d.status !== DOCUMENT_STATUS.VOID) ??
      null
    );
  }

  /** Sets OrgInvoice.generatedDocumentId (active PDF pointer). Document.invoiceId is set at create time. */
  private async linkInvoiceToDocument(invoiceId: string, documentId: string): Promise<void> {
    await this.prisma.orgInvoice.update({
      where: { id: invoiceId },
      data: { generatedDocumentId: documentId },
    });
  }

  private async mapVersions(
    orgId: string,
    docs: GeneratedDocument[],
    invoice: OrgInvoice,
  ): Promise<InvoiceDocumentVersionDto[]> {
    const nonVoid = docs.filter((d) => d.status !== DOCUMENT_STATUS.VOID);
    const userIds = [...new Set(nonVoid.map((d) => d.generatedByUserId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activeId =
      nonVoid.find((d) => isSendableDocumentStatus(d.status))?.id ??
      nonVoid.find((d) => isActiveDocumentStatus(d.status))?.id ??
      null;

    return nonVoid.map((doc, index) => {
      const version = nonVoid.length - index;
      const isActive = doc.id === activeId;
      const versionCaps = {
        preview: {
          allowed: isSendableDocumentStatus(doc.status) || doc.status === DOCUMENT_STATUS.GENERATED,
          reason: isSendableDocumentStatus(doc.status) ? null : 'Vorschau für diesen Status nicht verfügbar',
        },
        download: {
          allowed: doc.status !== DOCUMENT_STATUS.FAILED,
          reason: doc.status === DOCUMENT_STATUS.FAILED ? 'Download nicht verfügbar' : null,
        },
      };
      const creator = doc.generatedByUserId ? userMap.get(doc.generatedByUserId) : null;
      return {
        id: doc.id,
        fileName: doc.fileName,
        documentType: doc.documentType,
        documentTypeLabel: documentTypeLabelDe(doc.documentType),
        version,
        isActive,
        status: doc.status,
        statusLabel: documentStatusLabelDe(doc.status),
        createdAt: (doc.generatedAt ?? doc.createdAt).toISOString(),
        createdByName: userDisplayName(creator),
        sizeBytes: doc.sizeBytes,
        sizeLabel: formatFileSizeLabel(doc.sizeBytes),
        capabilities: versionCaps,
      };
    });
  }

  private async loadDeliveryHistory(
    orgId: string,
    invoiceId: string,
    isAdmin: boolean,
  ): Promise<InvoiceDeliveryHistoryItemDto[]> {
    const rows = await this.prisma.outboundEmail.findMany({
      where: { organizationId: orgId, invoiceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        attachments: true,
      },
    });

    const userIds = [...new Set(rows.map((r) => r.sentByUserId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return rows.map((row) => {
      const attachment = row.attachments[0];
      const canRetry = isAdmin && row.status === 'FAILED';
      return {
        id: row.id,
        recipient: row.toEmail,
        channelLabel: 'E-Mail',
        documentVersionLabel: attachment?.fileName ?? 'Rechnungs-PDF',
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        triggeredByName: row.sentByUserId ? userDisplayName(userMap.get(row.sentByUserId)) : null,
        status: row.status,
        statusLabel: outboundEmailStatusLabelDe(row.status),
        errorMessage: row.errorMessage,
        capabilities: {
          retry: {
            allowed: canRetry,
            reason: canRetry ? null : 'Wiederholung nur für fehlgeschlagene E-Mails durch Administratoren',
          },
        },
      };
    });
  }

  private canGeneratePdf(type: OrgInvoiceType | string): boolean {
    return (
      this.generationEnabled &&
      ['OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'OUTGOING_FINAL'].includes(type)
    );
  }

  private async requireInvoice(orgId: string, invoiceId: string): Promise<OrgInvoice> {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private parseLineItems(raw: unknown, fallbackTotal: number): InvoiceLineItem[] {
    if (!Array.isArray(raw)) {
      return [
        {
          description: 'Leistung',
          quantity: 1,
          totalCents: fallbackTotal,
        },
      ];
    }
    const items: InvoiceLineItem[] = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const totalCents = Number(r.totalCents ?? r.grossCents ?? 0);
      if (!Number.isFinite(totalCents) || totalCents <= 0) continue;
      items.push({
        description: String(r.description ?? 'Position'),
        quantity: Number(r.quantity ?? 1) || 1,
        unitPriceCents: Number(r.unitPriceNetCents ?? r.unitPriceCents ?? totalCents) || totalCents,
        totalCents,
      });
    }
    return items.length
      ? items
      : [{ description: 'Leistung', quantity: 1, totalCents: fallbackTotal }];
  }

  private toOrgInfo(org: {
    companyName: string;
    address?: string | null;
    city?: string | null;
    zip?: string | null;
    state?: string | null;
    country?: string | null;
    taxId?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    logoUrl?: string | null;
  }): OrgInfo {
    return {
      name: org.companyName,
      address: org.address,
      city: org.city,
      zip: org.zip,
      state: org.state,
      country: org.country,
      taxId: org.taxId,
      email: org.email,
      phone: org.phone,
      website: org.website,
      logoUrl: org.logoUrl,
    };
  }

  private toCustomerInfo(customer: {
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null): CustomerInfo {
    if (!customer) {
      return { firstName: 'Kunde', lastName: '' };
    }
    return {
      firstName: customer.firstName,
      lastName: customer.lastName,
      company: customer.company,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      zip: customer.zip,
      country: customer.country,
    };
  }

  private toVehicleInfo(vehicle: {
    make?: string | null;
    model?: string | null;
    year?: number | null;
    licensePlate?: string | null;
    vin?: string | null;
    color?: string | null;
  } | null): VehicleInfo {
    if (!vehicle) {
      return { make: '', model: '', licensePlate: '' };
    }
    return {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
      vin: vehicle.vin,
      color: vehicle.color,
    };
  }

  private userFacingError(err: unknown): string {
    if (err instanceof BadRequestException || err instanceof ConflictException) {
      return err.message;
    }
    if (err instanceof Error && err.message) {
      this.logger.warn(`Invoice PDF generation failed: ${err.message}`);
    }
    return 'PDF konnte nicht erzeugt werden. Bitte erneut versuchen.';
  }
}
