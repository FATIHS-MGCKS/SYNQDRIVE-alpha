import {
  buildHvCrossSessionAssessmentIdempotencyKey,
  computeHvCrossSessionAssessment,
} from './hv-capacity-cross-session.policy';
import {
  TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
  TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
} from './hv-capacity-cross-session.fixtures';
import {
  buildHvCrossSessionEvidenceIdentityDigest,
  hashHvCrossSessionEvidenceIdentityDigest,
} from './hv-cross-session-evidence-identity.policy';

describe('hv-cross-session-evidence-identity.policy', () => {
  it('changes evidence hash when a session median changes while endAt is unchanged', () => {
    const sessions = TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT.slice(0, 3);
    const target = sessions[2];
    const correctedMedian = (target.summary.stats.medianCapacityKwh ?? 0) + 1.25;
    const correctedSessions = sessions.map((row) =>
      row.sessionId === target.sessionId
        ? {
            ...row,
            summary: {
              ...row.summary,
              stats: {
                ...row.summary.stats,
                medianCapacityKwh: correctedMedian,
              },
            },
          }
        : row,
    );

    const digestBefore = buildHvCrossSessionEvidenceIdentityDigest(sessions);
    const digestAfter = buildHvCrossSessionEvidenceIdentityDigest(correctedSessions);
    expect(digestBefore).not.toBe(digestAfter);

    const latestEndAt = sessions.reduce(
      (max, row) => (row.sessionEndAt > max ? row.sessionEndAt : max),
      sessions[0].sessionEndAt,
    );
    const vehicleId = TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT.vehicleId;

    const keyBefore = buildHvCrossSessionAssessmentIdempotencyKey({
      vehicleId,
      latestSessionEndAt: latestEndAt,
      evidenceIdentityDigest: digestBefore,
    });
    const keyAfter = buildHvCrossSessionAssessmentIdempotencyKey({
      vehicleId,
      latestSessionEndAt: latestEndAt,
      evidenceIdentityDigest: digestAfter,
    });
    expect(keyBefore).not.toBe(keyAfter);
  });

  it('keeps assessment idempotency stable when evidence digest is unchanged', () => {
    const sessions = TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT.slice(0, 3);
    const first = computeHvCrossSessionAssessment({
      sessions,
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });
    const second = computeHvCrossSessionAssessment({
      sessions,
      context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
    });
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(hashHvCrossSessionEvidenceIdentityDigest(
      buildHvCrossSessionEvidenceIdentityDigest(sessions),
    )).toBe(first.idempotencyKey.split(':').pop());
  });
});
