// Original HOOP LAB ratings. Season statistics are sourced; ratings/tendencies are design estimates.
const HoopProfiles=(()=>{
'use strict';
const TIERS=[{name:'None',color:'#536277'},{name:'Bronze',color:'#98622F'},{name:'Silver',color:'#C1C8D0'},{name:'Gold',color:'#E5BC40'},{name:'Hall of Fame',color:'#A467ED'},{name:'Legend',color:'#E74E4E'}];
const BADGES=[
{id:'rhythm',name:'Rhythm Engine',desc:'Reduces AI release variance and helps preserve timing consistency.'},
{id:'range',name:'Beyond the Arc',desc:'Adds a small amount of comfortable shooting range without changing ball gravity.'},
{id:'handle',name:'Floor Magician',desc:'Reduces stamina cost of dribble combinations.'},
{id:'focus',name:'Unshaken',desc:'Reduces the directional error caused by a nearby contest; cannot erase a physical block.'},
{id:'finish',name:'Rim Authority',desc:'Raises finishing jump capacity during dunk gathers.'},
{id:'pogo',name:'Second Spring',desc:'Shortens the grounded recovery before another defensive jump.'},
{id:'motor',name:'Endless Motor',desc:'Reduces sprint fatigue and restores stamina while resting.'},
{id:'anchor',name:'Paint Sentinel',desc:'Improves AI defensive closing speed and recovery.'},
{id:'glove',name:'Clean Swipe',desc:'Extends the small valid timing window for a well-positioned steal.'},
{id:'fade',name:'Air Sculptor',desc:'Preserves moving-shot compensation when the shooter is off balance.'}
];
const NAMES={close:'Close shot',mid:'Midrange',three:'Three-point',free:'Free throw',dunk:'Dunk',handle:'Ball handle',pass:'Passing',speed:'Speed',accel:'Acceleration',strength:'Strength',vertical:'Vertical',stamina:'Stamina',perimeter:'Perimeter defense',interior:'Interior defense',steal:'Steal',block:'Block',rebound:'Rebound',iq:'Basketball IQ'};
const DATA={
curry:{season:'2015–16',stats:{ppg:30.1,rpg:5.4,apg:6.7,fg:.504,three:.454,ft:.908},source:'https://pr.nba.com/stephen-curry-2015-16-kia-nba-mvp-award-warriors/',
 attributes:{close:91,mid:94,three:99,free:97,dunk:35,handle:98,pass:92,speed:88,accel:96,strength:57,vertical:70,stamina:98,perimeter:74,interior:38,steal:84,block:30,rebound:57,iq:99},
 tendencies:{three:99,mid:45,drive:20,dunk:3,dribble:90,pass:78,shotTaking:96},personality:{style:'Creative scoring engine',selfCreation:88,teamwork:90,composure:97},badges:{rhythm:5,range:5,handle:5,focus:4,finish:1,pogo:1,motor:5,anchor:1,glove:3,fade:3}},
lebron:{season:'2012–13',stats:{ppg:26.8,rpg:8,apg:7.3,fg:.565,three:.406,ft:.753},source:'https://pr.nba.com/lebron-james-2012-13-kia-nba-mvp-award/',
 attributes:{close:98,mid:87,three:87,free:76,dunk:99,handle:91,pass:98,speed:95,accel:92,strength:98,vertical:96,stamina:98,perimeter:96,interior:90,steal:90,block:92,rebound:88,iq:99},
 tendencies:{three:36,mid:50,drive:85,dunk:96,dribble:75,pass:95,shotTaking:90},personality:{style:'Power playmaker',selfCreation:85,teamwork:97,composure:97},badges:{rhythm:3,range:3,handle:4,focus:4,finish:5,pogo:4,motor:5,anchor:5,glove:4,fade:3}},
jordan:{season:'1990–91',stats:{ppg:31.5,rpg:6,apg:5.5,fg:.539,three:.312,ft:.851},source:'https://www.nba.com/news/history-season-review-1990-91',
 attributes:{close:99,mid:99,three:74,free:89,dunk:99,handle:94,pass:88,speed:97,accel:99,strength:83,vertical:99,stamina:99,perimeter:99,interior:76,steal:99,block:86,rebound:72,iq:99},
 tendencies:{three:18,mid:99,drive:74,dunk:92,dribble:85,pass:62,shotTaking:99},personality:{style:'Relentless shot creator',selfCreation:99,teamwork:78,composure:99},badges:{rhythm:4,range:2,handle:4,focus:5,finish:5,pogo:5,motor:5,anchor:4,glove:5,fade:5}}
};
const template=HoopRoster.getCharacter('lebron');
const dev={...template,id:'devin',name:'Devin Combs',short:'Devin',plate:'COMBS',number:'99',heightM:2.4384,massKg:145,role:'Experimental maxed player',
 colors:{jersey:'#20242B',accent:'#ED4040',shorts:'#20242B',shoe:'#1B1D20',sole:'#ED4040'},blurb:'8 feet tall. Every custom attribute and badge maxed. Deliberately outside human limits.',
 move:{...template.move,sprint:10.8,jog:6.2,accel:20,decel:24,turn:15,maxLeap:1.18},shoot:{...template.shoot,baseRange:13,moveComp:.98,releaseMul:.82},
 sig:{...template.sig,name:'Signature: Devin Combs',params:{...template.sig.params,speed:.95,arc:.70,elbow:.02,guide:.08,jump:.65}},style:{...template.style,shot:'power',dunk:'twohand'}};
HoopRoster.CHARACTERS.push(dev);
DATA.devin={season:'Experimental',stats:null,attributes:Object.fromEntries(Object.keys(NAMES).map(k=>[k,99])),tendencies:{three:99,mid:99,drive:99,dunk:99,dribble:99,pass:99,shotTaking:99},personality:{style:'Maxed laboratory athlete',selfCreation:99,teamwork:99,composure:99},badges:Object.fromEntries(BADGES.map(b=>[b.id,5]))};
for(const def of HoopRoster.CHARACTERS){Object.assign(def,DATA[def.id]);if(def.id!=='devin'){def.move.sprint=5.2+def.attributes.speed*.032;def.move.accel=6+def.attributes.accel*.06;def.move.decel=7+def.attributes.accel*.065;def.move.maxLeap=.30+def.attributes.vertical*.0065;}def.overall=def.id==='devin'?99:Math.round((def.attributes.iq+def.attributes.stamina+Math.max(def.attributes.three,def.attributes.mid)+Math.max(def.attributes.dunk,def.attributes.handle)+def.attributes.speed)/5);}
function effect(def,id){return Math.max(0,Math.min(5,def.badges&&def.badges[id]||0));}
function chemistry(players,coach){if(players.length<2)return {score:null,label:'Team chemistry requires teammates'};const teamwork=players.reduce((s,p)=>s+(p.personality?.teamwork||50),0)/players.length;const fit=players.reduce((s,p)=>s+(coach==='spacing'?(p.tendencies?.three||50):coach==='rim'?(p.tendencies?.drive||50):70),0)/players.length;return {score:Math.round(teamwork*.6+fit*.4),label:'Estimated coach/team fit'};}
function open(def,root,onClose){
 const stats=def.stats;root.innerHTML=`<div class="profile-card"><header><div class="eyebrow">${def.season} · ${def.id==='devin'?'Experimental':'Prime-season profile'}</div><h2>${def.name} <span>${def.overall} OVR</span></h2></header><p class="dim">${stats?`${stats.ppg} PPG · ${stats.rpg} RPG · ${stats.apg} APG · ${(stats.three*100).toFixed(1)}% 3PT`:'8′0″ · all 99 attributes · every badge at Legend'}</p><p class="dim">Custom HOOP LAB ratings and tendencies are design estimates, not official 2K/Live ratings or measured personality traits.</p><div class="profile-grid"><section><h3>Attributes</h3>${Object.entries(def.attributes).map(([k,v])=>`<div class="attribute-row"><span>${NAMES[k]}</span><i style="width:${v}%"></i><b>${v}</b></div>`).join('')}</section><section><h3>Badges</h3>${BADGES.map(b=>{const t=TIERS[effect(def,b.id)];return `<div class="badge-item" style="--tier:${t.color}"><b>${b.name}</b><span>${t.name}</span><small>${b.desc}</small></div>`;}).join('')}</section><section><h3>AI tendencies</h3>${Object.entries(def.tendencies).map(([k,v])=>`<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}<h3>Play style</h3><p>${def.personality.style}</p><p class="dim">Coaching changes AI shot selection and defensive spacing. Chemistry has a team-fit data model; 1v1 has no teammates or passing chemistry.</p>${def.source?`<a href="${def.source}" target="_blank" rel="noopener">Prime-season source</a>`:''}</section></div><button class="primary" data-close>Back</button></div>`;
 root.classList.remove('hidden');root.querySelector('[data-close]').onclick=()=>{root.classList.add('hidden');onClose&&onClose();};
}
return {TIERS,BADGES,NAMES,DATA,effect,chemistry,open};})();
