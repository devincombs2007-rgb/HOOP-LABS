import os, math, json
from pathlib import Path
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFont
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

OUT=Path('/mnt/data/hoop_lab_player_models')
OUT.mkdir(exist_ok=True)

PEOPLE=[
 dict(id='stephen_curry',name='Stephen Curry',height=1.8796,number='30',tag='CURRY',skin='#B77B58',jersey='#1C54A3',accent='#F6C84A',shorts='#1C54A3',shoe='#E7EAE6',sole='#E2BD4B',hair='curls',face='goatee',build=.94),
 dict(id='lebron_james',name='LeBron James',height=2.0574,number='23',tag='JAMES',skin='#9A5D3E',jersey='#542A80',accent='#EEB84E',shorts='#542A80',shoe='#F4EDDD',sole='#6D4BAC',hair='buzz',face='beard',build=1.24),
 dict(id='michael_jordan',name='Michael Jordan',height=1.9812,number='23',tag='JORDAN',skin='#A96847',jersey='#C91F37',accent='#F2F2F0',shorts='#C91F37',shoe='#F5F5F5',sole='#CC2D37',hair='bald',face='clean',build=1.10),
]


def rgba(code,a=255):
 h=code.lstrip('#'); return [int(h[i:i+2],16) for i in (0,2,4)]+[a]

def boxmesh(extents, color):
 m=trimesh.creation.box(extents=extents);m.visual.vertex_colors=rgba(color);return m

def orb(scale,color,sub=2):
 m=trimesh.creation.icosphere(subdivisions=sub,radius=1.0)
 m.apply_scale(scale);m.visual.vertex_colors=rgba(color)
 return m

def tube(start, end, radius, color, sections=16):
 a=np.array(start,dtype=float);b=np.array(end,dtype=float)
 h=np.linalg.norm(b-a)
 m=trimesh.creation.cylinder(radius=radius,height=h,sections=sections)
 m.apply_transform(trimesh.geometry.align_vectors([0,0,1],(b-a)/h))
 m.apply_translation((a+b)/2)
 m.visual.vertex_colors=rgba(color)
 return m

