/** Canonical surface layer names (L0–L2). L3 liquid is map-HUD only — not exposed here. */

export type SolidSurface = 'solid' | 'premium' | 'elevated';

export type CardSurface = SolidSurface | 'frosted';

export type DialogSurface = 'solid' | 'elevated';

export type TabsListSurface = 'solid' | 'frosted';

export type FooterSurface = 'solid' | 'frosted';

export type EmptySurface = 'solid' | 'premium';

/** Maps a surface token to the canonical `.surface-*` CSS class. */
export function surfaceClassName(surface: CardSurface | DialogSurface | TabsListSurface): string {
  switch (surface) {
    case 'solid':
      return 'surface-solid';
    case 'premium':
      return 'surface-premium';
    case 'elevated':
      return 'surface-elevated';
    case 'frosted':
      return 'surface-frosted';
    default:
      return 'surface-solid';
  }
}

/** shadcn Card / generic card surfaces. */
export function resolveCardSurface(options: {
  surface?: CardSurface;
  interactive?: boolean;
  /** Default when neither surface nor interactive is set. */
  defaultSurface?: CardSurface;
}): string {
  const { surface, interactive, defaultSurface = 'solid' } = options;
  if (surface) return surfaceClassName(surface);
  if (interactive) return 'surface-elevated';
  return surfaceClassName(defaultSurface);
}

/** DataCard / MetricCard — interactive elevates unless surface is explicit. */
export function resolveDataCardSurface(options: {
  surface?: SolidSurface;
  interactive?: boolean;
  flush?: boolean;
}): string {
  const { surface, interactive, flush } = options;
  if (surface) return surfaceClassName(surface);
  if (interactive) return 'surface-elevated';
  if (flush) return 'surface-solid';
  return 'surface-premium';
}
