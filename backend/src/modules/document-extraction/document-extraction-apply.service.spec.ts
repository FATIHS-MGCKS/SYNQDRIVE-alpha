import { BadRequestException } from '@nestjs/common';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';

describe('DocumentExtractionApplyService — executor routing', () => {
  const svc = new DocumentExtractionApplyService();

  it('blocks BRAKE apply outside orchestrator', async () => {
    await expect(
      svc.apply({
        extractionId: 'ext-1',
        vehicleId: 'veh-1',
        documentType: 'BRAKE',
        sourceFileUrl: null,
        confirmedData: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks TIRE apply outside orchestrator', async () => {
    await expect(
      svc.apply({
        extractionId: 'ext-1',
        vehicleId: 'veh-1',
        documentType: 'TIRE',
        sourceFileUrl: null,
        confirmedData: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks BATTERY apply outside orchestrator', async () => {
    await expect(
      svc.apply({
        extractionId: 'ext-1',
        vehicleId: 'veh-1',
        documentType: 'BATTERY',
        sourceFileUrl: null,
        confirmedData: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
