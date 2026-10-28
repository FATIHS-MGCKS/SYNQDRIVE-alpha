export const masterIntelligencePl = {
  'master.nav.vsiIntelligence': 'VSI – inteligencja sygnałów',
  'master.nav.apdsIntelligence': 'APDS – polling adaptacyjny',

  'master.intelligence.vsi.title': 'VSI – inteligencja sygnałów',
  'master.intelligence.vsi.description':
    'Tylko do odczytu: profile sygnałów pojazdu, obserwowana kadencja, historia rewizji (gdy włączona) i wyjaśnienia capability resolver z danych produkcyjnych.',
  'master.intelligence.apds.title': 'APDS – polling adaptacyjny',
  'master.intelligence.apds.description':
    'Decyzje shadow reconciliation i powiązane dowody rzeczywistego polla. Historia decyzji w PR3.',

  'master.intelligence.section.context': 'Kontekst URL',
  'master.intelligence.section.crossLinks': 'Odnośniki',
  'master.intelligence.section.previewComponents': 'Podgląd prezentacji (bez danych na żywo)',
  'master.intelligence.section.evidenceSemantics': 'Znaczenie dowodów',

  'master.intelligence.url.invalidParams': 'Zignorowano nieprawidłowe parametry URL: {{params}}',

  'master.intelligence.vsi.previewNote':
    'Odznaki pokazują tylko semantykę etykiet backendu. W PR1 nie ładujemy danych produkcyjnych.',
  'master.intelligence.vsi.empty.title': 'API odczytu jeszcze niepodłączone',
  'master.intelligence.vsi.empty.body':
    'PR2 załaduje profile sygnałów pojazdu, historię rewizji (gdy jest) i wyjaśnienia resolvera przez endpointy tylko do odczytu.',

  'master.intelligence.apds.empty.title': 'API odczytu jeszcze niepodłączone',
  'master.intelligence.apds.empty.body':
    'PR3 załaduje decyzje shadow, epoki aktywacji i korelację VSI. Wiersze shadow nigdy nie są pokazywane jako wykonane polle.',

  'master.intelligence.crossLink.vehicle': 'Otwórz pojazd',
  'master.intelligence.crossLink.device': 'Otwórz inwentarz urządzeń',
  'master.intelligence.crossLink.vsi': 'Otwórz VSI',
  'master.intelligence.crossLink.apds': 'Otwórz APDS',
  'master.intelligence.crossLink.contextMissing':
    'Link do {{target}} wymaga więcej kontekstu w URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h obserwowane',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h obserwowane',
  'master.intelligence.badge.lv.UNKNOWN': 'LV nieznane',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Obserwowana transmisja w trybie czuwania co około 8 godzin (nie potwierdzona konfiguracja sprzętu).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Obserwowana transmisja w trybie czuwania co około 24 godziny (nie potwierdzona konfiguracja sprzętu).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Niewystarczające lub zablokowane dowody transmisji w czuwaniu.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM wysoka częstotliwość (empirycznie)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirycznie)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM nieznane',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirycznie sklasyfikowany profil RPM o wysokiej częstotliwości. To nie dowód natywnego próbkowania 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Empirycznie sklasyfikowana standardowa gęstość obserwacji RPM.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Niewystarczające dowody kadencji RPM dla stabilnej etykiety.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM spalinowy nie ma zastosowania (np. BEV). To nie to samo co nieznana jakość sygnału.',

  'master.intelligence.badge.limitation': 'Ograniczenie backendu: {{code}}',

  'master.intelligence.confidence.HIGH': 'Pewność: wysoka',
  'master.intelligence.confidence.MEDIUM': 'Pewność: średnia',
  'master.intelligence.confidence.LOW': 'Pewność: niska',
  'master.intelligence.confidence.UNKNOWN': 'Pewność: nieznana',

  'master.intelligence.density.SUB_ONE_HZ': 'Gęstość: poniżej 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Gęstość: kubełki 1 s nieudowodnione',
  'master.intelligence.density.IRREGULAR': 'Gęstość: nieregularna',
  'master.intelligence.density.UNKNOWN': 'Gęstość: nieznana',
  'master.intelligence.density.NOT_APPLICABLE': 'Gęstość: nie dotyczy',

  'master.intelligence.evidence.title': 'Znaczniki czasu dowodów',
  'master.intelligence.evidence.evaluatedAt': 'Oceniono',
  'master.intelligence.evidence.providerSourceTimestamp': 'Czas źródła dostawcy',
  'master.intelligence.evidence.providerFetchedAt': 'Czas pobrania u dostawcy',
  'master.intelligence.evidence.profileRevision': 'Rewizja profilu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Czas pobrania to ingest SynqDrive — nie dowód nowego sygnału od dostawcy.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Decyzje shadow APDS opisują symulowane wyniki reconciliation, chyba że powiązano ID rzeczywistego polla.',

  'master.intelligence.evidence.kind.observed': 'Rodzaj: obserwowany dowód dostawcy',
  'master.intelligence.evidence.kind.simulated_shadow': 'Rodzaj: symulacja / ocena shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Rodzaj: zweryfikowane wykonanie polla',
  'master.intelligence.evidence.kind.not_available': 'Rodzaj: niedostępne',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Rodzaj: niewystarczające dowody',
  'master.intelligence.evidence.kind.not_applicable': 'Rodzaj: nie dotyczy',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Rodzaj: ocena zablokowana',

  'master.intelligence.blocked.title': 'Ocena zablokowana',
  'master.intelligence.blocked.body':
    'Klasyfikacja profilu wstrzymana ({{code}}). Starsza etykieta nie może być pokazana jako aktualna.',

  'master.intelligence.section.fleetOverview': 'Zakres floty i profile',
  'master.intelligence.section.signals': 'Szczegóły sygnału',
  'master.intelligence.section.revisions': 'Historia rewizji profilu',
  'master.intelligence.section.capability': 'Capability resolver (tylko odczyt)',

  'master.intelligence.vsi.picker.org': 'Organizacja',
  'master.intelligence.vsi.picker.vehicle': 'Pojazd',
  'master.intelligence.vsi.picker.link': 'Link źródła providera',
  'master.intelligence.vsi.loading': 'Ładowanie modeli odczytu VSI…',
  'master.intelligence.vsi.error': 'Nie udało się załadować VSI.',
  'master.intelligence.vsi.retry': 'Ponów',

  'master.intelligence.vsi.empty.selectScope.title': 'Wybierz organizację i pojazd',
  'master.intelligence.vsi.empty.selectScope.body':
    'Wybierz organizację i pojazd, aby załadować zapisane profile VSI. Zakres jest weryfikowany po stronie serwera.',

  'master.intelligence.vsi.noProfiles.title': 'Brak zmaterializowanych profili VSI',
  'master.intelligence.vsi.noProfiles.body':
    'Dla tego pojazdu nie ma jeszcze profilu capability. To nie to samo co wyłączona historia rewizji.',

  'master.intelligence.vsi.decision.lv': 'Kod decyzji LV: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Kod decyzji RPM: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Etykiety cadence opisują obserwowane wzorce transmisji, nie konfigurację sprzętu.',
  'master.intelligence.vsi.signals.canonical': 'Sygnał kanoniczny',
  'master.intelligence.vsi.signals.provider': 'Nazwa u providera',
  'master.intelligence.vsi.signals.quality': 'Jakość / pewność',
  'master.intelligence.vsi.signals.observedAt': 'Ostatnia obserwacja (UTC + lokalnie)',
  'master.intelligence.vsi.signals.limitations': 'Ograniczenia',

  'master.intelligence.vsi.revision.notCaptured': 'Historia rewizji: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'Rejestracja P5-H1 jest wyłączona. Brak historii nie oznacza braku zmian profilu.',
  'master.intelligence.vsi.revision.moreAvailable': 'Dostępne kolejne rewizje — paginacja kursorem przez API.',

  'master.intelligence.vsi.asOf.title': 'Rozstrzygnięcie rewizji as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Czas decyzji',
  'master.intelligence.vsi.asOf.authority': 'Autorytet',
} as const;
