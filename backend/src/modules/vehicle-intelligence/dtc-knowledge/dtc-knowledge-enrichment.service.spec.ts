import { DtcKnowledgeEnrichmentService } from './dtc-knowledge-enrichment.service';

function makeHarness(researchResult: any) {
  const prisma = {
    dtcKnowledge: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    dtcVehicleKnowledge: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const research = { isEnabled: jest.fn().mockReturnValue(true), research: jest.fn().mockResolvedValue(researchResult) };
  const service = new DtcKnowledgeEnrichmentService(prisma as any, research as any);
  return { prisma, research, service };
}

const SUCCESS = {
  success: true,
  data: {
    title: 'Glühkerze Zylinder 5',
    standardType: 'GENERIC',
    systemCategory: 'POWERTRAIN',
    shortDescription: 'Beschreibung',
    possibleCauses: ['Defekte Glühkerze'],
    possibleEffects: ['Schlechter Kaltstart'],
    technicalUrgency: 'MEDIUM',
    rentalUrgency: 'MEDIUM',
    rentalRecommendation: 'CHECK_BEFORE_NEXT_RENTAL',
    recommendedAction: 'Prüfen',
    sourceType: 'MIXED',
    sources: [{ type: 'WEB', title: 't', url: 'https://x.test' }],
    needsReview: false,
  },
};

const baseGeneric = { id: 'g1', code: 'P0675', normalizedCode: 'P0675', language: 'de', systemCategory: 'POWERTRAIN', standardType: 'GENERIC' };

describe('DtcKnowledgeEnrichmentService', () => {
  it('is idempotent — skips a generic row already READY', async () => {
    const { prisma, research, service } = makeHarness(SUCCESS);
    prisma.dtcKnowledge.findUnique.mockResolvedValue({ ...baseGeneric, enrichmentStatus: 'READY' });

    await service.enrichGeneric({ knowledgeId: 'g1', code: 'P0675', normalizedCode: 'P0675', language: 'de' });

    expect(research.research).not.toHaveBeenCalled();
    expect(prisma.dtcKnowledge.update).not.toHaveBeenCalled();
  });

  it('persists compact READY knowledge on success (aiGenerated, lastVerifiedAt)', async () => {
    const { prisma, service } = makeHarness(SUCCESS);
    prisma.dtcKnowledge.findUnique.mockResolvedValue({ ...baseGeneric, enrichmentStatus: 'QUEUED' });

    await service.enrichGeneric({ knowledgeId: 'g1', code: 'P0675', normalizedCode: 'P0675', language: 'de' });

    // first update → PROCESSING, second update → READY payload
    expect(prisma.dtcKnowledge.update).toHaveBeenCalledTimes(2);
    expect(prisma.dtcKnowledge.update.mock.calls[0][0].data.enrichmentStatus).toBe('PROCESSING');
    const readyData = prisma.dtcKnowledge.update.mock.calls[1][0].data;
    expect(readyData.enrichmentStatus).toBe('READY');
    expect(readyData.aiGenerated).toBe(true);
    expect(readyData.possibleCauses).toEqual(['Defekte Glühkerze']);
    expect(readyData.lastVerifiedAt).toBeInstanceOf(Date);
    expect(readyData.enrichmentError).toBeNull();
  });

  it('marks FAILED (without deleting) on research failure', async () => {
    const { prisma, service } = makeHarness({ success: false, error: 'agent down' });
    prisma.dtcKnowledge.findUnique.mockResolvedValue({ ...baseGeneric, enrichmentStatus: 'QUEUED' });

    await service.enrichGeneric({ knowledgeId: 'g1', code: 'P0675', normalizedCode: 'P0675', language: 'de' });

    const failData = prisma.dtcKnowledge.update.mock.calls[1][0].data;
    expect(failData.enrichmentStatus).toBe('FAILED');
    expect(failData.enrichmentError).toBe('agent down');
  });

  it('enriches vehicle-specific rows and stores vehicle fields', async () => {
    const vehicleResult = {
      success: true,
      data: {
        ...SUCCESS.data,
        vehicleSpecificTitle: 'BMW-spezifisch',
        vehicleSpecificDescription: 'Fahrzeugspezifisch',
        vehicleSpecificEffects: ['Notlauf'],
        vehicleSpecificUrgency: 'HIGH',
        vehicleRentalRecommendation: 'BLOCK_UNTIL_INSPECTED',
      },
    };
    const { prisma, service } = makeHarness(vehicleResult);
    prisma.dtcVehicleKnowledge.findUnique.mockResolvedValue({
      id: 'v1',
      code: 'P0675',
      normalizedCode: 'P0675',
      language: 'de',
      make: 'BMW',
      model: '320d',
      year: 2019,
      fuelType: 'DIESEL',
      engineCode: null,
      enrichmentStatus: 'QUEUED',
    });

    await service.enrichVehicle({ vehicleKnowledgeId: 'v1', code: 'P0675', normalizedCode: 'P0675', language: 'de' });

    const readyData = prisma.dtcVehicleKnowledge.update.mock.calls[1][0].data;
    expect(readyData.enrichmentStatus).toBe('READY');
    expect(readyData.vehicleSpecificTitle).toBe('BMW-spezifisch');
    expect(readyData.vehicleRentalRecommendation).toBe('BLOCK_UNTIL_INSPECTED');
    expect(readyData.aiGenerated).toBe(true);
  });
});
