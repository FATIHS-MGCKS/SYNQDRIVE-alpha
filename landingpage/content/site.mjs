/**
 * Content model for the public SynqDrive landing page.
 *
 * One shape per locale so landingpage/tools/build-site.mjs renders the German
 * and English page from the same templates. Every capability claim below maps to
 * a module that exists in the product today:
 *
 *   bookings, customers, stations, tasks, fleet          frontend/src/rental
 *   finance (invoices, payments, price tariffs)          backend/src/modules/billing
 *   fleet telemetry and health                           backend/src/modules/vehicle-intelligence
 *   trips from vehicle segments                          backend/src/modules/dimo
 *   AI assistant with sources and freshness              backend/src/modules/ai
 *   workflow automation with approvals                   backend/src/modules/workflow-automation
 *   WhatsApp, notifications, email, voice                backend/src/modules/{whatsapp,notifications,voice}
 *
 * No metric, customer name, logo or testimonial is claimed anywhere, because no
 * verifiable public source exists for them.
 */

/** Reachable destinations only. The public site is a single page per locale. */
const LINKS = {
  app: 'https://app.synqdrive.eu',
  demo: 'mailto:info@synqdrive.eu?subject=SynqDrive%20demo%20request',
  contact: 'mailto:info@synqdrive.eu',
  email: 'info@synqdrive.eu',
};

const SECTION_IDS = {
  platform: 'platform',
  vehicle: 'vehicle-intelligence',
  ai: 'ai-orchestration',
  workflow: 'workflow-automation',
  communication: 'communication',
  integrations: 'integrations',
  contact: 'contact',
};

/**
 * Product visuals. Every file is a real screenshot of the SynqDrive frontend
 * rendered against one synthetic demo tenant (frontend/e2e/landing-demo-tenant.ts).
 */
const MEDIA = {
  hero: { file: 'landing-hero-operations', width: 2200, height: 978 },
  unified: { file: 'landing-unified-operations', width: 1900, height: 1516 },
  vehicle: { file: 'landing-connected-vehicle', width: 980, height: 1296 },
  ai: { file: 'landing-ai-orchestration', width: 1900, height: 1237 },
  workflow: { file: 'landing-workflow-automation', width: 1900, height: 1205 },
  communication: { file: 'landing-communications', width: 1900, height: 1372 },
};

