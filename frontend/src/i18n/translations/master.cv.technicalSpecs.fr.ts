export const masterCvTechnicalSpecsFr = {
  'master.cv.technicalSpecs.sectionTitle': 'Spécifications techniques du véhicule',
  'master.cv.technicalSpecs.editAction': 'Modifier les spécifications',
  'master.cv.technicalSpecs.loading': 'Chargement des spécifications…',
  'master.cv.technicalSpecs.loadError': 'Impossible de charger les spécifications.',
  'master.cv.technicalSpecs.retry': 'Réessayer',
  'master.cv.technicalSpecs.noReference': 'Aucune référence',
  'master.cv.technicalSpecs.make': 'Constructeur',
  'master.cv.technicalSpecs.model': 'Modèle',
  'master.cv.technicalSpecs.year': 'Année modèle',
  'master.cv.technicalSpecs.drivetrainType': 'Motorisation / carburant',
  'master.cv.technicalSpecs.curbWeight': 'Masse à vide',
  'master.cv.technicalSpecs.engineDisplacement': 'Cylindrée',
  'master.cv.technicalSpecs.cylinderCount': 'Nombre de cylindres',
  'master.cv.technicalSpecs.weightDistribution': 'Répartition des masses (AV/AR)',
  'master.cv.technicalSpecs.idleRpm': 'Régime au ralenti',
  'master.cv.technicalSpecs.maxRpm': 'Régime max.',
  'master.cv.technicalSpecs.brakeForceDistribution': 'Répartition de freinage (avant)',
  'master.cv.technicalSpecs.unitPercentFront': '% avant',
  'master.cv.technicalSpecs.unitCc': 'cm³',
  'master.cv.technicalSpecs.systemPower': 'Puissance moteur / système',
  'master.cv.technicalSpecs.accel0To100': '0–100 km/h',
  'master.cv.technicalSpecs.unitKg': 'kg',
  'master.cv.technicalSpecs.unitKw': 'kW',
  'master.cv.technicalSpecs.unitSeconds': 's',
  'master.cv.technicalSpecs.editLoadError': 'Impossible de charger les données du véhicule pour modification.',
  'master.cv.technicalSpecs.updateSuccess': 'Spécifications du véhicule enregistrées.',
  'master.cv.technicalSpecs.updatePartialSaveFailed':
    'Les spécifications n’ont pas pu être entièrement enregistrées. Vérifiez les champs et réessayez.',
  'master.cv.technicalSpecs.updatePartialPhysicsFailed':
    'Les données physiques (ex. masse à vide) n’ont pas été enregistrées. Les données HV ont été enregistrées.',
  'master.cv.technicalSpecs.updatePartialHvFailed':
    'Les spécifications HV n’ont pas été enregistrées. D’autres données peuvent avoir été enregistrées.',
  'master.cv.technicalSpecs.secondaryDetails': 'Détails opérationnels et d’intégration',
  'master.cv.technicalSpecs.hvCatalogVariantLabel': 'Variante catalogue HV (explicite)',
  'master.cv.technicalSpecs.hvCatalogVariantNone': 'Aucune — pas de métadonnées catalogue',
  'master.cv.technicalSpecs.hvCatalogVariantTeslaModel3RwdCatl6l':
    'Tesla Model 3 RWD LFP — catalogue CATL 6L (ESTIMATED, pack non vérifié)',
  'master.cv.technicalSpecs.hvLegacyMasterDataHint':
    'La capacité utile est une donnée legacy (pas SOH, pas référence vérifiée, pas mesure) et reste en lecture seule. Les champs HV étendus ci-dessous sont modifiables et stockés séparément de la battery health.',
  'master.cv.technicalSpecs.hvFieldNotPersistedHint':
    'Les champs HV étendus sont stockés dans la spécification master HV (séparée des capacités de référence SOH).',
  'master.cv.technicalSpecs.diRoutingSectionTitle': 'Routage des événements de conduite (DI)',
  'master.cv.technicalSpecs.diRoutingHint':
    'LTE_R1 vs SMART5 détermine la source des événements de conduite pour Driving Intelligence. C’est distinct de la modalité de connexion onboarding vérifiée (logiciel/OEM vs télématique physique).',
  'master.cv.technicalSpecs.connectionModalityLabel': 'Modalité de connexion vérifiée',
  'master.cv.technicalSpecs.telemetryFamilyLabel': 'Famille de télémétrie',
  'master.cv.technicalSpecs.diRoutingHardwareLabel': 'Classification de routage DI (enregistrée)',
  'master.cv.technicalSpecs.diRoutingReadOnlyHint':
    'Le routage DI ne peut pas être modifié ici. Tout changement de classification stockée nécessite une revue DI approuvée par l’exploitant.',
  'master.cv.technicalSpecs.diRoutingLteR1Info':
    'Routage LTE_R1 : les événements de conduite (freinage brusque, accélération, virage) passent par les événements de l’API télémétrie DIMO. Ce n’est pas le type d’appareil physique embarqué.',
};
