const GERMAN_HINT_CHARS = /[äöüßÄÖÜ]/;

const GERMAN_KEYWORDS = [
  'wo steht',
  'wo ist',
  'wo parkt',
  'standort',
  'position',
  'gps',
  'aktuell steht',
  'überfällig',
  'überfällige',
  'ueberfällig',
  'ueberfaellig',
  'verspätet',
  'verspaetet',
  'rückgabe',
  'rueckgabe',
  'rücknahme',
  'ruecknahme',
  'buchung',
  'buchungsnummer',
  'buchungsstatus',
  'übergabe',
  'uebergabe',
  'verlängerung',
  'verlaengerung',
  'telemetrie',
  'verbindung',
  'signal',
  'gesundheit',
  'batterie',
  'reifen',
  'bremsen',
  'fehlercode',
  'fehlercodes',
  'wartung',
  'schaden',
  'schäden',
  'synqdrive',
  'wie viele fahrzeuge',
  'flotte',
  'hilfe',
  'glossar',
];

const ENGLISH_KEYWORDS = [
  'where is',
  'where does',
  'location',
  'gps',
  'position',
  'overdue',
  'late return',
  'past due',
  'return deadline',
  'booking',
  'booking number',
  'booking status',
  'handover',
  'pickup',
  'extension',
  'telemetry',
  'connectivity',
  'signal',
  'online',
  'offline',
  'health',
  'battery',
  'tire',
  'brake',
  'dtc',
  'error code',
  'synqdrive',
  'how does',
  'documentation',
  'glossary',
  'how many vehicles',
  'fleet size',
  'fleet overview',
];

export function detectFleetChatLanguage(message: string): 'de' | 'en' | 'unknown' {
  const lower = message.toLowerCase();
  let germanScore = 0;
  let englishScore = 0;

  if (GERMAN_HINT_CHARS.test(message)) {
    germanScore += 2;
  }

  for (const term of GERMAN_KEYWORDS) {
    if (lower.includes(term)) {
      germanScore += 1;
    }
  }

  for (const term of ENGLISH_KEYWORDS) {
    if (lower.includes(term)) {
      englishScore += 1;
    }
  }

  if (germanScore === 0 && englishScore === 0) {
    return 'unknown';
  }
  if (germanScore > englishScore) {
    return 'de';
  }
  if (englishScore > germanScore) {
    return 'en';
  }
  return 'unknown';
}
