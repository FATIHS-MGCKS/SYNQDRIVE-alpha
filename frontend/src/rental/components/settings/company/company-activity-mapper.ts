import type { ActivityLogRow } from './useCompanyCenter';

export type CompanyActivityCategory =
  | 'profile'
  | 'logo'
  | 'legal-upload'
  | 'legal-activate'
  | 'legal-archive'
  | 'other';

export interface CompanyActivityViewEntry {
  id: string;
  title: string;
  subtitle?: string;
  category: CompanyActivityCategory;
  categoryLabel: string;
  timestamp: string;
  actor?: string;
  technicalDetails?: string[];
  sourceIds: string[];
}

const CATEGORY_LABELS: Record<CompanyActivityCategory, string> = {
  profile: 'Unternehmen',
  logo: 'Branding',
  'legal-upload': 'Rechtstexte',
  'legal-activate': 'Rechtstexte',
  'legal-archive': 'Rechtstexte',
  other: 'Allgemein',
};

const MERGE_WINDOW_MS = 90_000;

const HTTP_METHOD_ROUTE_RE =
  /^(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/v\d+\/|\/organizations\/)/i;

function isTechnicalDescription(description: string): boolean {
  const trimmed = description.trim();
  return HTTP_METHOD_ROUTE_RE.test(trimmed);
}

function normalizeRoute(description: string): string {
  return description.replace(/\s*→\s*\d{3}\s*$/i, '').trim();
}

function mapRouteDescription(route: string): {
  category: CompanyActivityCategory;
  title: string;
  technicalDetail: string;
} | null {
  const routeLower = route.toLowerCase();

  if (
    /patch\s+(\/api\/v\d+\/organizations\/[^/]+\/profile|\/organizations\/[^/]+\/profile)$/i.test(
      route,
    )
  ) {
    return {
      category: 'profile',
      title: 'Unternehmensdaten aktualisiert',
      technicalDetail: route,
    };
  }

  if (/\/profile\/logo/i.test(routeLower)) {
    return {
      category: 'logo',
      title: 'Logo aktualisiert',
      technicalDetail: route,
    };
  }

  if (/\/legal-documents\/upload/i.test(routeLower)) {
    return {
      category: 'legal-upload',
      title: 'Rechtstext hochgeladen',
      technicalDetail: route,
    };
  }

  if (/\/legal-documents\/[^/]+\/activate/i.test(routeLower)) {
    return {
      category: 'legal-activate',
      title: 'Rechtstext aktiviert',
      technicalDetail: route,
    };
  }

  if (/\/legal-documents\/[^/]+\/archive/i.test(routeLower)) {
    return {
      category: 'legal-archive',
      title: 'Rechtstext archiviert',
      technicalDetail: route,
    };
  }

  return null;
}

interface MappedEntry {
  category: CompanyActivityCategory;
  title: string;
  subtitle?: string;
  technicalDetail?: string;
}

export function mapCompanyActivityLogEntry(entry: ActivityLogRow): MappedEntry {
  const description = entry.description.trim();
  const descriptionLower = description.toLowerCase();

  if (descriptionLower === 'tenant company profile updated') {
    return { category: 'profile', title: 'Unternehmensprofil geändert' };
  }

  if (descriptionLower === 'organization logo uploaded') {
    return { category: 'logo', title: 'Logo aktualisiert' };
  }

  if (descriptionLower === 'legal document uploaded') {
    return { category: 'legal-upload', title: 'Rechtstext hochgeladen' };
  }

  if (descriptionLower === 'legal document activated') {
    return { category: 'legal-activate', title: 'Rechtstext aktiviert' };
  }

  if (isTechnicalDescription(description)) {
    const route = normalizeRoute(description);
    const mapped = mapRouteDescription(route);
    if (mapped) {
      return {
        category: mapped.category,
        title: mapped.title,
        technicalDetail: description,
      };
    }
    return {
      category: 'other',
      title: 'Änderung gespeichert',
      subtitle: entry.entity && entry.entity !== 'Organization' ? entry.entity : undefined,
      technicalDetail: description,
    };
  }

  if (/\/api\/v\d+\//i.test(description)) {
    return {
      category: 'other',
      title: 'Änderung gespeichert',
      subtitle: entry.entity && entry.entity !== 'Organization' ? entry.entity : undefined,
      technicalDetail: description,
    };
  }

  return {
    category: 'other',
    title: 'Änderung gespeichert',
    subtitle: entry.entity && entry.entity !== 'Organization' ? entry.entity : undefined,
    technicalDetail: description !== 'Änderung gespeichert' ? description : undefined,
  };
}

