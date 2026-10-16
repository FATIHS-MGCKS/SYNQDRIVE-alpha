import json,statistics
from PIL import Image,ImageDraw
p=json.load(open('analysis/parsed-overlay.json'))
def sec(s):
 h,m,s=map(int,s.split(':'));return h*3600+m*60+s
base={f:statistics.median(sec(x['clock'])-x['pts'] for x in p if x['file']==f and x['clock']) for f in set(x['file'] for x in p)}
check=[x for x in p if not x['clock'] or abs(sec(x['clock'])-x['pts']-base[x['file']])>1.1 or (x['clock_full'] and x['clock']!=x['clock_full'])]
# include transition file66 and67 anomalous phase
check +=[x for x in p if x['index'] in range(735,745) or x['index'] in range(1000,1028) or x['index'] in [179,180,359,360,539,540,719,720,899,900]]
check=list({x['index']:x for x in check}.values());check.sort(key=lambda x:x['index'])
json.dump([x['index'] for x in check],open('analysis/clock-check-indices.json','w'))
for st in range(0,len(check),40):
 a=check[st:st+40];im=Image.new('RGB',(1000,55*((len(a)+1)//2)),'white');d=ImageDraw.Draw(im)
 for j,x in enumerate(a):
  crop=Image.open(x['image']).crop((320,28,715,78)).resize((395,50));xx=j%2*500;yy=j//2*55;im.paste(crop,(xx+100,yy));d.text((xx,yy+15),str(x['index']),fill='black')
 im.save('analysis/clock-check-%03d.jpg'%st)
print(len(check),base)
