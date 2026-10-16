import json,csv,hashlib,shutil,base64,html,re,zipfile
from pathlib import Path
import numpy as np
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
out=Path('EXP021_review');out.mkdir(exist_ok=True)
r=json.load(open('analysis/results/comparison.json'));p=json.load(open('analysis/frame-observations.json'));m=json.load(open('analysis/results/metrics.json'));inv=json.load(open('EXP021_Video_Inventar.json'))
# Time-series: missing data stay NaN; no smoothing or imputation.
t=np.arange(len(r));v=np.array([x['tachoKmh'] if x['tachoKmh'] is not None else np.nan for x in r]);d=np.array([x['l3SpeedKmh'] if x['qcTrustLevel']=='TRUSTED' and x['l3SpeedKmh'] is not None else np.nan for x in r])
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axs=plt.subplots(2,1,figsize=(13,7),gridspec_kw={'height_ratios':[2,1]},layout='constrained')
for ax in axs:
 ax.plot(t,v,color='#222222',lw=1.5,label='Tesla-Tacho, visuell geprüfte Stichproben')
 ax.plot(t,d,color='#007fa3',lw=1.4,label='DI L3, nur TRUSTED')
 ax.set_ylabel('km/h');ax.grid(alpha=.16);ax.xaxis.set_major_formatter(FuncFormatter(lambda x,_:f'05:{36+int(x)//60:02}:{int(x)%60:02}'))
