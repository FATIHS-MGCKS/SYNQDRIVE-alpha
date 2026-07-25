import { describe, expect, it } from 'vitest';
import {
  redactOperatorUploadErrorMessage,
  sanitizeOperatorUploadClientFileName,
  validateOperatorUploadClientFile,
} from './operatorUploadSanitize';

describe('operatorUploadSanitize', () => {
  it('sanitizes path-like filenames', () => {
    expect(sanitizeOperatorUploadClientFileName('../../secret/Mein Foto.jpg')).toBe('Mein_Foto.jpg');
  });

  it('rejects oversize client files', () => {
    expect(validateOperatorUploadClientFile({ size: 9 * 1024 * 1024, type: 'image/jpeg' })).toContain('zu groß');
  });

  it('redacts storage paths from error messages', () => {
    expect(redactOperatorUploadErrorMessage('failed organizations/org-1/secret/file.jpg')).toContain('[redacted]');
  });
});