const en = {
  locale: 'en',
  htmlLang: 'en',
  ogLocale: 'en_GB',
  dir: '/en/',
  meta: {
    title: 'SynqDrive | The operating system for modern mobility operations',
    description:
      'SynqDrive runs rental, fleet, bookings, customers, billing and connected vehicle data in one operational platform for mobility operators.',
    ogTitle: 'SynqDrive | The operating system for modern mobility operations',
    ogDescription:
      'Rental, fleet, bookings, customers, billing and connected vehicle data in one operational platform.',
    skipLink: 'Skip to content',
    localeSwitchLabel: 'Language',
    localeName: 'English',
    otherLocaleName: 'Deutsch',
  },
  nav: {
    home: 'SynqDrive home',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    platform: 'Platform',
    platformItems: [
      { label: 'Overview', href: `#${SECTION_IDS.platform}` },
      { label: 'Connected vehicle intelligence', href: `#${SECTION_IDS.vehicle}` },
      { label: 'AI and automation', href: `#${SECTION_IDS.ai}` },
      { label: 'Integrations', href: `#${SECTION_IDS.integrations}` },
    ],
    contact: 'Contact',
    contactHref: `#${SECTION_IDS.contact}`,
    login: 'Log in',
    demo: 'Book a demo',
  },
  hero: {
    eyebrow: 'Fleet and rental operations platform',
    title: 'The operating system for modern mobility operations',
    body: 'SynqDrive runs rental, fleet, bookings, customers, billing and connected vehicle data in one operational system.',
    primary: 'Book a demo',
    secondary: 'See the platform',
    media: MEDIA.hero,
    mediaAlt:
      'SynqDrive operations dashboard showing fleet readiness, today\u2019s rentals, revenue, open receivables and prioritised notifications.',
  },
  unified: {
    id: SECTION_IDS.platform,
    eyebrow: null,
    title: 'One system for the entire operation',
    body: 'Rental, fleet, bookings, customers, tasks and billing share one data model. Teams read the same operational state instead of reconciling separate tools.',
    media: MEDIA.unified,
    mediaAlt:
      'SynqDrive booking plan showing every fleet vehicle across one week with active, confirmed and completed rentals.',
    cards: [
      {
        icon: 'database',
        title: 'Shared data model',
        body: 'A booking, its vehicle, its customer and its invoice are the same record in every module.',
      },
      {
        icon: 'git-merge',
        title: 'One operational context',
        body: 'Fleet condition, bookings and open work are read together, not module by module.',
      },
      {
        icon: 'layers',
        title: 'Fewer system breaks',
        body: 'Handover, invoicing and follow-up work continue inside the same platform.',
      },
      {
        icon: 'users',
        title: 'Scoped access',
        body: 'Organisations, users and permissions are separated per tenant across every surface.',
      },
    ],
  },
  vehicle: {
    id: SECTION_IDS.vehicle,
    eyebrow: null,
    title: 'Connected vehicle intelligence',
    body: 'Every vehicle carries its own live state: telemetry, location, condition, service status and the bookings that depend on it. A vehicle is an operational unit, not a static record.',
    media: MEDIA.vehicle,
    mediaAlt:
      'SynqDrive fleet list showing per vehicle status, health state, station, telemetry freshness and mileage.',
    points: [
      {
        title: 'Live and last known state',
        body: 'Telemetry freshness, mileage and station are shown per vehicle, including when a signal has gone stale.',
      },
      {
        title: 'Condition that blocks rentals',
        body: 'Brakes, tyres, battery, error codes and service intervals can take a vehicle out of rental automatically.',
      },
      {
        title: 'Trips from vehicle segments',
        body: 'Trip boundaries come from vehicle segment data and are enriched with route and driving context.',
      },
    ],
  },
  ai: {
    id: SECTION_IDS.ai,
    eyebrow: 'AI orchestration',
    title: 'AI that works with your operational data',
    body: 'The assistant answers from the fleet, booking, finance and task data of your own organisation. Every answer names its sources and how fresh the underlying data is.',
    media: MEDIA.ai,
    mediaAlt:
      'SynqDrive AI assistant answering an operational question with a structured summary, named data sources and a data freshness note.',
    flowLabel: 'How an answer is produced',
    flow: [
      { title: 'Signal', body: 'Telemetry, bookings, finance and task events.' },
      { title: 'Context', body: 'Records are read together across modules.' },
      { title: 'Recommendation', body: 'A grounded answer with sources and open gaps.' },
      { title: 'Approved action', body: 'A person decides before anything is changed.' },
    ],
    governance: [
      {
        title: 'Grounded, not generated',
        body: 'Answers are built from tracked records. Missing data is reported instead of filled in.',
      },
      {
        title: 'People stay in control',
        body: 'Higher risk automations wait for human approval before they run.',
      },
    ],
  },
  workflow: {
    id: SECTION_IDS.workflow,
    eyebrow: null,
    title: 'Workflow automation',
    body: 'Operational events become operational reactions. Every automation is versioned, has a risk class and keeps a run history.',
    media: MEDIA.workflow,
    mediaAlt:
      'SynqDrive workflow overview listing active automations with their trigger, conditions, actions, risk class and last run result.',
    chainLabel: 'How an automation runs',
    chain: [
      {
        title: 'Trigger',
        body: 'A booking is returned, a document expires, an invoice runs overdue, vehicle condition turns critical.',
      },
      {
        title: 'Conditions',
        body: 'Thresholds and scope decide whether this event applies to this vehicle, station or organisation.',
      },
      {
        title: 'Action',
        body: 'Create a task, change vehicle status, raise an alert or notify the responsible team.',
      },
    ],
  },
  communication: {
    id: SECTION_IDS.communication,
    eyebrow: null,
    title: 'Connected customer communication',
    body: 'Messages sit next to the booking, the vehicle, the station and the open payment they belong to. Communication is part of the operation, not a separate inbox.',
    media: MEDIA.communication,
    mediaAlt:
      'SynqDrive customer conversation next to its operational context: booking, vehicle, station, payment status and documents.',
    points: [
      {
        title: 'One conversation layer',
        body: 'WhatsApp, email, in-app notifications and the voice assistant share the same customer record.',
      },
      {
        title: 'Every message has context',
        body: 'The booking, vehicle, station, payment state and open documents are visible while you reply.',
      },
      {
        title: 'Assisted, not automatic',
        body: 'The assistant can draft and suggest. Your team decides what is sent and when to escalate.',
      },
    ],
  },
  integrations: {
    id: SECTION_IDS.integrations,
    eyebrow: 'Integration and extension',
    title: 'Open where your operation needs it',
    body: 'SynqDrive connects to the systems around your fleet and exposes its own API and webhooks, so capabilities can be enabled per organisation.',
    hubLabel: 'Platform capabilities',
    tiles: [
      { icon: 'car', title: 'Vehicle telemetry', body: 'Connected vehicle data and trip segments.' },
      { icon: 'credit-card', title: 'Payments', body: 'Deposits, payouts and invoice settlement.' },
      { icon: 'user-check', title: 'Identity checks', body: 'Customer and driver verification.' },
      { icon: 'message-circle', title: 'Messaging and voice', body: 'Customer contact across channels.' },
      { icon: 'file-text', title: 'Documents', body: 'Upload, extraction and confirmed apply.' },
      { icon: 'code-xml', title: 'API and webhooks', body: 'Read and react to operational events.' },
    ],
    note: 'Extraction results are never applied to your data before someone confirms them.',
  },
  cta: {
    id: SECTION_IDS.contact,
    title: 'Ready to bring your mobility operations onto one platform?',
    body: 'Tell us how you operate today and we will show SynqDrive against your own workflow.',
    primary: 'Book a demo',
    secondary: 'Log in',
  },
  footer: {
    tagline: 'Operational software for fleet, rental and mobility businesses.',
    columnsLabel: 'Footer',
    platform: 'Platform',
    company: 'Company',
    links: {
      platform: [
        { label: 'Overview', href: `#${SECTION_IDS.platform}` },
        { label: 'Connected vehicle intelligence', href: `#${SECTION_IDS.vehicle}` },
        { label: 'AI and automation', href: `#${SECTION_IDS.ai}` },
        { label: 'Integrations', href: `#${SECTION_IDS.integrations}` },
      ],
      company: [
        { label: 'Contact', href: LINKS.contact },
        { label: 'Log in', href: LINKS.app },
      ],
    },
    rights: 'All rights reserved.',
  },
};

