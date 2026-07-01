import { useIcon, type IconName } from '@cardog-icons/react';

/* eslint-disable react-refresh/only-export-components -- shared module exports BrandLogo + brand resolver helpers */

export type BrandLogoVariant = 'icon' | 'logo' | 'logoHorizontal' | 'wordmark';
export type BrandLogoTone = 'auto' | 'color' | 'dark';

export interface BrandLogoProps {
  brand: string;
  size?: number;
  isDarkMode?: boolean;
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  className?: string;
  title?: string;
  /** @deprecated No-op — retained for backward compatibility with older call sites. */
  loading?: 'eager' | 'lazy';
}

/** Accepts a free-text model string, a `make + model` string, or an object from fleet API rows. */
export type BrandSource = string | null | undefined | { make?: string | null; model?: string | null };

const VARIANT_SUFFIX: Record<BrandLogoVariant, string> = {
  icon: 'Icon',
  logo: 'Logo',
  logoHorizontal: 'LogoHorizontal',
  wordmark: 'Wordmark',
};

/** SynqDrive brand keys that have no Cardog mapping and always use the neutral fallback. */
export const CARDOG_UNSUPPORTED_BRAND_KEYS = [
  'skoda',
  'opel',
  'renault',
  'peugeot',
  'seat',
  'citroen',
  'suzuki',
] as const;

/** Cardog brand prefix per SynqDrive brand key. */
const SYNQ_KEY_TO_CARDOG_PREFIX: Record<string, string> = {
  volkswagen: 'Volkswagen',
  bmw: 'BMW',
  audi: 'Audi',
  'mercedes-benz': 'MB',
  tesla: 'Tesla',
  toyota: 'Toyota',
  hyundai: 'Hyundai',
  porsche: 'Porsche',
  ford: 'Ford',
  fiat: 'Fiat',
  volvo: 'Volvo',
  mini: 'Mini',
  kia: 'Kia',
  mazda: 'Mazda',
  honda: 'Honda',
  nissan: 'Nissan',
  jeep: 'Jeep',
  'land-rover': 'Landrover',
  jaguar: 'Jaguar',
  lexus: 'Lexus',
  subaru: 'Subaru',
  mitsubishi: 'Mitsubishi',
  'alfa-romeo': 'AlfaRomeo',
  acura: 'Acura',
  'aston-martin': 'AstonMartin',
  bentley: 'Bentley',
  bugatti: 'Bugatti',
  buick: 'Buick',
  byd: 'BYD',
  cadillac: 'Cadillac',
  chevrolet: 'Chevrolet',
  chrysler: 'Chrysler',
  dodge: 'Dodge',
  ferrari: 'Ferrari',
  genesis: 'Genesis',
  gmc: 'GMC',
  hummer: 'Hummer',
  infiniti: 'Infiniti',
  koenigsegg: 'Koenigsegg',
  lamborghini: 'Lamborghini',
  lincoln: 'Lincoln',
  lotus: 'Lotus',
  lucid: 'Lucid',
  maserati: 'Maserati',
  mclaren: 'Mclaren',
  pagani: 'Pagani',
  polestar: 'Polestar',
  ram: 'RAM',
  rivian: 'Rivian',
  'rolls-royce': 'RollsRoyce',
  vinfast: 'Vinfast',
};

const KNOWN_SYNQ_BRAND_KEYS = new Set<string>([
  ...Object.keys(SYNQ_KEY_TO_CARDOG_PREFIX),
  ...CARDOG_UNSUPPORTED_BRAND_KEYS,
  'generic',
]);

/** Alias slug → SynqDrive brand key (includes Cardog and unsupported keys). */
const BRAND_ALIAS_TO_SYNQ_KEY: Record<string, string> = {
  volkswagen: 'volkswagen',
  vw: 'volkswagen',
  bmw: 'bmw',
  audi: 'audi',
  mercedes: 'mercedes-benz',
  'mercedes-benz': 'mercedes-benz',
  benz: 'mercedes-benz',
  'mercedes benz': 'mercedes-benz',
  tesla: 'tesla',
  toyota: 'toyota',
  hyundai: 'hyundai',
  porsche: 'porsche',
  ford: 'ford',
  fiat: 'fiat',
  volvo: 'volvo',
  mini: 'mini',
  kia: 'kia',
  mazda: 'mazda',
  honda: 'honda',
  nissan: 'nissan',
  jeep: 'jeep',
  'land-rover': 'land-rover',
  landrover: 'land-rover',
  'land rover': 'land-rover',
  jaguar: 'jaguar',
  lexus: 'lexus',
  subaru: 'subaru',
  mitsubishi: 'mitsubishi',
  'alfa-romeo': 'alfa-romeo',
  'alfa romeo': 'alfa-romeo',
  alfa: 'alfa-romeo',
  skoda: 'skoda',
  opel: 'opel',
  renault: 'renault',
  peugeot: 'peugeot',
  seat: 'seat',
  citroen: 'citroen',
  suzuki: 'suzuki',
  acura: 'acura',
  'aston-martin': 'aston-martin',
  'aston martin': 'aston-martin',
  bentley: 'bentley',
  bugatti: 'bugatti',
  buick: 'buick',
  byd: 'byd',
  cadillac: 'cadillac',
  chevrolet: 'chevrolet',
  chrysler: 'chrysler',
  dodge: 'dodge',
  ferrari: 'ferrari',
  genesis: 'genesis',
  gmc: 'gmc',
  hummer: 'hummer',
  infiniti: 'infiniti',
  koenigsegg: 'koenigsegg',
  lamborghini: 'lamborghini',
  lincoln: 'lincoln',
  lotus: 'lotus',
  lucid: 'lucid',
  maserati: 'maserati',
  mclaren: 'mclaren',
  pagani: 'pagani',
  polestar: 'polestar',
  ram: 'ram',
  rivian: 'rivian',
  'rolls-royce': 'rolls-royce',
  'rolls royce': 'rolls-royce',
  rollsroyce: 'rolls-royce',
  vinfast: 'vinfast',
  generic: 'generic',
};

