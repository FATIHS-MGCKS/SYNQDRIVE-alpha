import {
  assertDeployShaMatchesEvaluationCheckoutV1,
  resolveEvaluationCodeShaFromGitCheckoutV1,
  Ds4Layer2HistoricalExportEvaluationAttestationErrorV1,
} from '../export/ds4-layer2-historical-export-evaluation-attestation.v1';

describe('ds4-layer2-historical-export-evaluation-attestation.v1', () => {
  it('resolves checkout HEAD from git', () => {
    const sha = resolveEvaluationCodeShaFromGitCheckoutV1();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('rejects deploy-sha mismatch', () => {
    expect(() =>
      assertDeployShaMatchesEvaluationCheckoutV1({
        deployShaAssertion: '0000000000000000000000000000000000000000',
        evaluationCodeSha: '1111111111111111111111111111111111111111',
      }),
    ).toThrow(Ds4Layer2HistoricalExportEvaluationAttestationErrorV1);
  });

  it('accepts matching deploy-sha assertion', () => {
    const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(() =>
      assertDeployShaMatchesEvaluationCheckoutV1({
        deployShaAssertion: sha,
        evaluationCodeSha: sha,
      }),
    ).not.toThrow();
  });
});
