import { BadRequestException } from '@nestjs/common';

export class LegalBasisAssessmentException extends BadRequestException {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

export function throwLegalBasisError(code: string, message: string): never {
  throw new LegalBasisAssessmentException(code, message);
}
