import {
  DataProcessingAgreementStatus,
  DataTransferMechanism,
  DpaSubprocessorStatus,
  ProcessorPartyRole,
  TransferAssessmentStatus,
} from '@prisma/client';
import { isThirdCountry } from './processor-dpa.config';
import { DpaTransferAssessmentService } from './dpa-transfer-assessment.service';

describe('processor-dpa.config', () => {
  it('detects third countries outside EEA', () => {
    expect(isThirdCountry('US')).toBe(true);
    expect(isThirdCountry('DE')).toBe(false);
  });
});

describe('DpaTransferAssessmentService', () => {
  const service = new DpaTransferAssessmentService();

  it('marks third-country NOT_ASSESSED transfers as not assessed', () => {
    expect(
      service.deriveStatus([
        { countryCode: 'US', transferMechanism: DataTransferMechanism.NOT_ASSESSED },
      ]),
    ).toBe(TransferAssessmentStatus.NOT_ASSESSED);
  });

  it('marks EEA-only transfers as assessed', () => {
    expect(
      service.deriveStatus([
        { countryCode: 'DE', transferMechanism: DataTransferMechanism.NONE_REQUIRED },
      ]),
    ).toBe(TransferAssessmentStatus.ASSESSED);
  });

  it('surfaces missing assessment visibly in summary', () => {
    const summary = service.summarize({
      transferAssessmentStatus: TransferAssessmentStatus.NOT_ASSESSED,
      transferCountries: [
        {
          countryCode: 'US',
          transferMechanism: DataTransferMechanism.NOT_ASSESSED,
          assessmentStatus: TransferAssessmentStatus.NOT_ASSESSED,
        },
      ],
    });
    expect(summary.missingAssessmentVisible).toBe(true);
    expect(summary.missingAssessmentCount).toBe(1);
  });
});

describe('processor role model', () => {
  it('includes required processor party roles', () => {
    expect(ProcessorPartyRole.CONTROLLER).toBe('CONTROLLER');
    expect(ProcessorPartyRole.PROCESSOR).toBe('PROCESSOR');
    expect(ProcessorPartyRole.SUBPROCESSOR).toBe('SUBPROCESSOR');
    expect(ProcessorPartyRole.JOINT_CONTROLLER).toBe('JOINT_CONTROLLER');
    expect(ProcessorPartyRole.INDEPENDENT_RECIPIENT).toBe('INDEPENDENT_RECIPIENT');
  });

  it('tracks subprocessor review lifecycle statuses', () => {
    expect(DpaSubprocessorStatus.PENDING_REVIEW).toBe('PENDING_REVIEW');
    expect(DpaSubprocessorStatus.APPROVED).toBe('APPROVED');
  });

  it('supports required transfer mechanisms', () => {
    expect(DataTransferMechanism.STANDARD_CONTRACTUAL_CLAUSES).toBe('STANDARD_CONTRACTUAL_CLAUSES');
    expect(DataTransferMechanism.NOT_ASSESSED).toBe('NOT_ASSESSED');
  });

  it('keeps DPA contract statuses separate from policy lifecycle', () => {
    expect(DataProcessingAgreementStatus.DRAFT).toBe('DRAFT');
    expect(DataProcessingAgreementStatus.ACTIVE).toBe('ACTIVE');
    expect(DataProcessingAgreementStatus.EXPIRED).toBe('EXPIRED');
  });
});
