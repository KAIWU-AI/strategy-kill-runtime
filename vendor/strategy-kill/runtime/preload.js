import { FileSystem, installLegacyFileSystemAPI } from './noname/library/fs/index.js';
const base=new URL('./',import.meta.url);

// Fixed standard/extra list names, not all lib.card definitions (which include
// virtual/skill cards). Preserve native rendering for every unlisted identity.
export function buildNoncharacterCardStyle(lib){
 const names='bagua baiyin bingliang chitu cixiong dawan dilu fangtian guanshi guding guohe hanbing hualiu huogong jiedao jiu juedou jueying lebu muniu nanman qilin qinggang qinglong renwang sha shan shandian shunshou tao taoyuan tengjia tiesuo wanjian wugu wuxie wuzhong zhangba zhuahuang zhuge zhuque zixin'.split(' ');
 const palette={basic:'#375c50',trick:'#305d70',delay:'#6b4d72',equip:'#76542e'};
 const ids=names.filter(id=>lib.card[id]&&lib.translate[id]);
 // Only public full-size faces. Native compact equipped/judgment layouts stay
 // intact. Every generated selector excludes hidden cards, including pseudo text.
 const scope='.card:not(.infohidden):not(.equips>.card):not(.judges>.card)';
 const face=scope+':is('+ids.map(id=>'[data-card-name="'+id+'"]').join(',')+')';
 let css=`
 ${face}{border-color:var(--sk-ink)!important;background:linear-gradient(135deg,#fff9ea,#e9d8b6)!important;color:#172529!important}
 ${face}>.name{font:700 20px/1.12 system-ui!important;left:5px!important;top:7px!important;text-shadow:none!important;letter-spacing:1px}
 ${face}>.name.long{font-size:17px!important;letter-spacing:0}
 ${face}>.info{font:700 16px/1.1 system-ui!important;top:6px!important;right:6px!important;text-shadow:none!important;color:#243339!important}
 ${face}>.info.red{color:#ac3029!important}
 ${face}>.info span{font-family:system-ui!important}
 ${face}>.image{position:absolute!important;inset:29px 7px 22px 32px!important;width:auto!important;height:auto!important;background:none!important;pointer-events:none}
 ${face}>.image::before{content:var(--sk-symbol);position:absolute;inset:18px 0 0;display:flex;align-items:center;justify-content:center;border:1px solid var(--sk-ink);border-radius:50%;color:var(--sk-ink);background:linear-gradient(145deg,#fff9eb,#ddcba8);font:800 30px/1 system-ui;text-shadow:none;box-sizing:border-box}
 ${face}>.image::after{content:var(--sk-category);position:absolute;top:0;left:0;right:0;text-align:center;color:var(--sk-ink);font:700 10px/1.2 system-ui;white-space:nowrap;letter-spacing:1px;text-shadow:none}
 ${face}>.range{font:600 11px/1.2 system-ui!important;color:#34443d!important;text-shadow:none!important;bottom:5px!important}
 `;
 for(const id of ids){
  const definition=lib.card[id];
  const category=lib.translate[definition.subtype||definition.type];
  const symbol=lib.translate[id+'_cbg']||lib.translate[id+'_bg']||lib.translate[id][0];
  // JSON strings safely quote the fixed public translations in CSS content.
  css+=`${scope}[data-card-name="${id}"]{--sk-ink:${palette[definition.type]};--sk-symbol:${JSON.stringify(symbol)};--sk-category:${JSON.stringify(category)}}\n`;
 }
 css+=`
 ${face}[data-card-name="sha"].fire{--sk-ink:#a53f24}
 ${face}[data-card-name="sha"].thunder{--sk-ink:#57417b}
 ${face}[data-card-subtype="equip1"]>.image::before{border-radius:3px 45% 3px 45%;border-width:2px}
 ${face}[data-card-subtype="equip2"]>.image::before{border-radius:8px 8px 45% 45%;border-width:2px}
 ${face}[data-card-subtype="equip3"]>.image::before{border-radius:8px;border-style:double;border-width:3px;font-size:24px}
 ${face}[data-card-subtype="equip4"]>.image::before{border-radius:8px;border-style:dashed;font-size:24px}
 ${face}[data-card-subtype="equip5"]>.image::before{border-radius:3px;border-style:double;border-width:4px}
 `;
 return css;
}

