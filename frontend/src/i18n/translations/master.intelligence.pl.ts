export const masterIntelligencePl = {
  'master.nav.vsiIntelligence': 'VSI – inteligencja sygnałów',
  'master.nav.apdsIntelligence': 'APDS – polling adaptacyjny',

  'master.intelligence.vsi.title': 'VSI – inteligencja sygnałów',
  'master.intelligence.vsi.description':
    'Tylko do odczytu: profile sygnałów pojazdu, obserwowana kadencja, historia rewizji (gdy włączona) i wyjaśnienia capability resolver z danych produkcyjnych.',
  'master.intelligence.apds.title': 'APDS – polling adaptacyjny',
  'master.intelligence.apds.description':
    'Tylko do odczytu: decyzje shadow reconciliation, historia epok, dowody rzeczywistego polla (gdy powiązane) i historyczna korelacja VSI. Symulowane czasy next poll to nie wykonane polle.',

  'master.intelligence.apds.loading': 'Ładowanie modeli odczytu APDS…',
  'master.intelligence.apds.error': 'Nie udało się załadować APDS intelligence.',
  'master.intelligence.apds.latestDecision': 'Ostatnia zapisana decyzja',
  'master.intelligence.apds.activeEpoch': 'Aktywna epoka',
  'master.intelligence.apds.decisionsForVehicle': 'decyzji dla tego pojazdu w epoce',
  'master.intelligence.apds.shadowNotReal':
    'Rekomendacje shadow i symulowane znaczniki next poll nie dowodzą zaplanowanego ani wykonanego rzeczywistego polla.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historyczna korelacja VSI to dowód badawczy — nie musiała kierować tą decyzją APDS w runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Otwórz VSI z czasem as-of decyzji',
  'master.intelligence.apds.empty.selectScope.title': 'Wybierz organizację i pojazd',
  'master.intelligence.apds.empty.selectScope.body':
    'Wybierz zakres, aby załadować zapisane decyzje shadow i epoki. Link źródła providera umożliwia korelację VSI; zakres weryfikowany po stronie serwera.',
  'master.intelligence.apds.section.epochs': 'Oś czasu epok aktywacji',
  'master.intelligence.apds.section.decisions': 'Eksplorator decyzji',
  'master.intelligence.apds.section.detail': 'Szczegóły decyzji',
  'master.intelligence.apds.col.time': 'Czas decyzji',
  'master.intelligence.apds.col.reason': 'Powód',
  'master.intelligence.apds.col.policy': 'Polityka',
  'master.intelligence.apds.col.realPoll': 'Powiązanie z rzeczywistym pollem',
  'master.intelligence.apds.detail.shadow': 'Rekomendacja shadow (zapisane wyjścia)',
  'master.intelligence.apds.detail.realPoll': 'Dowód rzeczywistego polla',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historyczna korelacja VSI',
  'master.intelligence.apds.availability.AVAILABLE': 'Dostępna evidencja shadow',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS nieaktywny dla tego zakresu',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Brak zarejestrowanych decyzji reconciliation',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Zapisana historia niedostępna',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Niepełna evidencja dla tego zakresu',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Brak powiązania z rzeczywistym pollem',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Powiązano — log polla niezweryfikowany',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Powiązano — zarejestrowano sukces',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Powiązano — status bez sukcesu',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Dowód rzeczywistego polla niedostępny',

  'master.intelligence.pdi.loading': 'Ładowanie intelligence urządzenia…',
  'master.intelligence.pdi.error': 'Nie udało się załadować PDI device intelligence.',
  'master.intelligence.pdi.section.identity': 'Podsumowanie tożsamości',
  'master.intelligence.pdi.section.timeline': 'Oś czasu',
  'master.intelligence.pdi.section.episodes': 'Epizody połączenia',
  'master.intelligence.pdi.section.drift': 'Monitoring tożsamości',
  'master.intelligence.pdi.snapshotNotHistory':
    'Bieżący stan i live mirror to migawki — nie pełna historia.',
  'master.intelligence.pdi.notApplicableR1':
    'Monitoring fizycznego R1 nie dotyczy (np. integracja Tesla tylko software).',
  'master.intelligence.pdi.noDriftHistory':
    'Brak persistowanej historii driftu. Brak wpisów nie dowodzi braku driftu.',
  'master.intelligence.pdi.episodeNotPoll':
    'Epizody połączenia to persistowana evidencja lifecycle — nie wykonanie polla APDS.',
  'master.intelligence.pdi.noEpisodes': 'Brak epizodów dla bieżącego zakresu pojazdu.',
  'master.intelligence.pdi.emptyTimeline': 'Brak wpisów timeline w persistowanej historii.',
  'master.intelligence.pdi.evaluatedAt': 'Evidencja oceniona',

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
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Nie dotyczy (napęd)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nigdy nie obserwowano',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Obserwowano',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Obserwowano (nieaktualne)',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Łączna dostępność RPM (pochodna)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Udowodnione na żywo (świeży snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Tylko historycznie udowodnione (kadencja HF; snapshot nie na żywo)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Nieudowodnione',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Nie dotyczy (napęd)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'Dowód HF nie przypisany do tego source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Obroty silnika (RPM) korzystają z dwóch oddzielnych warstw dowodów. Status migawki pochodzi z najnowszego pakietu vehicle latest state; HF/kadencja z punktów wysokiej częstotliwości i zakończonych tras. Nie są zamienne.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Migawka (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Okno obserwacji: najnowszy przypisany pakiet providera przy materializacji profilu (bez historii HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / kadencja (okna tras)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Okno obserwacji: wzbogacenie kadencji HF w zakresie linku (zwykle do 14 dni zakończonych tras).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Obserwacja empiryczna',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Świeżość',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Ostatnia ważna obserwacja',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Jakość / pewność',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Pochodzenie',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Liczba próbek HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktywny profil RPM',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil oceniono',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Zakończone trasy w oknie kadencji',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Decyzja klasyfikacji',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Wspierające klasyfikacje tras',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'Klasyfikacja kadencji RPM nie ma zastosowania dla tego napędu (np. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Brak dowodów kadencji HF w zapisanym profilu (brak lub puste cadenceIntelligence).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Migawka',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/kadencja',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} próbek HF (patrz panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Patrz panel poniżej',

  'master.intelligence.vsi.revision.loading': 'Ładowanie historii rewizji…',
  'master.intelligence.vsi.revision.loadError': 'Nie udało się załadować historii rewizji.',
  'master.intelligence.vsi.revision.retry': 'Ponów ładowanie historii rewizji',
  'master.intelligence.vsi.revision.notCaptured': 'Historia rewizji: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'Rejestracja P5-H1 jest wyłączona. Brak historii nie oznacza braku zmian profilu.',
  'master.intelligence.vsi.revision.moreAvailable': 'Dostępne kolejne rewizje — paginacja kursorem przez API.',

  'master.intelligence.vsi.asOf.title': 'Rozstrzygnięcie rewizji as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Czas decyzji',
  'master.intelligence.vsi.asOf.authority': 'Autorytet',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Podsumowania tylko do odczytu z API VSI, APDS i PDI. Etykiety odzwierciedlają obserwacje lub trwałe dowody — nie dowód sprzętu.',
  'master.intelligence.vehicleDetail.loading': 'Ładowanie podsumowań intelligence…',
  'master.intelligence.vehicleDetail.error': 'Nie udało się załadować podsumowań intelligence dla tego pojazdu.',
  'master.intelligence.vehicleDetail.openVsi': 'Otwórz szczegóły VSI',
  'master.intelligence.vehicleDetail.openApds': 'Otwórz szczegóły APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Otwórz szczegóły urządzenia',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Brak trwałej decyzji w zakresie.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Brak pojedynczego zainstalowanego urządzenia fizycznego przypisanego do tego pojazdu.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Wiele linków źródłowych dostawcy — pokazano link główny; potwierdź link w VSI/APDS przed założeniami między pojazdami.',
} as const;
