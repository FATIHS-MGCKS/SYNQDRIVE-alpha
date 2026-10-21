import type { SourceAdoptionContext } from './source-adoption.context';

/** Master Admin trusted platform adoption — never caller-supplied. */
export const PLATFORM_TRUSTED_SOURCE_ADOPTION: SourceAdoptionContext = {
  mode: 'PLATFORM_TRUSTED_ADOPTION',
};
