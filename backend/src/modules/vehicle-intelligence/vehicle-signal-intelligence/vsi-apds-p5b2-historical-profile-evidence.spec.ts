import { classifyProfileEvidenceFromRevisionAsOf } from './vsi-apds-p5b2-historical-profile-evidence';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import {
  VsiProfileRevisionAsOfAuthority,
  VsiProfileRevisionAsOfQueryCompleteness,
} from './vsi-profile-revision-as-of.types';

const complete = (n: number, max: number | null) => ({
  completeness: VsiProfileRevisionAsOfQueryCompleteness.COMPLETE,
  eligibleRevisionCountExact: n,
  maxEligibleProfileRevision: max,
});

describe('classifyProfileEvidenceFromRevisionAsOf (P5B.2 cases A–G)', () => {
  it('A — NO_PRIOR_REVISION → HISTORICAL_PROFILE_UNAVAILABLE', () => {
    const r = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION,
        selectedRevision: null,
        limitations: [],
        queryEvidence: complete(0, null),
      },
      malformedProfileProjection: false,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
    );
  });

  it('B — PRIOR_REVISION_FOUND with commit visibility unproven → LIMITED (not VERIFIED)', () => {
    const r = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
        selectedRevision: null,
        limitations: ['PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN'],
        queryEvidence: complete(1, 1),
      },
      malformedProfileProjection: false,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.LIMITED_HISTORICAL_REVISION_EVIDENCE,
    );
    expect(r.historicalRevisionEvidence.commitVisibilityProven).toBe(false);
  });

  it('F — incomplete as-of query → unavailable', () => {
    const r = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
        selectedRevision: null,
        limitations: ['AS_OF_QUERY_INCOMPLETE'],
        queryEvidence: {
          completeness: VsiProfileRevisionAsOfQueryCompleteness.INCOMPLETE,
          eligibleRevisionCountExact: null,
          maxEligibleProfileRevision: null,
        },
      },
      malformedProfileProjection: false,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
    );
  });

  it('G — attribution unproven surfaces via resolver UNPROVEN authority', () => {
    const r = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
        selectedRevision: null,
        limitations: ['HISTORICAL_SOURCE_LINK_ATTRIBUTION_UNPROVEN'],
        queryEvidence: complete(0, null),
      },
      malformedProfileProjection: false,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
    );
  });

  it('malformed snapshot projection fail-closed', () => {
    const r = classifyProfileEvidenceFromRevisionAsOf({
      resolution: {
        authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
        selectedRevision: null,
        limitations: [],
        queryEvidence: complete(1, 1),
      },
      malformedProfileProjection: true,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
    );
  });
});
