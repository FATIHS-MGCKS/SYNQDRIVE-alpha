/** P6 PR1 — rental stress assessment gate UI (all official locales). */
const scoreNotPublishedPl =
  'Wartość obciążenia liczbowa nie jest pokazywana przy tym statusie oceny.';
const scoreNotPublishedFr =
  'Le score de charge numérique n’est pas affiché pour ce statut d’évaluation.';
const scoreNotPublishedCs =
  'Číselné skóre zatížení se u tohoto stavu hodnocení nezobrazuje.';
const scoreNotPublishedNl =
  'Numerieke belastingsscore wordt niet getoond bij deze beoordelingsstatus.';
const scoreNotPublishedEs =
  'La puntuación numérica de carga no se muestra con este estado de evaluación.';
const scoreNotPublishedTr =
  'Bu değerlendirme durumunda sayısal yük skoru gösterilmez.';
const scoreNotPublishedIt =
  'Il punteggio di carico numerico non viene mostrato per questo stato di valutazione.';

const bookingUsageGatePl = {
  'misuseStress.stress.empty.payloadUnavailable':
    'Szczegółowe dane obciążenia nie są dostępne dla tego statusu oceny.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Obciążenie jazdy tej rezerwacji',
  'misuseStress.stress.bookingUsage.stat.stress': 'Obciążenie jazdy',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Zdarzenia jazdy',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Zdarzenia nadużycia',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'Wskazówki przeglądu',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Przejechane km',
  'misuseStress.stress.bookingUsage.pendingHint':
    'Analiza użytkowania jest dostępna po lub w trakcie wynajmu, gdy pojawią się dane jazdy.',
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Podejrzenie nadużycia lub uszkodzenia w tej rezerwacji',
} as const;

export const rentalMisuseStressStressGatePl = {
  ...bookingUsageGatePl,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedPl,
  'misuseStress.stress.footnote':
    'SynqDrive ocenia tutaj techniczne obciążenie pojazdu — nie moralnie kierowcę. Przekroczenia prędkości nie są oceniane w Rental.',
  'misuseStress.stress.assessmentStatus.label': 'Status oceny',
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Kompletna',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Częściowa',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Wstępna',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'Niemożliwa do oceny',
  'misuseStress.stress.assessmentStatus.FAILED': 'Niepowodzenie',
  'misuseStress.stress.wearImpact.low': 'Niskie',
  'misuseStress.stress.wearImpact.medium': 'Średnie',
  'misuseStress.stress.wearImpact.medium_to_high': 'Średnie do wysokiego',
  'misuseStress.stress.wearImpact.high': 'Wysokie',
} as const;

const bookingUsageGateFr = {
  'misuseStress.stress.empty.payloadUnavailable':
    'Les données de charge détaillées ne sont pas disponibles pour ce statut d’évaluation.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Charge de conduite pour cette réservation',
  'misuseStress.stress.bookingUsage.stat.stress': 'Charge de conduite',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Événements de conduite',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Événements d’abus',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'Indices de revue',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Km parcourus',
  'misuseStress.stress.bookingUsage.pendingHint':
    'L’analyse d’usage est disponible après ou pendant la location dès que des données de conduite existent.',
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Soupçon d’abus ou de dommage pendant cette réservation',
} as const;

export const rentalMisuseStressStressGateFr = {
  ...bookingUsageGateFr,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedFr,
  'misuseStress.stress.footnote':
    'SynqDrive mesure ici la charge technique du véhicule — pas un jugement moral du conducteur. Les excès de vitesse ne sont pas évalués en location.',
  'misuseStress.stress.assessmentStatus.label': "Statut d'évaluation",
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Complet',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Partiel',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Provisoire',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'Non évaluable',
  'misuseStress.stress.assessmentStatus.FAILED': 'Échec',
  'misuseStress.stress.wearImpact.low': 'Faible',
  'misuseStress.stress.wearImpact.medium': 'Moyen',
  'misuseStress.stress.wearImpact.medium_to_high': 'Moyen à élevé',
  'misuseStress.stress.wearImpact.high': 'Élevé',
} as const;

