import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runtimeManifest, readRuntimeAsset } from '../index.js';

// Existing workspace Playwright only; this runtime remains dependency-free.
assert.ok(process.env.STRATEGY_BROWSER_TOOLS, 'Set STRATEGY_BROWSER_TOOLS to an existing package.json that resolves playwright-core');
const { chromium } = createRequire(resolve(process.env.STRATEGY_BROWSER_TOOLS))('playwright-core');
const evidence = resolve(process.argv[2] || '.native-evidence');
mkdirSync(evidence, { recursive: true });
const approved = JSON.parse(readRuntimeAsset('approved-setup.json'));
const importMap = readRuntimeAsset('sandbox.html').toString().match(/<script type="importmap">([^<]+)<\/script>/)[1];
const importMapHash = createHash('sha256').update(importMap).digest('base64');
const report = { node: process.version, engine: '2367607e246d21aae168dba15c01151ee0651f30', geometry: [], errors: [], requests: [], fixtures: 'fictitious synthetic public fixtures only; no private user inputs' };
const mime = path => path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : path.endsWith('.json') ? 'application/json' : path.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url === '/browser.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(readFileSync(new URL('../browser.js', import.meta.url)));
    return;
  }
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><style>body{margin:0;background:#122b30}#scroller{overflow:auto;width:100%;height:100vh}iframe{border:0;width:100%;min-width:900px;height:100%;min-height:720px}</style></head><body><div id="scroller"></div><script type="module">
      import {StrategyRuntimeController} from '/browser.js';
      window.messages=[];window.failures=[];window.send=type=>window.controller.setPaused(type==='pause');
      window.start=count=>{
        window.controller?.dispose();document.querySelector('iframe')?.remove();window.messages=[];window.failures=[];
        const frame=document.createElement('iframe');frame.title='Native test board';
        document.querySelector('#scroller').append(frame);
        window.controller=new StrategyRuntimeController({
          frame,runtimeUrl:'/runtime/sandbox.html',
          provideConfig:()=>({setup:{...${JSON.stringify(approved)},playerCount:count}}),
          onEvent:event=>window.messages.push(event),onFailure:reason=>window.failures.push(reason)
        });
        window.controller.start();
      };
      </script></body></html>`);
    return;
  }
  const path = req.url?.startsWith('/runtime/') ? req.url.slice('/runtime/'.length) : '';
  if (!runtimeManifest.files.some(file => file.path === path)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', mime(path));
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'unsafe-eval' 'sha256-${importMapHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; media-src 'none'`);
  res.end(readRuntimeAsset(path));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) report.requests.push(request.url()); });