function mergeKey(category: CompanyActivityCategory): string {
  if (category === 'logo' || category === 'profile') return 'company-profile';
  return category;
}

function canMergeCategories(a: CompanyActivityCategory, b: CompanyActivityCategory): boolean {
  return mergeKey(a) === mergeKey(b);
}

function dominantCategory(
  a: CompanyActivityCategory,
  b: CompanyActivityCategory,
): CompanyActivityCategory {
  if (a === 'logo' || b === 'logo') return 'logo';
  if (a === 'profile' || b === 'profile') return 'profile';
  return a;
}

function dominantTitle(
  a: { category: CompanyActivityCategory; title: string },
  b: { category: CompanyActivityCategory; title: string },
): string {
  const category = dominantCategory(a.category, b.category);
  if (category === 'logo') return 'Logo aktualisiert';
  if (category === 'profile') return 'Unternehmensprofil geändert';
  return a.title;
}

function toViewEntry(entry: ActivityLogRow, mapped: MappedEntry): CompanyActivityViewEntry {
  return {
    id: entry.id,
    title: mapped.title,
    subtitle: mapped.subtitle,
    category: mapped.category,
    categoryLabel: CATEGORY_LABELS[mapped.category],
    timestamp: entry.createdAt,
    actor: entry.userName?.trim() || undefined,
    technicalDetails: mapped.technicalDetail ? [mapped.technicalDetail] : undefined,
    sourceIds: [entry.id],
  };
}

function mergeInto(
  target: CompanyActivityViewEntry,
  mapped: MappedEntry,
  entry: ActivityLogRow,
): void {
  target.title = dominantTitle(
    { category: target.category, title: target.title },
    { category: mapped.category, title: mapped.title },
  );
  target.category = dominantCategory(target.category, mapped.category);
  target.categoryLabel = CATEGORY_LABELS[target.category];
  target.sourceIds.push(entry.id);
  if (mapped.technicalDetail) {
    target.technicalDetails = [...(target.technicalDetails ?? []), mapped.technicalDetail];
  }
  if (new Date(entry.createdAt).getTime() > new Date(target.timestamp).getTime()) {
    target.timestamp = entry.createdAt;
  }
}

export function mapCompanyActivityLogEntries(
  entries: ActivityLogRow[],
  options?: { mergeWindowMs?: number },
): CompanyActivityViewEntry[] {
  const mergeWindowMs = options?.mergeWindowMs ?? MERGE_WINDOW_MS;
  if (entries.length === 0) return [];

  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const groups: CompanyActivityViewEntry[] = [];

  for (const entry of sorted) {
    const mapped = mapCompanyActivityLogEntry(entry);
    const last = groups[groups.length - 1];
    const actor = entry.userName?.trim() || undefined;
    const withinWindow =
      last &&
      Math.abs(new Date(entry.createdAt).getTime() - new Date(last.timestamp).getTime()) <=
        mergeWindowMs;
    const sameActor = (last?.actor ?? '') === (actor ?? '');
    const mergeable =
      last && withinWindow && sameActor && canMergeCategories(last.category, mapped.category);

    if (mergeable && last) {
      mergeInto(last, mapped, entry);
    } else {
      groups.push(toViewEntry(entry, mapped));
    }
  }

  return groups.reverse();
}

export function formatCompanyActivityTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
