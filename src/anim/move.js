// HOOP LAB — locomotion, footwork, dribbling, jumping and landing (Movement Animation Engineer).
// Contract: HoopMove.install(Player) runs once at load (below) and may replace/extend
// HoopPlayer.Player.prototype methods that the Movement role owns (see docs/TEAM.md):
// updateFeet, replantFeet, updateBallCarry, crossover, stepback, jump, giveBall, and the
// non-shot parts of the pose. The shooting methods belong to the Shooting Animation role.
const HoopMove = (() => {
  'use strict';
  function install(Player) {
    const P=Player.prototype, update=P.update, carry=P.updateBallCarry, pose=P.computePose, jump=P.jump;
    const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
    const badge=(p,id)=>typeof HoopProfiles!=='undefined'?HoopProfiles.effect(p.def,id):0;
    P.jump=function(){if((this.jumpRecover||0)>0)return false;return jump.call(this);};
    P.handle=function(kind='between') {
      if(!this.hasBall || this.busy())return false;
      if(!['behind','between','hesitation'].includes(kind))return false;
      this.handleState={kind,dur:kind==='hesitation'?.66:.48,to:kind==='hesitation'?this.dribbleHand:1-this.dribbleHand,from:this.ballPos.clone(),bounced:false};
      this.stamina=Math.max(0,(this.stamina??100)-3*(1-badge(this,'handle')*.12));this.action='handle';this.actionT=0;this.dribbling=true;return true;
    };
    P.dunk=function() {
      const H=HoopPhysics.HOOPS[this.targetHoop],dist=Math.hypot(H.cx-this.x,H.cz-this.z);
      if(!this.hasBall || this.busy() || dist>2.45 || dist<.18)return false;
      if(typeof HoopGame!=='undefined'&&HoopGame.G.match&&!HoopMatch.canDunk(HoopGame.G,this))return false;
      const dx=(H.cx-this.x)/dist,dz=(H.cz-this.z)/dist;
      this.dunkState={t:0,fromX:this.x,fromZ:this.z,toX:H.cx-dx*.36,toZ:H.cz-dz*.36,dx,dz,release:false,kind:this.def.style.dunk,
        lift:Math.max(.55,HoopPhysics.K.RIM_TOP+.20-this.dims.shoulderY-this.dims.armLen-this.dims.palm)+badge(this,'finish')*.009};
      this.action='dunk';this.actionT=0;this.vx=this.vz=0;this.dribbling=false;this.shot=null;
      this.air=false;this.airY=0;this.airVy=0;this.yaw=Math.atan2(dx,dz);this.replantFeet();return true;
    };
    P.updateBallCarry=function(dt,now) {
      if(this.action!=='handle')return carry.call(this,dt,now);
      const h=this.handleState,t=Math.min(1,this.actionT/h.dur),side=h.to===0?1:-1,f=this.fwd(this.yaw),r=this.right(this.yaw),root=new THREE.Vector3(this.x,0,this.z),top=this.mv.dribbleTop*this.hs;
      const finish=root.clone().addScaledVector(r,side*.31*this.hs).addScaledVector(f,.28*this.hs);finish.y=top;
      const floor=root.clone().addScaledVector(f,h.kind==='behind'?-.28:h.kind==='between'?0:.35);floor.y=HoopPhysics.K.BALL_R;
      if(h.kind==='hesitation') {const hold=root.clone().addScaledVector(r,(this.dribbleHand===0?1:-1)*.32*this.hs).addScaledVector(f,.3);hold.y=top+.10;
        if(t<.4)this.ballPos.lerpVectors(h.from,hold,smooth(t/.4));else if(t<.7)this.ballPos.lerpVectors(hold,floor,smooth((t-.4)/.3));else this.ballPos.lerpVectors(floor,finish,smooth((t-.7)/.3));
      }else if(t<.46)this.ballPos.lerpVectors(h.from,floor,smooth(t/.46));else this.ballPos.lerpVectors(floor,finish,smooth((t-.46)/.54));
      if(t>=.46&&!h.bounced){h.bounced=true;this.emit('dribble',{v:5});}this.ballSpin.set(0,0,0);
    };
    P.update=function(dt,input,now) {
      this.jumpRecover=Math.max(0,(this.jumpRecover||0)-dt);this.stamina??=100;
      const fatigue=input&&input.sprint&&this.speed()>3 ? -(4-badge(this,'motor')*.45) : 3+badge(this,'motor')*.4;
      this.stamina=Math.max(0,Math.min(100,this.stamina+fatigue*dt));
      const controlled=input?{...input}:null;if(controlled&&this.stamina<15)controlled.sprint=false;
      if(this.action!=='dunk') {const wasAir=this.air,out=update.call(this,dt,controlled,now);if(wasAir&&!this.air)this.jumpRecover=.30-badge(this,'pogo')*.045;if(this.action==='handle'&&this.actionT>=this.handleState.dur){this.dribbleHand=this.handleState.to;this.action='none';this.dribblePhase=.01;this.handleState=null;}return out;}
      const d=this.dunkState,K=HoopPhysics.K;
      if(!d){this.air=false;this.airY=this.airVy=0;this.action='none';this.replantFeet();return update.call(this,dt,controlled,now);}
      this.events.length=0;this.time=now;d.t+=dt;this.actionT=d.t;
      const travel=smooth(d.t/.62);this.x=d.fromX+(d.toX-d.fromX)*travel;this.z=d.fromZ+(d.toZ-d.fromZ)*travel;
      this.air=d.t>=.14&&d.t<1.12;
      this.airY=this.air?d.lift*Math.sin(Math.PI*Math.max(0,Math.min(1,(d.t-.14)/.98))):0;
      if(this.air)for(const foot of this.feet){foot.planted=false;foot.swinging=false;foot.heel=0;}
      const H=HoopPhysics.HOOPS[this.targetHoop],up=smooth(d.t/.6),from=new THREE.Vector3(this.x,this.dims.hipsY+.16+this.airY,this.z).addScaledVector(this.fwd(this.yaw),.30);
      const aim=new THREE.Vector3(H.cx,K.RIM_TOP+.22,H.cz);this.ballPos.lerpVectors(from,aim,up);
      if(d.t>=.63&&!d.release){d.release=true;this.ballPos.copy(aim);this.emit('dunkRelease',{kind:d.kind});}
      if(d.t>=1.12){this.air=false;this.airY=this.airVy=0;this.action='none';this.actionT=0;this.dunkState=null;this.reaching=false;this.reachTarget=null;this.sm.handInit=false;this.replantFeet();this.emit('land',{v:5});}
      return this.events;
    };
    P.computePose=function(dt) {
      pose.call(this,dt);
      const P=this.pose,f=this.fwd(this.yaw),r=this.right(this.yaw),u=new THREE.Vector3(0,1,0);
      for(let i=0;i<2;i++)P.hands[i].grip=this.hasBall ? (this.shot ? (this.shot.released?.05:.68) : this.dribbling?.20:.68) : .12;
      if(this.action==='handle'){P.pelvis.y-=Math.sin(this.actionT/this.handleState.dur*Math.PI)*.07*this.hs;}
      if(this.defending&&this.action!=='jump') {
        P.pelvis.y-=.09*this.hs;
        for(let i=0;i<2;i++){const h=P.hands[i],side=i===0?1:-1;h.wrist.set(this.x,this.dims.shoulderY-.15,this.z).addScaledVector(f,.4).addScaledVector(r,side*.37);h.palm.copy(f);h.fingers.copy(u);h.pole.copy(r).multiplyScalar(side);}
      }
      if(this.action!=='dunk'||!this.dunkState)return;
      const d=this.dunkState,K=HoopPhysics.K,H=HoopPhysics.HOOPS[this.targetHoop],g=smooth(d.t/.6);
      for(let i=0;i<2;i++){
        const h=P.hands[i],side=i===0?1:-1;
        if(i===0||d.kind==='twohand')h.wrist.copy(this.ballPos).addScaledVector(r,side*(d.kind==='twohand'?.10:.025)).addScaledVector(u,-.15);
        else h.wrist.set(this.x,this.dims.shoulderY+this.airY-.20,this.z).addScaledVector(r,-.35).addScaledVector(f,-.10);
        if(d.kind==='tomahawk'&&i===0&&d.t<.48)h.wrist.addScaledVector(f,-.3*Math.sin(d.t/.48*Math.PI));
        if(d.release&&d.t<.88&&(i===0||d.kind==='twohand'))h.wrist.set(H.cx,K.RIM_Y,H.cz).addScaledVector(r,side*.10);
        h.fingers.copy(f).addScaledVector(u,-.65*g).normalize();h.palm.copy(u).negate();h.pole.copy(r).multiplyScalar(side).addScaledVector(f,-.3).normalize();
      }
      if(this.air)for(let i=0;i<2;i++){
        const foot=P.feet[i],tuck=Math.sin(Math.PI*Math.min(1,(d.t-.14)/.98));
        foot.ankle.set(this.x,this.dims.ankleY+this.airY+.10*tuck,this.z).addScaledVector(r,(i===0?1:-1)*.12*this.hs).addScaledVector(f,-.12*tuck);
        foot.pole.copy(f);foot.fwd.copy(f).addScaledVector(u,-.35*tuck).normalize();foot.up.copy(u).addScaledVector(f,.35*tuck).normalize();
      }
    };
  }
  install(HoopPlayer.Player);
  return { install };
})();
