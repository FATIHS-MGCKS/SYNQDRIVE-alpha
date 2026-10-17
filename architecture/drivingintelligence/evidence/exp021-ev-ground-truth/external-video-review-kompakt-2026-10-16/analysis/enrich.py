import json,numpy as np,collections,datetime,csv
from pathlib import Path
p=json.load(open('analysis/frame-observations.json'));r=json.load(open('analysis/results/comparison.json'));m=json.load(open('analysis/results/metrics.json'))
# Observed bars, reviewed in full-resolution source frames. No inference at other seconds.
bar={650:'WHITE_POWER_OUTPUT_INDICATOR',926:'GREEN_REGEN_INDICATOR'}
for x in r:
 for idx,label in bar.items():
  if x['bucketLabelUtc']==p[idx]['utc']:x['evIndicator']=label
 x['tachoValidation']='VISUAL_REVIEW_1HZ_SAMPLE_INTEGER_DISPLAY' if x['tachoKmh'] is not None else 'UNKNOWN'
 x['speedDifferenceDiMinusTachoKmh']=x['l3SpeedKmh']-x['tachoKmh'] if x['l3SpeedKmh'] is not None and x['tachoKmh'] is not None and x['qcTrustLevel']=='TRUSTED' else None
 x['berlinTime']=x['bucketLabelUtc'].replace('T03:','T05:').replace('Z','+02:00')
 x['eventTags']=[]
# Contiguous runs preserve all gaps.
def runs(pred):
 g=[]
 for i,x in enumerate(r):
  if pred(x):
   if g and g[-1][-1]+1==i:g[-1].append(i)
   else:g.append([i])
 return g
stops=[]
for g in runs(lambda x:x['tachoKmh']==0):
 stops.append({'startUtc':r[g[0]]['bucketLabelUtc'],'endUtcInclusive':r[g[-1]]['bucketLabelUtc'],'sampleSeconds':len(g),'description':'Tacho displays 0; physical sub-display-resolution motion not excluded','diStates':dict(collections.Counter(r[i]['motionState'] for i in g))})
 for i in g:r[i]['eventTags'].append('TACHO_ZERO_SAMPLE')
gaps=[]
for g in runs(lambda x:x['l3SpeedKmh'] is None):
 gaps.append({'startUtc':r[g[0]]['bucketLabelUtc'],'endUtcInclusive':r[g[-1]]['bucketLabelUtc'],'seconds':len(g),'tachoZeroSamples':sum(r[i]['tachoKmh']==0 for i in g),'tachoPositiveSamples':sum(r[i]['tachoKmh'] is not None and r[i]['tachoKmh']>0 for i in g),'positionAvailability':dict(collections.Counter(r[i]['positionAvailability'] for i in g)),'positionStates':dict(collections.Counter(r[i]['positionState'] for i in g))})
# 5-second observed secant windows. Never bridge missing tacho or DI.
windows=[]
for i in range(len(r)-5):
 a=r[i:i+6]
 if any(x['tachoKmh'] is None for x in a):continue
 if len({x['videoFile'] for x in a})!=1 or any(not .99<=(a[j+1]['videoPts']-a[j]['videoPts'])<=1.01 for j in range(5)):continue
 acc=(a[-1]['tachoKmh']-a[0]['tachoKmh'])/3.6/5
 da=(a[-1]['l3SpeedKmh']-a[0]['l3SpeedKmh'])/3.6/5 if all(x['qcTrustLevel']=='TRUSTED' and x['l3SpeedKmh'] is not None for x in a) else None
 windows.append(dict(startUtc=a[0]['bucketLabelUtc'],endUtc=a[-1]['bucketLabelUtc'],startKmh=a[0]['tachoKmh'],endKmh=a[-1]['tachoKmh'],tachoMeanAccelerationMps2=acc,diMeanAccelerationMps2=da,phase='ACCELERATION' if acc>=.5 else 'DECELERATION' if acc<=-.5 else 'LOW_NET_SPEED_CHANGE',note='Overlapping 5s windows; descriptive, not independent; no brake/regen inference'))
# Common cohorts for timing sensitivity, 1 sample per clock second.
pairs={};common=[]
for i,x in enumerate(r):
 if x['tachoKmh'] is not None and i>=3 and i<len(r)-3 and all(r[j]['l3SpeedKmh'] is not None and r[j]['qcTrustLevel']=='TRUSTED' for j in range(i-3,i+4)):common.append(i)
def met(a):
 a=np.array(a);return dict(n=len(a),biasKmh=float(a.mean()),maeKmh=float(abs(a).mean()),p95AbsoluteKmh=float(np.quantile(abs(a),.95))) if len(a) else {}
m['lag_common_cohort']={str(s):met([r[i+s]['l3SpeedKmh']-r[i]['tachoKmh'] for i in common]) for s in range(-3,4)}
m['by_tacho_band']={label:met([x['speedDifferenceDiMinusTachoKmh'] for x in r if x['speedDifferenceDiMinusTachoKmh'] is not None and lo<=x['tachoKmh']<hi]) for label,lo,hi in [('0_to_29',0,30),('30_to_59',30,60),('60_to_89',60,90),('90_plus',90,1000)]}
m['readable_unique_seconds']=sum(x['tachoKmh'] is not None for x in r);m['positive_tacho_seconds']=sum(x['tachoKmh'] is not None and x['tachoKmh']>0 for x in r)
m['speed_sample_max']=max(x['tachoKmh'] or 0 for x in r);m['five_second_windows']=len(windows)
m['window_dynamics']={phase:met([x['diMeanAccelerationMps2']-x['tachoMeanAccelerationMps2'] for x in windows if x['phase']==phase and x['diMeanAccelerationMps2'] is not None]) for phase in ['ACCELERATION','DECELERATION','LOW_NET_SPEED_CHANGE']}
# Unit names in helper are km/h; replace to retain physically correct schema.
for q in m['window_dynamics'].values():
 for a,b in [('biasKmh','biasMps2'),('maeKmh','maeMps2'),('p95AbsoluteKmh','p95AbsoluteMps2')]:
  if a in q:q[b]=q.pop(a)
for name,data in [('comparison',r),('metrics',m),('zero-display-intervals',stops),('numeric-gaps',gaps),('five-second-dynamics',windows)]:json.dump(data,open('analysis/results/'+name+'.json','w'),indent=2)
with open('analysis/results/comparison.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=r[0]);w.writeheader();w.writerows({k:json.dumps(v) if isinstance(v,(list,dict)) else v for k,v in x.items()} for x in r)
print(json.dumps({k:m[k] for k in ['lag_common_cohort','by_tacho_band','readable_unique_seconds','positive_tacho_seconds','window_dynamics']},indent=2))
print('most dynamic',sorted(windows,key=lambda x:abs(x['tachoMeanAccelerationMps2']),reverse=True)[:5]);print('gaps',json.dumps([x for x in gaps if x['seconds']>=10],indent=1))
