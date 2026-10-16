import pathlib,json,subprocess,concurrent.futures,re,os
from PIL import Image
os.environ['OMP_THREAD_LIMIT']='1'
r=pathlib.Path('/workspace/scratch/b8c6c74d57aa/analysis'); files=sorted((r/'frames').glob('*/*.jpg'))
def run(p):
 out=r/'ocr'/f'{p.parent.name}-{p.stem}.txt'
 if out.exists():return
 im=Image.open(p).crop((0,0,720,235)).resize((1440,470)); q=r/'ocr'/f'{p.parent.name}-{p.stem}.png'; im.save(q)
 a=subprocess.run(['tesseract',str(q),'stdout','--psm','6'],capture_output=True,text=True,env=os.environ)
 out.write_text(a.stdout);q.unlink()
with concurrent.futures.ThreadPoolExecutor(8) as pool:
 for i,_ in enumerate(pool.map(run,files)):
  if i%100==0: print('OCR',i,'/',len(files),flush=True)
print('DONE',len(files),flush=True)
