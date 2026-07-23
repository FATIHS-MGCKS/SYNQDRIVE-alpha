import { describe, expect, it } from 'vitest';
import {
  CONSUMER_INFORMATION_VARIANT,
  LEGAL_DOCUMENT_TYPE,
  legalDocumentGroupKey,
} from './legal-document-types';

describe('legal-document-types', () => {
  it('groups legacy WITHDRAWAL_INFORMATION under CONSUMER_INFORMATION', () => {
    expect(legalDocumentGroupKey(LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION)).toBe(
      LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION,
    );
    expect(
      legalDocumentGroupKey(
        LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION,
        LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
      ),
    ).toBe(LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION);
  });

  it('exposes all consumer information variants for admin selection', () => {
    expect(Object.keys(CONSUMER_INFORMATION_VARIANT)).toEqual([
      'WITHDRAWAL_RIGHT_NOTICE',
      'NO_WITHDRAWAL_RIGHT_NOTICE',
      'OTHER_CONSUMER_INFORMATION',
    ]);
  });
});
