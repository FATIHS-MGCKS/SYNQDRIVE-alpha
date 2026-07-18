import {
  ARCHIVE_EMPTY,
  ARCHIVE_INVENTED_ENTITY,
  ARCHIVE_SUBTYPE_FIXTURES,
  ARCHIVE_UNKNOWN,
} from './__fixtures__/document-archive-fixtures';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import {
  assessArchiveApplyGate,
  buildArchiveApplyPayload,
  buildDeadlineSuggestions,
  buildEntityLinkSuggestions,
  collectArchivePlausibilityChecks,
  hasMinimalArchiveMetadata,
  readActionRequired,
  readDocumentDate,
  readReferenceNumber,
  readSender,
  readSubject,
  readSummary,
  resolveArchiveSubtype,
} from './document-archive-extraction.rules';

describe('document-archive-extraction.rules', () => {
  describe.each(Object.entries(ARCHIVE_SUBTYPE_FIXTURES))(
    'subtype %s',
    (subtype, fixture) => {
      it('resolves archive subtype without inventing domain objects', () => {
        expect(resolveArchiveSubtype(fixture)).toBe(subtype);
        const gate = assessArchiveApplyGate({
          documentType: 'OTHER',
          fields: fixture,
        });
        expect(gate.canApplyDomain).toBe(false);
        expect(gate.canArchive).toBe(true);
      });

      it('never auto-applies domain records', () => {
        const payload = buildArchiveApplyPayload(fixture);
        expect(payload).not.toBeNull();
        expect(payload?.archiveSubtype).toBe(subtype);
      });
    },
  );

  describe('field readers', () => {
    it('reads common archive fields and aliases', () => {
      const fixture = ARCHIVE_SUBTYPE_FIXTURES.AUTHORITY_LETTER;
      expect(readSender(fixture)).toContain('Stadtverwaltung');
      expect(readDocumentDate(fixture)).toBe('2026-04-02');
      expect(readReferenceNumber(fixture)).toBe('AZ-2026-4412');
      expect(readSubject(fixture)).toContain('Anhörung');
      expect(readSummary(fixture)).toContain('Behördliches Schreiben');
      expect(readActionRequired(fixture)).toContain('Stellungnahme');
    });

    it('keeps unknown subtype as UNKNOWN', () => {
      expect(resolveArchiveSubtype(ARCHIVE_UNKNOWN)).toBe('UNKNOWN');
      expect(resolveArchiveSubtype({ documentKind: 'RANDOM_DOC' })).toBe('UNKNOWN');
      expect(resolveArchiveSubtype({})).toBe('UNKNOWN');
    });
  });

  describe('entity links and deadlines', () => {
    it('builds entity link suggestions only from explicit mentions', () => {
      const links = buildEntityLinkSuggestions(ARCHIVE_SUBTYPE_FIXTURES.INSURANCE_LETTER);
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((row) => row.source === 'MENTIONED')).toBe(true);
    });

    it('marks deadlines as suggestion-only', () => {
      const deadlines = buildDeadlineSuggestions(ARCHIVE_SUBTYPE_FIXTURES.CONTRACT_DOCUMENT);
      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines.every((row) => row.suggestionOnly === true)).toBe(true);
    });

    it('warns on unconfirmed entity IDs without labels', () => {
      const checks = collectArchivePlausibilityChecks('OTHER', ARCHIVE_INVENTED_ENTITY);
      expect(checks.some((check) => check.code === 'ARCHIVE_ENTITY_LINK_UNCONFIRMED')).toBe(true);
    });
  });

  describe('apply gate', () => {
    it('blocks archive when metadata is completely missing', () => {
      const gate = assessArchiveApplyGate({
        documentType: 'OTHER',
        fields: ARCHIVE_EMPTY,
      });
      expect(gate.canArchive).toBe(false);
      expect(gate.canApplyDomain).toBe(false);
      expect(hasMinimalArchiveMetadata(ARCHIVE_EMPTY)).toBe(false);
    });

    it('allows archive for VEHICLE_CONDITION with same rules', () => {
      const gate = assessArchiveApplyGate({
        documentType: 'VEHICLE_CONDITION',
        fields: ARCHIVE_SUBTYPE_FIXTURES.GENERAL_EVIDENCE,
      });
      expect(gate.canArchive).toBe(true);
      expect(gate.canApplyDomain).toBe(false);
    });
  });

  describe('plausibility integration', () => {
    const svc = new DocumentExtractionPlausibilityService();

    it('includes archive-only and no-outreach checks for OTHER', () => {
      const result = svc.runChecks(
        'OTHER',
        ARCHIVE_SUBTYPE_FIXTURES.CUSTOMER_CORRESPONDENCE,
        {},
      );
      expect(result.checks.some((check) => check.code === 'ARCHIVE_NO_DOMAIN_APPLY')).toBe(true);
      expect(result.checks.some((check) => check.code === 'ARCHIVE_NO_AUTOMATIC_OUTREACH')).toBe(
        true,
      );
    });

    it('warns for UNKNOWN subtype', () => {
      const result = svc.runChecks('OTHER', ARCHIVE_UNKNOWN, {});
      expect(result.checks.some((check) => check.code === 'ARCHIVE_SUBTYPE_UNKNOWN')).toBe(true);
    });
  });
});
