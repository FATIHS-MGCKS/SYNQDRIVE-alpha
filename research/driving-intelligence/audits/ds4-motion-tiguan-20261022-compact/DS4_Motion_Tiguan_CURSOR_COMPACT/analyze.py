"""Independent offline audit; no DB/network/production writes, no reference interpolation."""
from pathlib import Path
import csv, json, math, statistics, hashlib
from datetime import datetime, timedelta, timezone
from collections import Counter

ROOT=Path(__file__).resolve().parent
EV=ROOT/'evaluation'; OUT=ROOT/'analysis'; OUT.mkdir(exist_ok=True)
read=lambda p: json.loads(p.read_text())
rows=list(csv.DictReader((EV/'outputs/comparison_primary.csv').open(newline='')))
ref=list(csv.DictReader((EV/'reference/TIGUAN_2026-10-22_1Hz.csv').open(newline='')))
motion=read(EV/'snapshots/di_v0_motion_core_shadow_payload.json')
base=read(OUT/'baseline_replay.json'); exp=read(OUT/'candidate_experiment.json'); candidate=exp['candidate']
number=lambda v: float(v) if v not in ('',None) and math.isfinite(float(v)) else None
dt=lambda s:datetime.fromisoformat(s.replace('Z','+00:00'))
iso=lambda t:t.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
ts=lambda s:iso(dt(s))
local=lambda s:dt(s).astimezone(timezone(timedelta(hours=2))).strftime('%H:%M:%S')
cm={ts(s['bucketLabelUtc']):s for s in motion['speeds']}
fm={ts(s['bucketLabelUtc']):s for s in motion['fsmLabels']}
km={ts(s['label']):s for s in candidate['c4']}
bm={ts(s['label']):s for s in base['fsm']}
grid={ts(b['bucketLabelUtc']):b for b in read(EV/'snapshots/position_grid_verified.json')}
for r in rows:
 r['utc']=ts(r['time_utc_estimated']); r['ref']=number(r['ref_speed_kmh']);r['l3']=number(r['ds4_l3_speed_kmh']);r['c4']=cm[r['utc']]['speedKmh'];r['candidate']=km[r['utc']]['valueKmh']
assert len(rows)==len(ref)==1464
assert len({r['utc'] for r in rows})==len(rows)
assert len({(r['source_clip'],r['video_second']) for r in rows})==len(rows)
assert all(number(r['ds4_motion_speed_kmh'])==r['c4'] for r in rows)

def percentile(xs,q):
 s=sorted(xs); p=(len(s)-1)*q;i=int(p); f=p-i
 return s[i] if i+1==len(s) else s[i]*(1-f)+s[i+1]*f
def stats(pairs):
 if not pairs:return {'n':0}
 e=[estimate-reference for reference,estimate in pairs];a=[abs(x) for x in e]
 return dict(n=len(e),mae=statistics.mean(a),median_abs=statistics.median(a),rmse=math.sqrt(statistics.mean(x*x for x in e)),bias=statistics.mean(e),p90_abs=percentile(a,.9),p95_abs=percentile(a,.95),within3=sum(x<=3 for x in a)/len(a),within5=sum(x<=5 for x in a)/len(a),within10=sum(x<=10 for x in a)/len(a),max_abs=max(a),abs_error_gt100=sum(x>100 for x in a))
