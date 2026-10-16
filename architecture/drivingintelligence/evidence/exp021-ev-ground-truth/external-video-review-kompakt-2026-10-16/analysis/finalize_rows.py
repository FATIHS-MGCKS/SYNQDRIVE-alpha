import json,csv
p=json.load(open('analysis/frame-observations.json'));r=json.load(open('analysis/results/comparison.json'));events=json.load(open('analysis/results/events.json'));lookup={}
for x in p:lookup.setdefault(x['utc'],x)
for x in r:
 f=lookup.get(x['bucketLabelUtc']);x['videoSourceImage']=f['image'] if f else None
 x['tachoConfidence']='VISUALLY_REVIEWED_NOT_CALIBRATED' if x['tachoKmh'] is not None else 'UNKNOWN'
 x['iPhoneGpsMeasurementTimeUtc']=None;x['telemetryMeasurementTimeUtc']=None
 clock=x['berlinTime'][11:19];x['eventIds']=[e['id'] for e in events if e['startBerlin']<=clock<=e['endBerlin']]
json.dump(r,open('analysis/results/comparison.json','w'),indent=2)
with open('analysis/results/comparison.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=r[0]);w.writeheader();w.writerows({k:json.dumps(v) if isinstance(v,(list,dict)) else v for k,v in x.items()} for x in r)
