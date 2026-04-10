import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, ChevronDown, ChevronRight, BookOpen, LayoutDashboard, Calendar, Car,
  Users, MapPin, BarChart3, Activity, FileText, AlertCircle, Tag, ListTodo,
  Briefcase, Zap, MessageSquare, Phone, Shield, Package, CreditCard, Truck,
  Building2, UserCog, Wifi, Lock, HelpCircle, Headphones, Gauge,
  Upload, Bot, FileCheck, Wrench, Heart, ShieldCheck, Sparkles, Clock, Eye,
  CheckCircle, Info, AlertTriangle, Rocket,
} from 'lucide-react';

// ═══════════════════════════════════════════════════
// HELP CENTER DATA
// ═══════════════════════════════════════════════════

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  articles: HelpArticle[];
  comingSoon?: boolean;
}

interface HelpArticle {
  id: string;
  title: string;
  content: string;
}

const SECTIONS: HelpSection[] = [
  // ──── GETTING STARTED ────
  {
    id: 'getting-started',
    title: 'Erste Schritte',
    icon: Rocket,
    description: 'Willkommen bei SynqDrive – hier erfahren Sie, wie Sie am besten starten.',
    articles: [
      {
        id: 'welcome',
        title: 'Was ist SynqDrive?',
        content: `SynqDrive ist eine intelligente Plattform für Miet- und Fuhrparkbetriebe. Sie hilft Ihnen, Fahrzeuge, Buchungen, Kunden, Finanzen und den gesamten operativen Alltag an einem zentralen Ort zu verwalten.

Die Plattform kombiniert klassische Verwaltungsfunktionen mit moderner Fahrzeugdatenanalyse und KI-Unterstützung, damit Sie bessere Entscheidungen treffen und weniger Zeit mit Verwaltung verbringen.`,
      },
      {
        id: 'first-steps',
        title: 'Wie fange ich an?',
        content: `1. **Unternehmensdaten einrichten** – Gehen Sie zu Einstellungen → Unternehmensinformationen und füllen Sie Ihre Firmendaten aus.
2. **Fahrzeuge anlegen** – Fügen Sie Ihre Fahrzeuge über die Flotte-Seite hinzu. Nutzen Sie die KI-Erkennung für schnellere Erfassung.
3. **Stationen erstellen** – Richten Sie Ihre Standorte ein, damit Fahrzeuge und Buchungen korrekt zugeordnet werden.
4. **Kunden anlegen** – Erfassen Sie Ihre Kunden, um Buchungen erstellen zu können.
5. **Erste Buchung erstellen** – Alles bereit? Erstellen Sie Ihre erste Buchung über das Dashboard oder die Buchungsseite.

**Tipp:** Pflegen Sie von Anfang an vollständige Fahrzeugdaten – das verbessert die Auswertungen und KI-Ergebnisse deutlich.`,
      },
      {
        id: 'roles',
        title: 'Rollen und Berechtigungen verstehen',
        content: `SynqDrive kennt drei Rollen:

**Org-Admin** – Voller Zugriff auf alle Bereiche. Kann Mitarbeiter anlegen und verwalten, Berechtigungen vergeben und alle Einstellungen ändern.

**Sub-Admin** – Kann vom Org-Admin für bestimmte Stationen oder die gesamte Organisation eingerichtet werden. Der Zugriff auf einzelne Seiten und Funktionen ist konfigurierbar (Lese- und/oder Schreibrechte).

**Worker** – Operativer Mitarbeiter mit individuell zugewiesenen Zugriffsrechten. Ideal für Fahrer, Werkstatt-Mitarbeiter oder Buchhalter, die nur bestimmte Bereiche benötigen.

Berechtigungen werden unter Einstellungen → Benutzer & Rollen verwaltet.`,
      },
    ],
  },

  // ──── OPERATIONS ────
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Ihre zentrale Übersicht über den Betrieb.',
    articles: [
      {
        id: 'dashboard-overview',
        title: 'Was zeigt das Dashboard?',
        content: `Das Dashboard ist Ihre Startseite und gibt Ihnen auf einen Blick die wichtigsten Informationen:

• **Fahrzeugstatus** – Wie viele Fahrzeuge sind verfügbar, vermietet oder in der Werkstatt?
• **Aktive Buchungen** – Aktuell laufende Vermietungen und anstehende Rückgaben.
• **Umsatz-Übersicht** – Tages- und Monatsumsätze auf einen Blick.
• **Live-Karte** – Standorte Ihrer verbundenen Fahrzeuge in Echtzeit.
• **KI-Zusammenfassung** – Wichtige Hinweise und Empfehlungen, automatisch erstellt.
• **Fahrzeuggesundheit** – Warnungen und Zustands-Updates Ihrer Flotte.

**Tipp:** Schauen Sie morgens als Erstes auf das Dashboard – es zeigt Ihnen, was heute Ihre Aufmerksamkeit braucht.`,
      },
    ],
  },
  {
    id: 'bookings',
    title: 'Buchungen',
    icon: Calendar,
    description: 'Vermietungen erstellen, verwalten und nachverfolgen.',
    articles: [
      {
        id: 'bookings-overview',
        title: 'Wie funktionieren Buchungen?',
        content: `Die Buchungsseite ist das Herzstück Ihres Vermietungsbetriebs. Hier sehen Sie alle aktiven, geplanten und abgeschlossenen Buchungen.

**Neue Buchung erstellen:**
1. Klicken Sie auf „Neue Buchung" (auch über das Dashboard oder die Schnellaktion in der Seitenleiste möglich).
2. Wählen Sie den Kunden, das Fahrzeug, den Zeitraum und die Station.
3. Tarife werden automatisch berechnet, können aber angepasst werden.
4. Bestätigen und speichern.

**Buchungsübersicht:**
• Filtern Sie nach Status (aktiv, abgeschlossen, storniert).
• Suchen Sie nach Kunden, Fahrzeug oder Buchungsnummer.
• Klicken Sie auf eine Buchung, um alle Details zu sehen.

**Warum vollständige Buchungen wichtig sind:**
Saubere Buchungsdaten fließen in Ihre Umsatzübersichten, Kundenhistorien und Analysen ein. Fehlende Daten verringern die Aussagekraft der Berichte.`,
      },
    ],
  },
  {
    id: 'fleet',
    title: 'Flotte',
    icon: Car,
    description: 'Alle Fahrzeuge verwalten, dokumentieren und überwachen.',
    articles: [
      {
        id: 'fleet-overview',
        title: 'Fahrzeugverwaltung',
        content: `Auf der Flotte-Seite sehen Sie alle registrierten Fahrzeuge Ihres Betriebs. Sie können:

• Neue Fahrzeuge anlegen (manuell oder mit KI-Unterstützung)
• Fahrzeugdetails einsehen und bearbeiten
• Fahrzeugstatus verfolgen (verfügbar, vermietet, in Reparatur etc.)
• Nach Marke, Modell, Status oder Station filtern

**KI-gestützte Fahrzeugerfassung:**
Laden Sie Fahrzeugdokumente hoch (z. B. Zulassungsbescheinigung Teil I) – die KI erkennt automatisch Fahrzeugdaten wie Marke, Modell, Baujahr und technische Spezifikationen und füllt das Formular für Sie aus.`,
      },
      {
        id: 'vehicle-detail',
        title: 'Fahrzeug-Detailseite',
        content: `Wenn Sie ein Fahrzeug auswählen, öffnet sich die Detailansicht mit mehreren Tabs:

**Übersicht** – Alle Stammdaten des Fahrzeugs, Live-Position (bei verbundenen Fahrzeugen) und KI-Zusammenfassung.

**Fahrten** – Alle aufgezeichneten Fahrten des Fahrzeugs mit Start, Ziel, Entfernung und Dauer.

**Gesundheit** – Der Zustand des Fahrzeugs: Batterie, Reifen, Bremsen, Ölstand, Serviceintervalle und Warnungen. Hier sehen Sie, ob Handlungsbedarf besteht.

**Schäden** – Dokumentierte Schäden am Fahrzeug mit Fotos, Beschreibung und Status.

**Dokumente** – Alle zum Fahrzeug gehörenden Dokumente (Versicherung, TÜV, Zulassung, Rechnungen etc.).

**Buchungen** – Die Buchungshistorie dieses Fahrzeugs.

**Aufgaben** – Offene und erledigte Aufgaben, die mit diesem Fahrzeug verknüpft sind.`,
      },
      {
        id: 'fleet-data-quality',
        title: 'Warum gute Fahrzeugdaten so wichtig sind',
        content: `Die Qualität Ihrer Fahrzeugdaten beeinflusst das gesamte System:

**Gesundheits-Analysen:** Die Plattform berechnet den Zustand Ihrer Fahrzeuge basierend auf dokumentierten Service-Intervallen, Reifenwechseln, Bremsenarbeiten und Inspektionen. Fehlen diese Daten, können Warnungen ungenau sein oder ganz ausbleiben.

**KI-Empfehlungen:** Je vollständiger die Fahrzeughistorie ist, desto besser kann die KI Wartungsbedarf vorhersagen, Kosten einschätzen und Handlungsempfehlungen geben.

**Beispiele wichtiger Dokumentation:**
• Reifenwechsel (Zeitpunkt, Reifentyp, Profiltiefe)
• Bremsenwechsel und Bremsenverschleiß
• Ölwechsel und Service-Intervalle
• TÜV/AU-Termine und -Ergebnisse
• Werkstattrechnungen
• Versicherungsdokumente
• Schadensmeldungen und Reparaturen

**Merke:** Dokumentation ist kein Aufwand, sondern eine Investition. Gut gepflegte Daten sparen Ihnen später viel Zeit und Kosten.`,
      },
    ],
  },
  {
    id: 'customers',
    title: 'Kunden',
    icon: Users,
    description: 'Kundenstamm und Kundenhistorie verwalten.',
    articles: [
      {
        id: 'customers-overview',
        title: 'Kundenverwaltung',
        content: `Auf der Kundenseite verwalten Sie Ihren gesamten Kundenstamm:

• **Kunden anlegen** – Erfassen Sie Name, Kontaktdaten, Führerscheininformationen und Adresse.
• **Kundendetails** – Klicken Sie auf einen Kunden, um dessen vollständige Historie zu sehen: alle Buchungen, Rechnungen und Interaktionen.
• **Suchen und Filtern** – Finden Sie Kunden schnell über die Suche oder nach Status.

**Wichtig:** Vollständige Kundendaten ermöglichen schnellere Buchungen und aussagekräftigere Berichte. Achten Sie darauf, die Kontaktdaten aktuell zu halten.`,
      },
    ],
  },
  {
    id: 'stations',
    title: 'Stationen',
    icon: MapPin,
    description: 'Standorte und Übergabepunkte einrichten.',
    articles: [
      {
        id: 'stations-overview',
        title: 'Was sind Stationen?',
        content: `Stationen sind Ihre physischen Standorte – z. B. Büros, Übergabepunkte oder Filialen. Sie werden genutzt für:

• **Fahrzeugzuordnung** – Jedes Fahrzeug kann einer Station zugewiesen werden.
• **Buchungszuordnung** – Bei Buchungen wird definiert, wo Abholung und Rückgabe stattfinden.
• **Berechtigungssteuerung** – Sub-Admins können auf bestimmte Stationen beschränkt werden.
• **Kartenanzeige** – Stationen werden auf der Karte angezeigt.

**Tipp:** Richten Sie alle Ihre Standorte ein, bevor Sie mit Buchungen beginnen. So sind Ihre Daten von Anfang an korrekt zugeordnet.`,
      },
    ],
  },

  // ──── INSIGHTS ────
  {
    id: 'insights',
    title: 'Einblicke & Analysen',
    icon: BarChart3,
    description: 'Fahrdaten-Analyse, Statistiken und Flottengesundheit.',
    articles: [
      {
        id: 'rental-driving-analysis',
        title: 'Fahrverhalten-Analyse',
        content: `Die Fahrverhalten-Analyse zeigt Ihnen, wie Ihre Fahrzeuge genutzt werden:

• **Fahrverhalten-Scores** – Bewertung des Fahrverhaltens anhand von Beschleunigung, Bremsen und Geschwindigkeit.
• **Eco-Scores** – Wie effizient und umweltfreundlich werden Ihre Fahrzeuge gefahren?
• **Sicherheits-Scores** – Gibt es auffällige Fahrweisen, die ein Risiko darstellen könnten?

Diese Daten helfen Ihnen, den Umgang mit Ihren Fahrzeugen zu verstehen und bei Auffälligkeiten frühzeitig einzugreifen.

**Voraussetzung:** Fahrzeuge müssen über Fleet Connectivity verbunden sein, damit Fahrdaten erfasst werden.`,
      },
      {
        id: 'analytics',
        title: 'Analysen',
        content: `Die Analyse-Seite bietet Ihnen Auswertungen zu Ihrem Betrieb:

• Buchungsvolumen und Auslastung über verschiedene Zeiträume
• Umsatzentwicklung
• Fahrzeug-Performance-Vergleiche
• Stationsbezogene Auswertungen

**Warum wichtig:** Zahlen lügen nicht. Regelmäßige Blicke auf die Analysen helfen Ihnen, Trends zu erkennen, Ihre Flotte optimal einzusetzen und bessere Geschäftsentscheidungen zu treffen.`,
      },
      {
        id: 'fleet-condition',
        title: 'Flottengesundheit',
        content: `Die Flottengesundheit zeigt den technischen Zustand aller Fahrzeuge auf einen Blick:

• **Health-Score** – Ein zusammenfassender Wert pro Fahrzeug (basierend auf Alter, Kilometern, Service-Status, Reifenzustand, Bremsenzustand etc.).
• **Warnungen** – Fahrzeuge mit überfälligem Service, abgenutzten Reifen oder anderen Problemen werden hervorgehoben.
• **Detailansicht** – Klicken Sie auf ein Fahrzeug, um die vollständige Gesundheits-Analyse zu sehen.

**Zusammenhang mit Dokumentation:** Der Health-Score ist nur so genau wie Ihre Daten. Wenn Service-Termine, Reifenwechsel und Werkstattarbeiten nicht dokumentiert sind, kann das System den Zustand nicht korrekt berechnen. Pflegen Sie daher regelmäßig die Fahrzeug-Dokumentation.`,
      },
    ],
  },

  // ──── FINANCE ────
  {
    id: 'finance',
    title: 'Finanzen',
    icon: FileText,
    description: 'Rechnungen, Bußgelder und Preisgestaltung.',
    articles: [
      {
        id: 'invoices',
        title: 'Rechnungen',
        content: `Auf der Rechnungsseite verwalten Sie alle erstellten Rechnungen:

• Übersicht aller Rechnungen mit Status (offen, bezahlt, storniert)
• Suche nach Rechnungsnummer, Kunde oder Zeitraum
• Rechnungsdetails und Positionen einsehen

Rechnungen werden aus Buchungen generiert und berücksichtigen den gewählten Tarif, die Mietdauer und eventuelle Zusatzkosten.`,
      },
      {
        id: 'fines',
        title: 'Bußgelder',
        content: `Hier verwalten Sie Bußgelder, die im Zusammenhang mit Ihren Fahrzeugen anfallen:

• Erfassen Sie eingehende Bußgeldbescheide
• Ordnen Sie sie dem richtigen Fahrzeug und Zeitraum zu
• Identifizieren Sie, welcher Mieter zum Zeitpunkt des Verstoßes verantwortlich war

**Tipp:** Durch vollständige Buchungsdaten kann das System automatisch den verantwortlichen Mieter zuordnen.`,
      },
      {
        id: 'pricing',
        title: 'Preise & Tarife',
        content: `Auf der Tarife-Seite definieren Sie Ihre Preisstruktur:

• Erstellen Sie Tarife mit Tages-, Wochen- und Monatspreisen
• Definieren Sie Kilometer-Pauschalen und Zusatzkosten
• Weisen Sie Tarife Fahrzeugen oder Fahrzeuggruppen zu

Gut gepflegte Tarife sorgen dafür, dass Buchungen automatisch korrekt berechnet werden und Rechnungen stimmen.`,
      },
    ],
  },

  // ──── TASKS ────
  {
    id: 'tasks-section',
    title: 'Aufgaben & Dienstleister',
    icon: ListTodo,
    description: 'Aufgaben planen und externe Dienstleister verwalten.',
    articles: [
      {
        id: 'task-management',
        title: 'Aufgabenverwaltung',
        content: `Die Aufgabenverwaltung hilft Ihnen, Ihre operativen To-Dos im Blick zu behalten:

• Erstellen Sie Aufgaben (z. B. „Fahrzeug X zum TÜV bringen", „Reifenwechsel für Fahrzeug Y")
• Weisen Sie Aufgaben Mitarbeitern zu
• Verfolgen Sie den Fortschritt (offen, in Bearbeitung, erledigt)
• Verknüpfen Sie Aufgaben mit Fahrzeugen

**Tipp:** Nutzen Sie Aufgaben, um Wartungsarbeiten systematisch zu planen. So vergessen Sie nichts und alles ist dokumentiert.`,
      },
      {
        id: 'vendor-management',
        title: 'Dienstleisterverwaltung',
        content: `Hier verwalten Sie Ihre externen Partner – Werkstätten, Reinigungsdienste, Reifenhändler und andere Dienstleister:

• Dienstleister anlegen mit Kontaktdaten und Spezialisierung
• Aufgaben und Aufträge an Dienstleister verknüpfen
• Überblick über alle Zusammenarbeiten behalten

**Warum nützlich:** Ein gepflegtes Dienstleister-Verzeichnis spart im Tagesgeschäft viel Zeit. Wenn ein Fahrzeug eine Reparatur braucht, finden Sie sofort den richtigen Ansprechpartner.`,
      },
    ],
  },

  // ──── AI & UPLOAD ────
  {
    id: 'ai-tools',
    title: 'KI & Dokument-Upload',
    icon: Bot,
    description: 'KI-gestützte Funktionen und intelligente Dokumentenverarbeitung.',
    articles: [
      {
        id: 'document-upload',
        title: 'Dokument-Upload',
        content: `Der Dokument-Upload erlaubt Ihnen, fahrzeugbezogene Dokumente direkt in die Plattform zu laden:

• Zulassungsbescheinigungen
• Versicherungspolicen
• Werkstattrechnungen
• TÜV-Berichte
• Weitere Fahrzeugdokumente

**KI-Erkennung:** Beim Upload versucht die KI automatisch, relevante Informationen aus dem Dokument zu extrahieren – z. B. Fahrzeugdaten, Daten oder Beträge. Das beschleunigt die Erfassung und reduziert Tippfehler.

**Wichtig:** Laden Sie Dokumente in guter Qualität hoch (nicht verschwommen, nicht abgeschnitten). Je besser die Vorlage, desto genauer die KI-Erkennung.`,
      },
      {
        id: 'ai-assistant',
        title: 'KI-Assistent',
        content: `Der KI-Assistent ist Ihr intelligenter Helfer innerhalb der Plattform. Sie können direkt mit ihm chatten:

• Fragen zum Fuhrpark stellen (z. B. „Welches Fahrzeug braucht als nächstes einen Service?")
• Daten zusammenfassen lassen
• Empfehlungen und Hinweise erhalten

Der Assistent lernt aus Ihren Fahrzeug- und Betriebsdaten und kann Ihnen im Tagesgeschäft schnelle Antworten liefern.

**Hinweis:** Der Assistent ist so gut wie Ihre Daten. Je vollständiger Fahrzeug-Dokumentation, Buchungen und Kundendaten sind, desto hilfreicher werden die Antworten.`,
      },
    ],
  },

  // ──── ADMINISTRATION ────
  {
    id: 'administration',
    title: 'Administration & Einstellungen',
    icon: Building2,
    description: 'Unternehmensdaten, Benutzer, Verbindungen und Abrechnung.',
    articles: [
      {
        id: 'company-info',
        title: 'Unternehmensinformationen',
        content: `Unter Einstellungen → Unternehmensinformationen pflegen Sie Ihre Firmendaten:

• Firmenname, Adresse, Kontaktdaten
• Logo und Geschäftsdetails
• Organisationskürzel (wird intern z. B. für die KI-Benennung verwendet)

**Wichtig:** Vollständige Unternehmensdaten sind für Rechnungen und offizielle Korrespondenz notwendig.`,
      },
      {
        id: 'users-roles',
        title: 'Benutzer & Rollen',
        content: `Hier verwalten Sie Ihr Team innerhalb der Plattform:

• **Mitarbeiter anlegen** – In einem strukturierten Assistenten mit Rollenauswahl, persönlichen Daten, Einstellungen, Berechtigungen und Kontoanlegung.
• **Rollen zuweisen** – Org-Admin, Sub-Admin oder Worker.
• **Berechtigungen konfigurieren** – Welche Seiten und Funktionen darf der Mitarbeiter sehen und bearbeiten?
• **Stationen zuweisen** – Sub-Admins und Worker können auf bestimmte Stationen beschränkt werden.
• **Field Agent App Zugriff** – Konfigurierbar für Sub-Admins und Worker.
• **Passwörter verwalten** – Einmalpasswörter generieren oder E-Mail-Einladungen versenden.
• **Sitzungen einsehen** – Aktive Sitzungen pro Benutzer anzeigen und bei Bedarf beenden.

**Wichtig:** Vergeben Sie Berechtigungen bewusst. Nicht jeder Mitarbeiter braucht Zugriff auf alle Bereiche. Gezielte Rechtevergabe erhöht die Sicherheit und Übersichtlichkeit.`,
      },
      {
        id: 'fleet-connectivity',
        title: 'Fleet Connectivity',
        content: `Fleet Connectivity verbindet Ihre physischen Fahrzeuge mit der digitalen Plattform.

Verbundene Fahrzeuge liefern Live-Daten wie:
• Position und Standort in Echtzeit
• Kilometerstand
• Fahrdaten (Geschwindigkeit, Beschleunigung, Bremsen)
• Fahrzeugzustand (Batterie, Reifendruck, Warnungen)

**Wie verbinden?** Unter Einstellungen → Fleet Connectivity sehen Sie alle verbundenen Fahrzeuge und können neue Verbindungen einrichten. Die Verbindung erfolgt über die DIMO-Technologie.

**Warum verbinden?** Verbundene Fahrzeuge ermöglichen Live-Tracking, automatische Fahrtenerfassung, Gesundheitsanalysen und Fahrverhalten-Auswertungen. Ohne Verbindung sind diese Funktionen nicht verfügbar.`,
      },
      {
        id: 'data-authorization',
        title: 'Datenautorisierung',
        content: `Unter Datenautorisierung legen Sie fest, welche Daten geteilt und genutzt werden dürfen.

Dies betrifft insbesondere:
• Welche Fahrzeugdaten der Plattform zur Analyse zur Verfügung stehen
• Ob und wie Daten für Versicherungsangebote oder andere Dienste freigegeben werden
• Die Kontrolle über Ihre Datenhoheit

**Grundprinzip:** Sie behalten immer die Kontrolle. Daten werden nur dann geteilt, wenn Sie das aktiv autorisieren.`,
      },
      {
        id: 'billing',
        title: 'Abrechnung & Abonnement',
        content: `Hier verwalten Sie Ihr SynqDrive-Abonnement:

• Aktueller Plan und Funktionsumfang
• Rechnungsübersicht
• Zahlungsinformationen

Bei Fragen zur Abrechnung können Sie auch jederzeit ein Support-Ticket erstellen.`,
      },
    ],
  },

  // ──── SUPPORT ────
  {
    id: 'support-section',
    title: 'Support & Hilfe',
    icon: Headphones,
    description: 'So erhalten Sie Hilfe bei Fragen und Problemen.',
    articles: [
      {
        id: 'support-tickets',
        title: 'Support-Tickets',
        content: `Über die Support-Seite können Sie direkt mit dem SynqDrive-Team kommunizieren:

• **Neues Ticket erstellen** – Beschreiben Sie Ihr Anliegen mit Betreff, Beschreibung und optional einem Bild.
• **Chat-artige Kommunikation** – Jedes Ticket wird zu einem Gesprächsverlauf. Sie können jederzeit antworten und neue Informationen hinzufügen.
• **Bilder anhängen** – Laden Sie Screenshots oder Fotos hoch, um Ihr Anliegen besser zu beschreiben.
• **Status verfolgen** – Sehen Sie jederzeit, ob Ihr Ticket offen, in Bearbeitung oder gelöst ist.

Jedes Ticket erhält eine eindeutige Ticketnummer, die Ihnen die Nachverfolgung erleichtert.`,
      },
      {
        id: 'help-center-self',
        title: 'Help Center (diese Seite)',
        content: `Sie befinden sich gerade im Help Center – der zentralen Anlaufstelle für Erklärungen, Anleitungen und Best Practices rund um die Plattform.

**Tipp:** Nutzen Sie die Suchfunktion oben, um schnell nach bestimmten Themen zu suchen. Das Help Center wird regelmäßig aktualisiert.`,
      },
    ],
  },

  // ──── DATA QUALITY ────
  {
    id: 'data-quality',
    title: 'Datenqualität & Dokumentation',
    icon: FileCheck,
    description: 'Warum gute Dokumentation den Unterschied macht.',
    articles: [
      {
        id: 'why-documentation-matters',
        title: 'Warum Dokumentation so wichtig ist',
        content: `SynqDrive arbeitet mit Ihren Daten. Je besser Ihre Daten sind, desto besser funktioniert das System für Sie.

**Konkret bedeutet das:**

Wenn Sie regelmäßig dokumentieren, wann ein Ölwechsel stattgefunden hat, wann Reifen gewechselt wurden und wann die letzte Inspektion war, kann das System:
• Den Zustand Ihrer Fahrzeuge genau einschätzen
• Rechtzeitig an kommende Services erinnern
• Kosten besser vorhersagen
• Probleme frühzeitig erkennen

**Wenn Daten fehlen:**
• Der Health-Score wird ungenau
• Wartungserinnerungen können nicht korrekt berechnet werden
• Die KI-Empfehlungen werden weniger hilfreich
• Im schlimmsten Fall übersehen Sie wichtige Wartungen

**Unser Rat:** Machen Sie es sich zur Gewohnheit, Dokumente und Ereignisse zeitnah zu erfassen. Das kostet wenige Minuten, spart aber langfristig erheblich Zeit und Geld.`,
      },
      {
        id: 'what-to-document',
        title: 'Was sollte ich dokumentieren?',
        content: `Hier eine Checkliste der wichtigsten Dokumentationen:

**Regelmäßige Wartung:**
• Ölwechsel (Datum, Kilometerstand)
• Service-Inspektionen (Ergebnis, nächster Termin)
• Bremsenwechsel / Bremsenprüfung
• Reifenwechsel (Typ, Profiltiefe, Saisonwechsel)

**Offizielle Dokumente:**
• TÜV / Hauptuntersuchung (Ergebnis, nächster Termin)
• Versicherungspolicen und -änderungen
• Zulassungsbescheinigungen
• KFZ-Steuerbescheide

**Vorfälle:**
• Schadensmeldungen mit Fotos
• Unfallberichte
• Reparaturaufträge und -rechnungen

**Werkstattbelege:**
• Alle Werkstattrechnungen (mit Datum und Beschreibung)
• Ersatzteilkosten
• Arbeitszeit-Nachweise

**Tipp:** Nutzen Sie den Dokument-Upload, um Belege direkt hochzuladen. Die KI hilft beim Auslesen der wichtigsten Informationen.`,
      },
      {
        id: 'data-quality-ai',
        title: 'Wie Datenqualität die KI verbessert',
        content: `Die KI-Funktionen in SynqDrive basieren auf Ihren Betriebsdaten. Je vollständiger und aktueller diese sind, desto nützlicher wird die KI:

**Mit guten Daten kann die KI:**
• Genauere Fahrzeug-Gesundheitsbewertungen erstellen
• Konkretere Wartungsempfehlungen geben
• Bessere Kostenprognosen liefern
• Sinnvollere Zusammenfassungen im Dashboard anzeigen
• Im Chat-Assistenten präzisere Antworten geben

**Stellen Sie sich vor:** Sie fragen den KI-Assistenten „Welches Fahrzeug sollte als nächstes zum Service?" – die Antwort ist nur dann hilfreich, wenn Service-Daten tatsächlich gepflegt sind.

**Zusammengefasst:** Gute Daten = Gute KI = Bessere Entscheidungen = Weniger Kosten und Aufwand.`,
      },
    ],
  },

  // ──── SECURITY ────
  {
    id: 'security',
    title: 'Datensicherheit & Vertrauen',
    icon: ShieldCheck,
    description: 'Wie wir mit Ihren Daten umgehen.',
    articles: [
      {
        id: 'security-overview',
        title: 'Wie sicher sind meine Daten?',
        content: `Der Schutz Ihrer Daten ist ein zentrales Anliegen von SynqDrive. Hier die wichtigsten Punkte:

**Zugriffskontrolle:**
• Jeder Benutzer hat individuelle Berechtigungen
• Ihre Daten sind organisationsgebunden – andere Organisationen sehen Ihre Daten nicht
• Passwörter werden verschlüsselt gespeichert

**Datenhoheit:**
• Sie entscheiden, welche Daten Sie mit der Plattform und externen Diensten teilen
• Die Datenautorisierungsseite gibt Ihnen volle Kontrolle
• Ohne Ihre Zustimmung werden keine Daten weitergegeben

**Fahrzeugdaten:**
• Verbundene Fahrzeugdaten werden über DIMO-basierte Technologie bereitgestellt
• DIMO nutzt eine dezentrale, blockchain-basierte Architektur, die Datenintegrität und Transparenz fördert
• Das bedeutet: Fahrzeugdaten sind nachvollziehbar, manipulationsresistent und können nicht einseitig verändert werden

**Einfach gesagt:** Ihre Daten gehören Ihnen. Wir stellen sicher, dass sie geschützt, richtig behandelt und nur für die von Ihnen gewünschten Zwecke genutzt werden.`,
      },
      {
        id: 'security-best-practices',
        title: 'Sicherheits-Tipps für den Alltag',
        content: `Ein paar einfache Regeln helfen, die Sicherheit in Ihrem Konto hoch zu halten:

• **Starke Passwörter verwenden** – Mindestens 8 Zeichen, am besten eine Kombination aus Buchstaben, Zahlen und Sonderzeichen.
• **Passwörter nicht teilen** – Jeder Mitarbeiter sollte ein eigenes Konto haben.
• **Berechtigungen regelmäßig prüfen** – Hat ein ehemaliger Mitarbeiter noch Zugriff? Entfernen Sie nicht mehr benötigte Konten.
• **Richtige Rolle wählen** – Nicht jeder braucht Org-Admin-Rechte. Vergeben Sie Rollen nach dem Prinzip „So wenig wie nötig, so viel wie sinnvoll".
• **Aktive Sitzungen prüfen** – Unter Benutzer & Rollen können Sie sehen, wo Konten eingeloggt sind, und verdächtige Sitzungen beenden.`,
      },
    ],
  },

  // ──── COMING SOON: AUTOMATION ────
  {
    id: 'automation',
    title: 'Automatisierung',
    icon: Zap,
    description: 'Workflows, KI-Sprachassistent und WhatsApp – demnächst verfügbar.',
    comingSoon: true,
    articles: [
      {
        id: 'workflow-automation',
        title: 'Workflow-Automatisierung',
        content: `**Demnächst verfügbar**

Die Workflow-Automatisierung ermöglicht Ihnen, wiederkehrende Abläufe mit Regeln und Automatisierungen zu vereinfachen.

**Geplante Möglichkeiten:**
• **Geofencing-Benachrichtigungen** – Erhalten Sie Alarme, wenn ein Fahrzeug ein bestimmtes Gebiet verlässt.
• **Automatische Aufgaben** – Erstellen Sie Aufgaben automatisch basierend auf Fahrzeugstatus oder Kilometerständen.
• **KI-gestützte Aktionen** – Geben Sie der KI spezielle Rechte, z. B. für automatische Terminbuchungen.
• **Kundenbenachrichtigungen** – Automatische Erinnerungen per WhatsApp oder E-Mail.
• **Mehrstufige Regeln** – Kombinieren Sie mehrere Bedingungen und Aktionen zu komplexen Workflows.

Diese Funktion wird Ihnen helfen, Routinearbeiten zu reduzieren und Ihr Team effizienter einzusetzen.`,
      },
      {
        id: 'ai-voice',
        title: 'KI-Sprachassistent',
        content: `**Demnächst verfügbar**

Der KI-Sprachassistent wird ein telefonbasierter Helfer für Ihre Organisation:

**Geplante Fähigkeiten:**
• Eingehende Anrufe entgegennehmen und Kunden beraten
• Buchungen erstellen, ändern oder stornieren per Sprachbefehl
• Werkstatttermine anfragen und vereinbaren
• Bei laufenden Buchungen unterstützen, z. B. bei Pannen oder Unfällen
• Kundenanfragen beantworten, wenn kein Mitarbeiter verfügbar ist

Sie können dem Assistenten bestimmte Aufgaben zuweisen und eine Telefonnummer verbinden. So verpassen Sie keinen wichtigen Anruf mehr.`,
      },
      {
        id: 'whatsapp',
        title: 'WhatsApp Business',
        content: `**Demnächst verfügbar**

Die WhatsApp-Integration verbindet Ihren WhatsApp Business Account mit SynqDrive:

**Geplante Funktionen:**
• WhatsApp Business Account verbinden
• KI die Erlaubnis geben, über WhatsApp mit Kunden zu kommunizieren
• Nachrichtenverlauf einsehen und nachverfolgen
• Automatisierte Nachrichten über Workflow-Regeln senden

Das ermöglicht schnelle, unkomplizierte Kundenkommunikation über den Kanal, den Ihre Kunden am häufigsten nutzen.`,
      },
    ],
  },

  // ──── COMING SOON: INTEGRATIONS ────
  {
    id: 'integrations',
    title: 'Integrationen',
    icon: Package,
    description: 'Versicherung, Ersatzteile, Tankkarten und Fahrzeugbewertung – demnächst verfügbar.',
    comingSoon: true,
    articles: [
      {
        id: 'insurance',
        title: 'Versicherung',
        content: `**Demnächst verfügbar**

Die Versicherungsintegration ermöglicht es Ihnen, Versicherungsangebote direkt in der Plattform zu erhalten und zu verwalten:

**Geplante Funktionen:**
• Automatische Versicherungsanfragen basierend auf Ihren Fahrzeugdaten
• Versicherungsanbieter können (nach Ihrer Datenautorisierung) direkt Angebote zusenden
• Angebote im Detail vergleichen und einsehen
• Bestehende Versicherungen übersichtlich verwalten

**Voraussetzung:** Die Datenautorisierung muss für Versicherungszwecke aktiviert und eine Anfrage gesendet werden.`,
      },
      {
        id: 'parts',
        title: 'Ersatzteile & Zubehör',
        content: `**Demnächst verfügbar**

Diese Seite ermöglicht die Suche und Bestellung von Fahrzeugteilen direkt aus der Plattform:

**Geplante Funktionen:**
• Ersatzteile und Reifen suchen
• Das System kennt Ihre Fahrzeuge und kann passende Teile vorschlagen
• Empfehlungen basierend auf aktuellen Fahrzeugdaten (z. B. „Reifen für BMW 320d, Baujahr 2021")
• Bestellungen aufgeben und verfolgen

Das spart Ihnen die separate Teilenummer-Recherche und sorgt dafür, dass immer die richtigen Teile bestellt werden.`,
      },
      {
        id: 'fuel-cards',
        title: 'Tankkarten',
        content: `**Demnächst verfügbar**

Die Tankkarten-Verwaltung bündelt alle Kraftstoff-bezogenen Vorgänge:

**Geplante Funktionen:**
• Tankkarten verwalten und neuen Karten beantragen
• Tankbelege und Quittungen einsehen
• Verbrauchsanalysen pro Fahrzeug
• Abrechnungsdokumente zentral verfügbar

So behalten Sie die Kraftstoffkosten im Blick und haben alle Belege an einem Ort.`,
      },
      {
        id: 'brokerage',
        title: 'Fahrzeugvermittlung & -bewertung',
        content: `**Demnächst verfügbar**

Die Fahrzeugvermittlung hilft Ihnen beim Verkauf und der Bewertung Ihrer Fahrzeuge:

**Geplante Funktionen:**
• Restwertschätzung basierend auf Marktpreisen und Fahrzeugdaten
• KI-unterstützte Erstellung von Verkaufsanzeigen
• Marktplatz-Integration
• Übersichtliche Darstellung des geschätzten Fahrzeugwerts

Ideal, wenn Sie Fahrzeuge rotieren und den besten Zeitpunkt sowie Preis für den Verkauf ermitteln möchten.`,
      },
    ],
  },

  // ──── FAQ ────
  {
    id: 'faq',
    title: 'Häufig gestellte Fragen',
    icon: HelpCircle,
    description: 'Schnelle Antworten auf die häufigsten Fragen.',
    articles: [
      {
        id: 'faq-reset-password',
        title: 'Wie ändere ich mein Passwort?',
        content: `Gehen Sie zu Einstellungen → Kontoinformationen. Dort finden Sie die Option „Passwort ändern". Geben Sie Ihr aktuelles und dann Ihr neues Passwort ein.

Wenn Sie Ihr Passwort vergessen haben, wenden Sie sich an Ihren Org-Admin – dieser kann Ihnen ein neues Einmalpasswort zuweisen.`,
      },
      {
        id: 'faq-add-vehicle',
        title: 'Wie füge ich ein neues Fahrzeug hinzu?',
        content: `Gehen Sie zur Flotte-Seite und klicken Sie auf „Fahrzeug registrieren". Sie können die Daten manuell eingeben oder ein Fahrzeugdokument hochladen – die KI erkennt die meisten Daten automatisch.`,
      },
      {
        id: 'faq-connect-vehicle',
        title: 'Wie verbinde ich ein Fahrzeug mit Live-Daten?',
        content: `Gehen Sie zu Einstellungen → Fleet Connectivity. Dort sehen Sie alle Fahrzeuge und deren Verbindungsstatus. Folgen Sie den Anweisungen, um ein Fahrzeug über DIMO zu verbinden. Nach erfolgreicher Verbindung werden Live-Daten automatisch in der Plattform angezeigt.`,
      },
      {
        id: 'faq-create-user',
        title: 'Wie lege ich einen neuen Mitarbeiter an?',
        content: `Gehen Sie zu Einstellungen → Benutzer & Rollen und klicken Sie auf „Neuer Benutzer". Der Assistent führt Sie durch die Schritte: Rolle wählen, persönliche Daten eingeben, Einstellungen festlegen, Berechtigungen konfigurieren und Konto erstellen (Einmalpasswort oder E-Mail-Einladung).`,
      },
      {
        id: 'faq-station-scope',
        title: 'Was bedeutet Stationsbereich bei Berechtigungen?',
        content: `Wenn Sie einem Sub-Admin oder Worker bestimmte Stationen zuweisen, sieht dieser Mitarbeiter nur die Fahrzeuge, Buchungen und Daten der zugewiesenen Stationen. Das ist nützlich, wenn Sie mehrere Standorte betreiben und den Zugriff begrenzen möchten.`,
      },
      {
        id: 'faq-ai-inaccurate',
        title: 'Warum gibt die KI ungenaue Informationen?',
        content: `Die KI basiert auf Ihren Daten. Wenn Fahrzeug-Dokumentationen, Service-Einträge oder andere wichtige Informationen fehlen, kann die KI nur eingeschränkt arbeiten. Pflegen Sie Ihre Daten möglichst vollständig – das verbessert die KI-Ergebnisse erheblich.`,
      },
      {
        id: 'faq-support',
        title: 'Wie erreiche ich den Support?',
        content: `Klicken Sie in der Seitenleiste auf „Support" und erstellen Sie ein neues Ticket. Beschreiben Sie Ihr Anliegen so genau wie möglich und fügen Sie bei Bedarf Screenshots hinzu. Unser Team antwortet direkt im Ticket-Thread.`,
      },
      {
        id: 'faq-coming-soon',
        title: 'Was bedeutet „Demnächst verfügbar"?',
        content: `Einige Bereiche sind mit „Coming Soon" markiert. Diese Funktionen befinden sich in der Entwicklung und werden in zukünftigen Updates freigeschaltet. Sie können sich darauf vorbereiten, indem Sie Ihre Daten vollständig pflegen – dann sind Sie sofort startklar, wenn die neuen Funktionen verfügbar werden.`,
      },
    ],
  },
];

