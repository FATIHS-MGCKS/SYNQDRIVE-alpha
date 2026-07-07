/** Canonical Make Model Year label — shared across booking surfaces. */
export function buildMMY(v: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): string {
  const make = (v.make ?? '').toString().trim();
  const rawModel = (v.model ?? '').toString().trim();
  const year = typeof v.year === 'number' && Number.isFinite(v.year) ? v.year : null;
  const modelClean = rawModel.replace(/\s+\d{4}$/, '').trim();
  const makeAlreadyInModel = make && modelClean.toLowerCase().startsWith(make.toLowerCase());
  const head = makeAlreadyInModel || !make ? modelClean : `${make} ${modelClean}`.trim();
  return year ? `${head} ${year}`.trim() : head || rawModel || 'Fahrzeug';
}
