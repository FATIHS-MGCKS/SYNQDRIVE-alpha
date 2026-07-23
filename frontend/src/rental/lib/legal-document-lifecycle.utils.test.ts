import { describe, expect, it } from 'vitest';
import type { LegalDocumentDto } from '../../lib/api';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import {
  findActivePeer,
  getLifecycleActionsForDocument,
  validateLifecycleForm,
  violatesFourEyes,
} from './legal-document-lifecycle.utils';
import { EMPTY_LIFECYCLE_FORM } from './legal-document-lifecycle.types';

function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text = en[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}

function doc(partial: Partial<LegalDocumentDto> & Pick<LegalDocumentDto, 'id' | 'status'>): LegalDocumentDto {
  return {
    documentType: 'TERMS_AND_CONDITIONS',
    title: 'AGB',
    versionLabel: 'v1',
    language: 'de',
    fileName: 'agb.pdf',
    sizeBytes: 100,
    activeFrom: null,
    createdAt: '2026-01-01',
    ...partial,
  };
}

describe('legal-document-lifecycle.utils', () => {
  it('finds active peer by type and language', () => {
    const draft = doc({ id: 'd1', status: 'APPROVED', versionLabel: '2026-02' });
    const active = doc({ id: 'a1', status: 'ACTIVE', versionLabel: '2026-01' });
    expect(findActivePeer(draft, [draft, active])?.id).toBe('a1');
  });

  it('exposes replace_active when an active peer exists', () => {
    const target = doc({ id: 'd1', status: 'APPROVED' });
    const active = doc({ id: 'a1', status: 'ACTIVE' });
    const actions = getLifecycleActionsForDocument(
      target,
      [target, active],
      { canWrite: true, canManage: true },
      { fourEyesEnabled: false },
      'user-1',
      t,
    );
    expect(actions.some((a) => a.action === 'replace_active')).toBe(true);
    expect(actions.some((a) => a.action === 'activate_now')).toBe(false);
  });

  it('blocks approve under four-eyes for uploader', () => {
    const inReview = doc({
      id: 'd1',
      status: 'IN_REVIEW',
      uploadedBy: { id: 'user-1', displayName: 'Uploader' },
    });
    expect(
      violatesFourEyes(inReview, 'user-1', { fourEyesEnabled: true }, 'approve'),
    ).toBe(true);
    const actions = getLifecycleActionsForDocument(
      inReview,
      [inReview],
      { canWrite: true, canManage: true },
      { fourEyesEnabled: true },
      'user-1',
      t,
    );
    const approve = actions.find((a) => a.action === 'approve');
    expect(approve?.disabled).toBe(true);
  });

  it('requires future validFrom for schedule', () => {
    const errors = validateLifecycleForm('schedule_activation', {
      ...EMPTY_LIFECYCLE_FORM,
      statusReason: 'Scheduled activation for release',
      validFrom: '2020-01-01T08:00',
    }, t);
    expect(errors.validFrom).toBeTruthy();
  });

  it('lists revoke only for active documents', () => {
    const active = doc({ id: 'a1', status: 'ACTIVE' });
    const actions = getLifecycleActionsForDocument(
      active,
      [active],
      { canWrite: false, canManage: true },
      { fourEyesEnabled: false },
      'user-2',
      t,
    );
    expect(actions.map((a) => a.action)).toEqual(['revoke']);
  });
});
