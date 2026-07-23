import { describe, expect, it } from 'vitest';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import { legalDocumentsEn } from '../i18n/translations/legal-documents.en';
import type { LegalDocumentsTranslationKey } from '../i18n/translations/legal-documents.en';
import type { TranslationKey } from '../i18n/translations/en';

const LEGAL_DOCUMENTS_KEYS = Object.keys(legalDocumentsEn) as LegalDocumentsTranslationKey[];

describe('legal documents i18n', () => {
  it('defines every legalDocuments key in DE and EN', () => {
    for (const key of LEGAL_DOCUMENTS_KEYS) {
      expect(de[key as TranslationKey], `missing de key ${key}`).toBeTruthy();
      expect(en[key as TranslationKey], `missing en key ${key}`).toBeTruthy();
    }
  });

  it('uses consistent German status terminology', () => {
    expect(de['legalDocuments.status.DRAFT']).toBe('Entwurf');
    expect(de['legalDocuments.status.IN_REVIEW']).toBe('In Prüfung');
    expect(de['legalDocuments.status.APPROVED']).toBe('Freigegeben');
    expect(de['legalDocuments.status.SCHEDULED']).toBe('Geplante Aktivierung');
    expect(de['legalDocuments.status.ACTIVE']).toBe('Aktiv');
    expect(de['legalDocuments.status.SUPERSEDED']).toBe('Ersetzt');
    expect(de['legalDocuments.status.REVOKED']).toBe('Widerrufen');
    expect(de['legalDocuments.status.ARCHIVED']).toBe('Archiviert');
  });

  it('does not frame privacy policy as consent', () => {
    const privacyHint = de['legalDocuments.type.PRIVACY_POLICY.hint'].toLowerCase();
    expect(privacyHint).not.toMatch(/einwilligung|zustimmung|consent/);
    expect(privacyHint).toContain('aktivierung');
  });

  it('does not present withdrawal notice as always mandatory', () => {
    expect(de['legalDocuments.variant.WITHDRAWAL_RIGHT_NOTICE']).toContain('falls anwendbar');
    expect(en['legalDocuments.variant.WITHDRAWAL_RIGHT_NOTICE']).toContain('where applicable');
  });

  it('avoids absolute auto-attach wording in wizard review', () => {
    const reviewNote = de['legalDocuments.wizard.reviewNote'].toLowerCase();
    expect(reviewNote).not.toMatch(/automatisch angehängt|automatically attached/);
    expect(reviewNote).toContain('freigabe');
  });

  it('does not position SynqDrive as legal advisor', () => {
    const disclaimer = de['legalDocuments.disclaimer'].toLowerCase();
    expect(disclaimer).not.toMatch(/rechtsberatung durch synqdrive|legal advice from synqdrive/);
    expect(disclaimer).toContain('keine');
  });

  it('provides tooltips for technical terms', () => {
    expect(de['legalDocuments.tooltip.checksum'].length).toBeGreaterThan(10);
    expect(de['legalDocuments.tooltip.integrity'].length).toBeGreaterThan(10);
    expect(de['legalDocuments.tooltip.snapshot'].length).toBeGreaterThan(10);
    expect(en['legalDocuments.tooltip.checksum']).toMatch(/checksum|fingerprint/i);
  });
});
