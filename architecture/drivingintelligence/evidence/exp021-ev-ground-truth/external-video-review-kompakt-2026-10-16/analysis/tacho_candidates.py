import pathlib,json,os,subprocess,concurrent.futures
import numpy as np
from scipy import ndimage
from PIL import Image,ImageDraw,ImageOps
os.environ['OMP_THREAD_LIMIT']='1';root=pathlib.Path('/workspace/scratch/b8c6c74d57aa/analysis');out=root/'tacho';out.mkdir(exist_ok=True)
def run(p):
 im=Image.open(p);arr=np.asarray(im);sub=arr[90:530,:280].astype(float);gray=sub.mean(axis=2);mask=(gray>130)&(sub.max(axis=2)-sub.min(axis=2)<75);lab,n=ndimage.label(mask);boxes=[]
 for sl in ndimage.find_objects(lab):
  y,x=sl;h=y.stop-y.start;w=x.stop-x.start
  if 28<=h<=100 and 5<=w<=85 and x.start<200 and h/w<9:
   boxes.append((x.start,y.start+90,x.stop,y.stop+90))
 # Largest white component is only a candidate; all values need visual review.
 if not boxes:return {'file':str(p),'bbox':None,'candidate':None}
 a=max(boxes,key=lambda b:b[3]-b[1]);h=a[3]-a[1]; group=[b for b in boxes if abs((b[1]+b[3])/2-(a[1]+a[3])/2)<h*.3 and b[3]-b[1]>h*.65 and abs(b[0]-a[0])<150]
 box=[max(0,min(b[0] for b in group)-8),max(0,min(b[1] for b in group)-8),min(720,max(b[2] for b in group)+8),min(1280,max(b[3] for b in group)+8)]
 crop=im.crop(box);q=out/f'{p.parent.name}-{p.stem}.png';ImageOps.invert(crop.convert('L')).resize((crop.width*3,crop.height*3)).save(q)
 txt=subprocess.run(['tesseract',str(q),'stdout','--psm','7','-c','tessedit_char_whitelist=0123456789'],capture_output=True,text=True,env=os.environ).stdout.strip()
 return {'file':str(p),'bbox':box,'candidate':int(txt) if txt.isdigit() and int(txt)<200 else None,'raw':txt}
files=sorted((root/'frames').glob('*/*.jpg'))
with concurrent.futures.ThreadPoolExecutor(8) as ex:
 rows=[]
 for i,row in enumerate(ex.map(run,files)):
  rows.append(row)
  if i%200==0:print(i,flush=True)
(root/'tacho-candidates.json').write_text(json.dumps(rows));print('DONE',len(rows),flush=True)
