import { useEffect, useState } from 'react';

interface BrandLogoProps {
  brand: string;
  size?: number;
  isDarkMode?: boolean;
}

/** Accepts a free-text model string, a `make + model` string, or an object from fleet API rows. */
export type BrandSource = string | null | undefined | { make?: string | null; model?: string | null };

function normalizeBrandHaystack(source: BrandSource): string {
  if (source == null) return '';
  if (typeof source === 'object') {
    return `${source.make ?? ''} ${source.model ?? ''}`.replace(/\s+/g, ' ').trim();
  }
  return String(source).replace(/\s+/g, ' ').trim();
}

export function getBrandFromModel(source: BrandSource): string {
  const haystack = normalizeBrandHaystack(source);
  if (!haystack) return 'generic';
  const lower = haystack.toLowerCase();
  if (lower.startsWith('volkswagen') || lower.startsWith('vw ')) return 'volkswagen';
  if (lower.startsWith('tesla')) return 'tesla';
  if (lower.startsWith('bmw')) return 'bmw';
  if (lower.startsWith('audi')) return 'audi';
  if (lower.startsWith('mercedes')) return 'mercedes-benz';
  if (lower.startsWith('skoda') || lower.startsWith('škoda')) return 'skoda';
  if (lower.startsWith('opel')) return 'opel';
  if (lower.startsWith('ford')) return 'ford';
  if (lower.startsWith('toyota')) return 'toyota';
  if (lower.startsWith('hyundai')) return 'hyundai';
  if (lower.startsWith('porsche')) return 'porsche';
  if (lower.startsWith('renault')) return 'renault';
  if (lower.startsWith('peugeot')) return 'peugeot';
  if (lower.startsWith('fiat')) return 'fiat';
  if (lower.startsWith('volvo')) return 'volvo';
  if (lower.startsWith('mini')) return 'mini';
  if (lower.startsWith('seat')) return 'seat';
  if (lower.startsWith('kia')) return 'kia';
  if (lower.startsWith('mazda')) return 'mazda';
  if (lower.startsWith('honda')) return 'honda';
  if (lower.startsWith('nissan')) return 'nissan';
  if (lower.startsWith('jeep')) return 'jeep';
  if (lower.startsWith('land rover') || lower.startsWith('landrover')) return 'land-rover';
  if (lower.startsWith('jaguar')) return 'jaguar';
  if (lower.startsWith('lexus')) return 'lexus';
  if (lower.startsWith('subaru')) return 'subaru';
  if (lower.startsWith('suzuki')) return 'suzuki';
  if (lower.startsWith('mitsubishi')) return 'mitsubishi';
  if (lower.startsWith('citroën') || lower.startsWith('citroen')) return 'citroen';
  if (lower.startsWith('alfa romeo') || lower.startsWith('alfa')) return 'alfa-romeo';
  return 'generic';
}

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized';

const brandSlugMap: Record<string, string> = {
  'volkswagen': 'volkswagen',
  'bmw': 'bmw',
  'audi': 'audi',
  'mercedes-benz': 'mercedes-benz',
  'tesla': 'tesla',
  'skoda': 'skoda',
  'opel': 'opel',
  'ford': 'ford',
  'toyota': 'toyota',
  'hyundai': 'hyundai',
  'porsche': 'porsche',
  'renault': 'renault',
  'peugeot': 'peugeot',
  'fiat': 'fiat',
  'volvo': 'volvo',
  'mini': 'mini',
  'seat': 'seat',
  'kia': 'kia',
  'mazda': 'mazda',
  'honda': 'honda',
  'nissan': 'nissan',
  'jeep': 'jeep',
  'land-rover': 'land-rover',
  'jaguar': 'jaguar',
  'lexus': 'lexus',
  'subaru': 'subaru',
  'suzuki': 'suzuki',
  'mitsubishi': 'mitsubishi',
  'citroen': 'citroen',
  'alfa-romeo': 'alfa-romeo',
};

function FallbackIcon({ size, isDarkMode }: { size: number; isDarkMode: boolean }) {
  const c = isDarkMode ? '#a3a3a3' : '#525252';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke={c} strokeWidth="2" fill="none" />
      <circle cx="32" cy="32" r="8" stroke={c} strokeWidth="2" fill="none" />
      <line x1="32" y1="4" x2="32" y2="24" stroke={c} strokeWidth="2" />
      <line x1="32" y1="40" x2="32" y2="60" stroke={c} strokeWidth="2" />
      <line x1="4" y1="32" x2="24" y2="32" stroke={c} strokeWidth="2" />
      <line x1="40" y1="32" x2="60" y2="32" stroke={c} strokeWidth="2" />
    </svg>
  );
}

export function BrandLogo({ brand, size = 36, isDarkMode = false }: BrandLogoProps) {
  const slug = brandSlugMap[brand];
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [brand]);

  if (!slug || imgFailed) {
    return <FallbackIcon size={size} isDarkMode={isDarkMode} />;
  }

  const src = `${CDN_BASE}/${slug}.png`;

  return (
    <img
      src={src}
      alt={brand}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        filter: isDarkMode ? 'brightness(0) invert(1)' : 'none',
      }}
      onError={() => setImgFailed(true)}
    />
  );
}
