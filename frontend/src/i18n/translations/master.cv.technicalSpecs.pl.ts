export const masterCvTechnicalSpecsPl = {
  'master.cv.technicalSpecs.sectionTitle': 'Techniczne specyfikacje pojazdu',
  'master.cv.technicalSpecs.editAction': 'Edytuj specyfikacje',
  'master.cv.technicalSpecs.loading': 'Ładowanie specyfikacji…',
  'master.cv.technicalSpecs.loadError': 'Nie można załadować specyfikacji.',
  'master.cv.technicalSpecs.retry': 'Spróbuj ponownie',
  'master.cv.technicalSpecs.noReference': 'Brak referencji',
  'master.cv.technicalSpecs.make': 'Marka',
  'master.cv.technicalSpecs.model': 'Model',
  'master.cv.technicalSpecs.year': 'Rok produkcji',
  'master.cv.technicalSpecs.drivetrainType': 'Rodzaj napędu / paliwo',
  'master.cv.technicalSpecs.curbWeight': 'Masa własna',
  'master.cv.technicalSpecs.engineDisplacement': 'Pojemność skokowa',
  'master.cv.technicalSpecs.cylinderCount': 'Liczba cylindrów',
  'master.cv.technicalSpecs.weightDistribution': 'Rozkład masy (przód/tył)',
  'master.cv.technicalSpecs.idleRpm': 'Obroty jałowe',
  'master.cv.technicalSpecs.maxRpm': 'Maks. obroty',
  'master.cv.technicalSpecs.brakeForceDistribution': 'Rozkład siły hamowania (przód)',
  'master.cv.technicalSpecs.unitPercentFront': '% przód',
  'master.cv.technicalSpecs.unitCc': 'cm³',
  'master.cv.technicalSpecs.systemPower': 'Moc silnika / układu',
  'master.cv.technicalSpecs.accel0To100': '0–100 km/h',
  'master.cv.technicalSpecs.unitKg': 'kg',
  'master.cv.technicalSpecs.unitKw': 'kW',
  'master.cv.technicalSpecs.unitSeconds': 's',
  'master.cv.technicalSpecs.editLoadError': 'Nie można załadować danych pojazdu do edycji.',
  'master.cv.technicalSpecs.updateSuccess': 'Specyfikacje pojazdu zapisane.',
  'master.cv.technicalSpecs.updatePartialSaveFailed':
    'Nie udało się w pełni zapisać specyfikacji pojazdu. Sprawdź pola i spróbuj ponownie.',
  'master.cv.technicalSpecs.updatePartialPhysicsFailed':
    'Nie zapisano danych fizycznych (np. masy własnej). Dane HV zostały zapisane.',
  'master.cv.technicalSpecs.updatePartialHvFailed':
    'Nie zapisano specyfikacji HV. Inne dane pojazdu mogły zostać zapisane.',
  'master.cv.technicalSpecs.secondaryDetails': 'Szczegóły operacyjne i integracji',
  'master.cv.technicalSpecs.hvCatalogVariantLabel': 'Wariant katalogowy HV (jawny)',
  'master.cv.technicalSpecs.hvCatalogVariantNone': 'Brak — bez metadanych katalogu',
  'master.cv.technicalSpecs.hvCatalogVariantTeslaModel3RwdCatl6l':
    'Tesla Model 3 RWD LFP — katalog CATL 6L (ESTIMATED, bez weryfikacji packu)',
  'master.cv.technicalSpecs.hvLegacyMasterDataHint':
    'Pojemność użytkowa to dane legacy (nie SOH, nie zweryfikowana referencja, nie pomiar) i pozostaje tylko do odczytu. Rozszerzone pola HV poniżej można edytować; są zapisywane oddzielnie od battery health.',
  'master.cv.technicalSpecs.hvFieldNotPersistedHint':
    'Rozszerzone pola HV są zapisywane w master spec HV (oddzielnie od referencyjnych pojemności SOH).',
  'master.cv.technicalSpecs.diRoutingSectionTitle': 'Routing zdarzeń jazdy (DI)',
  'master.cv.technicalSpecs.diRoutingHint':
    'LTE_R1 vs SMART5 określa źródło zdarzeń jazdy w Driving Intelligence. To jest oddzielne od zweryfikowanej modalności połączenia onboarding (software/OEM vs telematyka fizyczna).',
  'master.cv.technicalSpecs.connectionModalityLabel': 'Zweryfikowana modalność połączenia',
  'master.cv.technicalSpecs.telemetryFamilyLabel': 'Rodzina telemetrii',
  'master.cv.technicalSpecs.diRoutingHardwareLabel': 'Klasyfikacja routingu zdarzeń DI (zapisana)',
  'master.cv.technicalSpecs.diRoutingReadOnlyHint':
    'Routingu DI nie można zmienić w tym edytorze. Zmiana zapisanej klasyfikacji wymaga osobnej zgody właściciela i przeglądu DI.',
  'master.cv.technicalSpecs.diRoutingLteR1Info':
    'Routing LTE_R1: zdarzenia jazdy (ostre hamowanie, przyspieszenie, pokonywanie zakrętów) korzystają ze ścieżki zdarzeń API telemetrii DIMO. To nie jest fizyczny typ urządzenia w pojeździe.',
};
