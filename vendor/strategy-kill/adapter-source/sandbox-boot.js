import * as idb from './vendor/fake-indexeddb-6.2.4/index.js';
class MemoryStorage { #data=new Map(); get length(){return this.#data.size} key(i){return [...this.#data.keys()][i]??null} getItem(k){return this.#data.get(String(k))??null} setItem(k,v){this.#data.set(String(k),String(v))} removeItem(k){this.#data.delete(String(k))} clear(){this.#data.clear()} }
for(const k of ['localStorage','sessionStorage']) Object.defineProperty(window,k,{value:new MemoryStorage(),configurable:false});
for(const [k,v] of Object.entries(idb)) if(k==='indexedDB'||k.startsWith('IDB')) Object.defineProperty(window,k,{value:v,configurable:false});
Object.defineProperty(window,'caches',{value:undefined});
const createElement=document.createElement.bind(document);document.createElement=function(tag,...args){const el=createElement(tag,...args);if(['script','link','img'].includes(tag.toLowerCase()))el.crossOrigin='anonymous';return el;};
const hash=new URLSearchParams(location.hash.slice(1)),session=hash.get('session'),parentOrigin=hash.get('parentOrigin');
const validHost=parent!==window && /^[a-f0-9]{32,128}$/.test(session??'') && /^https?:\/\/[^/]+$/.test(parentOrigin??'');
let configured=false,engine,engineStatus,desiredPaused=false,finished=false,helpOpen=false,helpInheritedPause=false;
const mustPause=()=>desiredPaused||helpOpen||document.hidden||finished;
const syncPause=()=>{if(mustPause())engine?.pause2();else engine?.resume2();};
const openHelp=()=>{helpInheritedPause=!!engineStatus?.paused2&&!desiredPaused&&!document.hidden;helpOpen=true;syncPause();};
const closeHelp=()=>{helpOpen=false;if(mustPause())engine?.pause2();else if(!helpInheritedPause)engine?.resume2();helpInheritedPause=false;};
document.addEventListener('visibilitychange',syncPause);
const send=(type,extra={})=>{if(validHost)parent.postMessage({channel:'strategy-kill/v1',session,type,...extra},parentOrigin)};
const fail=code=>send('failed',{code});
window.addEventListener('error',()=>fail('RUNTIME_FAILED'));
window.addEventListener('unhandledrejection',()=>fail('RUNTIME_FAILED'));
const raster=v=>typeof v==='string'&&v.length<=3000000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,allowed)=>record(value)&&Object.keys(value).every(key=>allowed.includes(key));
function validate(data,approved){
 const s=data.setup;
 if(!fields(s,['selectedCharacter','playerCount','characters','translations'])||![3,4,5,6].includes(s.playerCount)||!Array.isArray(s.characters)||s.characters.length!==31)return false;
 const seen=new Set();
 for(const c of s.characters){
  if(!fields(c,['heroId','id','name','group','sex','hp','skills']))return false;
  const a=approved.characters.find(x=>x.heroId===c.heroId);
  if(!a||seen.has(c.heroId))return false;
  seen.add(c.heroId);
  for(const k of ['id','name','group','sex','hp'])if(c[k]!==a[k])return false;
  if(JSON.stringify(c.skills)!==JSON.stringify(a.skills))return false;
 }
 if(!s.characters.some(c=>c.id===s.selectedCharacter))return false;
 if(!record(s.translations)||Object.keys(s.translations).length!==Object.keys(approved.translations).length||!Object.keys(approved.translations).every(k=>Object.hasOwn(s.translations,k)&&s.translations[k]===approved.translations[k]))return false;
 if(data.portraits!==undefined&&(!record(data.portraits)||!Object.keys(data.portraits).every(k=>seen.has(k)&&raster(data.portraits[k]))))return false;
 if(data.cardBack!==undefined&&!raster(data.cardBack))return false;
 return true;
}
window.addEventListener('message',async event=>{
 const m=event.data;if(!validHost||event.source!==parent||event.origin!==parentOrigin||!m||m.channel!=='strategy-kill/v1'||m.session!==session)return;
 const allowed=m.type==='configure'?['channel','session','type','setup','portraits','cardBack']:['channel','session','type'];
 if(!['configure','pause','resume'].includes(m.type)||!fields(m,allowed)){fail('INVALID_CONFIG');return;}
 if(m.type==='configure'&&!configured){
  configured=true;
  try{
   const approved=await fetch('./approved-setup.json',{credentials:'omit'}).then(r=>r.json());
   if(!validate(m,approved)){fail('INVALID_CONFIG');return;}
   // Translations are authoritative approved plain text, not executable markup from a message.
   const setup={...approved,selectedCharacter:m.setup.selectedCharacter,playerCount:m.setup.playerCount};
   const api=await import('./noname.js');engine=api.game;engineStatus=api._status;if(mustPause())engine.pause2();
   const {default:preload}=await import('./preload.js');
   await preload(api,{setup,portraits:m.portraits??{},cardBack:m.cardBack,openHelp,closeHelp,notify:(type,extra)=>{if(type==='running'&&mustPause())engine.pause2();if(type==='finished')finished=true;send(type,extra);if(type==='running'&&desiredPaused)send('paused');}});
   const {boot}=await import('./noname/init/index.js');await boot();
  }catch(e){console.error(e);fail('BOOT_FAILED');}
 }else if(m.type==='pause'&&!finished){desiredPaused=true;engine?.pause2();send('paused');}
 else if(m.type==='resume'&&!finished){desiredPaused=false;syncPause();send('resumed');}
});
if(validHost)send('ready');else document.body.textContent='This runtime requires an opaque host frame.';
