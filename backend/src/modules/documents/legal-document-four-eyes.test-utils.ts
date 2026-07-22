import { LegalDocumentFourEyesService } from './legal-document-four-eyes.service';

export function createNoopLegalDocumentFourEyesService(): Pick<
  LegalDocumentFourEyesService,
  'assertSeparation' | 'isEnabled'
> {
  return {
    isEnabled: jest.fn().mockResolvedValue(false),
    assertSeparation: jest.fn().mockResolvedValue(undefined),
  };
}
