import { buildCommunicationAttachmentContentDisposition } from './communication-attachment-content-disposition.util';

describe('buildCommunicationAttachmentContentDisposition', () => {
  it('strips CR/LF and quotes from malicious filenames', () => {
    const header = buildCommunicationAttachmentContentDisposition(
      '"><script>alert(1)</script>.pdf',
      false,
    );
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).not.toContain('<script>');
    expect(header).toContain('filename*=');
    expect(header.startsWith('attachment;')).toBe(true);
  });

  it('uses inline disposition for image preview', () => {
    const header = buildCommunicationAttachmentContentDisposition('photo.jpg', true);
    expect(header.startsWith('inline;')).toBe(true);
  });
});
