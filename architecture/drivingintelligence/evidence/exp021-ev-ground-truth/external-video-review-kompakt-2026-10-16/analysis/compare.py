import json,collections,datetime,statistics,numpy as np,csv
from pathlib import Path
p=json.load(open('analysis/parsed-overlay.json'));manual=json.load(open('analysis/manual-tacho.json'));tc=json.load(open('analysis/tacho-candidates.json'))
checks=json.load(open('analysis/clock-check-indices.json'))
base=[20261,20441,20621,20801,20981,21162]
# These clock crops were visually reviewed, corrections only outside clip66's real jitter.
cor={}
for i in checks:
 if not 720<=i<900:
  b=i//180;v=base[b]+i-b*180;cor[str(i)]=f'{v//3600:02}:{v//60%60:02}:{v%60:02}'
json.dump(cor,open('analysis/manual-clock.json','w'),indent=2)
di=json.load(open('review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.json'));dm={r['bucketLabelUtc']:r for r in di}
for x,t in zip(p,tc):
 i=x['index'];x['clock']=cor.get(str(i),x['clock']);x['tacho']=None if i in manual['unknown'] else manual['corrections'].get(str(i),t['candidate'])
 x['utc']='2026-10-16T03:'+x['clock'][3:]+'Z' if x['clock'] else None
 x['gps_validation']='OCR_TWO_PASSES_AGREE_NOT_INDEPENDENT' if x['gps'] is not None and x['gps']==x['gps_full'] else 'OCR_UNVERIFIED'
 x['coords_validation']='OCR_UNVERIFIED' if x['coords'] else 'UNKNOWN'
for x in p:
 if str(x['index']) in json.load(open('analysis/manual-gps.json')):
  x['gps']=json.load(open('analysis/manual-gps.json'))[str(x['index'])];x['gps_validation']='VISUALLY_CONFIRMED'
json.dump(p,open('analysis/frame-observations.json','w'),indent=2)
# Earliest sampled PTS per displayed UTC second, no interpolation or averaging.
groups=collections.defaultdict(list)
for x in p:
 if x['utc']:groups[x['utc']].append(x)
rows=[]
for r in di:
 a=groups.get(r['bucketLabelUtc'],[]);x=a[0] if a else {};rr=dict(r)
 rr.update(videoFile=x.get('file'),videoPts=x.get('pts'),videoFrame=x.get('frame_index'),videoClock=x.get('clock'),videoSamplesThisClockSecond=len(a),tachoKmh=x.get('tacho'),iPhoneGpsOcrKmh=x.get('gps'),iPhoneGpsValidation=x.get('gps_validation'),coordinatesOcr=x.get('coords'),coordinatesValidation=x.get('coords_validation'),videoTimeUncertainty='CLOCK_QUANTIZED_1S_AND_UNKNOWN_SENSOR_LATENCY' if x else 'NO_VIDEO_SAMPLE',pedalPosition='UNKNOWN',brakePedal='UNKNOWN',recoveredEnergyKwh=None,evIndicator='NOT_SYSTEMATICALLY_ANNOTATED')
 rows.append(rr)
Path('analysis/results').mkdir(exist_ok=True)
json.dump(rows,open('analysis/results/comparison.json','w'),indent=2)
with open('analysis/results/comparison.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=rows[0]);w.writeheader();w.writerows({k:json.dumps(v) if isinstance(v,(list,dict)) else v for k,v in r.items()} for r in rows)
def metrics(pairs):
 a=np.array([x-y for x,y in pairs]);return dict(n=len(a),bias=float(a.mean()),mae=float(abs(a).mean()),median_abs=float(np.quantile(abs(a),.5)),p90_abs=float(np.quantile(abs(a),.9)),p95_abs=float(np.quantile(abs(a),.95)),max_abs=float(abs(a).max())) if len(a) else {}
stats={'frames_sampled':len(p),'tacho_readable_samples':sum(x['tacho'] is not None for x in p),'distinct_clock_seconds':len(groups),'duplicate_seconds':{k:len(v) for k,v in groups.items() if len(v)>1},'paired':metrics([(r['l3SpeedKmh'],r['tachoKmh']) for r in rows if r['tachoKmh'] is not None and r['l3SpeedKmh'] is not None and r['qcTrustLevel']=='TRUSTED']), 'lag_sensitivity':{}}
for lag in [-3,-2,-1,0,1,2,3]:
 pairs=[]
 for x in p:
  if x['tacho'] is None:continue
  dt=datetime.datetime.fromisoformat(x['utc'].replace('Z','+00:00'))+datetime.timedelta(seconds=lag)
  r=dm.get(dt.isoformat(timespec='seconds').replace('+00:00','Z'))
  if r and r['qcTrustLevel']=='TRUSTED' and r['l3SpeedKmh'] is not None:pairs.append((r['l3SpeedKmh'],x['tacho']))
 stats['lag_sensitivity'][lag]=metrics(pairs)
zero=[r for r in rows if r['tachoKmh']==0]
stats['zero_tacho_seconds']=len(zero);stats['zero_di_states']=dict(collections.Counter(r['motionState'] for r in zero));stats['zero_trusted_numeric']=[(r['bucketLabelUtc'],r['l3SpeedKmh']) for r in zero if r['qcTrustLevel']=='TRUSTED' and r['l3SpeedKmh'] is not None]
stats['stationary_di']=[(r['bucketLabelUtc'],r['tachoKmh']) for r in rows if r['motionState']=='STATIONARY_SUPPORTED']
stats['largest_residuals']=sorted([(r['bucketLabelUtc'],r['tachoKmh'],r['l3SpeedKmh'],r['videoFile'],r['videoFrame']) for r in rows if r['tachoKmh'] is not None and r['l3SpeedKmh'] is not None and r['qcTrustLevel']=='TRUSTED'],key=lambda a:abs(a[1]-a[2]),reverse=True)[:20]
json.dump(stats,open('analysis/results/metrics.json','w'),indent=2)
print(json.dumps(stats,indent=2))
