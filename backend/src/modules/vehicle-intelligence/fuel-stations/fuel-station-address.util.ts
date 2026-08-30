export function formatFuelStationAddress(parts: {
  street?: string | null;
  housenumber?: string | null;
  postcode?: string | null;
  city?: string | null;
}): string | undefined {
  const streetLine = [parts.street, parts.housenumber].filter(Boolean).join(' ').trim();
  const cityLine = [parts.postcode, parts.city].filter(Boolean).join(' ').trim();
  const combined = [streetLine, cityLine].filter(Boolean).join(', ');
  return combined || undefined;
}

export function metadataCompletenessScore(parts: {
  name?: string | null;
  brand?: string | null;
  operator?: string | null;
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
}): number {
  const fields = [
    parts.name,
    parts.brand,
    parts.operator,
    parts.street,
    parts.postcode,
    parts.city,
  ];
  const present = fields.filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  return present / fields.length;
}

export function normalizeFuelStationLabel(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