def metrics(rs,key):return stats([(r['ref'],r[key]) for r in rs if r['ref'] is not None and r[key] is not None])
primary={k:metrics(rows,k) for k in ('l3','c4','candidate')}
coverage={k:{'numeric_all_reference_rows':sum(r[k] is not None for r in rows),'paired_readable_reference':primary[k]['n'],'denominator_all_reference_rows':1464,'denominator_readable_reference':1417} for k in primary}
common= [r for r in rows if all(r[k] is not None for k in ('ref','l3','c4'))]
common_candidate=[r for r in rows if all(r[k] is not None for k in ('ref','c4','candidate'))]
sens={str(shift):stats([(r['ref'],cm[iso(dt(r['utc'])+timedelta(seconds=shift))]['speedKmh']) for r in rows if r['ref'] is not None and cm.get(iso(dt(r['utc'])+timedelta(seconds=shift)),{}).get('speedKmh') is not None]) for shift in (-2,-1,0,1,2)}
rpm_pairs=[(number(r['ref_rpm_estimate']),number(r['r1_obd_rpm'])) for r in rows if number(r['ref_rpm_estimate']) is not None and number(r['r1_obd_rpm']) is not None]
rpm_stats=stats(rpm_pairs);rpm_stats['within500']=sum(abs(b-a)<=500 for a,b in rpm_pairs)/len(rpm_pairs) if rpm_pairs else None
rpm_stats['n_excluded_by_original_l3_gate']=sum(number(r['ref_rpm_estimate']) is not None and number(r['r1_obd_rpm']) is not None and r['comparison_exclusion']!='' for r in rows)
states={key:dict(Counter(fm[r['utc']]['state'] for r in rows if r['ref'] is not None and ((r['ref']==0) if key=='display_zero' else (r['ref']>0)))) for key in ('display_zero','display_positive')}

stop_reference=list(csv.DictReader((EV/'reference/TIGUAN_2026-10-22_visible_stops.csv').open(newline='')))
stops=[]
for i,s in enumerate(stop_reference,1):
 a,b=ts(s['first_time_local_estimated']),ts(s['last_time_local_estimated'])
 window=[r for r in rows if a<=r['utc']<=b]
 assert all(r['ref']==0 for r in window)
 stationary=[r for r in window if fm[r['utc']]['state']=='STATIONARY']
 overlaps=[e for e in motion['stopEpisodes'] if e['startEarliest']<=b and (e['endLatest'] or '9999')>=a]
 first=stationary[0]['utc'] if stationary else None
 # A display-run is censored at clip edges; no merging over unreadable seconds or clips.
 next_row=next((r for r in rows if r['utc']>b),None)
 departure=None
 if next_row and next_row['source_clip']==s['source_clip'] and next_row['ref'] is not None and next_row['ref']>0 and (dt(next_row['utc'])-dt(b)).total_seconds()<=2:
  departure={'last_zero':b,'first_positive':next_row['utc'],'fsm_at_first_positive':fm[next_row['utc']]['state'],'reference_bracket_width_s':(dt(next_row['utc'])-dt(b)).total_seconds()}
 stops.append(dict(id=i,start=a,end=b,local_start=local(a),local_end=local(b),clip=s['source_clip'],zero_rows=len(window),fsm_counts=dict(Counter(fm[r['utc']]['state'] for r in window)),first_stationary=first,first_stationary_offset_from_first_zero_s=(dt(first)-dt(a)).total_seconds() if first else None,overlapping_episodes=overlaps,departure_observation=departure,details=[{'utc':r['utc'],'c4':r['c4'],'quality':cm[r['utc']]['quality'],'fsm':fm[r['utc']]['state'],'reason':bm[r['utc']]['reason'],'r1_speed':number(r['r1_obd_speed_kmh']),'flags':bm[r['utc']]['flags']} for r in window]))

reference_windows=list(csv.DictReader((EV/'reference/TIGUAN_2026-10-22_analysis_windows.csv').open(newline='')))
windows=[]
for i,w in enumerate(reference_windows,1):
 a,b=ts(w['start_time_local_estimated']),ts(w['end_time_local_estimated'])
 kind='ACCELERATION' if w['type']=='SPEED_INCREASE' else 'DECELERATION'
 overlaps=[e for e in motion['events'] if e['startLabel']<=b and e['endLabel']>=a]
 matching=[e for e in overlaps if e['kind']==kind]
 rs=[r for r in rows if a<=r['utc']<=b]
 reference_series=[{'label':r['utc'],'valueKmh':r['ref'],'quality':'OK','supportLabels':[],'supportSpanS':None,'flags':[],'estimator':'VIDEO_TACHO_DIAGNOSTIC_ONLY'} for r in rs if r['ref'] is not None]
 verdict='DIRECTION_MATCH_TIME_OVERLAP' if matching else 'NO_MATCHING_EVENT_REQUIRES_THRESHOLD_REVIEW'
 windows.append(dict(id=i,start=a,end=b,local_start=local(a),local_end=local(b),direction=kind,reference_start_kmh=number(w['start_speed_display_kmh']),reference_end_kmh=number(w['end_speed_display_kmh']),reference_mean_accel_mps2=number(w['mean_display_accel_mps2']),c4_start_kmh=cm[a]['speedKmh'],c4_end_kmh=cm[b]['speedKmh'],c4_metrics=metrics(rs,'c4'),matching_events=matching,all_overlapping_events=overlaps,verdict=verdict,scope='selected window only; no global precision/recall; no pedal ground truth'))

