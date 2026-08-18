/** Canonical Master Admin page layout tokens (CSS vars in theme.css). */
export const MASTER_PAGE_STACK_CLASS = 'master-page-stack';
export const MASTER_SECTION_GAP_CLASS = 'master-section-gap';
export const MASTER_HEADER_TABS_GAP_CLASS = 'master-header-tabs-gap';

export type PageContainerVariant = 'standard' | 'wide' | 'full';

export const PAGE_CONTAINER_MAX_CLASS: Record<PageContainerVariant, string> = {
  standard: 'max-w-[length:var(--master-shell-max-standard)]',
  wide: 'max-w-[length:var(--master-shell-max-wide)]',
  full: 'max-w-none',
};
