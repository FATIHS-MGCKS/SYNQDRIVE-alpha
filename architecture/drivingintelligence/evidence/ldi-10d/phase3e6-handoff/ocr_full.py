import os,glob,csv,subprocess,concurrent.futures
D='/mnt/data/ldi3e5'; prior={r['frame']:r['raw_ocr'] for r in csv.DictReader(open(D+'/ocr_raw.csv'))}
files=sorted(glob.glob(D+'/frames/*.jpg'))
def run(p):
 n=os.path.basename(p)
 if n in prior:return n,prior[n]
 try:return n,subprocess.run(['tesseract',p,'stdout','--psm','6'],capture_output=True,text=True,timeout=15).stdout.replace('\n',' | ')
 except Exception as e:return n,'ERROR '+str(e)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:rows=list(ex.map(run,files))
with open(D+'/ocr_1hz_raw.csv','w') as f:
 w=csv.writer(f);w.writerow(['frame','raw_ocr']);w.writerows(rows)
print('FINISHED',len(rows),flush=True)
