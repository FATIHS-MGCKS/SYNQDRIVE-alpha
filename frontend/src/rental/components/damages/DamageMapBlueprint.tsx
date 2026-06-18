import type { VehicleExteriorViewKey } from '../../../lib/api';

export function DamageMapBlueprint({ view }: { view: VehicleExteriorViewKey }) {
  const stroke = 'currentColor';
  if (view === 'FRONT') {
    return (
      <svg viewBox="0 0 200 140" className="w-3/4 h-3/4" aria-hidden>
        <path d="M40,110 L40,65 Q40,45 55,40 L80,30 Q100,24 120,30 L145,40 Q160,45 160,65 L160,110" fill="none" stroke={stroke} strokeWidth="1.6" />
        <path d="M65,35 Q100,20 135,35" fill="none" stroke={stroke} strokeWidth="1.4" />
        <path d="M60,42 L70,55 L130,55 L140,42" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M55,75 L145,75 L145,90 L55,90 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <line x1="100" y1="75" x2="100" y2="90" stroke={stroke} strokeWidth="0.7" />
        <ellipse cx="50" cy="75" rx="8" ry="12" fill="none" stroke={stroke} strokeWidth="1.1" />
        <ellipse cx="150" cy="75" rx="8" ry="12" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M45,95 L155,95 L155,108 Q100,112 45,108 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="30" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="152" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
      </svg>
    );
  }
  if (view === 'REAR') {
    return (
      <svg viewBox="0 0 200 140" className="w-3/4 h-3/4" aria-hidden>
        <path d="M40,110 L40,65 Q40,45 55,40 L80,32 Q100,26 120,32 L145,40 Q160,45 160,65 L160,110" fill="none" stroke={stroke} strokeWidth="1.6" />
        <path d="M65,37 Q100,22 135,37" fill="none" stroke={stroke} strokeWidth="1.4" />
        <path d="M62,44 L72,58 L128,58 L138,44" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="42" y="68" width="14" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="144" y="68" width="14" height="20" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M60,65 L140,65 L140,90 L60,90 Z" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="75" y="92" width="50" height="12" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <ellipse cx="65" cy="110" rx="6" ry="4" fill="none" stroke={stroke} strokeWidth="0.9" />
        <ellipse cx="135" cy="110" rx="6" ry="4" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="30" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
        <rect x="152" y="95" width="18" height="18" rx="3" fill="none" stroke={stroke} strokeWidth="1.1" />
      </svg>
    );
  }
  if (view === 'ROOF') {
    return (
      <svg viewBox="0 0 200 140" className="w-3/4 h-3/4" aria-hidden>
        <path d="M60,15 Q100,8 140,15 L150,35 Q155,70 150,105 L140,125 Q100,132 60,125 L50,105 Q45,70 50,35 Z" fill="none" stroke={stroke} strokeWidth="1.6" />
        <path d="M65,38 Q100,32 135,38 L130,50 Q100,47 70,50 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M70,95 Q100,92 130,95 L135,108 Q100,112 65,108 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
        <path d="M70,50 Q100,47 130,50 L130,95 Q100,92 70,95 Z" fill="none" stroke={stroke} strokeWidth="0.7" />
        <ellipse cx="45" cy="42" rx="5" ry="3" fill="none" stroke={stroke} strokeWidth="0.9" />
        <ellipse cx="155" cy="42" rx="5" ry="3" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="42" y="28" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="150" y="28" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="42" y="95" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <rect x="150" y="95" width="8" height="18" rx="2" fill="none" stroke={stroke} strokeWidth="0.9" />
        <line x1="100" y1="15" x2="100" y2="125" stroke={stroke} strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5" />
      </svg>
    );
  }
  const sideOutline = (
    <svg viewBox="0 0 320 140" className="w-3/4 h-3/4" aria-hidden>
      <path d="M40,95 L40,75 Q40,65 50,62 L95,52 Q110,48 120,38 L180,28 Q195,26 210,28 L250,35 Q270,40 280,55 L285,70 Q290,75 290,80 L290,95" fill="none" stroke={stroke} strokeWidth="1.6" />
      <path d="M120,38 Q150,25 180,28" fill="none" stroke={stroke} strokeWidth="1.4" />
      <line x1="55" y1="95" x2="245" y2="95" stroke={stroke} strokeWidth="1.6" />
      <path d="M125,40 L135,52 L195,52 L210,35 Q200,30 185,30 L140,33 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
      <path d="M100,55 L125,40 L135,52 L100,55 Z" fill="none" stroke={stroke} strokeWidth="1.1" />
      <circle cx="90" cy="95" r="22" fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle cx="90" cy="95" r="14" fill="none" stroke={stroke} strokeWidth="0.9" />
      <circle cx="90" cy="95" r="4" fill={stroke} opacity="0.3" />
      <circle cx="235" cy="95" r="22" fill="none" stroke={stroke} strokeWidth="1.6" />
      <circle cx="235" cy="95" r="14" fill="none" stroke={stroke} strokeWidth="0.9" />
      <circle cx="235" cy="95" r="4" fill={stroke} opacity="0.3" />
      <line x1="140" y1="52" x2="140" y2="90" stroke={stroke} strokeWidth="0.9" />
      <line x1="190" y1="52" x2="190" y2="90" stroke={stroke} strokeWidth="0.9" />
      <ellipse cx="50" cy="72" rx="8" ry="5" fill="none" stroke={stroke} strokeWidth="1.1" />
      <ellipse cx="283" cy="72" rx="5" ry="8" fill="none" stroke={stroke} strokeWidth="1.1" />
      <line x1="155" y1="65" x2="165" y2="65" stroke={stroke} strokeWidth="1.4" />
    </svg>
  );
  return (
    <div className={view === 'RIGHT' ? 'w-full h-full flex items-center justify-center scale-x-[-1]' : 'w-full h-full flex items-center justify-center'}>
      {sideOutline}
    </div>
  );
}
