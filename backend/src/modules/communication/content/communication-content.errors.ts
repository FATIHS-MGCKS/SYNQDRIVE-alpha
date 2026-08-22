export type CommunicationContentIntegrityCode =
  | 'INTEGRITY_REJECTED'
  | 'DATA_INTEGRITY_CONFLICT';

export class CommunicationContentIntegrityError extends Error {
  readonly code: CommunicationContentIntegrityCode;

  constructor(code: CommunicationContentIntegrityCode, message: string) {
    super(message);
    this.name = 'CommunicationContentIntegrityError';
    this.code = code;
  }
}
