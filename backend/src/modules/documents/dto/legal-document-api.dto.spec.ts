import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LegalDocumentListQueryDto } from './legal-document-list-query.dto';
import { LegalDocumentEventsQueryDto } from './legal-document-events-query.dto';
import {
  LegalDocumentActivateDto,
  LegalDocumentRequestChangesDto,
  LegalDocumentRevokeDto,
  LegalDocumentScheduleDto,
} from './legal-document-lifecycle.dto';

async function validateDto<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain);
  return validate(dto);
}

describe('LegalDocumentListQueryDto', () => {
  it('accepts pagination, filters and sort options', async () => {
    const errors = await validateDto(LegalDocumentListQueryDto, {
      page: '2',
      limit: '25',
      documentType: 'TERMS_AND_CONDITIONS',
      status: 'ACTIVE',
      language: 'de',
      jurisdiction: 'DE',
      customerSegment: 'BOTH',
      channelScope: 'ALL',
      search: 'AGB',
      sort: 'activatedAt',
      order: 'desc',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid status and sort fields', async () => {
    const errors = await validateDto(LegalDocumentListQueryDto, {
      status: 'NOT_A_STATUS',
      sort: 'fileName',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('caps limit at 100', async () => {
    const errors = await validateDto(LegalDocumentListQueryDto, { limit: '500' });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});

describe('LegalDocumentEventsQueryDto', () => {
  it('accepts pagination and event filters', async () => {
    const errors = await validateDto(LegalDocumentEventsQueryDto, {
      page: '1',
      limit: '50',
      legalDocumentId: '22222222-2222-4222-8222-222222222222',
      eventType: 'ACTIVATED',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
      sort: 'createdAt',
      order: 'desc',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid legalDocumentId', async () => {
    const errors = await validateDto(LegalDocumentEventsQueryDto, {
      legalDocumentId: 'not-a-uuid',
    });
    expect(errors.some((e) => e.property === 'legalDocumentId')).toBe(true);
  });
});

describe('LegalDocument lifecycle DTOs', () => {
  it('requires validFrom for schedule', async () => {
    const errors = await validateDto(LegalDocumentScheduleDto, {});
    expect(errors.some((e) => e.property === 'validFrom')).toBe(true);
  });

  it('requires statusReason for revoke', async () => {
    const errors = await validateDto(LegalDocumentRevokeDto, { statusReason: '' });
    expect(errors.some((e) => e.property === 'statusReason')).toBe(true);
  });

  it('requires statusReason for activate and request-changes', async () => {
    const activateErrors = await validateDto(LegalDocumentActivateDto, { statusReason: 'short' });
    expect(activateErrors.some((e) => e.property === 'statusReason')).toBe(true);

    const requestErrors = await validateDto(LegalDocumentRequestChangesDto, {
      statusReason: 'too short',
    });
    expect(requestErrors.some((e) => e.property === 'statusReason')).toBe(true);
  });
});