by_clip={clip:{k:metrics([r for r in rows if r['source_clip']==clip],k) for k in ('l3','c4','candidate')} for clip in sorted({r['source_clip'] for r in rows})}
bands={'zero':lambda v:v==0,'0_to_30':lambda v:0<v<30,'30_to_60':lambda v:30<=v<60,'60_to_100':lambda v:60<=v<100,'100_plus':lambda v:v>=100}
by_band={b:{k:metrics([r for r in rows if r['ref'] is not None and f(r['ref'])],k) for k in ('l3','c4','candidate')} for b,f in bands.items()}
changes=[{'utc':r['utc'],'reference':r['ref'],'baseline':r['c4'],'candidate':r['candidate'],'baseline_quality':cm[r['utc']]['quality'],'candidate_quality':km[r['utc']]['quality']} for r in rows if r['c4']!=r['candidate']]
summary={'schema':'SYNQDRIVE_DS4_MOTION_INDEPENDENT_AUDIT_V1','primary_shift_s':0,'primary':primary,'coverage':coverage,'common_l3_c4':{k:metrics(common,k) for k in ('l3','c4')},'common_c4_candidate':{k:metrics(common_candidate,k) for k in ('c4','candidate')},'c4_shift_sensitivity':sens,'fsm_reference_seconds':states,'c4_null_reasons':dict(Counter(cm[r['utc']]['quality'] for r in rows if r['c4'] is None)),'rpm_independent_mask':rpm_stats,'by_clip':by_clip,'by_speed_band':by_band,'events_full_trip':len(motion['events']),'events_in_video_window':sum(e['startLabel']<=rows[-1]['utc'] and e['endLabel']>=rows[0]['utc'] for e in motion['events']),'visible_zero_runs_with_stationary':sum(s['first_stationary'] is not None for s in stops),'reference_zero_runs':len(stops),'candidate_changed_reference_rows':changes,'candidate_scope':'offline diagnostic hypothesis only; threshold uncalibrated; no runtime patch/deploy','baseline_replay':{k:base[k] for k in ('codeSha','labels','c4Mismatches','fsmStateMismatches','events','eventExactMismatches')}}
(OUT/'audit_metrics.json').write_text(json.dumps(summary,indent=2))
(OUT/'stop_run_audit.json').write_text(json.dumps(stops,indent=2))
(OUT/'event_window_audit.json').write_text(json.dumps(windows,indent=2))
(OUT/'reference_speed_series.json').write_text(json.dumps([{'clip':r['source_clip'],'label':r['utc'],'valueKmh':r['ref'],'quality':'OK','supportLabels':[],'supportSpanS':None,'flags':[],'estimator':'VIDEO_TACHO_DIAGNOSTIC'} for r in rows]))
with (OUT/'motion_comparison.csv').open('w',newline='') as f:
 fields=['utc','source_clip','video_second','ref','l3','c4','candidate','state','quality']
 wr=csv.DictWriter(f,fieldnames=fields);wr.writeheader()
 for r in rows:wr.writerow({**{k:r[k] for k in fields[:-2]},'state':fm[r['utc']]['state'],'quality':cm[r['utc']]['quality']})
print(json.dumps({k:summary[k] for k in ('primary','coverage','fsm_reference_seconds','c4_null_reasons','rpm_independent_mask','visible_zero_runs_with_stationary','events_in_video_window','candidate_changed_reference_rows')},indent=2))
for s in stops:print('STOP',s['id'],s['local_start'],s['local_end'],s['fsm_counts'],s['first_stationary_offset_from_first_zero_s'])
