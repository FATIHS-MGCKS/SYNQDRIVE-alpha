import { BadRequestException } from '@nestjs/common';
import {
  DOCUMENT_ENTITY_LINK_SOURCES,
  assertEntityTypeAllowsConfirmation,
  isDistinctPersonEntityType,
} from './document-entity.types';

describe('document-entity.types', () => {
  it('treats CUSTOMER and DRIVER as distinct person entity types', () => {
    expect(isDistinctPersonEntityType('CUSTOMER')).toBe(true);
    expect(isDistinctPersonEntityType('DRIVER')).toBe(true);
    expect(isDistinctPersonEntityType('VEHICLE')).toBe(false);
  });

  it('blocks auto-confirmation for context entity types', () => {
    expect(() =>
      assertEntityTypeAllowsConfirmation(
        'ORGANIZATION',
        DOCUMENT_ENTITY_LINK_SOURCES.CANDIDATE_CONFIRMATION,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      assertEntityTypeAllowsConfirmation(
        'ORGANIZATION',
        DOCUMENT_ENTITY_LINK_SOURCES.MANUAL_CONFIRMATION,
      ),
    ).not.toThrow();
  });
});