const de = {
  locale: 'de',
  htmlLang: 'de',
  ogLocale: 'de_DE',
  dir: '/',
  meta: {
    title: 'SynqDrive | Das Betriebssystem für den modernen Mobilitätsbetrieb',
    description:
      'SynqDrive führt Vermietung, Flotte, Buchungen, Kunden, Abrechnung und vernetzte Fahrzeugdaten in einer operativen Plattform für Mobilitätsbetriebe zusammen.',
    ogTitle: 'SynqDrive | Das Betriebssystem für den modernen Mobilitätsbetrieb',
    ogDescription:
      'Vermietung, Flotte, Buchungen, Kunden, Abrechnung und vernetzte Fahrzeugdaten in einer operativen Plattform.',
    skipLink: 'Zum Inhalt',
    localeSwitchLabel: 'Sprache',
    localeName: 'Deutsch',
    otherLocaleName: 'English',
  },
  nav: {
    home: 'SynqDrive Startseite',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    platform: 'Plattform',
    platformItems: [
      { label: 'Überblick', href: `#${SECTION_IDS.platform}` },
      { label: 'Vernetzte Fahrzeugintelligenz', href: `#${SECTION_IDS.vehicle}` },
      { label: 'KI und Automatisierung', href: `#${SECTION_IDS.ai}` },
      { label: 'Integrationen', href: `#${SECTION_IDS.integrations}` },
    ],
    contact: 'Kontakt',
    contactHref: `#${SECTION_IDS.contact}`,
    login: 'Anmelden',
    demo: 'Demo anfragen',
  },
  hero: {
    eyebrow: 'Plattform für Flotten- und Vermietbetrieb',
    title: 'Das Betriebssystem für den modernen Mobilitätsbetrieb',
    body: 'SynqDrive führt Vermietung, Flotte, Buchungen, Kunden, Abrechnung und vernetzte Fahrzeugdaten in einem operativen System zusammen.',
    primary: 'Demo anfragen',
    secondary: 'Plattform entdecken',
    media: MEDIA.hero,
    mediaAlt:
      'SynqDrive Betriebsübersicht mit Fahrzeugverfügbarkeit, laufenden Vermietungen, Umsatz, offenen Forderungen und priorisierten Hinweisen.',
  },
  unified: {
    id: SECTION_IDS.platform,
    eyebrow: null,
    title: 'Ein System für den gesamten Betrieb',
    body: 'Vermietung, Flotte, Buchungen, Kunden, Aufgaben und Abrechnung teilen ein Datenmodell. Alle Teams lesen denselben operativen Stand, statt getrennte Tools abzugleichen.',
    media: MEDIA.unified,
    mediaAlt:
      'SynqDrive Buchungsplan mit allen Flottenfahrzeugen über eine Woche und laufenden, bestätigten sowie abgeschlossenen Vermietungen.',
    cards: [
      {
        icon: 'database',
        title: 'Gemeinsame Datenbasis',
        body: 'Buchung, Fahrzeug, Kunde und Rechnung sind in jedem Modul derselbe Datensatz.',
      },
      {
        icon: 'git-merge',
        title: 'Ein operativer Kontext',
        body: 'Flottenzustand, Buchungen und offene Arbeit werden gemeinsam gelesen, nicht Modul für Modul.',
      },
      {
        icon: 'layers',
        title: 'Weniger Systembrüche',
        body: 'Übergabe, Abrechnung und Folgearbeit laufen in derselben Plattform weiter.',
      },
      {
        icon: 'users',
        title: 'Abgegrenzter Zugriff',
        body: 'Organisationen, Nutzer und Berechtigungen sind pro Mandant getrennt.',
      },
    ],
  },
  vehicle: {
    id: SECTION_IDS.vehicle,
    eyebrow: null,
    title: 'Vernetzte Fahrzeugintelligenz',
    body: 'Jedes Fahrzeug trägt seinen eigenen Live-Zustand: Telemetrie, Standort, Zustand, Servicestatus und die Buchungen, die davon abhängen. Ein Fahrzeug ist eine operative Einheit, kein statischer Datensatz.',
    media: MEDIA.vehicle,
    mediaAlt:
      'SynqDrive Fahrzeugliste mit Status, Zustand, Station, Aktualität der Telemetrie und Laufleistung pro Fahrzeug.',
    points: [
      {
        title: 'Live und letzter bekannter Stand',
        body: 'Aktualität der Telemetrie, Laufleistung und Station je Fahrzeug, auch wenn ein Signal veraltet ist.',
      },
      {
        title: 'Zustand, der Vermietung blockiert',
        body: 'Bremsen, Reifen, Batterie, Fehlercodes und Serviceintervalle können ein Fahrzeug automatisch aus der Vermietung nehmen.',
      },
      {
        title: 'Fahrten aus Fahrzeugsegmenten',
        body: 'Fahrtgrenzen stammen aus Fahrzeug-Segmentdaten und werden um Route und Fahrkontext ergänzt.',
      },
    ],
  },
  ai: {
    id: SECTION_IDS.ai,
    eyebrow: 'KI-Orchestrierung',
    title: 'KI, die mit Ihren operativen Daten arbeitet',
    body: 'Der Assistent antwortet aus den Flotten-, Buchungs-, Finanz- und Aufgabendaten Ihrer eigenen Organisation. Jede Antwort nennt ihre Quellen und die Aktualität der Daten.',
    media: MEDIA.ai,
    mediaAlt:
      'SynqDrive KI-Assistent mit strukturierter Antwort auf eine operative Frage, genannten Datenquellen und Hinweis zur Datenaktualität.',
    flowLabel: 'So entsteht eine Antwort',
    flow: [
      { title: 'Signal', body: 'Telemetrie, Buchungen, Finanzen und Aufgaben.' },
      { title: 'Kontext', body: 'Datensätze werden modulübergreifend gemeinsam gelesen.' },
      { title: 'Empfehlung', body: 'Eine belegte Antwort mit Quellen und offenen Lücken.' },
      { title: 'Freigegebene Aktion', body: 'Ein Mensch entscheidet, bevor etwas verändert wird.' },
    ],
    governance: [
      {
        title: 'Belegt statt erfunden',
        body: 'Antworten entstehen aus erfassten Datensätzen. Fehlende Daten werden benannt, nicht ergänzt.',
      },
      {
        title: 'Menschen behalten die Kontrolle',
        body: 'Automatisierungen mit höherem Risiko warten auf eine Freigabe, bevor sie laufen.',
      },
    ],
  },
  workflow: {
    id: SECTION_IDS.workflow,
    eyebrow: null,
    title: 'Workflow-Automatisierung',
    body: 'Operative Ereignisse werden zu operativen Reaktionen. Jede Automatisierung ist versioniert, hat eine Risikoklasse und führt eine Laufhistorie.',
    media: MEDIA.workflow,
    mediaAlt:
      'SynqDrive Workflow-Übersicht mit aktiven Automatisierungen, ihren Auslösern, Bedingungen, Aktionen, Risikoklassen und letzten Läufen.',
    chainLabel: 'So läuft eine Automatisierung',
    chain: [
      {
        title: 'Auslöser',
        body: 'Eine Buchung wird zurückgegeben, ein Dokument läuft ab, eine Rechnung wird überfällig, ein Fahrzeugzustand wird kritisch.',
      },
      {
        title: 'Bedingungen',
        body: 'Schwellenwerte und Geltungsbereich entscheiden, ob das Ereignis für dieses Fahrzeug, diese Station oder diese Organisation gilt.',
      },
      {
        title: 'Aktion',
        body: 'Aufgabe anlegen, Fahrzeugstatus ändern, Warnung auslösen oder das zuständige Team informieren.',
      },
    ],
  },
  communication: {
    id: SECTION_IDS.communication,
    eyebrow: null,
    title: 'Vernetzte Kundenkommunikation',
    body: 'Nachrichten stehen neben der Buchung, dem Fahrzeug, der Station und der offenen Zahlung, zu denen sie gehören. Kommunikation ist Teil des Betriebs, nicht eine getrennte Inbox.',
    media: MEDIA.communication,
    mediaAlt:
      'SynqDrive Kundenkonversation neben ihrem operativen Kontext: Buchung, Fahrzeug, Station, Zahlungsstatus und Dokumente.',
    points: [
      {
        title: 'Eine Kommunikationsebene',
        body: 'WhatsApp, E-Mail, Benachrichtigungen und der Sprachassistent nutzen denselben Kundendatensatz.',
      },
      {
        title: 'Jede Nachricht hat Kontext',
        body: 'Buchung, Fahrzeug, Station, Zahlungsstand und offene Dokumente sind beim Antworten sichtbar.',
      },
      {
        title: 'Unterstützt, nicht automatisch',
        body: 'Der Assistent kann formulieren und vorschlagen. Ihr Team entscheidet, was gesendet und wann eskaliert wird.',
      },
    ],
  },
  integrations: {
    id: SECTION_IDS.integrations,
    eyebrow: 'Integration und Erweiterung',
    title: 'Offen, wo Ihr Betrieb es braucht',
    body: 'SynqDrive verbindet sich mit den Systemen rund um Ihre Flotte und stellt eine eigene API sowie Webhooks bereit, sodass Funktionen pro Organisation aktiviert werden können.',
    hubLabel: 'Plattformfunktionen',
    tiles: [
      { icon: 'car', title: 'Fahrzeugtelemetrie', body: 'Vernetzte Fahrzeugdaten und Fahrtsegmente.' },
      { icon: 'credit-card', title: 'Zahlungen', body: 'Kautionen, Auszahlungen und Rechnungsausgleich.' },
      { icon: 'user-check', title: 'Identitätsprüfung', body: 'Prüfung von Kunden und Fahrern.' },
      { icon: 'message-circle', title: 'Nachrichten und Sprache', body: 'Kundenkontakt über mehrere Kanäle.' },
      { icon: 'file-text', title: 'Dokumente', body: 'Upload, Auslesen und bestätigte Übernahme.' },
      { icon: 'code-xml', title: 'API und Webhooks', body: 'Operative Ereignisse lesen und beantworten.' },
    ],
    note: 'Ausgelesene Ergebnisse werden erst nach einer Bestätigung in Ihre Daten übernommen.',
  },
  cta: {
    id: SECTION_IDS.contact,
    title: 'Bereit, Ihren Mobilitätsbetrieb auf eine Plattform zu bringen?',
    body: 'Sagen Sie uns, wie Sie heute arbeiten, und wir zeigen SynqDrive an Ihrem eigenen Ablauf.',
    primary: 'Demo anfragen',
    secondary: 'Anmelden',
  },
  footer: {
    tagline: 'Operative Software für Flotten-, Vermiet- und Mobilitätsbetriebe.',
    columnsLabel: 'Fußbereich',
    platform: 'Plattform',
    company: 'Unternehmen',
    links: {
      platform: [
        { label: 'Überblick', href: `#${SECTION_IDS.platform}` },
        { label: 'Vernetzte Fahrzeugintelligenz', href: `#${SECTION_IDS.vehicle}` },
        { label: 'KI und Automatisierung', href: `#${SECTION_IDS.ai}` },
        { label: 'Integrationen', href: `#${SECTION_IDS.integrations}` },
      ],
      company: [
        { label: 'Kontakt', href: LINKS.contact },
        { label: 'Anmelden', href: LINKS.app },
      ],
    },
    rights: 'Alle Rechte vorbehalten.',
  },
};

export const SITE = {
  origin: 'https://synqdrive.eu',
  brand: 'SynqDrive',
  year: 2026,
  links: LINKS,
  sectionIds: SECTION_IDS,
};

/** German stays the root locale, matching the current public site. */
export const locales = [de, en];
export const defaultLocale = de;
