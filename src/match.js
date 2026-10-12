// Half-court 1v1, alternating possessions. Bots use the same animations and shot physics.
const HoopMatch=(()=>{
'use strict';let game;const K=HoopPhysics.K,rng=HoopShot.makeRng(0xBA5C),random=()=>Math.max(0,Math.min(.999,(rng()+3)/6));
const inputs=new Set(['shootDown','shootUp','cross','stepback','ball','behind','between','hesitation','handle','dunk']);
function init(g){game=g;g.on('release',()=>{const m=g.G.match;if(m){m.waiting=true;m.clock=14;}});g.on('shotResult',tr=>{
 const G=g.G,m=G.match;if(!m||m.done)return;const owner=m.ids.indexOf(tr.char);if(owner<0)return;
 if(tr.made)m.score[owner]+=tr.three?2:1;
 if(m.score[owner]>=11&&m.score[owner]-m.score[1-owner]>=2){m.done=true;G.mode.done=true;m.restartAt=m.watch?G.now+6:null;
 g.emit('modeDone',{title:`${HoopRoster.getCharacter(m.ids[owner]).short} wins`,lines:[`${m.score[0]} – ${m.score[1]}`,m.watch?'Next AI game starts in 6 seconds.':'First to 11, win by two.']});
 }else{m.switchAt=G.now+1.25;m.next=1-owner;}
 });}
function start(g,watch,cfg={}){game=g;const G=g.G,human=G.def.id,opp=HoopRoster.CHARACTERS.find(c=>c.id===cfg.opponent&&c.id!==human)||HoopRoster.CHARACTERS.find(c=>c.id!==human);
 const m=G.match={ids:[human,opp.id],human,watch,owner:0,score:[0,0],clock:14,waiting:false,done:false,previousCamera:G.rig.mode,elapsed:0,decision:0,handleAt:1.2,stealAt:0,coach:cfg.coach||'balanced',chemistry:50};
 for(const id of m.ids){const def=HoopRoster.getCharacter(id);let pl=G.players[id];if(!pl)pl=G.players[id]=new HoopPlayer.Player(G.models[id],def);
 const j=G.jumpers[id]||{presetId:'sig',params:HoopRoster.cloneParams(def.sig.params)};G.jumpers[id]=j;pl.setJumper(j.params,HoopShot.derive(j.params,def));}
 G.mode.hud=()=>({title:watch?'AI vs AI · Spectator':'1v1 · First to 11',main:`${HoopRoster.getCharacter(m.ids[0]).short} ${m.score[0]} : ${m.score[1]} ${HoopRoster.getCharacter(m.ids[1]).short}`,sub:m.done?'Final':`${HoopRoster.getCharacter(m.ids[m.owner]).short} has the ball · ${watch?m.coach:m.ids[m.owner]===m.human?'You: attack':'You: defend · Shoot contest / Cross steal'}`,timer:m.waiting?null:m.clock});
 G.mode.canShoot=()=>!m.done&&!m.waiting;if(watch)G.rig.setMode('broadcast');possession(G,0);}
function stop(G){const m=G.match;if(!m)return;G.match=null;for(const id of m.ids)G.players[id].defending=false;G.rig.setMode(m.previousCamera);game.selectCharacter(m.human);}
function possession(G,owner){const m=G.match;game.resetCourt();m.owner=owner;m.waiting=false;m.switchAt=null;m.clock=14;m.elapsed=0;m.decision=0;m.handleAt=.9;
 for(const id of m.ids){G.players[id].hasBall=false;G.players[id].defending=id!==m.ids[owner];}
 game.selectCharacter(m.ids[owner]);const off=G.player,def=G.players[m.ids[1-owner]];
 off.placeAt(K.HOOP_X-7.7,owner===0?-1.2:1.2,Math.PI/2);off.targetHoop=0;off.hasBall=true;off.defending=false;off.stamina=100;
 def.placeAt(K.HOOP_X-6,off.z,-Math.PI/2);def.targetHoop=0;def.defending=true;def.stamina=100;
 off.ballPos.set(off.x,off.dims.hipsY+.15,off.z);for(const id in G.models)G.models[id].root.visible=m.ids.includes(id);G.rig.snapNext();}
function beforeTick(dt,G,mv){let m=G.match;if(!m)return;
 if(m.restartAt&&G.now>=m.restartAt){game.emit('matchRestart');game.startMode('watch',{opponent:m.ids[1],coach:m.coach});m=G.match;}
 if(m.switchAt&&G.now>=m.switchAt)possession(G,m.next);
 const off=G.player,def=G.players[m.ids[1-m.owner]];off.targetHoop=0;m.elapsed+=dt;
 if(m.done||m.waiting){mv.mx=mv.mz=0;mv.sprint=false;return;}
 m.clock=Math.max(0,m.clock-dt);
 if(m.clock===0&&!off.shot&&off.action!=='dunk'){m.waiting=true;m.next=1-m.owner;m.switchAt=G.now+.6;game.emit('toast',{text:'Shot clock · turnover',tone:'info'});return;}
 if(m.watch||off.def.id!==m.human){
  const tendency=off.def.tendencies||{drive:50,three:50},driveChance=Math.max(.05,Math.min(.8,tendency.drive/(tendency.drive+(tendency.mid||50)+(tendency.three||50))+(m.coach==='rim'?.15:m.coach==='spacing'?-.15:0)));
  if(m.decision<=m.elapsed){const drive=random()<driveChance,three=random()<tendency.three/(tendency.three+tendency.mid),dist=drive?1.65:three?7.45+random()*1.2:3.8+random()*2.1;
   const a=(random()-.5)*1.45;m.destination={x:K.HOOP_X-Math.cos(a)*dist,z:Math.sin(a)*dist};m.decision=m.elapsed+3.3;}
  const t=m.destination,dx=t.x-off.x,dz=t.z-off.z,d=Math.hypot(dx,dz);mv.mx=d>.18?dx/d:0;mv.mz=d>.18?dz/d:0;mv.sprint=off.def.id==='lebron'&&d>2;
  if(!off.busy()&&off.hasBall){if(HoopPhysics.distToHoop(off.x,off.z,0)<2.3&&off.dunk())return;
   if(m.elapsed>=m.handleAt&&d>.8){off.handle(['between','behind','hesitation'][Math.floor(random()*3)]);m.handleAt=m.elapsed+2.3;}
   if((d<.4&&off.speed()<.7&&m.elapsed>1.6)||m.clock<2){const a=off.def.attributes||{},accuracy=HoopPhysics.isThree(off.x,off.z,0)?a.three:a.mid;
    const badge=typeof HoopProfiles!=='undefined'?HoopProfiles.effect(off.def,'rhythm'):0;
    game.api.shoot(rng()*(36-(accuracy||80)*.09)*(1-badge*.035));mv.mx=mv.mz=0;}}
 }
 const dx=off.x-def.x,dz=off.z-def.z,d=Math.hypot(dx,dz);if(d<.66&&!off.air&&!off.shot&&off.action!=='dunk'){const n=d||1;off.x+=dx/n*(.66-d)*.5;off.z+=dz/n*(.66-d)*.5;}
 off.x=Math.max(K.HOOP_X-K.COURT_HALF_L,Math.min(K.HOOP_X+.5,off.x));off.z=Math.max(-K.COURT_HALF_W+.4,Math.min(K.COURT_HALF_W-.4,off.z));
}
function afterTick(dt,G,h){const m=G.match;if(!m)return;const off=G.player,def=G.players[m.ids[1-m.owner]];let mx=0,mz=0;
 if(!m.watch&&def.def.id===m.human){const cy=G.rig.yaw;mx=Math.sin(cy)*h.y-Math.cos(cy)*h.x;mz=Math.cos(cy)*h.y+Math.sin(cy)*h.x;}
 else{const dx=K.HOOP_X-off.x,dz=-off.z,d=Math.hypot(dx,dz)||1,spacing=d<3?.72:m.coach==='defense'?.85:1.10,ex=off.x+dx/d*spacing+off.vx*.13-def.x,ez=off.z+dz/d*spacing+off.vz*.13-def.z,err=Math.hypot(ex,ez);
  if(err>.18){const boost=1+(typeof HoopProfiles!=='undefined'?HoopProfiles.effect(def.def,'anchor')*.06:0);mx=ex/err*Math.min(1,err*boost);mz=ez/err*Math.min(1,err*boost);}
  if(((off.shot&&!off.shot.released&&off.shot.t>off.shot.T*.48)||off.action==='dunk')&&Math.hypot(off.x-def.x,off.z-def.z)<2)def.jump();}
 def.update(dt,{mx,mz,sprint:false,walk:false,freeLook:true},G.now);if(!def.air)def.yaw=Math.atan2(off.x-def.x,off.z-def.z);
 def.x=Math.max(K.HOOP_X-K.COURT_HALF_L,Math.min(K.HOOP_X+.5,def.x));def.z=Math.max(-K.COURT_HALF_W+.4,Math.min(K.COURT_HALF_W-.4,def.z));collideBodies(G);}
function defender(G){const m=G.match;return G.players[m.ids[1-m.owner]];}
function canDunk(G,off){
 const def=defender(G),H=HoopPhysics.HOOPS[off.targetHoop],dx=H.cx-off.x,dz=H.cz-off.z,length=dx*dx+dz*dz;
 const t=Math.max(0,Math.min(1,((def.x-off.x)*dx+(def.z-off.z)*dz)/(length||1)));
 return !(t>.05&&t<.98&&Math.hypot(def.x-(off.x+t*dx),def.z-(off.z+t*dz))<.60+def.dims.shoulderHalf*.25);
}
function collideBodies(G){
 const off=G.player,def=defender(G);if(Math.abs(off.airY-def.airY)>.65)return;
 let dx=off.x-def.x,dz=off.z-def.z,d=Math.hypot(dx,dz);const radius=Math.max(.68,(off.dims.shoulderHalf+def.dims.shoulderHalf)*1.4);
 if(d>=radius)return;if(d<1e-5){dx=-1;dz=0;d=1;}
 const nx=dx/d,nz=dz/d,penetration=radius-Math.hypot(off.x-def.x,off.z-def.z),weight=def.def.massKg/(off.def.massKg+def.def.massKg);
 off.x+=nx*penetration*weight;off.z+=nz*penetration*weight;def.x-=nx*penetration*(1-weight);def.z-=nz*penetration*(1-weight);
 const inward=off.vx*nx+off.vz*nz;if(inward<0){off.vx-=inward*nx;off.vz-=inward*nz;}
}
function contestStrength(G){
 const off=G.player,def=defender(G),d=Math.hypot(off.x-def.x,off.z-def.z),rating=HoopPhysics.distToHoop(off.x,off.z,0)<3?def.def.attributes.interior:def.def.attributes.perimeter;
 return Math.max(0,Math.min(1,(1-d/1.9)*(rating/99)*(def.air?1.5:.85)));
}
function contest(G,rel,pos){
 const off=G.player,def=defender(G),d=Math.hypot(off.x-def.x,off.z-def.z);if(d>1.9)return;
 const reach=def.dims.shoulderY+def.dims.armLen+def.airY;
 if(def.air&&d<1.1&&reach>pos.y-.08){rel.vy*=.2;rel.vx*=.65;rel.vz*=.65;game.emit('toast',{text:'Blocked!',tone:'bad'});}
 else {const badge=typeof HoopProfiles!=='undefined'?HoopProfiles.effect(off.def,'focus'):0,strength=contestStrength(G),angle=rng()*(.008+strength*.11)*(1-badge*.06),c=Math.cos(angle),s=Math.sin(angle),vx=rel.vx;rel.vx=vx*c-rel.vz*s;rel.vz=vx*s+rel.vz*c;}
}
function contestDunk(G,rel,pos){
 const def=defender(G),H=HoopPhysics.HOOPS[G.player.targetHoop];
 if(!def.air||Math.hypot(def.x-H.cx,def.z-H.cz)>1.15||def.dims.shoulderY+def.dims.armLen+def.airY<K.RIM_Y-.08)return false;
 const dx=G.player.x-H.cx,dz=G.player.z-H.cz,d=Math.hypot(dx,dz)||1;rel.vx=dx/d*4;rel.vy=2;rel.vz=dz/d*4;rel.speed=Math.hypot(rel.vx,rel.vy,rel.vz);rel.angle=Math.atan2(rel.vy,Math.hypot(rel.vx,rel.vz));game.emit('toast',{text:'Dunk blocked!',tone:'bad'});return true;
}
function input(G,ev){const m=G.match;if(!m||!inputs.has(ev.type))return false;if(G.paused||m.watch||m.done||m.waiting)return true;if(G.player.def.id===m.human)return false;
 const human=G.players[m.human];if(ev.type==='shootDown')human.jump();
 if(ev.type==='cross'&&G.now>m.stealAt){m.stealAt=G.now+.9;const off=G.player,d=Math.hypot(off.x-human.x,off.z-human.z);
  if(d<.9&&off.dribbling&&!off.shot&&off.action!=='dunk'&&off.ballPos.y<.6+(typeof HoopProfiles!=='undefined'?HoopProfiles.effect(human.def,'glove')*.025:0)){m.waiting=true;m.next=m.ids.indexOf(m.human);m.switchAt=G.now+.35;game.emit('toast',{text:'Steal!',tone:'good'});}else game.emit('toast',{text:'Reach missed',tone:'info'});}return true;}
function render(dt,G){const m=G.match,def=G.players[m.ids[1-m.owner]];def.computePose(dt);HoopCharacters.applyPose(def.model,def.pose);HoopCharacters.update(def.model,dt,def.pose);}
function summary(G){const m=G.match;return {players:m.ids.slice(),score:m.score.slice(),owner:m.ids[m.owner],watch:m.watch,clock:m.clock,done:m.done,coach:m.coach,chemistry:m.chemistry};}
return {init,start,stop,beforeTick,afterTick,input,contest,contestDunk,contestStrength,canDunk,collideBodies,render,summary};})();
