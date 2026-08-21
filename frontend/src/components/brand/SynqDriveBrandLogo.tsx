const LOGO_SRC = {
  /** Full SYNQDRIVE wordmark (~6.9:1). */
  full: '/synqdrive-logo-v2-blau.png',
  /** Compact SQD mark (~2.8:1) for narrow shells such as collapsed sidebars. */
  mark: '/SQD-logo-kurz-blau.png',
} as const;

export type SynqDriveBrandLogoVariant = keyof typeof LOGO_SRC;

interface SynqDriveBrandLogoProps {
  className?: string;
  alt?: string;
  variant?: SynqDriveBrandLogoVariant;
}

/** Platform wordmark — same asset in light and dark theme. */
export function SynqDriveBrandLogo({
  className = 'h-[18px] w-auto object-contain',
  alt = 'SYNQDRIVE',
  variant = 'full',
}: SynqDriveBrandLogoProps) {
  return <img src={LOGO_SRC[variant]} alt={alt} className={className} />;
}
