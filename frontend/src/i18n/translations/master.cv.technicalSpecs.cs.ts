export const masterCvTechnicalSpecsCs = {
  'master.cv.technicalSpecs.sectionTitle': 'Technické specifikace vozidla',
  'master.cv.technicalSpecs.editAction': 'Upravit specifikace',
  'master.cv.technicalSpecs.loading': 'Načítání specifikací…',
  'master.cv.technicalSpecs.loadError': 'Specifikace se nepodařilo načíst.',
  'master.cv.technicalSpecs.retry': 'Zkusit znovu',
  'master.cv.technicalSpecs.noReference': 'Bez reference',
  'master.cv.technicalSpecs.make': 'Výrobce',
  'master.cv.technicalSpecs.model': 'Model',
  'master.cv.technicalSpecs.year': 'Rok výroby',
  'master.cv.technicalSpecs.drivetrainType': 'Pohon / palivo',
  'master.cv.technicalSpecs.curbWeight': 'Provozní hmotnost',
  'master.cv.technicalSpecs.engineDisplacement': 'Objem motoru',
  'master.cv.technicalSpecs.cylinderCount': 'Počet válců',
  'master.cv.technicalSpecs.weightDistribution': 'Rozložení hmotnosti (přední/zadní)',
  'master.cv.technicalSpecs.idleRpm': 'Volnoběžné otáčky',
  'master.cv.technicalSpecs.maxRpm': 'Max. otáčky',
  'master.cv.technicalSpecs.brakeForceDistribution': 'Rozložení brzdné síly (přední)',
  'master.cv.technicalSpecs.unitPercentFront': '% přední',
  'master.cv.technicalSpecs.unitCc': 'cm³',
  'master.cv.technicalSpecs.systemPower': 'Výkon motoru / systému',
  'master.cv.technicalSpecs.accel0To100': '0–100 km/h',
  'master.cv.technicalSpecs.unitKg': 'kg',
  'master.cv.technicalSpecs.unitKw': 'kW',
  'master.cv.technicalSpecs.unitSeconds': 's',
  'master.cv.technicalSpecs.editLoadError': 'Data vozidla pro úpravu se nepodařilo načíst.',
  'master.cv.technicalSpecs.updateSuccess': 'Specifikace vozidla uloženy.',
  'master.cv.technicalSpecs.updatePartialSaveFailed':
    'Specifikace vozidla se nepodařilo uložit kompletně. Zkontrolujte pole a zkuste to znovu.',
  'master.cv.technicalSpecs.updatePartialPhysicsFailed':
    'Fyzikální data (např. provozní hmotnost) se neuložila. HV údaje byly uloženy.',
  'master.cv.technicalSpecs.updatePartialHvFailed':
    'HV údaje se neuložily. Ostatní data vozidla mohla být uložena.',
  'master.cv.technicalSpecs.secondaryDetails': 'Provozní a integrační podrobnosti',
  'master.cv.technicalSpecs.hvCatalogVariantLabel': 'HV katalogová varianta (explicitní)',
  'master.cv.technicalSpecs.hvCatalogVariantNone': 'Žádná — bez katalogových metadat',
  'master.cv.technicalSpecs.hvCatalogVariantTeslaModel3RwdCatl6l':
    'Tesla Model 3 RWD LFP — katalog CATL 6L (ESTIMATED, bez ověření packu)',
  'master.cv.technicalSpecs.hvLegacyMasterDataHint':
    'Užitná kapacita je legacy hodnota ze základních dat (ne SOH, ne ověřená reference, ne měření) a zůstává zde jen pro čtení. Rozšířená HV pole níže lze upravovat a ukládají se odděleně od battery health.',
  'master.cv.technicalSpecs.hvFieldNotPersistedHint':
    'Rozšířená HV pole se ukládají v master HV specifikaci (odděleně od SOH referenčních kapacit).',
  'master.cv.technicalSpecs.diRoutingSectionTitle': 'Směrování událostí jízdy (DI)',
  'master.cv.technicalSpecs.diRoutingHint':
    'LTE_R1 vs SMART5 určuje, jak Driving Intelligence získává události jízdy. Je to oddělené od ověřené onboardingové modality připojení (software/OEM vs fyzická telematika).',
  'master.cv.technicalSpecs.connectionModalityLabel': 'Ověřená modalita připojení',
  'master.cv.technicalSpecs.telemetryFamilyLabel': 'Telemetrická rodina',
  'master.cv.technicalSpecs.diRoutingHardwareLabel': 'Klasifikace směrování DI (uložená)',
  'master.cv.technicalSpecs.diRoutingReadOnlyHint':
    'Směrování DI zde nelze změnit. Změna uložené klasifikace vyžaduje samostatné schválení a revizi DI.',
  'master.cv.technicalSpecs.diRoutingLteR1Info':
    'Směrování LTE_R1: události jízdy (prudké brzdění, zrychlení, zatáčení) používají cestu událostí telemetrického API DIMO. Nejde o fyzický typ zařízení ve vozidle.',
};
