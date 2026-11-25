export type ProductCatalogStatusPatchPending = {
  productSlug: string;
  body: {
    catalogStatus: 'ACTIVE' | 'DISABLED';
    ifCurrentCatalogStatus: 'ACTIVE' | 'DISABLED';
    changeReason: string;
  };
};

export function shouldRetainProductCatalogStatusPending(status: number, message: string): boolean {
  return status === 403 && message.includes('STEP_UP_REQUIRED');
}

export function isProductCatalogStatusConflict(status: number, message: string): boolean {
  return status === 409 || message.toLowerCase().includes('concurrently');
}

export function oppositeCatalogStatus(status: string): 'ACTIVE' | 'DISABLED' {
  return status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
}