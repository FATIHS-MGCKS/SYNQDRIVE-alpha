import synqdriveLogo from '../../assets/synqdrive-logo-new.png';

interface SynqDriveBrandLogoProps {
  className?: string;
  alt?: string;
}

/** Platform wordmark — same asset in light and dark theme. */
export function SynqDriveBrandLogo({
  className = 'h-[25px] w-auto object-contain',
  alt = 'SYNQDRIVE',
}: SynqDriveBrandLogoProps) {
  return <img src={synqdriveLogo} alt={alt} className={className} />;
}
