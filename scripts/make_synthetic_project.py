import argparse, csv, io, random, zipfile, time
from pathlib import Path
from PIL import Image, ImageDraw

def write_zip(z, name, data):
 info=zipfile.ZipInfo(name, date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)

def create(out,students=40,seed=1,messy=False):
 out=Path(out);out.mkdir(parents=True,exist_ok=True);r=random.Random(seed)
 W,H=4000,2600
 clean=Image.new('RGB',(W,H));d=ImageDraw.Draw(clean)
 for y in range(H):d.line((0,y,W,y),fill=(240-y*15//H,245-y*10//H,250))
 ann=clean.copy();d=ImageDraw.Draw(ann)
 for i in range(16):
  page=i//8;col=(i%8)//4;row=i%4;x=page*2000+col*930+80;y=row*600+60
  d.rectangle((x,y,x+240,y+320),fill='#00bf63');d.rectangle((x+270,y,x+440,y+170),fill='#004aad') if i%2 else d.ellipse((x+270,y,x+440,y+170),fill='#004aad')
  d.rectangle((x,y+340,x+440,y+405),fill='#ff751f');d.rectangle((x+470,y,x+800,y+320),fill='#ff3131')
 clean.save(out/'clean.png');ann.save(out/'annotated.png')
 first=['José','Ana','Émile','Riley','Morgan','Casey','Quinn','Alex'];last=['García',"O'Brien",'Durand','Smith-Jones','Longfictionalfamilynamefortesting','Duran','Dupont','Rivera']
 names=[(first[i%8]+chr(65+i//26)+chr(65+i%26),last[i%8]+chr(65+i//26)+chr(65+i%26)) for i in range(students)]
 with open(out/'roster.csv','w',newline='',encoding='cp1252' if messy else 'utf8') as f:
  w=csv.writer(f);w.writerow(['first_name','last_name'] if messy else ['First Name','Last Name']);w.writerows(names[:10]+[('','')]+names[10:])
 with open(out/'quotes.csv','w',newline='',encoding='utf8') as f:
  w=csv.writer(f);w.writerow(['First Name','Last Name','Quote']);qs=['Dream','永远年轻','to the moon 🌙','https://example.invalid','REJECTED','']
  for i,n in enumerate(names[:-2]):w.writerow([*n,qs[i%6] if i<6 else 'A fictional quote for the yearbook.'])
 def face(i):
  im=Image.new('RGB',(600,800),(r.randrange(40,230),r.randrange(40,230),r.randrange(40,230)));dd=ImageDraw.Draw(im);dd.ellipse((90,90,510,620),fill=(235,185,145));dd.ellipse((190,250,225,285),fill='black');dd.ellipse((375,250,410,285),fill='black');dd.arc((210,340,390,490),0,180,fill='black',width=8);return im
 with zipfile.ZipFile(out/'portraits.zip','w') as z:
  for i in range(students):
   b=io.BytesIO();exif=Image.Exif();exif[274]=6 if i==1 else 1
   portrait=face(i)
   # Orientation 6 means stored pixels are rotated counterclockwise from upright.
   if i==1:portrait=portrait.transpose(Image.Transpose.ROTATE_90)
   portrait.save(b,format='JPEG',exif=exif);write_zip(z,f'{i+1:03}.jpg',b.getvalue())
  write_zip(z,'__MACOSX/._001.jpg',b'fictional metadata');write_zip(z,'corrupt.jpg',b'not a photo')
 with zipfile.ZipFile(out/'baby.zip','w') as z:
  for i,n in enumerate(names[::2]):
   b=io.BytesIO();im=face(i)
   if i==0:im.save(b,format='PDF',save_all=True,append_images=[im],creationDate=time.gmtime(1577836800),modDate=time.gmtime(1577836800));suffix='pdf'
   else:im.save(b,format='PNG');suffix='png'
   write_zip(z,' '.join(n)+'.'+suffix,b.getvalue())
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--students',type=int,default=40);p.add_argument('--seed',type=int,default=1);p.add_argument('--messy',action='store_true');a=p.parse_args();create(a.out,a.students,a.seed,a.messy)