def text_tex(text,fg,background,width=256,height=152,size=112):
 # Printed directly into texture, not an external font asset.
 im=Image.new('RGBA',(width,height),tuple(rgba(background)))
 dr=ImageDraw.Draw(im)
 try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',size)
 except: font=ImageFont.load_default()
 bb=dr.textbbox((0,0),text,font=font,stroke_width=0)
 tw,th=bb[2]-bb[0],bb[3]-bb[1]
 scale=min(1.0,(width*.91)/max(1,tw))
 if scale<1:
  # Draw at high resolution, then resize entire text layer
  layer=Image.new('RGBA',(max(1,int(tw+10)),max(1,int(th+10))),(0,0,0,0))
  ImageDraw.Draw(layer).text((5-bb[0],5-bb[1]),text,font=font,fill=fg)
  layer=layer.resize((max(1,int(layer.width*scale)),max(1,int(layer.height*scale))),Image.Resampling.LANCZOS)
  im.alpha_composite(layer,((width-layer.width)//2,(height-layer.height)//2))
 else:
  dr.text(((width-tw)//2-bb[0],(height-th)//2-bb[1]),text,font=font,fill=fg)
 return im

def plane_tex(width,height,im):
 w=width/2;h=height/2
 vertices=np.array([[-w,-h,0],[w,-h,0],[w,h,0],[-w,h,0]],dtype=float)
 faces=np.array([[0,1,2],[0,2,3]],dtype=np.int64)
 mesh=trimesh.Trimesh(vertices=vertices,faces=faces,process=False)
 uv=np.array([[0,1],[1,1],[1,0],[0,0]],dtype=float)
 mat=PBRMaterial(baseColorTexture=im,metallicFactor=0,roughnessFactor=1,doubleSided=True)
 mesh.visual=TextureVisuals(uv=uv,material=mat)
 return mesh


def build(cfg):
 H=cfg['height']; S=H/1.9812
 skin=cfg['skin']; top=cfg['jersey']; gold=cfg['accent']; short=cfg['shorts']; B=cfg['build']
 scene=trimesh.Scene()
 def X(x):return x*S
 def add(mesh,name,parent,loc=(0,0,0)):
  scene.add_geometry(mesh,node_name=name,geom_name=name+'_mesh',parent_node_name=parent,transform=trimesh.transformations.translation_matrix(loc))
 def empty(name,parent,loc=(0,0,0)):
  scene.graph.update(frame_to=name,frame_from=parent,matrix=trimesh.transformations.translation_matrix(loc))
 def sphere(name,parent,center,scale,c,sub=2):add(orb(scale,c,sub),name,parent,center)
 empty('AvatarRoot','world')
 empty('Hips','AvatarRoot',(0,X(.965),0))
 # Shoes + articulated legs. Hips are root; elbows/knees should be rotatable about local x axis.
 for side in ('L','R'):
  sign=-1 if side=='L' else 1
  hipx=sign*X(.128)*B
  thigh=X(.475); shin=X(.405)
  empty(side+'_Hip','Hips',(hipx,0,0))
  sphere(side+'_Thigh',side+'_Hip',(0,-thigh/2,0),(X(.074)*B,thigh*.57,X(.078)*B),skin)
  sphere(side+'_Shorts',side+'_Hip',(0,-X(.108),X(.002)),(X(.087)*B,X(.205),X(.089)*B),short)
  empty(side+'_Knee',side+'_Hip',(0,-thigh,0))
  sphere(side+'_KneeSkin',side+'_Knee',(0,0,0),(X(.065)*B,X(.066),X(.073)*B),skin)
  sphere(side+'_Calf',side+'_Knee',(0,-shin*.50,0),(X(.056)*B,shin*.57,X(.062)*B),skin)
  empty(side+'_Ankle',side+'_Knee',(0,-shin,0))
  sphere(side+'_Sock',side+'_Ankle',(0,-X(.018),0),(X(.061)*B,X(.080),X(.063)), '#F7F7F7')
  sphere(side+'_Shoe',side+'_Ankle',(0,-X(.078),X(.085)),(X(.080)*B,X(.058),X(.17)),cfg['shoe'])
  sphere(side+'_Sole',side+'_Ankle',(0,-X(.122),X(.091)),(X(.083)*B,X(.016),X(.167)),cfg['sole'])
  sphere(side+'_Laces',side+'_Ankle',(0,-X(.034),X(.17)),(X(.040),X(.012),X(.059)),'#F2F2F2')
 # Pelvis and torso around realistic anatomical positions
 sphere('Waist','Hips',(0,X(.080),0),(X(.172)*B,X(.125),X(.108)*B),short)
 empty('Spine','Hips',(0,X(.15),0))
 sphere('JerseyTorso','Spine',(0,X(.183),0),(X(.216)*B,X(.265),X(.124)*B),top,sub=3)
 # side panels & accent edging 
 for sign, label in [(-1,'Left'),(1,'Right')]:
  sphere(label+'JerseyAccent','Spine',(sign*X(.201)*B,X(.15),X(.008)),(X(.018),X(.195),X(.060)),gold)
 # Shirt chest patch, numbers and back name: flat sections intentionally stylized
 num=text_tex(cfg['number'],'#FFFFFF',top,size=130)
 add(plane_tex(X(.21)*B,X(.19),num),'FrontNumber','Spine',(0,X(.196),X(.126)*B))
 name=text_tex(cfg['tag'],'#FFFFFF',top,width=512,height=72,size=63)
 add(plane_tex(X(.30)*B,X(.054),name),'BackName','Spine',(0,X(.316),-X(.127)*B))
 numback=text_tex(cfg['number'],'#FFFFFF',top,size=130)
 add(plane_tex(X(.20)*B,X(.14),numback),'BackNumber','Spine',(0,X(.19),-X(.129)*B))
 # Upper chest at .735 to .835 H (relative y from spine)
 empty('Neck','Spine',(0,X(.445),0))
 sphere('NeckSkin','Neck',(0,X(.018),0),(X(.071),X(.085),X(.068)),skin)
 empty('Head','Neck',(0,X(.125),0))
 sphere('Skull','Head',(0,X(.022),0),(X(.105),X(.134),X(.094)),skin,sub=3)
 # ears
 for sign,label in [(-1,'Left'),(1,'Right')]:
  sphere(label+'Ear','Head',(sign*X(.108),X(.010),0),(X(.022),X(.034),X(.016)),skin)
 # features facing +Z
 for sign,label in [(-1,'Left'),(1,'Right')]:
  sphere(label+'Eye','Head',(sign*X(.037),X(.052),X(.085)),(X(.012),X(.008),X(.004)),'#2C2020')
  sphere(label+'Eyebrow','Head',(sign*X(.037),X(.072),X(.085)),(X(.025),X(.005),X(.004)),'#251914')
 sphere('Nose','Head',(0,X(.011),X(.104)),(X(.018),X(.036),X(.021)),skin)
 sphere('Mouth','Head',(0,-X(.047),X(.084)),(X(.032),X(.005),X(.005)),'#643B32')
 if cfg['hair']=='buzz':
  sphere('BuzzHair','Head',(0,X(.112),-X(.004)),(X(.103),X(.044),X(.092)),'#1D1717')
 if cfg['hair']=='curls':
  sphere('HairBase','Head',(0,X(.105),-X(.004)),(X(.106),X(.045),X(.095)),'#201A17')
  for i in range(17):
   a=2*math.pi*i/17;x=math.cos(a)*X(.073);z=math.sin(a)*X(.064)
   sphere('Curl%02d'%i,'Head',(x,X(.124)+X(.008)*(i%3),z),(X(.034),X(.029),X(.032)),'#1E1815')
 if cfg['face']=='beard':
  sphere('FullBeard','Head',(0,-X(.050),X(.039)),(X(.076),X(.062),X(.064)),'#201A17')
  sphere('ChinSkin','Head',(0,-X(.042),X(.093)),(X(.047),X(.023),X(.012)),skin)
 elif cfg['face']=='goatee':
  sphere('Goatee','Head',(0,-X(.081),X(.064)),(X(.037),X(.026),X(.039)),'#261B18')
 # arms attached to shoulders; each part is independent for procedural posing
 upper=X(.312);fore=X(.265)
 shoulder_y=X(.368); shoulder_x=X(.225)*B
 for side,sign in [('L',-1),('R',1)]:
  empty(side+'_Shoulder','Spine',(sign*shoulder_x,shoulder_y,0))
  sphere(side+'_Deltoid',side+'_Shoulder',(sign*X(.027),-X(.040),0),(X(.096)*B,X(.117),X(.097)*B),skin)
  sphere(side+'_UpperArm',side+'_Shoulder',(sign*X(.025),-upper*.50,0),(X(.068)*B,upper*.55,X(.070)*B),skin)
  empty(side+'_Elbow',side+'_Shoulder',(sign*X(.025),-upper,0))
  sphere(side+'_ElbowSkin',side+'_Elbow',(0,0,0),(X(.058)*B,X(.057),X(.062)*B),skin)
  sphere(side+'_Forearm',side+'_Elbow',(0,-fore*.5,0),(X(.051)*B,fore*.54,X(.055)*B),skin)
  empty(side+'_Wrist',side+'_Elbow',(0,-fore,0))
  sphere(side+'_Hand',side+'_Wrist',(0,-X(.073),0),(X(.052)*B,X(.081),X(.039)),skin)
  for finger in range(4):
   sphere(side+f'_Finger{finger}',''+side+'_Wrist',((finger-1.5)*X(.020),-X(.134),X(.023)),(X(.011),X(.039),X(.015)),skin)
 # Ensure ground contact and exact height of mesh; scale scene as a whole if needed
 bounds=scene.bounds
 actual_height=bounds[1][1]-bounds[0][1]
 scale_factor=H/actual_height
 mat=np.diag([scale_factor,scale_factor,scale_factor,1.0])
 mat[1,3]=-bounds[0][1]*scale_factor
 scene.graph.update(frame_to="AvatarRoot",frame_from="world",matrix=mat)
 corrected_bounds=scene.bounds
 # Geometry dimensions define simple representative avatar, not true body scan.
 # Add metadata with measured player height even if posed geometry slightly varies.
 scene.metadata={'player':cfg['name'],'height_m':H,'jersey_number':cfg['number'],'prototype':'Original stylized game proxy; not a likeness scan','forward_axis':'+Z','up_axis':'+Y'}
 filename=OUT/(cfg['id']+'.glb')
 filename.write_bytes(scene.export(file_type='glb'))
 print(cfg['name'], 'desired',H,'observed',actual_height,'bounds',bounds[:,1].tolist(),'size KB',round(filename.stat().st_size/1024))
 return {'id':cfg['id'],'name':cfg['name'],'height_m':H,'prototype_mesh_height_m':round(corrected_bounds[1][1]-corrected_bounds[0][1],4),'weight_kg_reference':{'stephen_curry':91,'lebron_james':113,'michael_jordan':98}[cfg['id']],'jersey_number':cfg['number'],'file':filename.name}

profile=[build(x) for x in PEOPLE]
(OUT/'player_profiles.json').write_text(json.dumps({'units':'meters','type':'stylized prototypes','sources':{'heights':'NBA.com player profiles'},'players':profile},indent=2))
print('created')
