import { planDocumentActions } from './document-action-planner.engine';
import { buildDocumentActionPlannerInputFingerprint } from './document-action-planner.fingerprint';
import { buildPlannerTestInput } from './document-action-planner.test-fixtures';

function executableActions(result: ReturnType<typeof planDocumentActions>) {
  return result.actions.filter(
    (action) => action.requirement === 'REQUIRED' || action.requirement === 'BLOCKER',
  );
}

describe('DocumentActionPlannerEngine', () => {
  describe('determinism', () => {
    it('produces identical plans for identical input', () => {
      const input = buildPlannerTestInput({ effectiveDocumentType: 'SERVICE' });
      const a = planDocumentActions(input);
      const b = planDocumentActions(input);

      expect(a).toEqual(b);
      expect(a.planDraft.inputFingerprint).toBe(
        buildDocumentActionPlannerInputFingerprint(input),
      );
    });

    it('does not embed timestamps in snapshot or payloads', () => {
      const result = planDocumentActions(buildPlannerTestInput({ effectiveDocumentType: 'SERVICE' }));
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/"generatedAt"/);
      expect(serialized).not.toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });

  describe('SERVICE maintenance planning', () => {
    it('plans CREATE_SERVICE_EVENT as required semantic action', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          documentCategory: 'SERVICE',
          effectiveDocumentType: 'SERVICE',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.planDraft.snapshot.planningMode).toBe('MAINTENANCE');
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toMatchObject({
        actionType: 'CREATE_SERVICE_EVENT',
        requirement: 'REQUIRED',
        targetEntityType: 'VEHICLE',
        targetEntityId: 'veh-1',
        sequence: 1,
      });
      expect((result.actions[0].previewPayload as Record<string, unknown>).semanticAction).toBe(
        'CREATE_SERVICE_EVENT',
      );
      expect(result.blockingReasons).toHaveLength(0);
      expect(result.missingRequirements).toHaveLength(0);
    });
  });

  describe('inspection documents', () => {
    it('plans service event plus TUV compliance update', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'TUV_REPORT',
          documentCategory: 'INSPECTION',
          confirmedData: {
            eventDate: '2026-02-01',
            validUntil: '2028-02-01',
            reportNumber: 'TUV-99',
            result: 'passed',
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.planDraft.snapshot.planningMode).toBe('MAINTENANCE');
      expect(result.actions.map((a) => (a.previewPayload as Record<string, unknown>).semanticAction)).toEqual([
        'CREATE_SERVICE_EVENT',
        'UPDATE_TUV_COMPLIANCE',
      ]);
      expect(result.followUpCandidateTypes).toContain('SCHEDULE_INSPECTION');
    });
  });

  describe('finance documents', () => {
    it('plans fine draft for complete fine notice', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'FINE',
          documentCategory: 'FINANCE',
          entityLinks: [
            { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
          ],
          confirmedData: {
            eventDate: '2026-03-01',
            eventTime: '10:30',
            totalCents: 3500,
            issuingAuthority: 'Ordnungsamt',
            reportNumber: 'REF-22',
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.planDraft.snapshot.planningMode).toBe('FINE');
      expect(result.actions.some((a) => a.actionType === 'CREATE_FINE')).toBe(true);
      expect(result.followUpCandidateTypes).not.toContain('NOTIFY_DRIVER');
    });

    it('blocks fine draft when required fields are missing', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'FINE',
          confirmedData: {
            totalCents: 3500,
          },
          entityLinks: [
            { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
          ],
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(executableActions(result)).toHaveLength(0);
      expect(result.missingRequirements.some((m) => m.code === 'MISSING_FINE_DRAFT_FIELDS')).toBe(
        true,
      );
    });
  });

  describe('tire measurements', () => {
    it('blocks when tread depth is missing', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'TIRE',
          documentCategory: 'MAINTENANCE',
          confirmedData: {
            eventDate: '2026-01-01',
            odometerKm: 10000,
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(executableActions(result)).toHaveLength(0);
      expect(result.actions.every((a) => a.requirement !== 'REQUIRED')).toBe(true);
    });

    it('plans tire measurement when tread depth is present', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'TIRE',
          confirmedData: {
            eventDate: '2026-01-01',
            treadDepthMm: { fl: 5.2, fr: 5.1, rl: 4.8, rr: 4.7 },
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.actions[0].actionType).toBe('RECORD_TIRE_MEASUREMENT');
    });
  });

  describe('plausibility blockers', () => {
    it('does not emit executable required actions when plausibility is BLOCKER', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'SERVICE',
          plausibility: {
            overallStatus: 'BLOCKER',
            checks: [
              {
                code: 'ODOMETER_NEGATIVE',
                status: 'BLOCKER',
                message: 'Negative odometer',
                source: 'DOCUMENT',
              },
            ],
            recommendedHumanReviewNotes: ['Review odometer'],
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(executableActions(result)).toHaveLength(0);
      expect(result.blockingReasons.some((b) => b.code === 'ODOMETER_NEGATIVE')).toBe(true);
      expect(result.followUpCandidateTypes).toContain('MANUAL_REVIEW');
      expect(result.planDraft.snapshot.planningMode).toBe('MAINTENANCE');
      expect(result.actions).toHaveLength(0);
    });

    it('never assigns BLOCKER requirement to planned actions', () => {
      const scenarios = [
        buildPlannerTestInput({ effectiveDocumentType: 'SERVICE' }),
        buildPlannerTestInput({
          effectiveDocumentType: 'FINE',
          confirmedData: {},
          plausibility: {
            overallStatus: 'BLOCKER',
            checks: [],
            recommendedHumanReviewNotes: [],
          },
        }),
      ];

      for (const input of scenarios) {
        const result = planDocumentActions(input);
        expect(result.actions.every((a) => a.requirement !== 'BLOCKER')).toBe(true);
      }
    });
  });

  describe('entity links', () => {
    it('blocks maintenance apply without confirmed vehicle link', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'BRAKE',
          entityLinks: [],
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(result.missingRequirements.some((m) => m.code === 'MISSING_VEHICLE_ENTITY_LINK')).toBe(
        true,
      );
      expect(executableActions(result)).toHaveLength(0);
    });
  });

  describe('downstream capabilities', () => {
    it('blocks executable actions when finance capability is disabled', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'INVOICE',
          documentCategory: 'FINANCE',
          confirmedData: {
            invoiceNumber: 'INV-1',
            totalCents: 11900,
            grossCents: 11900,
            netCents: 10000,
            taxCents: 1900,
            taxRatePercent: 19,
            amountSemantics: 'GROSS',
            taxSemantics: 'EXPLICIT',
            eventDate: '2026-01-01',
          },
          downstreamCapabilities: {
            ...buildPlannerTestInput().downstreamCapabilities,
            invoices: false,
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(executableActions(result)).toHaveLength(0);
      expect(result.blockingReasons.some((b) => b.code === 'CAPABILITY_DISABLED_INVOICES')).toBe(
        true,
      );
    });
  });

  describe('feature flags', () => {
    it('blocks planning when action preview is disabled', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          featureFlags: {
            ...buildPlannerTestInput().featureFlags,
            actionPreviewEnabled: false,
          },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(result.blockingReasons.some((b) => b.code === 'ACTION_PREVIEW_DISABLED')).toBe(true);
    });
  });

  describe('routing', () => {
    it('plans archive-only for OTHER without blockers', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'OTHER',
          documentCategory: 'GENERAL',
          confirmedData: { description: 'misc' },
        }),
      );

      expect(result.planDraft.isBlocked).toBe(false);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].actionType).toBe('ARCHIVE_ONLY');
      expect(result.actions[0].requirement).toBe('INFORMATIONAL');
    });

    it('blocks when category cannot resolve to a concrete routing type', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: null,
          documentCategory: 'MAINTENANCE',
          documentSubtype: 'ROUTINE_MAINTENANCE',
        }),
      );

      expect(result.planDraft.isBlocked).toBe(true);
      expect(result.blockingReasons.some((b) => b.code === 'ROUTING_TYPE_UNRESOLVED')).toBe(true);
    });
  });

  describe('follow-up candidate types', () => {
    it('does not auto-suggest driver notify for fine documents', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'FINE',
          entityLinks: [
            { role: 'PRIMARY_VEHICLE', entityType: 'VEHICLE', entityId: 'veh-1' },
          ],
          confirmedData: {
            eventDate: '2026-03-01',
            eventTime: '09:00',
            totalCents: 1000,
            issuingAuthority: 'Police',
            reportNumber: 'P-1',
          },
        }),
      );

      expect(result.followUpCandidateTypes).not.toContain('NOTIFY_DRIVER');
    });

    it('suggests vendor follow-up for finance invoice without vendor link', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'INVOICE',
          documentCategory: 'FINANCE',
          confirmedData: {
            invoiceNumber: 'INV-22',
            totalCents: 11900,
            grossCents: 11900,
            netCents: 10000,
            taxCents: 1900,
            taxRatePercent: 19,
            amountSemantics: 'GROSS',
            taxSemantics: 'EXPLICIT',
            eventDate: '2026-04-01',
          },
        }),
      );

      expect(result.followUpCandidateTypes).toContain('REQUEST_CUSTOMER_INFO');
    });
  });

  describe('plan draft snapshot', () => {
    it('includes action audit metadata for persistence layer', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({ effectiveDocumentType: 'BATTERY' }),
      );

      expect(result.planDraft.snapshot).toMatchObject({
        plannerVersion: expect.any(String),
        inputFingerprint: expect.any(String),
        routingType: 'BATTERY',
        isBlocked: false,
        actionTypes: ['RECORD_BATTERY_EVIDENCE'],
      });
    });
  });

  describe('payload contracts', () => {
    it('includes confirmed field keys in damage draft payloads without OCR blobs', () => {
      const result = planDocumentActions(
        buildPlannerTestInput({
          effectiveDocumentType: 'DAMAGE',
          confirmedData: {
            description: 'Scratch on bumper',
            severity: 'MODERATE',
          },
        }),
      );

      const payload = result.actions[0].inputPayload;
      expect(payload.confirmedFieldKeys).toEqual(['description', 'severity']);
      expect(payload).not.toHaveProperty('ocrText');
      expect(payload).not.toHaveProperty('fullText');
      expect(payload.damageType).toBeNull();
    });
  });
});
