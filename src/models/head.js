// HOOP LAB — heads, faces and hair (Face & Texture Specialist).
// Contract: HoopHead.attach(model, def) is called by CharacterModel after the body is built.
// It adds head/face/hair/beard geometry under model.nodes.Head (head-local frame: +Y up, +Z forward,
// origin at the Head pivot, meters), may hide the placeholder head parts, and returns an object with
// optional update(dt, pose) (blinks, eye focus) that HoopCharacters.update() calls every frame.
// Return null to keep the original head.
const HoopHead = (() => {
  'use strict';
  function attach(model, def) {
    const head=model.nodes.Head, hs=def.heightM/1.9812/model.dims.scale;
    // Replace the merged proxy head; keep the existing articulated Head pivot.
    for(const child of head.children) child.visible=false;
    const group=new THREE.Group();group.name='DetailedHead';head.add(group);
    const looks={curry:{skin:'#B98160',w:.096,jaw:.080,nose:.016,hair:'curls',beard:'short'},lebron:{skin:'#89543B',w:.109,jaw:.095,nose:.024,hair:'cropped',beard:'full'},jordan:{skin:'#986143',w:.100,jaw:.087,nose:.020,hair:'bald',beard:'moustache'},devin:{skin:'#BD987F',w:.100,jaw:.087,nose:.018,hair:'curls',beard:'short'}};
    const look=looks[def.id],skin=model.skinMaterial;
    const color=hex=>new THREE.Color(hex).convertSRGBToLinear();
    const hair=new THREE.MeshStandardMaterial({color:color('#211B18'),roughness:.94});
    const eye=new THREE.MeshStandardMaterial({color:color('#241B17'),roughness:.72}),white=new THREE.MeshStandardMaterial({color:color('#BDB6AC'),roughness:.65});
    const sphere=new THREE.SphereGeometry(1,24,18);
    const orb=(name,x,y,z,sx,sy,sz,mat)=>{const m=new THREE.Mesh(sphere,mat);m.name=name;m.position.set(x*hs,y*hs,z*hs);m.scale.set(sx*hs,sy*hs,sz*hs);group.add(m);return m;};
    orb('Cranium',0,.025,-.004,look.w,.126,.091,skin);
    orb('Jaw',0,-.054,.018,look.jaw,.065,.075,skin);
    orb('Chin',0,-.097,.043,look.jaw*.52,.025,.048,skin);
    orb('NoseBridge',0,.025,.085,look.nose*.68,.037,.022,skin);
    orb('NoseTip',0,-.006,.108,look.nose,.014,.015,skin);
    for(const sign of [-1,1]) {
      orb('Ear',sign*(look.w+.005),.014,-.005,.018,.031,.013,skin);
      orb('Cheek',sign*.052,-.022,.052,.032,.028,.014,skin);
      orb('EyeWhite',sign*.038,.047,.080,.012,.006,.0035,white);
      orb('Iris',sign*.038,.046,.084,.006,.0055,.0015,eye);
      orb('UpperLid',sign*.038,.054,.082,.017,.004,.006,skin);
      const brow=orb('Brow',sign*.038,.070,.079,.026,.004,.007,hair);brow.rotation.z=sign*.07;
      if(look.beard==='full') orb('SideBeard',sign*.070,-.043,.037,.023,.046,.043,hair);
    }
    const lip=new THREE.MeshStandardMaterial({color:model.skinColor.clone().multiplyScalar(.68),roughness:.75});
    orb('UpperLip',0,-.050,.087,.031,.0045,.007,lip);orb('LowerLip',0,-.058,.087,.029,.005,.006,lip);
    if(look.beard==='full') {orb('ChinBeard',0,-.096,.035,.067,.032,.046,hair);orb('Moustache',0,-.038,.089,.034,.007,.007,hair);}
    if(look.beard==='short') {orb('Goatee',0,-.095,.063,.032,.019,.026,hair);orb('Moustache',0,-.039,.088,.030,.006,.008,hair);}
    if(look.beard==='moustache') orb('Moustache',0,-.039,.088,.029,.005,.006,hair);
    if(look.hair==='cropped') orb('ShortHair',0,.116,-.012,.098,.028,.083,hair);
    if(look.hair==='curls') {
      const curls=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),hair,54), matrix=new THREE.Matrix4();
      for(let i=0;i<54;i++){const ring=Math.floor(i/18),a=(i%18)*Math.PI*2/18+.17*ring,r=.070-.020*ring;matrix.compose(new THREE.Vector3(Math.cos(a)*r*hs,(.128+ring*.009)*hs,Math.sin(a)*r*.88*hs),new THREE.Quaternion(),new THREE.Vector3(.018*hs,.019*hs,.018*hs));curls.setMatrixAt(i,matrix);}
      curls.name='ShortCurls';group.add(curls);
    }
    group.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    return {group,update(){}};
  }
  return { attach };
})();
