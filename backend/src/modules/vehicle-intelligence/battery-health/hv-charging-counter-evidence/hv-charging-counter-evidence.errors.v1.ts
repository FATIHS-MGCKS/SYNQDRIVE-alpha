export class HvChargingCounterEvidencePersistenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HvChargingCounterEvidencePersistenceConflictError';
  }
}

export class HvChargingCounterEvidenceEmptyWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HvChargingCounterEvidenceEmptyWriteError';
  }
}
