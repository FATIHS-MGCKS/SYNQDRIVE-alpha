import fs from 'node:fs';
import { detectMotionManoeuvreEvents, MOTION_CORE_EVENT_GUARDS_V0_1_DEV, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS } from './backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-event-detector.ts';
const series=JSON.parse(fs.readFileSync(new URL('./analysis/reference_speed_series.json',import.meta.url),'utf8'));
const byClip=Map.groupBy(series,x=>x.clip);
const events=[...byClip].flatMap(([clip,samples])=>detectMotionManoeuvreEvents(0,samples,'VIDEO_TACHO_DIAGNOSTIC',MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,MOTION_EVENT_V0_2_CANDIDATE_OPTIONS).map(e=>({...e,clip})));
const windows=JSON.parse(fs.readFileSync(new URL('./analysis/event_window_audit.json',import.meta.url),'utf8'));
for(const w of windows){
 w.reference_threshold_diagnostic_events=events.filter(e=>e.startLabel<=w.end&&e.endLabel>=w.start);
 const matching=w.reference_threshold_diagnostic_events.filter(e=>e.kind===w.direction);
 if(!w.matching_events.length&&!matching.length)w.verdict='NO_EVENT_IN_EITHER_SERIES_UNDER_SAME_THRESHOLDS';
}
fs.writeFileSync(new URL('./analysis/event_window_audit.json',import.meta.url),JSON.stringify(windows,null,2));
fs.writeFileSync(new URL('./analysis/reference_threshold_diagnostic.json',import.meta.url),JSON.stringify({warning:'Tacho quantization/clock uncertainty; diagnostic only, not ground truth or global precision/recall',events},null,2));
console.log(windows.map(w=>({id:w.id,verdict:w.verdict,motion:w.matching_events.map(e=>[e.startLabel,e.endLabel,e.deltaKmh]),reference:w.reference_threshold_diagnostic_events.filter(e=>e.kind===w.direction).map(e=>[e.startLabel,e.endLabel,e.deltaKmh])})));