const bookingUsageGateCs = {
  'misuseStress.stress.empty.payloadUnavailable':
    'Podrobná data o zatížení nejsou pro tento stav hodnocení k dispozici.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Zatížení jízdy této rezervace',
  'misuseStress.stress.bookingUsage.stat.stress': 'Zatížení jízdy',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Události jízdy',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Události zneužití',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'Kontrolní nápovědy',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Ujeto km',
  'misuseStress.stress.bookingUsage.pendingHint':
    'Analýza využití bude k dispozici po nebo během pronájmu, jakmile budou k dispozici data o jízdě.',
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Podezření na zneužití nebo poškození během této rezervace',
} as const;

export const rentalMisuseStressStressGateCs = {
  ...bookingUsageGateCs,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedCs,
  'misuseStress.stress.footnote':
    'SynqDrive zde hodnotí technické zatížení vozidla — ne morální hodnocení řidiče. Překročení rychlosti se v Rental nehodnotí.',
  'misuseStress.stress.assessmentStatus.label': 'Stav hodnocení',
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Úplné',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Částečné',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Předběžné',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'Nelze hodnotit',
  'misuseStress.stress.assessmentStatus.FAILED': 'Selhalo',
  'misuseStress.stress.wearImpact.low': 'Nízké',
  'misuseStress.stress.wearImpact.medium': 'Střední',
  'misuseStress.stress.wearImpact.medium_to_high': 'Střední až vysoké',
  'misuseStress.stress.wearImpact.high': 'Vysoké',
} as const;

const bookingUsageGateNl = {
  'misuseStress.stress.empty.payloadUnavailable':
    'Gedetailleerde belastingsgegevens zijn niet beschikbaar voor deze beoordelingsstatus.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Rijbelasting voor deze boeking',
  'misuseStress.stress.bookingUsage.stat.stress': 'Rijbelasting',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Rijgebeurtenissen',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Misbruikgebeurtenissen',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'Reviewhints',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Gereden km',
  'misuseStress.stress.bookingUsage.pendingHint':
    'Gebruiksanalyse is beschikbaar na of tijdens de verhuur zodra rijgegevens beschikbaar zijn.',
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Verdacht op misbruik of schade tijdens deze boeking',
} as const;

export const rentalMisuseStressStressGateNl = {
  ...bookingUsageGateNl,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedNl,
  'misuseStress.stress.footnote':
    'SynqDrive beoordeelt hier de technische voertuigbelasting — geen morele beoordeling van de bestuurder. Snelheidsovertredingen worden in Rental niet beoordeeld.',
  'misuseStress.stress.assessmentStatus.label': 'Beoordelingsstatus',
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Volledig',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Gedeeltelijk',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Voorlopig',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'Niet te beoordelen',
  'misuseStress.stress.assessmentStatus.FAILED': 'Mislukt',
  'misuseStress.stress.wearImpact.low': 'Laag',
  'misuseStress.stress.wearImpact.medium': 'Gemiddeld',
  'misuseStress.stress.wearImpact.medium_to_high': 'Gemiddeld tot hoog',
  'misuseStress.stress.wearImpact.high': 'Hoog',
} as const;

const bookingUsageGateEs = {
  'misuseStress.stress.empty.payloadUnavailable':
    'Los datos de carga detallados no están disponibles para este estado de evaluación.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Carga de conducción de esta reserva',
  'misuseStress.stress.bookingUsage.stat.stress': 'Carga de conducción',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Eventos de conducción',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Eventos de abuso',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'Indicios de revisión',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Km recorridos',
  'misuseStress.stress.bookingUsage.pendingHint':
    'El análisis de uso estará disponible después o durante el alquiler cuando existan datos de conducción.',
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Sospecha de abuso o daño durante esta reserva',
} as const;

export const rentalMisuseStressStressGateEs = {
  ...bookingUsageGateEs,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedEs,
  'misuseStress.stress.footnote':
    'SynqDrive evalúa aquí la carga técnica del vehículo — no un juicio moral del conductor. El exceso de velocidad no se evalúa en Rental.',
  'misuseStress.stress.assessmentStatus.label': 'Estado de evaluación',
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Completa',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Parcial',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Provisional',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'No evaluable',
  'misuseStress.stress.assessmentStatus.FAILED': 'Fallida',
  'misuseStress.stress.wearImpact.low': 'Baja',
  'misuseStress.stress.wearImpact.medium': 'Media',
  'misuseStress.stress.wearImpact.medium_to_high': 'Media a alta',
  'misuseStress.stress.wearImpact.high': 'Alta',
} as const;

