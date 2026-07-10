import synqdriveLogoLight from '../../assets/synqdrive-logo-new.png';
import synqdriveLogoDark from '../../assets/synqdrive-logo-dark-wordmark.png';

interface SynqDriveBrandLogoProps {
  className?: string;
  alt?: string;
}

/** Platform wordmark — dark text in light theme, white wordmark in dark theme. */
export function SynqDriveBrandLogo({
  className = 'h-[25px] w-auto object-contain',
  alt = 'SYNQDRIVE',
}: SynqDriveBrandLogoProps) {
  return (
    <>
      <img src={synqdriveLogoLight} alt={alt} className={`${className} dark:hidden`} />
      <img
        src={synqdriveLogoDark}
        alt={alt}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
