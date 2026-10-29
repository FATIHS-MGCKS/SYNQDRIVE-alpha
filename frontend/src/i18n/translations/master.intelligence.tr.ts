export const masterIntelligenceTr = {
  'master.nav.vsiIntelligence': 'VSI – sinyal istihbaratı',
  'master.nav.apdsIntelligence': 'APDS – uyarlanabilir polling',
  'master.intelligence.vsi.title': 'VSI – sinyal istihbaratı',
  'master.intelligence.vsi.description':
    'Salt okunur araç sinyal profilleri, gözlemlenen kadans, yakalanmışsa revizyon geçmişi ve capability resolver açıklamaları (üretim verisi).',
  'master.intelligence.apds.title': 'APDS – uyarlanabilir polling',
  'master.intelligence.apds.description':
    'Salt okuma shadow uzlaştırma kararları, epoch geçmişi, bağlıysa gerçek poll kanıtı ve geçmiş VSI korelasyonu. Simüle next poll zamanları yürütülmüş poll değildir.',

  'master.intelligence.apds.loading': 'APDS okuma modelleri yükleniyor…',
  'master.intelligence.apds.error': 'APDS intelligence yüklenemedi.',
  'master.intelligence.apds.latestDecision': 'Son kalıcı karar',
  'master.intelligence.apds.activeEpoch': 'Aktif epoch',
  'master.intelligence.apds.decisionsForVehicle': 'epoch içinde bu araç için karar',
  'master.intelligence.apds.shadowNotReal':
    'Shadow önerileri ve simüle next poll zaman damgaları planlanmış veya yürütülmüş gerçek poll kanıtı değildir.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Geçmiş VSI korelasyonu araştırma kanıtıdır — çalışma anında bu APDS kararını zorunlu olarak yönlendirmedi.',
  'master.intelligence.apds.openVsiAsOf': 'Karar as-of zamanıyla VSI aç',
  'master.intelligence.apds.empty.selectScope.title': 'Organizasyon ve araç seçin',
  'master.intelligence.apds.empty.selectScope.body':
    'Kalıcı shadow kararları ve epoch’ları yüklemek için kapsam seçin. Sağlayıcı kaynak linki VSI korelasyonunu etkinleştirir; kapsam sunucuda doğrulanır.',
  'master.intelligence.apds.section.epochs': 'Aktivasyon epoch zaman çizelgesi',
  'master.intelligence.apds.section.decisions': 'Karar gezgini',
  'master.intelligence.apds.section.detail': 'Karar detayı',
  'master.intelligence.apds.col.time': 'Karar zamanı',
  'master.intelligence.apds.col.reason': 'Neden',
  'master.intelligence.apds.col.policy': 'Politika',
  'master.intelligence.apds.col.realPoll': 'Gerçek poll bağlantısı',
  'master.intelligence.apds.detail.shadow': 'Shadow önerisi (kalıcı çıktılar)',
  'master.intelligence.apds.detail.realPoll': 'Gerçek poll kanıtı',
  'master.intelligence.apds.detail.vsiCorrelation': 'Geçmiş VSI korelasyonu',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow kanıtı mevcut',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Bu kapsam için APDS shadow etkin değil',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Yakalanmış uzlaştırma kararı yok',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Kalıcı geçmiş kullanılamıyor',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Bu kapsam için kanıt eksik',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Gerçek polle bağlı değil',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Bağlı — poll günlüğü doğrulanmadı',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Bağlı — başarı kaydedildi',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Bağlı — başarısız durum',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Gerçek poll kanıtı mevcut değil',
  'master.intelligence.pdi.loading': 'Cihaz intelligence yükleniyor…',
  'master.intelligence.pdi.error': 'PDI cihaz intelligence yüklenemedi.',
  'master.intelligence.pdi.section.identity': 'Kimlik özeti',
  'master.intelligence.pdi.section.timeline': 'Zaman çizelgesi',
  'master.intelligence.pdi.section.episodes': 'Bağlantı epizodları',
  'master.intelligence.pdi.section.drift': 'Kimlik izleme',
  'master.intelligence.pdi.snapshotNotHistory': 'Güncel envanter ve canlı ayna anlık görüntüdür — tam geçmiş değildir.',
  'master.intelligence.pdi.notApplicableR1': 'Fiziksel R1 izleme uygulanmaz (ör. yalnızca yazılım Tesla).',
  'master.intelligence.pdi.noDriftHistory': 'Kalıcı drift geçmişi yok. Kayıt yokluğu drift yokluğunu kanıtlamaz.',
  'master.intelligence.pdi.episodeNotPoll': 'Bağlantı epizodları kalıcı lifecycle kanıtıdır — APDS poll değildir.',
  'master.intelligence.pdi.noEpisodes': 'Geçerli araç kapsamında epizod yok.',
  'master.intelligence.pdi.emptyTimeline': 'Kalıcı geçmişte timeline girdisi yok.',
  'master.intelligence.pdi.evaluatedAt': 'Kanıt değerlendirildi',
  'master.intelligence.section.context': 'URL bağlamı',
  'master.intelligence.section.crossLinks': 'Çapraz bağlantılar',
  'master.intelligence.section.previewComponents': 'Sunum önizlemesi (canlı veri yok)',
  'master.intelligence.section.evidenceSemantics': 'Kanıt anlamları',
  'master.intelligence.url.invalidParams': 'Geçersiz URL parametreleri yok sayıldı: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Rozetler yalnızca backend etiket anlamını gösterir. PR1’de üretim verisi yüklenmez.',
  'master.intelligence.vsi.empty.title': 'Okuma API’leri henüz bağlı değil',
  'master.intelligence.vsi.empty.body':
    'PR2, salt okunur uç noktalarla araç sinyal profilleri, revizyon geçmişi ve resolver açıklamalarını yükleyecek.',
  'master.intelligence.apds.empty.title': 'Okuma API’leri henüz bağlı değil',
  'master.intelligence.apds.empty.body':
    'PR3 shadow kararları, aktivasyon dönemleri ve VSI korelasyonunu yükleyecek. Shadow satırları asla yürütülmüş poll değildir.',
  'master.intelligence.crossLink.vehicle': 'Aracı aç',
  'master.intelligence.crossLink.device': 'Cihaz envanterini aç',
  'master.intelligence.crossLink.vsi': 'VSI aç',
  'master.intelligence.crossLink.apds': 'APDS aç',
  'master.intelligence.crossLink.contextMissing':
    '{{target}} bağlantısı URL’de daha fazla bağlam gerektirir (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 sa gözlemlendi',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 sa gözlemlendi',
  'master.intelligence.badge.lv.UNKNOWN': 'LV bilinmiyor',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Yaklaşık 8 saatte bir gözlemlenen bekleme iletimi (doğrulanmış donanım yapılandırması değil).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Yaklaşık 24 saatte bir gözlemlenen bekleme iletimi (doğrulanmış donanım yapılandırması değil).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Yetersiz veya engellenmiş bekleme iletim kanıtı.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM yüksek frekans (ampirik)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standart (ampirik)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM bilinmiyor',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Ampirik olarak yüksek frekanslı RPM profili. Yerel 1 Hz örnekleme kanıtı değildir.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Ampirik standart RPM gözlem yoğunluğu.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Kararlı etiket için yetersiz RPM kadans kanıtı.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM profili uygulanamaz (ör. BEV). Bu, bilinmeyen sinyal kalitesi ile aynı değildir.',
  'master.intelligence.badge.limitation': 'Backend sınırlaması: {{code}}',
  'master.intelligence.confidence.HIGH': 'Güven: yüksek',
  'master.intelligence.confidence.MEDIUM': 'Güven: orta',
  'master.intelligence.confidence.LOW': 'Güven: düşük',
  'master.intelligence.confidence.UNKNOWN': 'Güven: bilinmiyor',
  'master.intelligence.density.SUB_ONE_HZ': 'Yoğunluk: 1 Hz altı',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Yoğunluk: 1 sn bucket kanıtlanmadı',
  'master.intelligence.density.IRREGULAR': 'Yoğunluk: düzensiz',
  'master.intelligence.density.UNKNOWN': 'Yoğunluk: bilinmiyor',
  'master.intelligence.density.NOT_APPLICABLE': 'Yoğunluk: uygulanamaz',
  'master.intelligence.evidence.title': 'Kanıt zaman damgaları',
  'master.intelligence.evidence.evaluatedAt': 'Değerlendirme zamanı',
  'master.intelligence.evidence.providerSourceTimestamp': 'Sağlayıcı kaynak zamanı',
  'master.intelligence.evidence.providerFetchedAt': 'Sağlayıcı fetch zamanı',
  'master.intelligence.evidence.profileRevision': 'Profil revizyonu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch zamanı SynqDrive alımını gösterir — yeni sağlayıcı sinyali kanıtı değildir.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow kararları, gerçek poll kimliği bağlı değilse simüle uzlaştırma sonucudur.',
  'master.intelligence.evidence.kind.observed': 'Tür: gözlemlenen sağlayıcı kanıtı',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tür: simüle / shadow değerlendirme',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tür: doğrulanmış gerçek poll',
  'master.intelligence.evidence.kind.not_available': 'Tür: kullanılamıyor',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tür: yetersiz kanıt',
  'master.intelligence.evidence.kind.not_applicable': 'Tür: uygulanamaz',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tür: değerlendirme engellendi',
  'master.intelligence.blocked.title': 'Değerlendirme engellendi',
  'master.intelligence.blocked.body':
    'Profil sınıflandırması duraklatıldı ({{code}}). Eski etiket güncel gibi gösterilmemelidir.',

  'master.intelligence.section.fleetOverview': 'Filo kapsamı ve profiller',
  'master.intelligence.section.signals': 'Sinyal detayı',
  'master.intelligence.section.revisions': 'Profil revizyon geçmişi',
  'master.intelligence.section.capability': 'Capability resolver (salt okunur)',

  'master.intelligence.vsi.picker.org': 'Organizasyon',
  'master.intelligence.vsi.picker.vehicle': 'Araç',
  'master.intelligence.vsi.picker.link': 'Sağlayıcı kaynak bağlantısı',
  'master.intelligence.vsi.loading': 'VSI okuma modelleri yükleniyor…',
  'master.intelligence.vsi.error': 'VSI intelligence yüklenemedi.',
  'master.intelligence.vsi.retry': 'Yeniden dene',

  'master.intelligence.vsi.empty.selectScope.title': 'Organizasyon ve araç seçin',
  'master.intelligence.vsi.empty.selectScope.body':
    'Kalıcı VSI profilleri için organizasyon ve araç seçin. Kapsam sunucuda doğrulanır.',

  'master.intelligence.vsi.noProfiles.title': 'Materialize VSI profili yok',
  'master.intelligence.vsi.noProfiles.body':
    'Bu araç için henüz capability profili yok. Bu, devre dışı revizyon geçmişi ile aynı değildir.',

  'master.intelligence.vsi.decision.lv': 'LV karar kodu: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM karar kodu: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Kadans etiketleri gözlemlenen iletim desenlerini anlatır; yerel donanım yapılandırması değildir.',
  'master.intelligence.vsi.signals.canonical': 'Kanonik sinyal',
  'master.intelligence.vsi.signals.provider': 'Sağlayıcı adı',
  'master.intelligence.vsi.signals.quality': 'Kalite / güven',
  'master.intelligence.vsi.signals.observedAt': 'Son gözlem (UTC + yerel)',
  'master.intelligence.vsi.signals.limitations': 'Sınırlamalar',

  'master.intelligence.vsi.revision.notCaptured': 'Revizyon geçmişi: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1 yakalama kapalı. Eksik geçmiş profilin hiç değişmediği anlamına gelmez.',
  'master.intelligence.vsi.revision.moreAvailable': 'Daha fazla revizyon — API ile imleç sayfalama.',

  'master.intelligence.vsi.asOf.title': 'As-of revizyon çözümü',
  'master.intelligence.vsi.asOf.decisionAt': 'Karar zamanı',
  'master.intelligence.vsi.asOf.authority': 'Otorite',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'VSI, APDS ve PDI API’lerinden salt okunur özetler. Rozetler gözlemlenen veya kalıcı kanıtı yansıtır — donanım kanıtı değildir.',
  'master.intelligence.vehicleDetail.loading': 'Intelligence özetleri yükleniyor…',
  'master.intelligence.vehicleDetail.error': 'Bu araç için intelligence özetleri yüklenemedi.',
  'master.intelligence.vehicleDetail.openVsi': 'VSI ayrıntısını aç',
  'master.intelligence.vehicleDetail.openApds': 'APDS ayrıntısını aç',
  'master.intelligence.vehicleDetail.openPdi': 'Cihaz ayrıntısını aç',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Kapsamda kalıcı karar yok.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Bu araca atanan tek bir kurulu fiziksel cihaz yok.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Birden fazla sağlayıcı kaynak bağlantısı — birincil bağlantı gösterildi; araçlar arası varsayımlardan önce VSI/APDS’de bağlantıyı doğrulayın.',
} as const;
