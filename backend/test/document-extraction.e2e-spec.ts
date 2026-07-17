import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DocumentExtractionController } from '@modules/document-extraction/document-extraction.controller';
import { DocumentExtractionService } from '@modules/document-extraction/document-extraction.service';
import { DocumentExtractionMetadataController } from '@modules/document-extraction/document-extraction-metadata.controller';
import { DocumentExtractionMetadataService } from '@modules/document-extraction/document-extraction-metadata.service';
import { DocumentExtractionHealthService } from '@modules/document-extraction/document-extraction-health.service';

const passGuard = { canActivate: () => true };

describe('Document extraction HTTP (e2e)', () => {
  let app: INestApplication;
  const vehicleId = 'veh-e2e-1';
  const extractionId = 'ext-e2e-1';

  const service = {
    listForVehicle: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
    getPublicForVehicle: jest.fn().mockResolvedValue({
      id: extractionId,
      vehicleId,
      status: 'READY_FOR_REVIEW',
      processingStage: 'REVIEW',
      documentType: 'SERVICE',
      effectiveDocumentType: 'SERVICE',
      allowedActions: ['confirm', 'download'],
      hasStoredFile: true,
      extractedData: { eventDate: '2026-06-01' },
    }),
    createFromUpload: jest.fn().mockResolvedValue({
      id: extractionId,
      vehicleId,
      status: 'QUEUED',
      documentType: 'AUTO',
    }),
    toPublicExtraction: jest.fn((record: { id: string; status: string; documentType?: string }) => ({
      id: record.id,
      vehicleId,
      status: record.status,
      documentType: record.documentType ?? 'SERVICE',
      effectiveDocumentType: 'SERVICE',
      allowedActions: ['confirm'],
      hasStoredFile: true,
    })),
    confirm: jest.fn().mockResolvedValue({
      id: extractionId,
      vehicleId,
      status: 'APPLIED',
      documentType: 'SERVICE',
      effectiveDocumentType: 'SERVICE',
    }),
  };

  const metadataService = {
    getMetadata: jest.fn().mockReturnValue({
      documentTypes: [{ value: 'SERVICE', labelKey: 'documentExtraction.type.SERVICE' }],
      mimeTypes: ['application/pdf'],
      extensions: ['.pdf'],
      maxUploadBytes: 10485760,
      maxUploadMb: 10,
      requiredFieldRegistry: { version: 'document-required-field-registry-v1', profiles: [] },
    }),
  };

  const healthService = {
    getHealth: jest.fn().mockResolvedValue({ status: 'ok', queueReachable: true }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentExtractionController, DocumentExtractionMetadataController],
      providers: [
        { provide: DocumentExtractionService, useValue: service },
        { provide: DocumentExtractionMetadataService, useValue: metadataService },
        { provide: DocumentExtractionHealthService, useValue: healthService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue(passGuard)
      .overrideGuard(VehicleOwnershipGuard)
      .useValue(passGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(passGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /document-extractions/metadata returns upload constraints', async () => {
    const res = await request(app.getHttpServer()).get('/document-extractions/metadata').expect(200);
    expect(res.body.mimeTypes).toContain('application/pdf');
    expect(metadataService.getMetadata).toHaveBeenCalled();
  });

  it('GET /document-extractions/health returns pipeline health', async () => {
    const res = await request(app.getHttpServer()).get('/document-extractions/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST upload → GET detail → POST confirm (mocked Mistral pipeline)', async () => {
    const upload = await request(app.getHttpServer())
      .post(`/vehicles/${vehicleId}/document-extractions/upload`)
      .field('documentType', 'AUTO')
      .attach('file', Buffer.from('%PDF-1.4 e2e'), {
        filename: 'service.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(upload.body.id).toBe(extractionId);
    expect(service.createFromUpload).toHaveBeenCalled();

    const detail = await request(app.getHttpServer())
      .get(`/vehicles/${vehicleId}/document-extractions/${extractionId}`)
      .expect(200);

    expect(detail.body.status).toBe('READY_FOR_REVIEW');
    expect(detail.body.extractedData).toMatchObject({ eventDate: '2026-06-01' });

    const confirm = await request(app.getHttpServer())
      .post(`/vehicles/${vehicleId}/document-extractions/${extractionId}/confirm`)
      .send({ confirmedData: { eventDate: '2026-06-01', odometerKm: 12000 } })
      .expect(201);

    expect(confirm.body.status).toBe('APPLIED');
    expect(service.confirm).toHaveBeenCalledWith(
      vehicleId,
      extractionId,
      { eventDate: '2026-06-01', odometerKm: 12000 },
      null,
    );
  });

  it('GET detail is reloadable (idempotent read)', async () => {
    const first = await request(app.getHttpServer())
      .get(`/vehicles/${vehicleId}/document-extractions/${extractionId}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(`/vehicles/${vehicleId}/document-extractions/${extractionId}`)
      .expect(200);
    expect(second.body).toEqual(first.body);
    expect(service.getPublicForVehicle).toHaveBeenCalledTimes(2);
  });
});