const evaluate = (frame, source) => frame.evaluate(`(async()=>{const {lib,game,get,ui,_status}=await import('./noname.js');${source}})()`);
const clickConfirm = async (frame, link) => {
  await frame.waitForFunction(async link => {
    const { ui } = await import('./noname.js');
    return ui.confirm && [...ui.confirm.children].some(node => node.link === link);
  }, link, { timeout: 20_000 });
  const handle = await frame.evaluateHandle(async link => {
    const { ui } = await import('./noname.js');
    return [...ui.confirm.children].find(node => node.link === link);
  }, link);
  assert.ok(handle.asElement(), `Native ${link} action exists`);
  await handle.asElement().click();await handle.dispose();
};
const overlap = (a, b) => a && b && a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
const geometry = frame => evaluate(frame, `
 const rect=el=>{if(!el||getComputedStyle(el).display==='none')return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
 return {classes:ui.arena.className,event:_status.event.name,dialogs:[...ui.arena.querySelectorAll(':scope>.dialog')].map(el=>({classes:el.className,text:el.textContent})),arena:rect(ui.arena),time:rect(ui.gameinfo),system:rect(ui.system),players:game.players.map(rect),prompt:rect(ui.arena.querySelector('.sk-action-prompt:not(.hidden):not(.removing)')),history:rect(ui.arenalog),control:rect(ui.control),equips:rect(game.me.node.equips),label:rect(game.me.querySelector('.sk-equipment-label')),hand:rect(ui.me),publicCards:[...ui.arena.querySelectorAll(':scope>.thrown.center:not(.hidden):not(.removing)')].map(rect)};
`);
let frame;
try {
  await page.goto(origin);
  for (const count of [3, 4, 5, 6]) {
    await page.evaluate(count => window.start(count), count);
    await page.waitForFunction(() => window.messages.some(message => message.type === 'running'), null, { timeout: 45_000 });
    frame = page.frames().find(frame => frame.url().includes('/sandbox.html'));
    assert.ok(frame);
    await frame.waitForFunction(`(async()=>{const {ui,_status}=await import('./noname.js');return !ui.arena.classList.contains('choose-character')&&_status.paused&&ui.arena.querySelector('.sk-action-prompt');})()`, null, { timeout: 30_000 });
    await frame.locator('.sk-equipment-label').waitFor();
    await evaluate(frame, `game.me.$throw(['sha','shan','tao','jiu','guohe','shunshou','tiesuo'].map(name=>game.createCard(name,'spade',5)));for(let i=0;i<25;i++)game.log('合成公开记录测试',i);`);
    for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [899, 720], [480, 720], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(650);
      const state = await geometry(frame);
      report.geometry.push({ count, viewport: [width, height], ...state });
      for (const player of state.players.slice(1)) {
        assert.ok(!overlap(player, state.time), `time/player ${count}/${width}`);
        assert.ok(!overlap(player, state.system), `system/player ${count}/${width}`);
        assert.ok(!overlap(player, state.history), `history/player ${count}/${width}`);
        assert.ok(!overlap(player, state.hand), `hand/player ${count}/${width}`);
      }
      for (let i = 1; i < state.players.length; i++) for (let j = i + 1; j < state.players.length; j++) assert.ok(!overlap(state.players[i], state.players[j]), 'Opponents overlap');
      assert.ok(!overlap(state.prompt, state.history), 'Prompt/history overlap');
      assert.ok(state.prompt, 'Actual own-play action prompt is visible');
      assert.ok(state.prompt.height >= 30, 'Prompt text has a readable visible lane');
      assert.ok(!overlap(state.hand, state.equips), 'Equipment/hand overlap');
      assert.ok(!overlap(state.control, state.label), 'Actions/equipment label overlap');
      assert.ok(!overlap(state.control, state.history), 'Actions/history overlap');
      assert.ok(state.publicCards.length > 0, 'Actual native public card DOM exists');
      for(const card of state.publicCards)for(const [name,region] of Object.entries({prompt:state.prompt,history:state.history,control:state.control,hand:state.hand}))assert.ok(!overlap(card,region), `Public card/${name} overlap`);
      assert.ok(await frame.locator('#arenalog').evaluate(el => el.scrollHeight > el.clientHeight), 'History has its own scrollable lane');
      if (width < 900) {
        assert.ok(await page.locator('#scroller').evaluate(el => el.scrollWidth > el.clientWidth), 'Outer scroller preserves readable native board');
        await page.locator('#scroller').evaluate(el => { el.scrollLeft = el.scrollWidth; });
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#scroller').evaluate(el => { el.scrollLeft = 0; });
  await page.waitForTimeout(650);
  await page.evaluate(() => window.send('pause'));
  report.initial = await evaluate(frame, `return {players:game.players.length,me:game.me.name,event:_status.event.name,enginePaused:_status.paused2,empty:!game.me.querySelector('.sk-equipment-empty').hidden};`);
  await page.screenshot({ path: join(evidence, 'native-empty.png') });
  report.equipment = await evaluate(frame, `
    window.fixture={cards:[],virtuals:[],hand:game.me.getCards('h').slice(),selected:ui.selected.cards.slice(),targets:ui.selected.targets.slice(),event:_status.event};
    for(const name of ['zhuge','bagua','dilu','chitu','muniu']){
      const card=game.createCard(name,'spade',7),virtual=new lib.element.VCard(card);
      game.me.addVirtualEquip(virtual,[card]);window.fixture.cards.push(card);window.fixture.virtuals.push(virtual);
    }
    const opponent=game.players.find(player=>player!==game.me),card=game.createCard('qinggang','spade',6);
    opponent.addVirtualEquip(new lib.element.VCard(card),[card]);
    return {kinds:window.fixture.cards.map(card=>get.subtype(card)),engineOwned:window.fixture.cards.every(card=>card.parentNode===game.me.node.equips)};
  `);
  await frame.locator('.sk-equipment-empty').waitFor({ state: 'hidden' });
  await page.waitForTimeout(600);
  assert.deepEqual(report.equipment.kinds, ['equip1', 'equip2', 'equip3', 'equip4', 'equip5']);
  assert.equal(report.equipment.engineOwned, true);
  report.equipment.render = await frame.locator('.player>.equips>.card:not(.hidden):not(.removing)').evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect(), style = getComputedStyle(card);
    return { name: card.getAttribute('data-card-name'), text: card.textContent, color: style.color, opacity: style.opacity, labelOpacity: getComputedStyle(card.querySelector('.name2')).opacity, display: style.display, width: rect.width, height: rect.height };
  }));
  assert.ok(report.equipment.render.every(card => card.color === 'rgb(255, 245, 219)' && Number(card.opacity) >= 0.5 && card.labelOpacity === '1' && card.width > 20 && card.height > 15));
  let state = await geometry(frame);
  assert.ok(!overlap(state.equips, state.hand), 'Five actual equipment faces visible before click');
  await page.screenshot({ path: join(evidence, 'native-five-equipment.png') });
  // Native presentation/registration APIs exercise virtual and disabled slots,
  // long labels, replacement and loss without fabricating engine card DOM.
  await evaluate(frame, `
    const old=window.fixture.virtuals[0];game.me.removeVirtualEquip(old);window.fixture.cards[0].goto(ui.discardPile);
    lib.translate.qinggang='合成测试用长名称装备·完整名称应始终可读';
    const replacement=game.createCard('qinggang','club',9),virtual=new lib.element.VCard(replacement);
    game.me.addVirtualEquip(virtual,[replacement]);window.fixture.cards[0]=replacement;window.fixture.virtuals[0]=virtual;
    replacement.classList.add('selectable','selected');
    game.me.node.equips.children[1].classList.add('selectable');
    game.me.classList.add('linked','turnedover');
    game.players.find(player=>player!==game.me).classList.add('linked','turnedover');
  `);
  await page.waitForTimeout(600);
  report.equipment.selected = await frame.locator('.player[data-position="0"]>.equips>.selected').evaluate(card => ({ outline: getComputedStyle(card).outlineWidth, opacity: getComputedStyle(card.parentNode).opacity, text: card.textContent }));
  assert.equal(report.equipment.selected.outline, '3px');
  assert.equal(report.equipment.selected.opacity, '1');
  assert.match(report.equipment.selected.text, /完整名称/);
  state = await geometry(frame);
  assert.ok(!overlap(state.equips, state.hand));
  assert.ok(state.equips.x >= state.arena.x && state.equips.x + state.equips.width <= state.arena.x + state.arena.width + 2, 'Linked own equipment stays in its reserved lane');
  assert.ok(state.equips.y >= state.arena.y && state.equips.y + state.equips.height <= state.hand.y, 'Linked own equipment remains above the hand');
  assert.match(await frame.locator('.player[data-position="0"]').evaluate(player => getComputedStyle(player, '::after').content), /连环/);
  await page.screenshot({ path: join(evidence, 'native-linked-long-equipment.png') });
  await evaluate(frame, `
    game.me.classList.remove('linked','turnedover');
    game.players.find(player=>player!==game.me).classList.remove('linked','turnedover');
    for(let i=0;i<window.fixture.virtuals.length;i++){game.me.removeVirtualEquip(window.fixture.virtuals[i]);window.fixture.cards[i].goto(ui.discardPile);}
    game.me.$syncDisable({equip2:1});
    const virtual=new lib.element.VCard({name:'zhuge'},[]);
    game.me.addVirtualEquip(virtual,[]);window.fixture.virtual=virtual;
  `);
  assert.equal(await frame.locator('.player[data-position="0"]>.equips>.fakeequip').count(), 1);
  assert.equal(await frame.locator('.player[data-position="0"]>.equips>.feichu').count(), 1);
  assert.equal(await frame.locator('.player[data-position="0"]>.equips').evaluate(el => [...el.children].every(card => card.classList.contains('card'))), true);
  await page.screenshot({ path: join(evidence, 'native-virtual-disabled-equipment.png') });
  await evaluate(frame, `
    game.me.removeVirtualEquip(window.fixture.virtual);for(const card of [...game.me.node.equips.children])if(card.classList.contains('fakeequip'))card.delete(0);
    game.me.$syncDisable({});
  `);
  await frame.locator('.sk-equipment-empty').waitFor();
  await page.waitForTimeout(600);
  report.equipment.replacementLossVirtualDisabledPassed = true;
  const ownHelp = frame.locator('.player[data-position="0"]>.sk-public-help');
  await ownHelp.focus();await page.keyboard.press('Enter');
  await frame.getByRole('dialog').waitFor();
  report.help = await evaluate(frame, `return {title:document.querySelector('.sk-help-modal h2').textContent,names:[...document.querySelectorAll('.sk-help-modal h3')].map(el=>el.textContent),paused:_status.paused2,menusStillHidden:[...document.querySelectorAll('.menubg,.menu-container,.menu')].every(el=>getComputedStyle(el).display==='none')};`);
  assert.equal(report.help.menusStillHidden, true);
  assert.equal(report.help.paused, true);
  assert.match(report.help.title, new RegExp(approved.characters[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await page.screenshot({ path: join(evidence, 'native-keyboard-help.png') });
  await page.evaluate(() => window.send('resume'));
  assert.equal(await evaluate(frame, `return _status.paused2;`), true, 'Host resume cannot bypass open help');
  await page.evaluate(() => window.send('pause'));
  await page.keyboard.press('Escape');
  await frame.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await evaluate(frame, `return _status.paused2;`), true, 'Close cannot wake host-paused game');
  assert.equal(await ownHelp.evaluate(button => button === document.activeElement), true, 'Focus returns to help action');
  assert.equal(await evaluate(frame, `return window.fixture.event===_status.event&&window.fixture.hand.every((card,i)=>game.me.getCards('h')[i]===card)&&window.fixture.selected.every((card,i)=>ui.selected.cards[i]===card)&&window.fixture.targets.every((target,i)=>ui.selected.targets[i]===target);`), true, 'Help preserves pending engine objects and original hand parents');
  await page.evaluate(() => window.send('resume'));
  await ownHelp.focus();await page.keyboard.press('Space');
  await frame.getByRole('dialog').waitFor();
  await frame.getByRole('button', { name: '关闭说明' }).click();
  assert.equal(await evaluate(frame, `return _status.paused2;`), false, 'Active visible match resumes');
  await evaluate(frame, `game.pause2();`);
  await ownHelp.click();await frame.getByRole('button', { name: '关闭说明' }).click();
  assert.equal(await evaluate(frame, `return _status.paused2;`), true, 'Pre-existing native pause is preserved');
  await page.evaluate(() => window.send('resume'));
  await ownHelp.click();
  await evaluate(frame, `Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));`);
  await frame.getByRole('button', { name: '关闭说明' }).click();
  assert.equal(await evaluate(frame, `return _status.paused2;`), true, 'Closing help cannot resume a hidden document');
  await page.evaluate(() => window.send('resume'));
  assert.equal(await evaluate(frame, `return _status.paused2;`), true, 'Explicit host resume still respects document visibility');
  await evaluate(frame, `delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`);
  assert.equal(await evaluate(frame, `return _status.paused2;`), false, 'Active visible document can resume');
  report.help.syntheticVisibilityPassed = true;
  // Hidden identity fixture: the opponent has private marker strings/skills, but
  // only current public skills may enter help. No opponent hand is read by help.
  await evaluate(frame, `
    const player=game.players.find(player=>player!==game.me);
    lib.skill.ux_private_fixture={};lib.translate.ux_private_fixture='秘密技能不可显示';lib.translate.ux_private_fixture_info='秘密内容不可显示';
    player.hiddenSkills.push('ux_private_fixture');player.invisibleSkills.push('ux_private_fixture');
    window.fixture.opponent=player;window.fixture.opponentSkills=player.skills.slice();
  `);
  await frame.locator('.player:not([data-position="0"])>.sk-public-help').first().click();
  assert.doesNotMatch(await frame.getByRole('dialog').innerText(), /秘密技能|秘密内容|身份：/);
  assert.equal(await frame.getByRole('dialog').locator('.card,.handcards,.identity').count(), 0);
  await frame.getByRole('button', { name: '关闭说明' }).click();
  await evaluate(frame, `window.fixture.opponent.classList.add('unseen');`);
  await frame.locator('.player:not([data-position="0"])>.sk-public-help').first().click();
  assert.doesNotMatch(await frame.getByRole('dialog').innerText(), /秘密/);
  assert.equal(await frame.locator('.sk-help-modal h2').innerText(), '当前公开技能');
  await page.keyboard.press('Escape');
  report.help.keyboardEscapeFocusPausePrivacyPassed = true;
  // Use an entirely fresh engine for real response/discard prompts and AI finish.
  await page.evaluate(() => window.start(3));
  await page.waitForFunction(() => window.messages.some(message => message.type === 'running'), null, { timeout: 45_000 });
  frame = page.frames().find(frame => frame.url().includes('/sandbox.html'));
  await frame.waitForFunction(`(async()=>{const {ui,_status}=await import('./noname.js');return !ui.arena.classList.contains('choose-character')&&_status.paused&&ui.arena.querySelector('.sk-action-prompt');})()`, null, { timeout: 30_000 });
  await evaluate(frame, `
    lib.skill.ux_native_fixture={
      trigger:{player:'phaseUseBefore'},forced:true,popup:false,
      async content(event,trigger,player){
        await player.chooseToRespond('合成响应测试：请打出一张闪',{name:'shan'}).set('autochoose',()=>false);
        await player.chooseToDiscard('合成弃牌测试：请选择一张手牌',1,'h',true);
        player.removeSkill('ux_native_fixture');
      }
    };
    game.me.addSkill('ux_native_fixture');
    game.me.directgain([game.createCard('shan','heart',2),game.createCard('tao','heart',3)]);
  `);
  await page.waitForTimeout(700);
  if(!await frame.locator('.sk-action-prompt:not(.removing)').filter({ hasText: '合成响应测试' }).isVisible())await frame.locator('#control').getByText('结束回合', { exact: true }).click();
  await frame.locator('.sk-action-prompt').filter({ hasText: '合成响应测试' }).waitFor({ timeout: 60_000 });
  report.response = await geometry(frame);
  assert.ok(!overlap(report.response.prompt, report.response.history));
  await page.screenshot({ path: join(evidence, 'native-response.png') });
  await clickConfirm(frame, 'cancel');
  await frame.locator('.sk-action-prompt').filter({ hasText: '合成弃牌测试' }).waitFor({ timeout: 20_000 });
  report.discard = await geometry(frame);
  assert.ok(!overlap(report.discard.prompt, report.discard.history));
  await page.screenshot({ path: join(evidence, 'native-discard.png') });
  await frame.locator('#me .card.selectable').first().click();
  await page.waitForTimeout(100);
  if(await frame.locator('.sk-action-prompt:not(.removing)').filter({ hasText: '合成弃牌测试' }).isVisible())await clickConfirm(frame, 'ok');
  await frame.locator('#autobutton').click();
  await page.waitForFunction(() => window.messages.some(message => message.type === 'finished'), null, { timeout: 540_000 });
  report.finished = await evaluate(frame, `return {over:!!_status.over,round:game.roundNumber,phase:game.phaseNumber,history:getComputedStyle(ui.arenalog).display,settlement:!!ui.arena.querySelector('.dialog'),noForcedGameOver:true};`);
  assert.equal(report.finished.over, true);
  assert.equal(report.finished.history, 'none');
  await page.screenshot({ path: join(evidence, 'native-settlement.png') });
  await page.evaluate(() => window.start(4));
  await page.waitForFunction(() => window.messages.some(message => message.type === 'running'), null, { timeout: 45_000 });
  const restarted = page.frames().find(candidate => candidate.url().includes('/sandbox.html'));
  assert.notEqual(restarted, frame);
  report.restart = await evaluate(restarted, `return {players:game.players.length,over:!!_status.over};`);
  assert.equal(report.restart.players, 4);assert.equal(report.restart.over, false);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.requests, []);
  assert.deepEqual(await page.evaluate(() => window.failures), []);
  assert.equal(await page.evaluate(() => window.controller.status), 'running');
  report.browserController = true;
  report.geometryPassed = true;
  console.log(JSON.stringify({ geometryCases: report.geometry.length, equipment: true, help: true, response: true, discard: true, finished: report.finished, restart: report.restart, errors: report.errors }, null, 2));
} catch (error) {
  report.failure = String(error);
  report.messages = await page.evaluate(() => window.messages);
  report.frames = page.frames().map(frame => frame.url());
  if (frame) report.failureGeometry = await geometry(frame).catch(() => null);
  if (frame) report.failureEquipment = await evaluate(frame, `return [...game.me.node.equips.children].map(card=>({name:card.name,classes:card.className}));`).catch(() => null);
  await page.screenshot({ path: join(evidence, 'native-failure.png') }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(evidence, 'native-verification.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
