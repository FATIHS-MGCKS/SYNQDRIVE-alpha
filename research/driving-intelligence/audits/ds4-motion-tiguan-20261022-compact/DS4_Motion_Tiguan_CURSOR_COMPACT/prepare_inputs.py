from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parent;EV=ROOT/'evaluation';SNAP=EV/'snapshots'
manifest=json.loads((EV/'PROVENANCE_MANIFEST.json').read_text())
for key in ('reference/TIGUAN_2026-10-22_1Hz.csv','snapshots/di_v0_motion_core_shadow_payload.json','snapshots/di_v0_s4_evidence_container.bin'):
 digest=hashlib.sha256((EV/key).read_bytes()).hexdigest()
 assert digest==manifest['file_hashes'][key],f'Input changed: {key}'
text=(SNAP/'di_v0_s4_evidence_container.bin').read_text();lines=text.split('\n');headers=[]
for i,line in enumerate(lines):
 if line.startswith('['):
  row=json.loads(line)
  if len(row)==6 and row[0] in ('NATIVE_EVENT','POSITION','R1_OBD'):headers.append((i,row))
assert [h[1][0] for h in headers]==['NATIVE_EVENT','POSITION','R1_OBD']
for k,(i,h) in enumerate(headers):
 if h[4] is None:continue
 end=headers[k+1][0] if k+1<len(headers) else len(lines)
 payload='\n'.join(lines[i+1:end]);assert hashlib.sha256(payload.encode()).hexdigest()==h[4]
 if h[0]=='POSITION':
  rows=[json.loads(line) for line in payload.split('\n') if line.startswith('["b",')]
  grid=[dict(bucketLabelUtc=b[1],availability=b[2],latitude=float(b[4]) if b[4] is not None else None,longitude=float(b[5]) if b[5] is not None else None) for b in rows]
  assert len(grid)==2094
  (SNAP/'position_grid_verified.json').write_text(json.dumps(grid))
print('Input and POSITION/R1 channel hashes: PASS; 2094 position buckets extracted')
