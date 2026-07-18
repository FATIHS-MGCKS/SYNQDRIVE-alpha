/** Curated IANA timezones for station operations (display label + value). */
export const STATION_FORM_TIMEZONE_OPTIONS = [
  { value: 'Europe/Berlin', labelKey: 'stations.form.timezone.europeBerlin' as const },
  { value: 'Europe/Vienna', labelKey: 'stations.form.timezone.europeVienna' as const },
  { value: 'Europe/Zurich', labelKey: 'stations.form.timezone.europeZurich' as const },
  { value: 'Europe/Amsterdam', labelKey: 'stations.form.timezone.europeAmsterdam' as const },
  { value: 'Europe/Paris', labelKey: 'stations.form.timezone.europeParis' as const },
  { value: 'Europe/Rome', labelKey: 'stations.form.timezone.europeRome' as const },
  { value: 'Europe/Madrid', labelKey: 'stations.form.timezone.europeMadrid' as const },
  { value: 'Europe/London', labelKey: 'stations.form.timezone.europeLondon' as const },
  { value: 'Europe/Stockholm', labelKey: 'stations.form.timezone.europeStockholm' as const },
  { value: 'Europe/Warsaw', labelKey: 'stations.form.timezone.europeWarsaw' as const },
  { value: 'Europe/Prague', labelKey: 'stations.form.timezone.europePrague' as const },
  { value: 'UTC', labelKey: 'stations.form.timezone.utc' as const },
] as const;

export const STATION_FORM_RADIUS_MIN = 25;
export const STATION_FORM_RADIUS_MAX = 5000;
export const STATION_FORM_RADIUS_DEFAULT = 100;