type BrandDetector = {
  key: string;
  matches: (haystack: string) => boolean;
};

const BRAND_DETECTORS: readonly BrandDetector[] = [
  { key: 'rolls-royce', matches: (h) => h.startsWith('rolls-royce') || h.startsWith('rolls royce') || h.startsWith('rollsroyce') },
  { key: 'land-rover', matches: (h) => h.startsWith('land rover') || h.startsWith('landrover') },
  { key: 'alfa-romeo', matches: (h) => h.startsWith('alfa romeo') || h.startsWith('alfa-romeo') || h.startsWith('alfa ') },
  { key: 'aston-martin', matches: (h) => h.startsWith('aston martin') || h.startsWith('aston-martin') },
  { key: 'mercedes-benz', matches: (h) => h.startsWith('mercedes') || h.startsWith('mercedes-benz') || h === 'benz' || h.startsWith('benz ') },
  { key: 'volkswagen', matches: (h) => h.startsWith('volkswagen') || h.startsWith('vw ') || h === 'vw' },
  { key: 'citroen', matches: (h) => h.startsWith('citroën') || h.startsWith('citroen') },
  { key: 'skoda', matches: (h) => h.startsWith('skoda') || h.startsWith('škoda') },
  { key: 'koenigsegg', matches: (h) => h.startsWith('koenigsegg') || h.startsWith('königsegg') },
  { key: 'lamborghini', matches: (h) => h.startsWith('lamborghini') },
  { key: 'tesla', matches: (h) => h.startsWith('tesla') },
  { key: 'bmw', matches: (h) => h.startsWith('bmw') },
  { key: 'audi', matches: (h) => h.startsWith('audi') },
  { key: 'porsche', matches: (h) => h.startsWith('porsche') },
  { key: 'toyota', matches: (h) => h.startsWith('toyota') },
  { key: 'hyundai', matches: (h) => h.startsWith('hyundai') },
  { key: 'ford', matches: (h) => h.startsWith('ford') },
  { key: 'fiat', matches: (h) => h.startsWith('fiat') },
  { key: 'volvo', matches: (h) => h.startsWith('volvo') },
  { key: 'mini', matches: (h) => h.startsWith('mini') },
  { key: 'kia', matches: (h) => h.startsWith('kia') },
  { key: 'mazda', matches: (h) => h.startsWith('mazda') },
  { key: 'honda', matches: (h) => h.startsWith('honda') },
  { key: 'nissan', matches: (h) => h.startsWith('nissan') },
  { key: 'jeep', matches: (h) => h.startsWith('jeep') },
  { key: 'jaguar', matches: (h) => h.startsWith('jaguar') },
  { key: 'lexus', matches: (h) => h.startsWith('lexus') },
  { key: 'subaru', matches: (h) => h.startsWith('subaru') },
  { key: 'mitsubishi', matches: (h) => h.startsWith('mitsubishi') },
  { key: 'opel', matches: (h) => h.startsWith('opel') },
  { key: 'renault', matches: (h) => h.startsWith('renault') },
  { key: 'peugeot', matches: (h) => h.startsWith('peugeot') },
  { key: 'seat', matches: (h) => h.startsWith('seat') },
  { key: 'suzuki', matches: (h) => h.startsWith('suzuki') },
  { key: 'ferrari', matches: (h) => h.startsWith('ferrari') },
  { key: 'maserati', matches: (h) => h.startsWith('maserati') },
  { key: 'bentley', matches: (h) => h.startsWith('bentley') },
  { key: 'mclaren', matches: (h) => h.startsWith('mclaren') },
  { key: 'lucid', matches: (h) => h.startsWith('lucid') },
  { key: 'rivian', matches: (h) => h.startsWith('rivian') },
  { key: 'polestar', matches: (h) => h.startsWith('polestar') },
  { key: 'byd', matches: (h) => h.startsWith('byd') },
  { key: 'genesis', matches: (h) => h.startsWith('genesis') },
  { key: 'cadillac', matches: (h) => h.startsWith('cadillac') },
  { key: 'chevrolet', matches: (h) => h.startsWith('chevrolet') },
  { key: 'dodge', matches: (h) => h.startsWith('dodge') },
  { key: 'ram', matches: (h) => h === 'ram' || h.startsWith('ram ') },
  { key: 'gmc', matches: (h) => h.startsWith('gmc') },
  { key: 'lincoln', matches: (h) => h.startsWith('lincoln') },
  { key: 'acura', matches: (h) => h.startsWith('acura') },
  { key: 'bugatti', matches: (h) => h.startsWith('bugatti') },
  { key: 'buick', matches: (h) => h.startsWith('buick') },
  { key: 'chrysler', matches: (h) => h.startsWith('chrysler') },
  { key: 'hummer', matches: (h) => h.startsWith('hummer') },
  { key: 'infiniti', matches: (h) => h.startsWith('infiniti') },
  { key: 'lotus', matches: (h) => h.startsWith('lotus') },
  { key: 'pagani', matches: (h) => h.startsWith('pagani') },
  { key: 'vinfast', matches: (h) => h.startsWith('vinfast') || h.startsWith('vin fast') },
];

function normalizeBrandSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeBrandHaystack(source: BrandSource): string {
  if (source == null) return '';
  if (typeof source === 'object') {
    return `${source.make ?? ''} ${source.model ?? ''}`.replace(/\s+/g, ' ').trim();
  }
  return String(source).replace(/\s+/g, ' ').trim();
}

export function resolveSynqDriveBrandKey(brand: string): string {
  const trimmed = brand?.trim();
  if (!trimmed || trimmed === 'generic') return 'generic';

  const slug = normalizeBrandSlug(trimmed);
  const aliased = BRAND_ALIAS_TO_SYNQ_KEY[slug] ?? BRAND_ALIAS_TO_SYNQ_KEY[trimmed.toLowerCase()];
  if (aliased) return aliased;
  if (KNOWN_SYNQ_BRAND_KEYS.has(slug)) return slug;

  return 'generic';
}

export function getBrandFromModel(source: BrandSource): string {
  const haystack = normalizeBrandHaystack(source);
  if (!haystack) return 'generic';

  const lower = haystack.toLowerCase();
  for (const detector of BRAND_DETECTORS) {
    if (detector.matches(lower)) return detector.key;
  }

  const slug = normalizeBrandSlug(haystack);
  const aliased = BRAND_ALIAS_TO_SYNQ_KEY[slug];
  if (aliased) return aliased;

  return 'generic';
}

function resolveCardogTone(tone: BrandLogoTone, isDarkMode: boolean): boolean {
  if (tone === 'dark') return true;
  if (tone === 'color') return false;
  return isDarkMode;
}

export function buildCardogIconName(
  synqBrandKey: string,
  variant: BrandLogoVariant,
  useDarkVariant: boolean,
): string | null {
  const prefix = SYNQ_KEY_TO_CARDOG_PREFIX[synqBrandKey];
  if (!prefix) return null;
  const variantSuffix = VARIANT_SUFFIX[variant];
  return `${prefix}${variantSuffix}${useDarkVariant ? 'Dark' : ''}`;
}

function FallbackIcon({
  size,
  className,
  title,
}: {
  size: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
      <line x1="32" y1="4" x2="32" y2="24" stroke="currentColor" strokeWidth="2" />
      <line x1="32" y1="40" x2="32" y2="60" stroke="currentColor" strokeWidth="2" />
      <line x1="4" y1="32" x2="24" y2="32" stroke="currentColor" strokeWidth="2" />
      <line x1="40" y1="32" x2="60" y2="32" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

type CardogResolvableIconName = IconName | `${IconName}Dark`;

function CardogBrandIcon({
  iconName,
  size,
  className,
  title,
}: {
  iconName: string;
  size: number;
  className?: string;
  title?: string;
}) {
  const rendered = useIcon({
    name: iconName as CardogResolvableIconName as IconName,
    size,
    className,
    'aria-label': title,
    role: title ? 'img' : undefined,
  });

  if (!rendered) {
    return <FallbackIcon size={size} className={className} title={title} />;
  }

  return rendered;
}

export function BrandLogo({
  brand,
  size = 36,
  isDarkMode = false,
  variant = 'icon',
  tone = 'auto',
  className,
  title,
}: BrandLogoProps) {
  const synqBrandKey = resolveSynqDriveBrandKey(brand);
  const useDarkVariant = resolveCardogTone(tone, isDarkMode);
  const iconName = buildCardogIconName(synqBrandKey, variant, useDarkVariant);

  if (!iconName) {
    return <FallbackIcon size={size} className={className} title={title ?? brand} />;
  }

  return (
    <CardogBrandIcon
      iconName={iconName}
      size={size}
      className={className}
      title={title ?? brand}
    />
  );
}

export { Icon as CardogIcon } from '@cardog-icons/react';