const bookingUsageGateTr = {
  'misuseStress.stress.empty.payloadUnavailable':
    'Bu değerlendirme durumu için ayrıntılı yük verileri mevcut değil.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Bu rezervasyonun sürüş yükü',
  'misuseStress.stress.bookingUsage.stat.stress': 'Sürüş yükü',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Sürüş olayları',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Kötüye kullanım olayları',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'İnceleme ipuçları',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Sürülen km',
  'misuseStress.stress.bookingUsage.pendingHint':
    'Kullanım analizi, sürüş verileri oluştuğunda kiralama sırasında veya sonrasında kullanılabilir.',
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Bu rezervasyon sırasında kötüye kullanım veya hasar şüphesi',
} as const;

export const rentalMisuseStressStressGateTr = {
  ...bookingUsageGateTr,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedTr,
  'misuseStress.stress.footnote':
    'SynqDrive burada teknik araç yükünü değerlendirir — sürücüye ahlaki yargı değil. Hız aşımı Rental bağlamında puanlanmaz.',
  'misuseStress.stress.assessmentStatus.label': 'Değerlendirme durumu',
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Tam',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Kısmi',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Geçici',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'Değerlendirilemez',
  'misuseStress.stress.assessmentStatus.FAILED': 'Başarısız',
  'misuseStress.stress.wearImpact.low': 'Düşük',
  'misuseStress.stress.wearImpact.medium': 'Orta',
  'misuseStress.stress.wearImpact.medium_to_high': 'Orta-yüksek',
  'misuseStress.stress.wearImpact.high': 'Yüksek',
} as const;

const bookingUsageGateIt = {
  'misuseStress.stress.empty.payloadUnavailable':
    'I dati di carico dettagliati non sono disponibili per questo stato di valutazione.',
  'misuseStress.stress.bookingUsage.panelTitle': 'Carico di guida per questa prenotazione',
  'misuseStress.stress.bookingUsage.stat.stress': 'Carico di guida',
  'misuseStress.stress.bookingUsage.stat.drivingEvents': 'Eventi di guida',
  'misuseStress.stress.bookingUsage.stat.abuseEvents': 'Eventi di abuso',
  'misuseStress.stress.bookingUsage.stat.misuseHints': 'Indizi di revisione',
  'misuseStress.stress.bookingUsage.stat.kmDriven': 'Km percorsi',
  'misuseStress.stress.bookingUsage.pendingHint':
    "L'analisi dell'uso è disponibile dopo o durante il noleggio quando sono presenti dati di guida.",
  'misuseStress.stress.bookingUsage.misusePanelTitle':
    'Sospetto di abuso o danno durante questa prenotazione',
} as const;

export const rentalMisuseStressStressGateIt = {
  ...bookingUsageGateIt,
  'misuseStress.stress.scoreNotPublished': scoreNotPublishedIt,
  'misuseStress.stress.footnote':
    'SynqDrive valuta qui il carico tecnico del veicolo — non un giudizio morale del conducente. Gli eccessi di velocità non sono valutati in Rental.',
  'misuseStress.stress.assessmentStatus.label': 'Stato della valutazione',
  'misuseStress.stress.assessmentStatus.COMPLETE': 'Completa',
  'misuseStress.stress.assessmentStatus.PARTIAL': 'Parziale',
  'misuseStress.stress.assessmentStatus.PROVISIONAL': 'Provvisoria',
  'misuseStress.stress.assessmentStatus.NOT_ASSESSABLE': 'Non valutabile',
  'misuseStress.stress.assessmentStatus.FAILED': 'Non riuscita',
  'misuseStress.stress.wearImpact.low': 'Bassa',
  'misuseStress.stress.wearImpact.medium': 'Media',
  'misuseStress.stress.wearImpact.medium_to_high': 'Da media ad alta',
  'misuseStress.stress.wearImpact.high': 'Alta',
} as const;