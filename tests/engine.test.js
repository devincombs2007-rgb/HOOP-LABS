// Node integration with a DOM and real GLBs. No browser/GPU: rendering is mocked explicitly.
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'https://hoop.test',runScripts:'outside-only'}),w=dom.window;
w.console=console;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.requestAnimationFrame=()=>0;w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:t=>({width:String(t).length*20}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{}});
let pass=0;const check=(name,fn)=>{fn();pass++;console.log('PASS '+name);};
const context=dom.getInternalVMContext();
for(const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)){vm.runInContext(fs.readFileSync(path.join(root,m[1]),'utf8'),context);}
const get=code=>vm.runInContext(code,context),THREE=get('THREE'),game=get('HoopGame'),PH=get('HoopPhysics'),profiles=get('HoopProfiles');
THREE.TextureLoader.prototype.load=function(url,loaded){const t=new THREE.Texture();setTimeout(()=>loaded(t),0);return t;};
THREE.WebGLRenderer=class{constructor(){this.domElement=w.document.createElement('canvas');this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>1};}setPixelRatio(){}setSize(){}render(){}getDrawingBufferSize(v){return v.set(900,600);}};
const World=get('HoopWorld'),originalBuild=World.build;
World.build=(renderer,q)=>{const scene=new THREE.Scene(),nets=PH.HOOPS.map(h=>new World.Net(h,scene,new THREE.LineBasicMaterial()));
const line=()=>new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(4000),3)),new THREE.LineBasicMaterial());
return {scene,Q:World.QUALITY[q],nets,ballMeshes:Array.from({length:6},()=>{const m=new THREE.Mesh(new THREE.SphereGeometry(PH.K.BALL_R),new THREE.MeshStandardMaterial());scene.add(m);return m;}),blobs:[],spotRing:new THREE.Object3D(),trail:line(),guide:line(),releaseMarker:new THREE.Object3D(),reflect:null,updateBoard(){}};};
(async()=>{
get('HoopUI').init(game);await game.boot();const API=w.HOOP,G=game.G;API.setAuto(false);API.pause(false);API.setSetting('variance','off');API.setSetting('difficulty','pro');
check('All four real character files load; Devin measures eight feet',()=>{assert.equal(Object.keys(G.models).length,4);assert(Math.abs(G.models.devin.dims.height-2.4384)<.015);});
for(const id of ['curry','lebron','jordan','devin']){
 API.select(id);API.place(PH.K.HOOP_X-7.45,0);API.advance(.65);
 check(id+' has five articulated fingers per hand, three joints each',()=>{for(const h of G.player.model.hands){assert.equal(h.fingers.length,5);for(const f of h.fingers)assert.equal(f.joints.length,3);}});
 check(id+' perfect signature release scores through actual physics',()=>{assert(API.shoot(0));API.advance(4.5);assert(G.lastShot.made,JSON.stringify(API.state().lastShot));});
 API.render();check(id+' pose contains no non-finite joint positions',()=>{G.player.model.root.traverse(n=>{for(const value of [...n.position.toArray(),...n.quaternion.toArray()])assert(Number.isFinite(value),n.name);});});
}
check('Signature paths differ even at equal normalized shot phase',()=>{
 const paths=[];for(const id of ['curry','lebron','jordan']){API.select(id);API.place(PH.K.HOOP_X-5,0);API.advance(.6);G.player.startShot(G.now);paths.push(G.player.shot.keys.signature.map(k=>[k.t/G.player.shot.T,k.p.y-G.player.dims.headY]));G.player.placeAt(G.player.x,G.player.z,G.player.yaw);}
 assert.notDeepEqual(paths[0],paths[1]);assert.notDeepEqual(paths[1],paths[2]);
});
check('Trajectory line stays off even when requested or saved',()=>{API.setSetting('trail',true);API.setSetting('guide',true);assert.equal(G.settings.trail,false);assert.equal(G.settings.guide,false);API.render();assert.equal(G.W.trail.visible,false);assert.equal(G.W.guide.visible,false);});
for(const kind of ['behind','between','hesitation']){
 API.mode('free');API.select('curry');API.advance(.6);
 check(kind+' handle completes and preserves possession',()=>{assert(API.handle(kind));API.advance(.8);assert(G.player.hasBall);assert.equal(G.player.action,'none');});
}
API.select('jordan');API.mode('free');API.place(PH.K.HOOP_X-1.6,0);API.advance(.6);
check('A dunk uses actual ball scoring and triggers the net',()=>{assert(API.dunk());API.advance(.7);API.render();assert(G.lastShot.dunk);API.advance(1.5);assert(G.lastShot.made);assert.equal(G.W.nets[0].reaction,'dunk');});
for(const id of ['curry','lebron','jordan','devin']){
 check(id+' dunk rises with both feet, lands and restores movement',()=>{
  API.mode('free');API.select(id);API.place(PH.K.HOOP_X-1.6,0);API.advance(.6);
  const pl=G.player;assert(API.dunk());let highest=0,feetHigh=0;
  for(let i=0;i<180;i++){API.advance(1/120);API.render();highest=Math.max(highest,pl.pose.pelvis.y-pl.dims.hipsY);feetHigh=Math.max(feetHigh,Math.min(...pl.pose.feet.map(f=>f.ankle.y)));}
  assert(highest>.45,'Body must actually rise rather than squat: '+highest);
  assert(feetHigh>.35,'Both feet must leave the ground: '+feetHigh);
  assert.equal(pl.air,false);assert.equal(pl.airY,0);assert.equal(pl.dunkState,null);assert.notEqual(pl.action,'dunk');
  const x=pl.x,z=pl.z;for(let i=0;i<30;i++)pl.update(1/120,{mx:0,mz:1,sprint:false},G.now+i/120);
  assert(Math.hypot(pl.x-x,pl.z-z)>.1,'Movement must resume after landing');
  assert(G.lastShot&&G.lastShot.dunk&&G.lastShot.made);
 });
 check(id+' visible face and fingers match the body skin color',()=>{
  const model=G.models[id],neck=model.ranges.get('NeckSkin'),colors=neck.mesh.geometry.attributes.color,index=neck.range[0];
  const target=new THREE.Color().setRGB(colors.getX(index),colors.getY(index),colors.getZ(index));
  const head=model.head.group.getObjectByName('Cranium'),hand=model.hands[0].root.children.find(n=>n.isMesh);
  assert(head.material.color.distanceTo ? head.material.color.distanceTo(target)<1e-6 : head.material.color.equals(target),'Face must use the body’s linear skin color');
  assert(hand.material.color.equals(target),'Fingers must share the body’s linear skin color');
  assert.equal(head.material.roughness,neck.mesh.material.roughness);
 });
}
check('Net reactions produce different finite deformations',()=>{const samples=[];for(const kind of ['swish','rattle','dunk']){const net=new World.Net(PH.HOOPS[0],new THREE.Scene(),new THREE.LineBasicMaterial());net.react(kind,{vx:1,vy:-5,vz:.5});for(let i=0;i<40;i++)net.step(1/120,[]);samples.push([...net.p]);assert(samples.at(-1).every(Number.isFinite));}assert.notDeepEqual(samples[0],samples[1]);assert.notDeepEqual(samples[0],samples[2]);});
check('Planted feet keep their floor targets until an actual step begins',()=>{API.mode('free');API.select('curry');API.place(PH.K.HOOP_X-5,0);API.advance(1);const feet=G.player.feet.map(f=>f.pos.clone());API.advance(.2);for(let i=0;i<2;i++)assert(feet[i].distanceTo(G.player.feet[i].pos)<1e-5);});
check('All attributes/badges on experimental Devin are maxed',()=>{const d=get('HoopRoster.getCharacter("devin")');assert(Object.values(d.attributes).every(v=>v===99));assert(profiles.BADGES.every(b=>profiles.effect(d,b.id)===5));});
API.select('curry');API.mode('watch',{opponent:'jordan',coach:'balanced'});API.pause(false);
check('AI spectator match moves, shoots, scores and exchanges possessions',()=>{const start=G.shots.length;API.advance(65);API.render();assert(G.shots.length>start);assert(G.match.score.some(n=>n>0));const chars=new Set(G.shots.slice(start).map(s=>s.char));assert(chars.size>=2,[...chars].join(','));assert(G.models.curry.root.visible&&G.models.jordan.root.visible);});
check('Human 1v1 can change to defense and blocks manual AI ownership input',()=>{API.mode('one',{opponent:'lebron'});assert(!G.match.watch);const summary=get('HoopMatch').summary(G);assert.equal(summary.players.length,2);API.shoot(0);API.advance(6);assert.equal(G.player.def.id,'lebron');assert(get('HoopMatch').input(G,{type:'shootDown'}));});
check('A planted defender denies a straight-line dunk; an open lane allows it',()=>{
 API.mode('free');API.select('curry');API.mode('one',{opponent:'lebron'});API.pause(false);
 const off=G.player,def=G.players.lebron;off.placeAt(PH.K.HOOP_X-1.7,0,Math.PI/2);off.hasBall=true;off.targetHoop=0;
 def.placeAt(PH.K.HOOP_X-.6,0,-Math.PI/2);
 assert.equal(get('HoopMatch').canDunk(G,off),false);assert.equal(API.dunk(),false);
 def.placeAt(PH.K.HOOP_X-.6,2,-Math.PI/2);assert.equal(get('HoopMatch').canDunk(G,off),true);assert(API.dunk());
});
check('Body contact separates players and removes velocity through a defender',()=>{
 API.mode('one',{opponent:'lebron'});const off=G.player,def=G.players.lebron;off.x=5;off.z=0;off.vx=4;off.vz=0;off.airY=0;def.x=5.2;def.z=0;def.airY=0;
 get('HoopMatch').collideBodies(G);assert(Math.hypot(off.x-def.x,off.z-def.z)>=.68-1e-6);assert(Math.abs(off.vx)<1e-6);
});
check('An airborne rim defender can deflect a dunk instead of awarding points',()=>{
 const def=G.players.lebron;def.x=PH.K.HOOP_X-.2;def.z=0;def.air=true;def.airY=1.1;
 const rel={vx:0,vy:-4.6,vz:0};assert(get('HoopMatch').contestDunk(G,rel,new THREE.Vector3(PH.K.HOOP_X,3.27,0)));assert(rel.vy>0);assert(Math.hypot(rel.vx,rel.vz)>1);
});
check('Curry Casual green window spans touch-friendly timing and actually scores',()=>{
 API.mode('free');API.select('curry');API.setSetting('difficulty','casual');
 for(const e of [-65,-35,35,65]){API.mode('free');API.place(PH.K.HOOP_X-7.45,0);API.advance(.65);assert(API.shoot(e));assert(G.meter.hi-G.meter.lo>.15);API.advance(4);assert(G.lastShot.green);assert(G.lastShot.made,'Green release failed at '+e+'ms');}
});
check('Pro is more forgiving than Simulation while Simulation retains raw physics timing',()=>{
 const widths={};for(const level of ['casual','pro','sim']){API.mode('free');API.setSetting('difficulty',level);API.place(PH.K.HOOP_X-7.45,0);API.advance(.6);assert(API.shoot(0));widths[level]=G.meter.hi-G.meter.lo;API.advance(4);}
 assert(widths.casual>widths.pro);assert(widths.pro>widths.sim);API.setSetting('difficulty','pro');
});
check('Signature release extension and guide-hand recovery are visibly different',()=>{
 const defs=get('HoopRoster.CHARACTERS'),angles=[];
 for(const id of ['curry','lebron','jordan']){API.mode('free');API.select(id);API.advance(.6);assert(G.player.startShot(G.now));angles.push(G.player.shot.keys.alpha);G.player.placeAt(G.player.x,G.player.z,G.player.yaw);}
 assert(angles[2]-angles[0]>.30);assert(new Set(defs.slice(0,3).map(d=>d.style.guideDrop)).size===3);
});
check('Restarting a drill abandons old flight and clears held input',()=>{API.mode('free');API.advance(.6);API.shoot(0);API.advance(.2);API.mode('three');assert.equal(G.shotInput,null);assert(!G.player.shot);assert(G.player.hasBall);assert.equal(G.lastShot,null);});
check('Graphics quality changes rebuild the world once and preserve models',()=>{const old=G.W;API.setSetting('quality','medium');assert.notEqual(old,G.W);assert.equal(G.W.Q,World.QUALITY.medium);assert(G.models.curry.root.parent===G.W.scene);});
check('Jump Shot Creator can apply a preset, edit all sixteen parameters and discard drafts',()=>{
 const jsc=get('HoopJSC');jsc.open(()=>{});assert.equal(w.document.querySelectorAll('#jsc [data-param]').length,16);
 const select=w.document.querySelector('#jsc-preset');select.value='mine';select.dispatchEvent(new w.Event('change'));
 w.document.querySelector('#jsc-apply').click();assert.equal(G.jumpers[G.def.id].presetId,'mine');
 const old=G.player.jumper.arc,input=w.document.querySelector('#jsc [data-param="arc"]');input.value='.01';input.dispatchEvent(new w.Event('input'));jsc.close();assert.equal(G.player.jumper.arc,old);
});
check('Profiles expose the exact requested badge tier colors',()=>{assert.equal(profiles.TIERS[1].name,'Bronze');assert.equal(profiles.TIERS[4].color,'#A467ED');assert.equal(profiles.TIERS[5].color,'#E74E4E');profiles.open(get('HoopRoster.getCharacter("devin")'),w.document.querySelector('#profile'),()=>{});assert.equal(w.document.querySelectorAll('#profile .badge-item').length,10);});
console.log(`\n${pass} Node integration checks passed (DOM, GLBs, physics, animations and AI; no real GPU/browser).`);dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exit(1);});
