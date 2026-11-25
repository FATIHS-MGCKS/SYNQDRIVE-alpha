/**
 * Master Admin product roadmap presentation (business launch status).
 * Distinct from ProductCatalogStatus (catalog metadata).
 */

export type ProductBusinessLaunchStatus =
  | 'EXISTING_PRODUCT'
  | 'IN_PREPARATION'
  | 'RETIRED_PRODUCT';

export const PRODUCT_BUSINESS_LAUNCH_STATUS: Record<string, ProductBusinessLaunchStatus> = {
  RENTAL: 'EXISTING_PRODUCT',
  FLEET: 'IN_PREPARATION',
  VYMOD: 'IN_PREPARATION',
  TAXI: 'RETIRED_PRODUCT',
};

export const SELECTABLE_PRODUCT_SLUGS = ['RENTAL', 'FLEET', 'VYMOD'] as const;
export type SelectableProductSlug = (typeof SELECTABLE_PRODUCT_SLUGS)[number];

export const PRODUCT_BUSINESS_STATUS_LABEL_DE: Record<ProductBusinessLaunchStatus, string> = {
  EXISTING_PRODUCT: 'Bestehendes Geschäftsprodukt',
  IN_PREPARATION: 'In Vorbereitung',
  RETIRED_PRODUCT: 'Produkt eingestellt (Legacy)',
};

export const VEHICLE_ACCESS_MODE_LABEL_DE: Record<string, string> = {
  ORGANIZATION_WIDE: 'Organisationsweit',
  SELECTED_VEHICLES: 'Ausgewählte Fahrzeuge',
};

export function businessLaunchStatusForSlug(slug: string): ProductBusinessLaunchStatus | null {
  return PRODUCT_BUSINESS_LAUNCH_STATUS[slug] ?? null;
}

export function isLegacyRetiredProductSlug(slug: string): boolean {
  return slug === 'TAXI';
}

export function isSelectableProductSlug(slug: string): slug is SelectableProductSlug {
  return (SELECTABLE_PRODUCT_SLUGS as readonly string[]).includes(slug);
}

/** Catalog entries offered for new assignments in Master Admin (excludes TAXI). */
export function isAssignableCatalogProduct(slug: string, catalogStatus?: string): boolean {
  if (!isSelectableProductSlug(slug)) return false;
  if (catalogStatus === 'DISABLED') return false;
  return true;
}

export function classifyMasterProductApiError(status: number, message: string): string {
  if (status === 401) return 'Sitzung abgelaufen — bitte erneut anmelden.';
  if (status === 403) {
    if (message.includes('STEP_UP_REQUIRED')) {
      return 'Zusätzliche 2FA-Bestätigung erforderlich. Bestätigen Sie im Dialog und führen Sie die Aktion erneut aus.';
    }
    return message || 'Keine Berechtigung für diese Aktion.';
  }
  if (status === 404) {
    if (message && !message.startsWith('Organisation')) return `Organisation, Produkt oder Fahrzeug nicht gefunden (${message}).`;
    return message || 'Organisation, Produkt oder Fahrzeug nicht gefunden.';
  }
  if (status === 409) {
    if (message.includes('vehicleAccessMode')) {
      return 'Zugriffsmodus wurde zwischenzeitlich geändert. Daten werden aktualisiert — bitte erneut versuchen.';
    }
    if (message.includes('metadata') || message.includes('concurrently')) {
      return 'Produktmetadaten wurden zwischenzeitlich geändert. Daten werden aktualisiert — bitte erneut versuchen.';
    }
    return message || 'Konflikt — bitte aktualisieren und erneut versuchen.';
  }
  return message || `Anfrage fehlgeschlagen (HTTP ${status}).`;
}