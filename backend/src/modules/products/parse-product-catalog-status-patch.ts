import { BadRequestException } from '@nestjs/common';
import { ProductCatalogStatus } from '@prisma/client';

export const PRODUCT_CATALOG_STATUS_CHANGE_REASON_MAX = 500;

const ALLOWED_KEYS = new Set(['catalogStatus', 'ifCurrentCatalogStatus', 'changeReason']);

const CATALOG_STATUS_VALUES = new Set<string>([ProductCatalogStatus.ACTIVE, ProductCatalogStatus.DISABLED]);

export type ParsedProductCatalogStatusPatch = {
  catalogStatus: ProductCatalogStatus;
  ifCurrentCatalogStatus: ProductCatalogStatus;
  changeReason: string;
};

function parseCatalogStatusValue(value: unknown, field: string): ProductCatalogStatus {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  const normalized = value.trim().toUpperCase();
  if (!CATALOG_STATUS_VALUES.has(normalized)) {
    throw new BadRequestException(`${field} must be ACTIVE or DISABLED`);
  }
  return normalized as ProductCatalogStatus;
}

function parseChangeReason(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('changeReason must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException('changeReason is required');
  }
  if (trimmed.length > PRODUCT_CATALOG_STATUS_CHANGE_REASON_MAX) {
    throw new BadRequestException(
      `changeReason must be at most ${PRODUCT_CATALOG_STATUS_CHANGE_REASON_MAX} characters`,
    );
  }
  return trimmed;
}

export function parseProductCatalogStatusPatchBody(body: unknown): ParsedProductCatalogStatusPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new BadRequestException(`Unknown field "${key}"`);
    }
  }
  if (!('catalogStatus' in record)) {
    throw new BadRequestException('catalogStatus is required');
  }
  if (!('ifCurrentCatalogStatus' in record)) {
    throw new BadRequestException('ifCurrentCatalogStatus is required for concurrency control');
  }
  if (!('changeReason' in record)) {
    throw new BadRequestException('changeReason is required');
  }

  const catalogStatus = parseCatalogStatusValue(record.catalogStatus, 'catalogStatus');
  const ifCurrentCatalogStatus = parseCatalogStatusValue(
    record.ifCurrentCatalogStatus,
    'ifCurrentCatalogStatus',
  );
  const changeReason = parseChangeReason(record.changeReason);

  return { catalogStatus, ifCurrentCatalogStatus, changeReason };
}