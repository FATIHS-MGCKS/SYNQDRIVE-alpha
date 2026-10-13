const MS_PER_SECOND = 1000;

export function bucketLabelToMs(label: string): number {
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid bucketLabel: ${label}`);
  }
  return ms;
}

export function bucketLabelMinusSeconds(label: string, seconds: number): string {
  return new Date(bucketLabelToMs(label) - seconds * MS_PER_SECOND).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function bucketLabelPlusSeconds(label: string, seconds: number): string {
  return new Date(bucketLabelToMs(label) + seconds * MS_PER_SECOND).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}
