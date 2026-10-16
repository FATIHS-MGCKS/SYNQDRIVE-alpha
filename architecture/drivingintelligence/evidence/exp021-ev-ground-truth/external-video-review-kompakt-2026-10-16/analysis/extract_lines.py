import pathlib,os,subprocess,concurrent.futures,json
from PIL import Image,ImageOps,ImageEnhance
os.environ['OMP_THREAD_LIMIT']='1';r=pathlib.Path('/workspace/scratch/b8c6c74d57aa/analysis');out=r/'lines';out.mkdir(exist_ok=True)
def run(p):
 dest=out/f'{p.parent.name}-{p.stem}.json'
 if dest.exists():return
 im=Image.open(p);d={}
 for name,box in [('clock',(340,30,705,76)),('gps',(250,150,705,198)),('coords',(300,76,705,116))]:
  q=out/f'{p.parent.name}-{p.stem}-{name}.png';c=im.crop(box).resize(((box[2]-box[0])*2,(box[3]-box[1])*2));c.save(q)
  d[name]=subprocess.run(['tesseract',str(q),'stdout','--psm','7'],capture_output=True,text=True,env=os.environ).stdout.strip();q.unlink()
 dest.write_text(json.dumps(d))
files=sorted((r/'frames').glob('*/*.jpg'))
with concurrent.futures.ThreadPoolExecutor(8) as ex:
 for i,_ in enumerate(ex.map(run,files)):
  if i%200==0:print(i,flush=True)
print('DONE',len(files),flush=True)