axs[0].set_xlim(0,1135);axs[0].set_ylim(-4,145);axs[0].set_title('EXP021 · unveränderte Baseline und Tacho',loc='left',fontsize=16,fontweight='bold');axs[0].legend(loc='upper left',fontsize=9)
axs[0].axvspan(0,101,color='#b8b8b8',alpha=.22);axs[0].text(7,65,'Vor erstem\nVideobild',fontsize=9)
axs[1].set_xlim(335,398);axs[1].set_ylim(-2,70);axs[1].set_title('Haltephase: Tacho 0, DI ohne Zahlenwert; iPhone-Anzeige bleibt bei 21,2',loc='left',fontsize=11)
verified=[x for x in r if x['iPhoneGpsValidation']=='VISUALLY_CONFIRMED' and x['iPhoneGpsOcrKmh']==21.2]
xx=[next(i for i,z in enumerate(r) if z['bucketLabelUtc']==x['bucketLabelUtc']) for x in verified]
axs[1].scatter(xx,[21.2]*len(xx),s=20,color='#ca7523',label='iPhone: visuell bestätigte Stichproben');axs[1].legend(loc='upper right',fontsize=8);axs[1].set_xlabel('Eingeblendete Uhrzeit, Europe/Berlin (UTC+02:00)')
fig.savefig(out/'Vergleich.png',dpi=160);plt.close(fig)
# Provenance supersedes initial inventory limitations, originals preserved.
inv['status']='BASELINE_REVIEW_V1_SAMPLED_VIDEO';inv['scope']={'systematic_sample_frames':1028,'tacho_readable_frames':975,'distinct_clock_seconds':1026,'tacho_readable_distinct_seconds':973,'matched_trusted_di_seconds':748,'additional_onset_frames_5hz':30,'systematic_sampling':'Every 25th decoded frame; exact PTS retained; approx 1 Hz','all_original_frames_count':sum(int(x['frames']) for x in inv['files'])}
inv['limitations']=['Not exhaustive 25-fps annotation. 53 sampled frames have unreadable/cropped/absent numeric tacho.','iPhone overlay GPS and coordinate OCR candidates are explicitly unverified except selected manually checked speed samples.','Clock labels are nominal UTC conversion, not a calibrated sensor-time measurement. Unknown display and telemetry latency; subsecond clip joins unresolved.','EV indicators checked at selected events; no exhaustive bar annotation, no pedal observation, no energy measurement.','Full stored projection JSON and actual trip boundary origin fields are not included in the supplied bundle.','Post-deploy status not queried.']
inv['baseline']={'bundleCommit':'518fc3dd67','executionSha':'a0ce01f192d888974e49c2558ee05e534f3dfeea','sourcePath':'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/chatgpt-review-bundle','reportedPackageSha256':'5958932d12361160f5f15223653393e68afb4f29689d9a5cee3a013e10433a8e','verification':'Five SHA256SUMS entries verified; package SHA is manifest-reported, package recipe not independently reconstructed.'}
json.dump(inv,open(out/'PROVENANCE_REVIEW.json','w'),indent=2)
events=[
 dict(id='E01',startBerlin='05:37:41',endBerlin='05:37:47',type='DEPARTURE_REVIEW_WINDOW',evidence='TC_00062 frames 0..145 at 5-frame steps; initial tacho 0, reverse-camera sequence; owner identifies this maneuver as departure.',conclusion='Trip boundary precedes first video timestamp by 101 s. Exact first physical motion remains unresolved; boundary cause not proven.'),
 dict(id='E02',startBerlin='05:40:19',endBerlin='05:40:49',type='ZERO_TACHO_AND_HELD_IPHONE_DISPLAY',evidence='31 zero-tacho samples; iPhone 11.7 at reviewed anchors; DI NO_MOTION_EVIDENCE throughout.'),
 dict(id='E03',startBerlin='05:41:42',endBerlin='05:41:47',type='DECELERATION_5S',tachoStartKmh=56,tachoEndKmh=8,meanDisplayedAccelerationMps2=-48/18,evidence='All six tacho samples readable; numerical DI available throughout.',brakePedal='UNKNOWN'),
 dict(id='E04',startBerlin='05:41:50',endBerlin='05:42:29',type='ZERO_TACHO_AND_HELD_IPHONE_DISPLAY',evidence='40 zero-tacho samples; iPhone 21.2 confirmed at multiple anchors including first/last; DI NO_MOTION_EVIDENCE.'),
 dict(id='E05',startBerlin='05:42:50',endBerlin='05:42:57',type='ZERO_TACHO',evidence='8 sampled zero values, no trusted numerical DI.'),
 dict(id='E06',startBerlin='05:43:43',endBerlin='05:44:35',type='ZERO_TACHO_WITH_OBSERVATION_GAP',evidence='46 zero-tacho samples; 05:44:03..09 tacho unknown, not filled; iPhone later holds 0.5.'),
 dict(id='E07',startBerlin='05:44:36',endBerlin='05:44:41',type='ACCELERATION_5S',tachoStartKmh=6,tachoEndKmh=42,meanDisplayedAccelerationMps2=2.0,evidence='DI null in first two seconds; no DI five-second acceleration claimed.'),
 dict(id='E08',startBerlin='05:46:59',endBerlin='05:46:59',type='LARGEST_PAIRED_DI_TACHO_RESIDUAL',tachoKmh=63,diKmh=56.92041012146674,evidence='TC_00065 frame450 PTS18.006667; visually rechecked.'),
 dict(id='E09',startBerlin='05:48:31',endBerlin='05:48:31',type='EV_POWER_OUTPUT_INDICATOR',evidence='TC_00065 frame2750 PTS110.046667, white vertical energy bar, tacho31; no numerical kW scale.',pedalPosition='UNKNOWN'),
 dict(id='E10',startBerlin='05:50:17',endBerlin='05:50:19',type='SAMPLED_TACHO_MAXIMUM',tachoKmh=134,evidence='TC_00066 three systematic samples; not a full-frame maximum claim.'),
 dict(id='E11',startBerlin='05:53:08',endBerlin='05:53:08',type='EV_REGEN_INDICATOR',evidence='TC_00067 frame650 PTS26.01, green vertical bar, tacho79, iPhone81.0; simultaneous friction braking not excluded.',brakePedal='UNKNOWN',recoveredEnergyKwh=None),
 dict(id='E12',startBerlin='05:54:20',endBerlin='05:54:49',type='PARKING_MANEUVER_AND_END',evidence='DI numeric gap continues through trip end; 20 positive-tacho samples in 03:54:20..55 gap. Tacho0 at05:54:44, parking UI by05:54:45. Video ends before stored trip end.'),
]
json.dump(events,open('analysis/results/events.json','w'),indent=2,ensure_ascii=False)
print('report inputs ready',sum(f['duration'] for f in inv['files']))