// ═══════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════

export function HelpCenterView({ isDarkMode }: { isDarkMode: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');
  const [expandedArticle, setExpandedArticle] = useState<string | null>('welcome');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const cardClass = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const dividerColor = isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60';

  const filteredSections = useMemo(() => {
    if (!searchTerm.trim()) return SECTIONS;
    const q = searchTerm.toLowerCase();
    return SECTIONS.map(sec => {
      const matchingArticles = sec.articles.filter(
        a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)
      );
      if (matchingArticles.length > 0 || sec.title.toLowerCase().includes(q) || sec.description.toLowerCase().includes(q)) {
        return { ...sec, articles: matchingArticles.length > 0 ? matchingArticles : sec.articles };
      }
      return null;
    }).filter(Boolean) as HelpSection[];
  }, [searchTerm]);

  useEffect(() => {
    if (searchTerm.trim() && filteredSections.length > 0) {
      setExpandedSection(filteredSections[0].id);
      if (filteredSections[0].articles.length > 0) {
        setExpandedArticle(filteredSections[0].articles[0].id);
      }
    }
  }, [searchTerm, filteredSections]);

  const scrollToSection = (id: string) => {
    setExpandedSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const totalArticles = SECTIONS.reduce((sum, s) => sum + s.articles.length, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-100/60'}`}>
            <BookOpen className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>Help Center</h1>
            <p className={`text-xs ${textSecondary}`}>{SECTIONS.length} Themenbereiche · {totalArticles} Artikel</p>
          </div>
        </div>
        <p className={`text-sm leading-relaxed mt-3 ${textSecondary}`}>
          Willkommen im Help Center! Hier finden Sie Erklärungen zu allen Bereichen der Plattform, 
          Anleitungen für den Arbeitsalltag und wichtige Best Practices für die optimale Nutzung.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
        <input
          type="text"
          placeholder="Nach Themen, Funktionen oder Fragen suchen..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className={`w-full pl-11 pr-4 py-3.5 rounded-xl border text-sm ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'} outline-none transition-all`}
        />
        {searchTerm && (
          <p className={`text-xs mt-2 ${textMuted}`}>
            {filteredSections.length === 0 ? 'Keine Ergebnisse gefunden.' : `${filteredSections.length} Themenbereiche gefunden`}
          </p>
        )}
      </div>

      {/* Quick Navigation */}
      {!searchTerm && (
        <div className={cardClass}>
          <div className="p-4">
            <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${textMuted}`}>Schnellnavigation</h2>
            <div className="flex flex-wrap gap-1.5">
              {SECTIONS.map(sec => (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    expandedSection === sec.id
                      ? (isDarkMode ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200')
                      : (isDarkMode ? 'text-gray-400 border-neutral-700 hover:bg-neutral-800 hover:text-gray-300' : 'text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-800')
                  }`}
                >
                  <sec.icon className="w-3 h-3" />
                  {sec.title}
                  {sec.comingSoon && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-400">Soon</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {filteredSections.map(section => {
          const isExpanded = expandedSection === section.id;
          return (
            <div
              key={section.id}
              ref={el => { sectionRefs.current[section.id] = el; }}
              className={cardClass}
            >
              {/* Section Header */}
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                className={`w-full flex items-center gap-3 p-5 text-left transition-colors ${isDarkMode ? 'hover:bg-neutral-800/30' : 'hover:bg-gray-50/40'} rounded-xl`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  section.comingSoon
                    ? (isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100/60')
                    : (isDarkMode ? 'bg-blue-500/15' : 'bg-blue-100/60')
                }`}>
                  <section.icon className={`w-4.5 h-4.5 ${section.comingSoon ? 'text-purple-400' : 'text-blue-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className={`text-sm font-bold ${textPrimary}`}>{section.title}</h2>
                    {section.comingSoon && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400">
                        Demnächst
                      </span>
                    )}
                    <span className={`text-[10px] ${textMuted}`}>{section.articles.length} {section.articles.length === 1 ? 'Artikel' : 'Artikel'}</span>
                  </div>
                  <p className={`text-xs mt-0.5 ${textSecondary} line-clamp-1`}>{section.description}</p>
                </div>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${textMuted} ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded Articles */}
              {isExpanded && (
                <div className={`px-5 pb-5 space-y-2 border-t ${dividerColor}`}>
                  <div className="pt-3" />
                  {section.articles.map(article => {
                    const isArticleExpanded = expandedArticle === article.id;
                    return (
                      <div key={article.id} className={`rounded-xl border overflow-hidden transition-all ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60'}`}>
                        <button
                          onClick={() => setExpandedArticle(isArticleExpanded ? null : article.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isDarkMode ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'}`}
                        >
                          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${textMuted} ${isArticleExpanded ? 'rotate-90' : ''}`} />
                          <span className={`text-xs font-semibold ${textPrimary}`}>{article.title}</span>
                        </button>
                        {isArticleExpanded && (
                          <div className={`px-4 pb-4 pl-11 border-t ${dividerColor}`}>
                            <div className={`pt-3 text-xs leading-[1.8] ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} help-content`}>
                              <ArticleContent content={article.content} isDarkMode={isDarkMode} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className={`${cardClass} p-5 text-center`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Headphones className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <p className={`text-xs font-semibold ${textPrimary}`}>Noch Fragen?</p>
        </div>
        <p className={`text-xs ${textSecondary}`}>
          Wenn Sie hier keine Antwort finden, erstellen Sie gerne ein Support-Ticket – unser Team hilft Ihnen schnell und persönlich weiter.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MARKDOWN-LITE RENDERER
// ═══════════════════════════════════════════════════

function ArticleContent({ content, isDarkMode }: { content: string; isDarkMode: boolean }) {
  const textStrong = isDarkMode ? 'text-white' : 'text-gray-900';
  const listBullet = isDarkMode ? 'text-blue-400' : 'text-blue-500';
  const codeBg = isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700';

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let idx = 0;

  for (const line of lines) {
    idx++;
    const trimmed = line.trimStart();

    if (trimmed === '') {
      elements.push(<div key={idx} className="h-2" />);
      continue;
    }

    const rendered = renderInline(trimmed, textStrong);

    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      const text = trimmed.replace(/^[•\-]\s*/, '');
      elements.push(
        <div key={idx} className="flex items-start gap-2 py-0.5 pl-1">
          <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${listBullet} bg-current`} />
          <span>{renderInline(text, textStrong)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={idx} className="flex items-start gap-2 py-0.5 pl-1">
            <span className={`${listBullet} font-bold shrink-0 mt-px`}>{match[1]}.</span>
            <span>{renderInline(match[2], textStrong)}</span>
          </div>
        );
      }
    } else {
      elements.push(<p key={idx} className="py-0.5">{rendered}</p>);
    }
  }

  return <>{elements}</>;
}

function renderInline(text: string, strongClass: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <strong key={key++} className={`font-semibold ${strongClass}`}>
        {match[1]}
      </strong>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}
