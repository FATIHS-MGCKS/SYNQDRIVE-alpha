import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomerVerificationService } from './customer-verification.service';
import { CustomerVerificationReadModelService } from './customer-verification-read-model.service';

describe('CustomerVerificationService — manual pickup', () => {
  const prisma = {
    customer: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    customerVerificationCheck: { create: jest.fn(), findMany: jest.fn() },
    customerDocument: { findMany: jest.fn() },
    customerEligibilityPolicy: { findUnique: jest.fn(), create: jest.fn() },
    customerTimelineEvent: { create: jest.fn() },
  };

  const readModelHelper = {
    isTerminalStatus: jest.fn((status: string) =>
      ['VERIFIED', 'REJECTED', 'EXPIRED', 'KYC_EXPIRED', 'ABANDONED', 'FAILED'].includes(
        status,
      ),
    ),
  } as unknown as CustomerVerificationReadModelService;

  const service = new CustomerVerificationService(
    prisma as never,
    {} as never,
    { get: jest.fn() } as never,
    readModelHelper,
  );

  const user = { id: 'user-1', organizationId: 'org-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'cust-1' });
    (prisma.customer.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      id: 'book-1',
      customerId: 'cust-1',
    });
    (prisma.customerVerificationCheck.create as jest.Mock).mockImplementation(
      async ({ data }: { data: { kind: string; status: string } }) => ({
        id: `check-${data.kind}`,
        organizationId: 'org-1',
        customerId: 'cust-1',
        ...data,
      }),
    );
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customer.update as jest.Mock).mockResolvedValue({});
    (prisma.customerTimelineEvent.create as jest.Mock).mockResolvedValue({});
  });

  const fullIdPayload = {
    customerId: 'cust-1',
    bookingId: 'book-1',
    idDocumentSeen: true,
    idNameMatchesBooking: true,
    idDateOfBirthChecked: true,
    minimumAgePassed: true,
    drivingLicenseSeen: false,
    licenseNameMatchesBooking: false,
    licenseClassValid: false,
    licenseNotExpired: false,
  };

  const fullLicensePayload = {
    customerId: 'cust-1',
    bookingId: 'book-1',
    idDocumentSeen: false,
    idNameMatchesBooking: false,
    idDateOfBirthChecked: false,
    minimumAgePassed: false,
    drivingLicenseSeen: true,
    licenseNameMatchesBooking: true,
    licenseClassValid: true,
    licenseNotExpired: true,
    minimumLicenseDurationPassed: true,
  };

  it('full ID checklist sets ID_DOCUMENT VERIFIED', async () => {
    const result = await service.createManualPickupCheck(user, fullIdPayload);
    const idCheck = result.checks.find((c) => c.kind === 'ID_DOCUMENT');
    expect(idCheck?.status).toBe('VERIFIED');
  });

  it('full license checklist sets DRIVING_LICENSE VERIFIED', async () => {
    const result = await service.createManualPickupCheck(user, fullLicensePayload);
    const licenseCheck = result.checks.find((c) => c.kind === 'DRIVING_LICENSE');
    expect(licenseCheck?.status).toBe('VERIFIED');
  });

  it('incomplete checklist sets REQUIRES_REVIEW when document seen', async () => {
    const result = await service.createManualPickupCheck(user, {
      ...fullIdPayload,
      idNameMatchesBooking: false,
    });
    const idCheck = result.checks.find((c) => c.kind === 'ID_DOCUMENT');
    expect(idCheck?.status).toBe('REQUIRES_REVIEW');
  });

  it('rejects customer outside org scope', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.createManualPickupCheck(user, fullIdPayload),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects booking/customer mismatch', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      id: 'book-1',
      customerId: 'other-customer',
    });
    await expect(
      service.createManualPickupCheck(user, fullIdPayload),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('CustomerVerificationService — eligibility', () => {
  const prisma = {
    customer: { findFirst: jest.fn(), update: jest.fn() },
    customerEligibilityPolicy: { findUnique: jest.fn(), create: jest.fn() },
    customerVerificationCheck: { findMany: jest.fn() },
    customerDocument: { findMany: jest.fn() },
  };

  const readModelHelper = {
    isTerminalStatus: jest.fn(),
  } as unknown as CustomerVerificationReadModelService;

  const service = new CustomerVerificationService(
    prisma as never,
    {} as never,
    { get: jest.fn() } as never,
    readModelHelper,
  );

  const defaultPolicy = {
    requireVerifiedIdForConfirmedBooking: true,
    requireVerifiedLicenseForConfirmedBooking: true,
    requireVerifiedIdForPickup: true,
    requireVerifiedLicenseForPickup: true,
    blockExpiredLicense: true,
    blockExpiredId: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust-1',
      organizationId: 'org-1',
      idExpiry: new Date('2030-01-01'),
      licenseExpiry: new Date('2030-01-01'),
    });
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue(
      defaultPolicy,
    );
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('verified ID + license allows booking and pickup', async () => {
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
      { type: 'ID_FRONT', status: 'VERIFIED' },
      { type: 'LICENSE_FRONT', status: 'VERIFIED' },
    ]);
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([
      {
        kind: 'ID_DOCUMENT',
        status: 'VERIFIED',
        updatedAt: new Date(),
        warnings: null,
      },
      {
        kind: 'DRIVING_LICENSE',
        status: 'VERIFIED',
        updatedAt: new Date(),
        warnings: null,
      },
    ]);

    const result = await service.getEligibilityStatus('org-1', 'cust-1');
    expect(result.idDocument).toBe('verified');
    expect(result.drivingLicense).toBe('verified');
    expect(result.canConfirmBooking).toBe(true);
    expect(result.canStartPickup).toBe(true);
  });

  it('rejected ID blocks confirm and pickup', async () => {
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([
      { kind: 'ID_DOCUMENT', status: 'REJECTED', updatedAt: new Date(), warnings: null },
    ]);
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
      { type: 'ID_FRONT', status: 'REJECTED' },
    ]);

    const result = await service.getEligibilityStatus('org-1', 'cust-1');
    expect(result.idDocument).toBe('rejected');
    expect(result.canConfirmBooking).toBe(false);
    expect(result.canStartPickup).toBe(false);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it('expired ID or license blocks confirm and pickup', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust-1',
      organizationId: 'org-1',
      idExpiry: new Date('2020-01-01'),
      licenseExpiry: new Date('2030-01-01'),
    });
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([
      { kind: 'ID_DOCUMENT', status: 'EXPIRED', updatedAt: new Date(), warnings: null },
      { kind: 'DRIVING_LICENSE', status: 'VERIFIED', updatedAt: new Date(), warnings: null },
    ]);
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
      { type: 'ID_FRONT', status: 'VERIFIED' },
      { type: 'LICENSE_FRONT', status: 'VERIFIED' },
    ]);

    const result = await service.getEligibilityStatus('org-1', 'cust-1');
    expect(result.idDocument).toBe('expired');
    expect(result.canConfirmBooking).toBe(false);
    expect(result.canStartPickup).toBe(false);
    expect(result.blockingReasons.some((r) => /Ausweis/i.test(r))).toBe(true);
  });

  it('proofOfAddress required does not globally block confirm', async () => {
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
      { type: 'ID_FRONT', status: 'VERIFIED' },
      { type: 'LICENSE_FRONT', status: 'VERIFIED' },
      { type: 'PROOF_OF_ADDRESS', status: 'PENDING_REVIEW' },
    ]);
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([
      { kind: 'ID_DOCUMENT', status: 'VERIFIED', updatedAt: new Date(), warnings: null },
      { kind: 'DRIVING_LICENSE', status: 'VERIFIED', updatedAt: new Date(), warnings: null },
      { kind: 'PROOF_OF_ADDRESS', status: 'PENDING', updatedAt: new Date(), warnings: null },
    ]);

    const result = await service.getEligibilityStatus('org-1', 'cust-1');
    expect(result.proofOfAddress).toBe('pending');
    expect(result.canConfirmBooking).toBe(true);
    expect(result.blockingReasons).not.toContainEqual(
      expect.stringMatching(/Adressnachweis/i),
    );
  });

  it('pickup_required when confirm not required but pickup is and docs not yet verified', async () => {
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue({
      ...defaultPolicy,
      requireVerifiedIdForConfirmedBooking: false,
      requireVerifiedLicenseForConfirmedBooking: false,
      requireVerifiedIdForPickup: true,
    });
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getEligibilityStatus('org-1', 'cust-1');
    expect(result.idDocument).toBe('missing');
    expect(result.canConfirmBooking).toBe(true);
    expect(result.canStartPickup).toBe(false);
    expect(result.blockingReasons).toContain('Ausweisprüfung für Pickup erforderlich');
  });

  it('uploaded but unverified ID yields requires_review not local verified', async () => {
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([
      { type: 'ID_FRONT', status: 'UPLOADED', createdAt: new Date() },
    ]);

    const result = await service.getEligibilityStatus('org-1', 'cust-1');
    expect(result.idDocument).toBe('requires_review');
    expect(result.idDocument).not.toBe('verified');
  });
});
