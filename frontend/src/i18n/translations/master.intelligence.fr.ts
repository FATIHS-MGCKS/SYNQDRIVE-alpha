export const masterIntelligenceFr = {
  'master.nav.vsiIntelligence': 'VSI – intelligence signal',
  'master.nav.apdsIntelligence': 'APDS – polling adaptatif',

  'master.intelligence.vsi.title': 'VSI – intelligence signal',
  'master.intelligence.vsi.description':
    'Profils de signaux véhicule en lecture seule, cadence observée, historique si capturé et explications capability resolver (données production).',
  'master.intelligence.apds.title': 'APDS – polling adaptatif',
  'master.intelligence.apds.description':
    'Décisions shadow de réconciliation en lecture seule, historique d’époques, preuves de poll réel si liées et corrélation VSI historique. Les prochains polls simulés ne sont pas des polls exécutés.',

  'master.intelligence.apds.loading': 'Chargement des modèles de lecture APDS…',
  'master.intelligence.apds.error': 'Impossible de charger l’intelligence APDS.',
  'master.intelligence.apds.latestDecision': 'Dernière décision persistée',
  'master.intelligence.apds.activeEpoch': 'Époque active',
  'master.intelligence.apds.decisionsForVehicle': 'décisions pour ce véhicule dans l’époque',
  'master.intelligence.apds.shadowNotReal':
    'Les recommandations shadow et les horodatages de prochain poll simulé ne prouvent pas un poll réel planifié ou exécuté.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'La corrélation VSI historique est une preuve de recherche — elle n’a pas nécessairement piloté cette décision APDS à l’exécution.',
  'master.intelligence.apds.openVsiAsOf': 'Ouvrir VSI avec l’heure as-of de la décision',
  'master.intelligence.apds.empty.selectScope.title': 'Choisir organisation et véhicule',
  'master.intelligence.apds.empty.selectScope.body':
    'Choisir le périmètre pour charger décisions shadow et époques persistées. Le lien source provider active la corrélation VSI ; périmètre validé côté serveur.',
  'master.intelligence.apds.section.epochs': 'Chronologie des époques d’activation',
  'master.intelligence.apds.section.decisions': 'Explorateur de décisions',
  'master.intelligence.apds.section.detail': 'Détail de la décision',
  'master.intelligence.apds.col.time': 'Heure de décision',
  'master.intelligence.apds.col.reason': 'Motif',
  'master.intelligence.apds.col.policy': 'Politique',
  'master.intelligence.apds.col.realPoll': 'Lien poll réel',
  'master.intelligence.apds.detail.shadow': 'Recommandation shadow (sorties persistées)',
  'master.intelligence.apds.detail.realPoll': 'Preuve de poll réel',
  'master.intelligence.apds.detail.vsiCorrelation': 'Corrélation VSI historique',
  'master.intelligence.apds.availability.AVAILABLE': 'Preuves shadow disponibles',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS non activé pour ce périmètre',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Aucune décision de réconciliation enregistrée',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Historique persisté indisponible',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Preuves incomplètes pour ce périmètre',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Non lié à un poll réel',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Lié — journal de poll non vérifié',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Lié — succès enregistré',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Lié — statut sans succès',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Preuve de poll réel indisponible',

  'master.intelligence.section.context': 'Contexte URL',
  'master.intelligence.section.crossLinks': 'Liens croisés',
  'master.intelligence.section.previewComponents': 'Aperçu de présentation (pas de données live)',
  'master.intelligence.section.evidenceSemantics': 'Sémantique des preuves',

  'master.intelligence.url.invalidParams': 'Paramètres URL invalides ignorés : {{params}}',

  'master.intelligence.vsi.previewNote':
    'Les badges illustrent uniquement la sémantique des libellés backend. Aucune donnée production en PR1.',
  'master.intelligence.vsi.empty.title': 'API de lecture non connectées',
  'master.intelligence.vsi.empty.body':
    'PR2 chargera les profils signal véhicule, l’historique de révision et le resolver via des endpoints en lecture seule.',

  'master.intelligence.apds.empty.title': 'API de lecture non connectées',
  'master.intelligence.apds.empty.body':
    'PR3 chargera les décisions shadow, épisodes d’activation et corrélation VSI. Les lignes shadow ne sont jamais des polls exécutés.',

  'master.intelligence.crossLink.vehicle': 'Ouvrir le véhicule',
  'master.intelligence.crossLink.device': 'Ouvrir l’inventaire appareils',
  'master.intelligence.crossLink.vsi': 'Ouvrir VSI',
  'master.intelligence.crossLink.apds': 'Ouvrir APDS',
  'master.intelligence.crossLink.contextMissing':
    'Le lien vers {{target}} nécessite plus de contexte dans l’URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h observé',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h observé',
  'master.intelligence.badge.lv.UNKNOWN': 'LV inconnu',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Transmission veille observée environ toutes les 8 heures (pas une config matérielle confirmée).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Transmission veille observée environ toutes les 24 heures (pas une config matérielle confirmée).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Preuves de transmission veille insuffisantes ou bloquées.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM haute fréquence (empirique)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirique)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM inconnu',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Profil RPM haute fréquence classé empiriquement. Ce n’est pas une preuve d’échantillonnage natif à 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Densité d’observation RPM standard classée empiriquement.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Preuves de cadence RPM insuffisantes pour un libellé stable.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM thermique non applicable (ex. BEV). Ce n’est pas la même chose qu’une qualité de signal inconnue.',

  'master.intelligence.badge.limitation': 'Limitation backend : {{code}}',

  'master.intelligence.confidence.HIGH': 'Confiance : élevée',
  'master.intelligence.confidence.MEDIUM': 'Confiance : moyenne',
  'master.intelligence.confidence.LOW': 'Confiance : faible',
  'master.intelligence.confidence.UNKNOWN': 'Confiance : inconnue',

  'master.intelligence.density.SUB_ONE_HZ': 'Densité : sous 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densité : buckets 1 s non prouvés',
  'master.intelligence.density.IRREGULAR': 'Densité : irrégulière',
  'master.intelligence.density.UNKNOWN': 'Densité : inconnue',
  'master.intelligence.density.NOT_APPLICABLE': 'Densité : non applicable',

  'master.intelligence.evidence.title': 'Horodatages des preuves',
  'master.intelligence.evidence.evaluatedAt': 'Évalué le',
  'master.intelligence.evidence.providerSourceTimestamp': 'Heure source fournisseur',
  'master.intelligence.evidence.providerFetchedAt': 'Heure de fetch fournisseur',
  'master.intelligence.evidence.profileRevision': 'Révision de profil',
  'master.intelligence.evidence.fetchNotSignalProof':
    'L’heure de fetch indique l’ingestion SynqDrive — pas une preuve de nouveau signal fournisseur.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Les décisions shadow APDS décrivent une réconciliation simulée sauf si un ID de poll réel est lié.',

  'master.intelligence.evidence.kind.observed': 'Type : preuve fournisseur observée',
  'master.intelligence.evidence.kind.simulated_shadow': 'Type : évaluation simulée / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Type : exécution de poll réelle vérifiée',
  'master.intelligence.evidence.kind.not_available': 'Type : non disponible',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Type : preuves insuffisantes',
  'master.intelligence.evidence.kind.not_applicable': 'Type : non applicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Type : évaluation bloquée',

  'master.intelligence.blocked.title': 'Évaluation bloquée',
  'master.intelligence.blocked.body':
    'Classification de profil en pause ({{code}}). Un ancien libellé ne doit pas être affiché comme actuel.',

  'master.intelligence.section.fleetOverview': 'Périmètre flotte et profils',
  'master.intelligence.section.signals': 'Détail des signaux',
  'master.intelligence.section.revisions': 'Historique des révisions de profil',
  'master.intelligence.section.capability': 'Capability resolver (lecture seule)',

  'master.intelligence.vsi.picker.org': 'Organisation',
  'master.intelligence.vsi.picker.vehicle': 'Véhicule',
  'master.intelligence.vsi.picker.link': 'Lien source provider',
  'master.intelligence.vsi.loading': 'Chargement des modèles VSI…',
  'master.intelligence.vsi.error': 'Impossible de charger l’intelligence VSI.',
  'master.intelligence.vsi.retry': 'Réessayer',

  'master.intelligence.vsi.empty.selectScope.title': 'Choisir organisation et véhicule',
  'master.intelligence.vsi.empty.selectScope.body':
    'Sélectionnez une organisation et un véhicule pour charger les profils VSI persistés. Périmètre validé côté serveur.',

  'master.intelligence.vsi.noProfiles.title': 'Aucun profil VSI matérialisé',
  'master.intelligence.vsi.noProfiles.body':
    'Aucun profil de capability pour ce véhicule. Ce n’est pas la même chose qu’un historique de révisions désactivé.',

  'master.intelligence.vsi.decision.lv': 'Code décision LV : {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Code décision RPM : {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Les libellés de cadence décrivent des schémas de transmission observés, pas une configuration matérielle native.',
  'master.intelligence.vsi.signals.canonical': 'Signal canonique',
  'master.intelligence.vsi.signals.provider': 'Nom provider',
  'master.intelligence.vsi.signals.quality': 'Qualité / confiance',
  'master.intelligence.vsi.signals.observedAt': 'Dernière observation (UTC + local)',
  'master.intelligence.vsi.signals.limitations': 'Limitations',

  'master.intelligence.vsi.revision.notCaptured': 'Historique : NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'La capture P5-H1 est désactivée. L’absence d’historique ne signifie pas l’absence de changements.',
  'master.intelligence.vsi.revision.moreAvailable': 'Révisions supplémentaires — pagination par curseur via l’API.',

  'master.intelligence.vsi.asOf.title': 'Résolution de révision as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Heure de décision',
  'master.intelligence.vsi.asOf.authority': 'Autorité',
} as const;
