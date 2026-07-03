import { TENANT_PROFILE_FORM_UPDATE_FIELDS } from './constants/tenant-profile-ui-fields';

describe('tenant profile UI field contract', () => {
  it('documents company form fields without legacy taxId or logo upload keys', () => {
    expect(TENANT_PROFILE_FORM_UPDATE_FIELDS).toHaveLength(29);
    expect(TENANT_PROFILE_FORM_UPDATE_FIELDS).not.toContain('taxId');
    expect(TENANT_PROFILE_FORM_UPDATE_FIELDS).not.toContain('logoUrl');
    expect(TENANT_PROFILE_FORM_UPDATE_FIELDS).not.toContain('logoDarkUrl');
    expect(TENANT_PROFILE_FORM_UPDATE_FIELDS).not.toContain('pdfLogoUrl');
    expect(TENANT_PROFILE_FORM_UPDATE_FIELDS).toEqual(
      expect.arrayContaining([
        'companyName',
        'taxNumber',
        'vatId',
        'iban',
        'accentColor',
        'pdfFooterText',
        'emailSignature',
      ]),
    );
  });
});