// These lanes belong to the adapter, not to host CSS or the engine's card tree.
// The host's existing board-scroller keeps the 900 × 720 native board readable.
export const tableLayoutStyle=`
 #window #arena,#window #arena>#control,#window #arena>#me,#window #arena>#mebg,#window #arena>#autonode{transition:none!important}
 #window #system{top:0!important;left:8px!important;width:calc(100% - 16px)!important;height:44px;box-sizing:border-box}
 #window #time{top:14px!important;left:230px!important;width:calc(100% - 460px)!important;font:16px system-ui}
 #window #arena{top:56px!important;left:20px!important;width:calc(100% - 40px)!important;height:calc(100% - 72px)!important}
 #window #arena>.player:not([data-position="0"]){top:0!important;left:var(--sk-seat-left)!important}
 #window #arena>.player[data-position="0"]{top:calc(100% - 208px)!important;left:0!important}
 /* Native linked rotation would rotate the entire reserved equipment lane.
    Keep seats upright and preserve the engine state with a visible chain badge. */
 #window #arena>.player.linked{transform:none!important}
 #window #arena>.player.linked>:is(.name,.identity,.marks,.judges){transform:none!important}
 #window #arena>.player.linked>.count{right:-14px!important}
 #window #arena>.player.linked:not([data-position="0"])>.equips{transform:scale(0.8)!important}
 #window #arena>.player:is(.linked,.linked2)::after{content:"连环";position:absolute;left:4px;bottom:0;padding:0 4px;height:18px;font:600 12px/18px system-ui;background:#423722;color:#fff5db;z-index:4;pointer-events:none}
 #window #arena>.dialog.sk-action-prompt.nobutton{top:216px!important;bottom:auto!important;left:144px!important;width:calc(100% - 444px)!important;height:40px!important;min-height:0!important;overflow:auto;background:#21353b;box-sizing:border-box;border:1px solid #bfa16a;transform:none!important}
 #window #arena>.dialog.sk-action-prompt.nobutton .caption{font:600 18px/1.4 system-ui!important;padding:2px!important}
 #window #arena>.dialog.sk-action-prompt.nobutton .content{padding:4px!important;box-sizing:border-box}
 #window #arena:not(.strategy-finished)>.card.thrown.center{top:288px!important;left:calc(50% - 130px)!important;transition:none!important}
 #window #arena>#arenalog{top:220px!important;bottom:288px!important;right:0!important;left:auto!important;width:270px!important;height:auto!important;transform:none!important;overflow:auto;border:1px solid #6d8586;background:#14292e;padding:30px 10px 8px;box-sizing:border-box;pointer-events:auto}
 #window #arena>#arenalog::before{content:"出牌记录";position:absolute;top:6px;left:10px;font:600 15px system-ui;color:#e8dab7}
 #window #arena.strategy-finished>#arenalog{display:none}
 body #window:not(.low_performance) #arena #arenalog>div{position:relative;display:block;animation:none;transition:none;line-height:24px;left:0;width:100%;margin:0!important;overflow-wrap:anywhere}
 #window #arena:not(.choose-character):not(.choose-to-move):not(.discard-player-card):not(.gain-player-card):not(.choose-player-card)>#control{bottom:222px!important;left:144px!important;width:calc(100% - 144px)!important;height:40px!important}
 #window #arena:not(.choose-character):not(.chess)>#me,
 #window #arena:not(.choose-character):not(.chess)>#mebg,
 #window #arena:not(.choose-character):not(.chess)>#autonode{bottom:8px!important;left:144px!important;top:auto!important;width:calc(100% - 144px)!important;height:120px!important}
 #window #arena #me #handcards1{left:0!important;top:0!important;width:100%!important;height:120px!important}
 /* Contrast is specific to compact equipment, including opponent/virtual slots.
    Never put labels, empty-state nodes, or help actions in node.equips. */
 #window #arena .player>.equips>.card{color:#fff5db!important;text-shadow:none!important}
 #window #arena .player>.equips>.card>.name2{color:inherit!important;opacity:1!important}
 #window #arena .player>.equips>.card.selectable{outline:2px solid #efdca5;outline-offset:-2px}
 #window #arena .player>.equips>.card.selected{outline:3px solid #8cd6ff;outline-offset:-3px;color:#fff!important}
 #window #arena .player[data-position="0"]>.equips{left:144px!important;top:14px!important;bottom:auto!important;right:auto!important;width:var(--sk-equip-width)!important;transform:none!important;display:flex;align-items:stretch;gap:6px;z-index:3}
 #window #arena .player[data-position="0"]>.equips>.card{flex:1 1 0;min-width:0;width:auto!important;min-height:62px;max-height:64px;height:auto!important;overflow:auto;line-height:20px;font:14px/20px system-ui;box-sizing:border-box;background:#21353b!important;border:1px solid #bfa16a!important;border-image:none!important;border-radius:4px;padding:5px 4px}
 #window #arena .player[data-position="0"]>.equips>.card>.name2{position:relative;display:block;margin:0;white-space:normal;overflow-wrap:anywhere}
 #window #arena .player[data-position="0"]>.equips>.card.selected{background:#235873!important}
 #window #arena .player[data-position="0"]>.equips>.card.removing{display:none!important}
 #window #arena .player[data-position="0"]>.equips>.emptyequip.hidden{display:none!important}
 #window #arena .player>.sk-equipment-label{left:144px;top:-12px;width:var(--sk-equip-width);font:600 16px/18px system-ui;color:#e8dab7;white-space:nowrap;pointer-events:none}
 #window #arena .player>.sk-equipment-empty{left:144px;top:14px;width:var(--sk-equip-width);height:62px;box-sizing:border-box;padding:18px 12px;border:1px dashed #8b9b93;border-radius:4px;font:15px/24px system-ui;color:#eee;pointer-events:none}
 #window #arena .player>.sk-equipment-empty[hidden]{display:none!important}
 #window #arena .player.turnedover>.equips,
 #window #arena .player.turnedover>.sk-equipment-label,
 #window #arena .player.turnedover>.sk-equipment-empty,
 #window #arena .player.turnedover>.sk-public-help{opacity:1!important}
 #window #arena .player>.sk-public-help{position:absolute;top:6px;left:4px;z-index:5;padding:4px 6px;font:14px/20px system-ui;color:#fff5db;background:#14292e;border:1px solid #bfa16a;border-radius:4px;cursor:pointer}
 .sk-public-help:focus-visible,.sk-help-modal button:focus-visible{outline:3px solid #8cd6ff;outline-offset:2px}
 .sk-help-modal{box-sizing:border-box;width:min(620px,calc(100vw - 40px));max-height:calc(100vh - 48px);overflow:auto;margin:auto;padding:22px;color:#f7edda;background:#14292e;border:1px solid #bfa16a;border-radius:8px;font:16px/1.6 system-ui}
 .sk-help-modal::backdrop{background:#0009}
 .sk-help-modal h2{font-size:22px;margin:0 0 10px}
 .sk-help-modal h3{font-size:18px;margin:20px 0 6px}
 .sk-help-modal p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}
 .sk-help-modal button{font:16px system-ui;padding:8px 14px;color:#14292e;background:#f2e5ca;border:0;border-radius:4px;cursor:pointer}
`;

