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
   Object.assign(v,{mode:'identity',new_tutorial:true,show_splash:'off',characters:['standard','shenhua','yijiang'],cards:['standard','extra'],extensions:[],plays:[],debug:true,dev:false,compatible:false,show_pause:false,show_auto:true,show_volumn:false,show_cardpile:false,show_connect:false,show_wuxie:true,show_stat:false,show_playerids:false,background_music:'music_off',background_audio:false,background_speak:false,animation:false,game_speed:'vvfast',sync_speed:true,video:0,confirm_exit:false,auto_check_update:false,image_background:'default',image_background_random:false,card_style:'default',cardback_style:'default',hp_style:'default',name_font:'default',identity_font:'default',global_font:'default',cardtext_font:'default',suits_font:false,continue_name:[setup.selectedCharacter]});
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
 const style=document.createElement('style');style.textContent=`
 html,body,#window{background:transparent!important;color:#eee;font-family:system-ui!important} .background{background:none!important}
 #system>div>div:not(#autobutton):not(#wuxie){display:none!important} .menubg,.menu-container,.menu,#roundmenu{display:none!important}
 .player{background:#21353b!important;border:1px solid #bfa16a!important} .player .count{background:#21353b!important} .avatar,.avatar2{background-image:none!important;background-color:#31464a!important}
 .card{background-image:none!important;background:#f2e5ca!important;color:#172529!important;border:1px solid #99805c!important} .card>.image{background-image:none!important}
 .cardbg,.card .markcount{background:#f2e5ca!important}
 .card.infohidden{background:#344d51!important} .card.infohidden>*{visibility:hidden!important} .card>.name{font-family:system-ui!important}
 .hp>div{background:#c5b06d!important;border:0!important;border-radius:0!important;clip-path:polygon(50% 0%,60.83333333333333% 26.666666666666668%,85.41666666666666% 14.583333333333334%,73.33333333333334% 39.166666666666664%,100% 50%,73.33333333333334% 60.83333333333333%,85.41666666666666% 85.41666666666666%,60.83333333333333% 73.33333333333334%,50% 100%,39.166666666666664% 73.33333333333334%,14.583333333333334% 85.41666666666666%,26.666666666666668% 60.83333333333333%,0% 50%,26.666666666666668% 39.166666666666664%,14.583333333333334% 14.583333333333334%,39.166666666666664% 26.666666666666668%)} .hp>.lost{background:#44534c!important}
 #arena .player>.name{font-family:system-ui!important;text-shadow:0 1px 3px #000}
 /* Native phase bursts combine negative-margin transitions with entry animations.
    Keep logs in normal flow below opponents, clear of the hand and controls. */
 #arena>#arenalog{top:220px;left:50%;transform:translateX(-50%);width:min(360px,calc(100% - 300px));height:calc(100% - 410px);overflow:auto}
 #arena.strategy-finished>#arenalog{display:none}
 body #window:not(.low_performance) #arena #arenalog>div{animation:none;transition:none;line-height:24px;left:0;width:100%}
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
