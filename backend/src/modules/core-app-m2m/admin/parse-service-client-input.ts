import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { normalizeClientId } from '../core-app-service-registry.policy';
import { isEligibleServiceClientProductSlug } from '../core-app-service-registry.policy';

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}[a-zA-Z0-9]$/;

export function parseServiceClientIdParam(value: unknown): string {
  const clientId = normalizeClientId(String(value ?? ''));
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new BadRequestException('clientId is invalid');
  }
  return clientId;
}

export function parseServiceClientProductSlug(value: unknown): ProductSlug {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!raw || !Object.values(ProductSlug).includes(raw as ProductSlug)) {
    throw new BadRequestException('productSlug is invalid or missing');
  }
  const slug = raw as ProductSlug;
  if (!isEligibleServiceClientProductSlug(slug)) {
    throw new BadRequestException('productSlug is not eligible for service clients');
  }
  return slug;
}

export function parseAllowedScopes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('allowedScopes must be an array');
  }
  const scopes = value.map((s) => String(s ?? '').trim()).filter(Boolean);
  if (scopes.length === 0) {
    throw new BadRequestException('allowedScopes must not be empty');
  }
  return [...new Set(scopes)];
}