// Match nodeintro's public skill mode (no invisible/hidden sources) and its
// nopop/equipSkill exclusions, but use complete names and no native menu actions.
export function publicSkillEntries(player,{lib,game,get}){
 if(player.isUnseen?.()||!player.name||player.name.startsWith('unknown'))return [];
 const ids=player.getSkills(null,false,false).slice();
 for(const [id,reasons] of Object.entries(player.disabledSkills)){
  if(reasons.length===1&&reasons[0]===id+'_awake'&&!player.hiddenSkills.includes(id)&&!ids.includes(id))ids.push(id);
 }
 if(player===game.me)for(const id of get.skills()){
  if(!player.hiddenSkills.includes(id)&&!player.invisibleSkills.includes(id)&&!ids.includes(id))ids.push(id);
 }
 const active=game.filterSkills(ids.slice(),player);
 return ids.filter(id=>lib.skill[id]&&!lib.skill[id].nopop&&!lib.skill[id].equipSkill&&lib.translate[id+'_info'])
  .map(id=>({id,name:get.translation(id),info:get.skillInfoTranslation(id,player,false),disabled:!active.includes(id)||!!player.forbiddenSkills[id]}));
}

function installTableUX(api,bridge){
 const {lib,game,get,_status,ui}=api;
 // Native game.log prunes rows to the visible height. Keep a bounded, scrollable
 // view of its already-public sidebar output; never inspect cards or event data.
 const publicHistory=[],log=game.log,clearArena=game.clearArena;
 game.log=function(...args){
  const previous=ui.sidebar?.firstChild,scrollTop=ui.arenalog?.scrollTop??0;
  const result=log.apply(this,args);
  if(ui.sidebar?.firstChild&&ui.sidebar.firstChild!==previous&&ui.arenalog){
   const entry=ui.sidebar.firstChild.cloneNode(true);
   publicHistory.unshift(entry);if(publicHistory.length>200)publicHistory.pop();
   ui.arenalog.replaceChildren(...publicHistory);
   ui.arenalog.scrollTop=scrollTop?scrollTop+entry.offsetHeight:0;
  }
  return result;
 };
 game.clearArena=function(...args){publicHistory.length=0;return clearArena.apply(this,args);};
 const dialog=ui.create.dialog;
 ui.create.dialog=function(...args){
  const result=dialog.apply(this,args),event=_status.event;
  if(['chooseToUse','chooseToRespond','chooseToDiscard'].includes(event?.name)&&!event.skill&&!event.openskilldialog&&args.length===1&&typeof args[0]==='string'&&!['hidden','forcebutton'].includes(args[0]))result.classList.add('sk-action-prompt');
  return result;
 };
 const layoutPublicCards=()=>{
  const cards=ui.thrown.filter(card=>card.parentNode===ui.arena&&!card.classList.contains('removing'));
  const width=Math.max(105,ui.arena.clientWidth-444),gap=Math.min(107,(width-105)/Math.max(1,cards.length-1));
  for(let i=0;i<cards.length;i++)cards[i].style.transform=`translate(${(i-(cards.length-1)/2)*gap}px, -30px)`;
 };
 const throwOrdered=lib.element.Player.prototype.$throwordered2;
 lib.element.Player.prototype.$throwordered2=function(...args){
  const result=throwOrdered.apply(this,args);layoutPublicCards();
  return result;
 };
 let modal,returnFocus;
 const plain=html=>{const text=document.createElement('div');text.innerHTML=html??'';return text.textContent??'';};
 const openHelp=(player,button)=>{
  if(modal)return;
  returnFocus=button;bridge.openHelp();
  modal=document.createElement('dialog');modal.className='sk-help-modal';modal.setAttribute('aria-labelledby','sk-help-title');
  for(const type of ['keydown','keyup'])modal.addEventListener(type,event=>event.stopPropagation());
  const heading=document.createElement('h2');heading.id='sk-help-title';
  heading.textContent=player.isUnseen?.()?'当前公开技能':get.translation(player.name)+' · 当前公开技能';modal.append(heading);
  const close=document.createElement('button');close.type='button';close.textContent='关闭说明';close.addEventListener('click',()=>modal.close());modal.append(close);
  const add=(name,info)=>{const h=document.createElement('h3'),p=document.createElement('p');h.textContent=name;p.textContent=plain(info);modal.append(h,p);};
  const entries=publicSkillEntries(player,api);
  for(const entry of entries)add(entry.name+(entry.disabled?'（当前不可发动）':''),entry.info);
  if(!entries.length)add('暂无公开技能','这里只展示当前公开的技能，不展示隐藏身份或手牌。');
  for(const card of player.getVCards('e'))add(get.translation(card.name)+' · 装备',lib.translate[card.name+'_info']);
  modal.addEventListener('close',()=>{modal.remove();modal=undefined;bridge.closeHelp();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  document.body.append(modal);modal.showModal();close.focus();
 };
 const attached=new WeakSet();
 const refresh=()=>{
  if(!ui.arena)return;
  ui.arena.style.setProperty('--sk-equip-width',Math.max(0,ui.arena.clientWidth-144)+'px');
  layoutPublicCards();
  const opponents=[...ui.arena.querySelectorAll(':scope>.player:not([data-position="0"])')];
  for(const player of opponents){
   const index=Number(player.dataset.position)-1,count=setupCount()-1;
   player.style.setProperty('--sk-seat-left',`calc(${100*(count-1-index)/Math.max(1,count-1)}% - ${120*(count-1-index)/Math.max(1,count-1)}px)`);
  }
  for(const player of [...game.players,...game.dead]){
   if(attached.has(player))continue;
   attached.add(player);
   const button=document.createElement('button');button.type='button';button.className='sk-public-help';button.textContent='技能说明';button.setAttribute('aria-label','查看当前公开技能');
   button.addEventListener('pointerdown',event=>event.stopPropagation());
   for(const type of ['keydown','keyup'])button.addEventListener(type,event=>event.stopPropagation());
   button.addEventListener('click',event=>{event.stopPropagation();openHelp(player,button);});
   player.append(button);
  }
  if(game.me?.node.equips&&!game.me.querySelector('.sk-equipment-label')){
   const label=document.createElement('div'),empty=document.createElement('div');label.className='sk-equipment-label';label.textContent='我的装备 · 常驻';empty.className='sk-equipment-empty';empty.textContent='暂无装备 · 装备后在此显示';empty.setAttribute('role','status');game.me.append(label,empty);
  }
  const empty=game.me?.querySelector('.sk-equipment-empty');
  if(empty){const hidden=[...game.me.node.equips.children].some(card=>!card.classList.contains('removing')&&!card.classList.contains('hidden'));if(empty.hidden!==hidden)empty.hidden=hidden;}
 };
 const setupCount=()=>Number(ui.arena.dataset.number)||game.players.length;
 // Observe native DOM updates (equip, replacement, loss, revived seats), not cards'
 // rules or private contents. Writes above are idempotent to avoid observer loops.
 const observe=()=>{
  if(!ui.arena)return;
  const observer=new MutationObserver(refresh);observer.observe(ui.arena,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});refresh();
  new ResizeObserver(refresh).observe(ui.arena);
 };
 const createArena=ui.create.arena;
 ui.create.arena=function(...args){const result=createArena.apply(this,args);observe();return result;};
}

export default async function preload({lib,game,get,_status,ui},bridge){
 const {setup,portraits,cardBack,notify}=bridge;lib.assetURL=base.href;
 // Keep upstream cache-busting off immutable manifest URLs. Relative paths stay
 // under this frame's mount; the server continues rejecting every query alias.
 const loadScript=lib.init.js.bind(lib.init);
 lib.init.js=(path,...args)=>loadScript(path.startsWith(base.href)?'./'+path.slice(base.href.length):path,...args);
 const manifest=await fetch(new URL('static-files.json',base),{credentials:'omit'}).then(r=>r.json());
 const valid=p=>typeof p==='string'&&Object.hasOwn(manifest,p);
 const denied=()=>Promise.reject(new Error('READ_ONLY_STATIC'));
 const adapter={async stat(p){return valid(p)?{type:'file',size:manifest[p]}:null},async read(p){if(!valid(p))throw new Error('STATIC_NOT_FOUND');const r=await fetch(new URL(p,base),{credentials:'omit'});if(!r.ok)throw new Error('STATIC_FETCH_FAILED');return new Uint8Array(await r.arrayBuffer())},async list(){return []},open:denied,write:denied,remove:denied,createDir:denied};
 const fs=new FileSystem(adapter);lib.fs=fs;installLegacyFileSystemAPI(game,fs);
 localStorage.setItem(lib.configprefix+'disable_extension','true');
 for(const key of ['exit','reload','showChangeLog','checkForUpdate','checkForAssetUpdate','download','multiDownload','importExtension','export','playAudio','playBackgroundMusic'])game[key]=()=>{};
 window.open=()=>null;
 const system=ui.create.system;ui.create.system=function(text,...args){const el=system.call(this,text,...args);if(text==='托管')el.id='auto';if(text==='不询问无懈')el.id='wuxie';return el;};
 document.addEventListener('click',e=>{if(e.target.closest('a,input[type=file]')){e.preventDefault();e.stopImmediatePropagation()}},true);
 const json=lib.init.promises.json.bind(lib.init.promises);
 lib.init.promises.json=async (...args)=>{
  const v=await json(...args);
  if(String(args[0]).endsWith('game/config.json')){
   Object.assign(v,{mode:'identity',new_tutorial:true,show_splash:'off',characters:['standard','shenhua','yijiang'],cards:['standard','extra'],extensions:[],plays:[],debug:true,dev:false,compatible:false,show_pause:false,show_auto:true,show_volumn:false,show_cardpile:false,show_connect:false,show_wuxie:true,show_stat:false,show_playerids:false,show_phaseuse_prompt:true,background_music:'music_off',background_audio:false,background_speak:false,animation:false,game_speed:'vvfast',sync_speed:true,video:0,confirm_exit:false,auto_check_update:false,image_background:'default',image_background_random:false,card_style:'default',cardback_style:'default',hp_style:'default',name_font:'default',identity_font:'default',global_font:'default',cardtext_font:'default',suits_font:false,continue_name:[setup.selectedCharacter]});
   Object.assign(v.mode_config.identity,{player_number:setup.playerCount,choice_zhu:3,choice_zhong:4,choice_nei:6,choice_fan:3,change_card:'disabled',identity_mode:'normal',double_character:false,free_choose:false,change_choice:false,change_identity:false,dierestart:false,show_identity:false,auto_identity:'off',ban_identity:'off'});
  }return v;
 };
 const js=lib.init.promises.js.bind(lib.init.promises);
 lib.init.promises.js=async (path,name,...args)=>{
  if(path==='game'&&name==='package'){window.noname_package={character:{standard:'战略人物',shenhua:'战略人物',yijiang:'战略人物'},card:{standard:'标准牌',extra:'军争牌'},play:{},submode:{},mode:{identity:'身份局'},background:{},music:{},theme:{simple:'简洁'}};return;}
  if(path==='game'&&name==='update'){window.noname_update={version:'1.11.6',changeLog:[]};return;}
  return js(path,name,...args);
 };
 lib.onload.push(()=>{
  const mode=lib.imported.mode.identity,original=mode.startBefore;
  mode.startBefore=function(){
   original?.apply(this,arguments);
   const allowed=new Set(setup.characters.map(c=>c.id));
   for(const c of setup.characters){const data=lib.character[c.id];if(!data)throw new Error('APPROVED_CHARACTER_MISSING');data.sex=c.sex;data.group=c.group;data.hp=c.hp;data.maxHp=c.hp;data.skills=c.skills.slice();data.img=portraits[c.heroId]||'';data.dieAudios=[];data.names=c.name;}
   for(const id of Object.keys(lib.character))if(!allowed.has(id))delete lib.character[id];
   lib.characterPack={strategy:Object.fromEntries(setup.characters.map(c=>[c.id,lib.character[c.id]]))};
   lib.characterReplace={};lib.characterSubstitute={};lib.config.characters=['strategy'];
   for(const c of setup.characters){lib.translate[c.id+'_ab']=c.name;lib.characterIntro[c.id]=c.name;}
   Object.assign(lib.translate,setup.translations,{wei:'实业',shu:'商业',wu:'智库',qun:'科创',wei2:'实业集团',shu2:'商业联盟',wu2:'战略智库',qun2:'科创先锋',strategy_character_config:'战略人物'});
   // loadCard has populated the public catalogue before mode.startBefore.
   const faces=document.createElement('style');faces.textContent=buildNoncharacterCardStyle(lib);document.head.append(faces);
   const create=game.createEvent;game.createEvent=function(name,...args){const e=create.call(this,name,...args);if(name==='chooseCharacter')e.identity='zhu';return e;};
   for(const c of setup.characters)for(const s of c.skills)if(!lib.skill[s])throw new Error('APPROVED_SKILL_MISSING');
   const over=game.over;game.over=function(result,...args){
    // Replace only the fixed native settlement icon before a poptip creates DOM.
    // Keep native ids/dialogs (including hand privacy) and all call semantics.
    const poptip=lib.poptip,add=poptip.add;
    const handcard=`<img style="width:15px; vertical-align: middle;" src="${lib.assetURL}image/card/handcard.png">`;
    poptip.add=function(item,...rest){return add.call(this,item?.name===handcard?{...item,name:'查看'}:item,...rest);};
    let r;try{r=over.call(this,result,...args);}finally{poptip.add=add;}
    ui.arena.classList.add('strategy-finished');
    notify('finished',{result:result===true?'win':result===false?'loss':'draw'});return r;
   };
   // The engine exclusively owns rules, AI decisions, hand privacy and termination.
   let sent=false;const timer=setInterval(()=>{if(!sent&&game.me?.name&&game.players.length===setup.playerCount&&game.players.every(p=>p.name)&&_status.gameStarted){sent=true;notify('running',{selectedCharacter:game.me.name,players:game.players.length,rosterCount:Object.keys(lib.character).length});}if(_status.over)clearInterval(timer);for(const k of ['config','pause','cardPileButton','connect','volume','identity','replay','restart','revive','swap'])ui[k]?.remove?.();},100);
  };
 });
 installTableUX({lib,game,get,_status,ui},bridge);
 const style=document.createElement('style');style.textContent=`
 html,body,#window{background:transparent!important;color:#eee;font-family:system-ui!important} .background{background:none!important}
 #system>div>div:not(#autobutton):not(#wuxie){display:none!important} .menubg,.menu-container,.menu,#roundmenu{display:none!important}
 .player{background:#21353b!important;border:1px solid #bfa16a!important} .player .count{background:#21353b!important} .avatar,.avatar2{background-image:none!important;background-color:#31464a!important}
 .card{background-image:none!important;background:#f2e5ca!important;color:#172529!important;border:1px solid #99805c!important} .card>.image{background-image:none!important}
 .cardbg,.card .markcount{background:#f2e5ca!important}
 .card.infohidden{background:#344d51!important} .card.infohidden>*{visibility:hidden!important} .card>.name{font-family:system-ui!important}
 .hp>div{background:#c5b06d!important;border:0!important;border-radius:0!important;clip-path:polygon(50% 0%,60.83333333333333% 26.666666666666668%,85.41666666666666% 14.583333333333334%,73.33333333333334% 39.166666666666664%,100% 50%,73.33333333333334% 60.83333333333333%,85.41666666666666% 85.41666666666666%,60.83333333333333% 73.33333333333334%,50% 100%,39.166666666666664% 73.33333333333334%,14.583333333333334% 85.41666666666666%,26.666666666666668% 60.83333333333333%,0% 50%,26.666666666666668% 39.166666666666664%,14.583333333333334% 14.583333333333334%,39.166666666666664% 26.666666666666668%)} .hp>.lost{background:#44534c!important}
 #arena .player>.name{font-family:system-ui!important;text-shadow:0 1px 3px #000}
 ${tableLayoutStyle}
 `;
 // Native player height is 200px: reserve 24px above and 8px below the name.
 // Leave names of seven characters or fewer entirely at the native size.
 for(const c of setup.characters){const length=[...c.name].length;if(length>7)style.textContent+=`#arena .player[data-character="${c.id}"]>.name{font-size:${Math.min(18,168/length)}px}`;}
 for(const c of setup.characters)if(portraits[c.heroId])style.textContent+=`.player[data-character="${c.id}"]>.avatar{background-image:url("${portraits[c.heroId]}")!important}`;
 if(cardBack)style.textContent+=`.card.infohidden{background-image:url("${cardBack}")!important;background-size:cover!important}`;
 document.head.append(style);
 // Paint only avatars. Never traverse or export opponent hand nodes.
 lib.onload.push(()=>{const init=lib.element.Player.prototype.init;lib.element.Player.prototype.init=function(...args){const r=init.apply(this,args);const c=setup.characters.find(c=>c.id===args[0]);if(c){this.dataset.character=c.id;this.node.avatar.style.setProperty('background-image',portraits[c.heroId]?`url("${portraits[c.heroId]}")`:'none','important');}return r;};});
}
