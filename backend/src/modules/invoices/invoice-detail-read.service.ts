import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import { mapInvoiceDetail } from './invoice-detail.mapper';

export interface InvoiceDetailReadOptions {
  /** VIN is secondary and only included when explicitly allowed (e.g. admin). */
  includeVin?: boolean;
}

@Injectable()
export class InvoiceDetailReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceDocuments: InvoiceDocumentsReadService,
  ) {}

  async findDetail(
    orgId: string,
    invoiceId: string,
    options?: InvoiceDetailReadOptions,
  ) {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: {
        tasks: { orderBy: { dueDate: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
        vendor: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const [customer, vehicle, booking, outboundEmails, timeline, documentsView, createdByActor, orgTax] =
      await Promise.all([
        invoice.customerId
          ? this.prisma.customer.findFirst({
              where: { id: invoice.customerId, organizationId: orgId },
            })
          : Promise.resolve(null),
        invoice.vehicleId
          ? this.prisma.vehicle.findFirst({
              where: { id: invoice.vehicleId, organizationId: orgId },
            })
          : Promise.resolve(null),
        invoice.bookingId
          ? this.prisma.booking.findFirst({
              where: { id: invoice.bookingId, organizationId: orgId },
              select: {
                id: true,
                customerId: true,
                status: true,
                startDate: true,
                endDate: true,
                pickupStationId: true,
                returnStationId: true,
                pickupStation: { select: { id: true, name: true, code: true } },
                returnStation: { select: { id: true, name: true, code: true } },
              },
            })
          : Promise.resolve(null),
        this.prisma.outboundEmail.findMany({
          where: {
            organizationId: orgId,
            invoiceId,
          },
          orderBy: { requestedAt: 'desc' },
          take: 50,
          include: {
            attachments: true,
            sentByUser: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
        this.prisma.activityLog.findMany({
          where: { organizationId: orgId, entity: 'INVOICE', entityId: invoiceId },
          orderBy: { createdAt: 'desc' },
          take: 40,
          select: {
            id: true,
            action: true,
            description: true,
            createdAt: true,
          },
        }),
        this.invoiceDocuments.getDocumentsForInvoice({
          organizationId: orgId,
          invoiceId: invoice.id,
          invoiceType: invoice.type,
          cacheDocumentId: invoice.generatedDocumentId,
          includeInternalErrors: false,
        }),
        invoice.createdByUserId
          ? this.prisma.organizationMembership
              .findFirst({
                where: {
                  organizationId: orgId,
                  userId: invoice.createdByUserId,
                },
                select: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              })
              .then((m) => m?.user ?? null)
          : Promise.resolve(null),
        this.prisma.organization.findFirst({
          where: { id: orgId },
          select: { defaultVatRate: true, isSmallBusiness: true },
        }),
      ]);

    return mapInvoiceDetail({
      invoice,
      customer,
      vehicle,
      booking,
      documentsView,
      outboundEmails,
      timeline,
      includeVin: options?.includeVin ?? false,
      createdByActor,
      orgTax: orgTax ?? undefined,
    });
  }
}
