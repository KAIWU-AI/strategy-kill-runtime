import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Load the pure exports without importing the browser-only filesystem seam.
// The entire remaining module is parsed, but preload/installTableUX is not run.
const source = readFileSync(new URL('../vendor/strategy-kill/adapter-source/preload.js', import.meta.url), 'utf8');
const pureSource = source.replace(/^import[^\n]+\n/, '').replace("const base=new URL('./',import.meta.url);", "const base=new URL('file:///');");
const { publicSkillEntries, tableLayoutStyle } = await import('data:text/javascript;base64,' + Buffer.from(pureSource).toString('base64'));
function fixture() {
  const player = { name: 'synthetic_public_character', disabledSkills: { awake: ['awake_awake'] }, hiddenSkills: ['secret'], invisibleSkills: ['invisible'], forbiddenSkills: {}, getSkills: () => ['full', 'temporary', 'internal', 'equipment'] };
  const lib = {
    skill: { full: {}, temporary: {}, awake: {}, internal: { nopop: true }, equipment: { equipSkill: true }, available: {}, secret: {}, invisible: {} },
    translate: Object.fromEntries(['full', 'temporary', 'awake', 'internal', 'equipment', 'available', 'secret', 'invisible'].map(id => [id + '_info', 'Public synthetic explanation'])),
  };
  const game = { me: player, filterSkills: skills => skills.filter(id => id !== 'awake') };
  const get = { skills: () => ['available', 'secret', 'invisible'], translation: id => 'Complete name ' + id, skillInfoTranslation: id => lib.translate[id + '_info'] };
  return { player, lib, game, get };
}
test('help follows current public skills with full names and awakened disabled state', () => {
  const f = fixture(), entries = publicSkillEntries(f.player, f);
  assert.deepEqual(entries.map(entry => entry.id), ['full', 'temporary', 'awake', 'available']);
  assert.equal(entries.find(entry => entry.id === 'awake').disabled, true);
  assert.equal(entries[0].name, 'Complete name full');
});
test('opponent active skills do not include own available, hidden, or invisible sources', () => {
  const f = fixture();f.game.me = {};
  assert.deepEqual(publicSkillEntries(f.player, f).map(entry => entry.id), ['full', 'temporary', 'awake']);
});
test('unseen and unknown characters reveal no skill entries', () => {
  const f = fixture();f.player.isUnseen = () => true;
  assert.deepEqual(publicSkillEntries(f.player, f), []);
  delete f.player.isUnseen;f.player.name = 'unknown';
  assert.deepEqual(publicSkillEntries(f.player, f), []);
});
test('positioning is scoped to action prompts; equipment contrast is not global-card contrast', () => {
  assert.match(tableLayoutStyle, /\.dialog\.sk-action-prompt\.nobutton/);
  assert.doesNotMatch(tableLayoutStyle, />\.dialog\{/);
  assert.match(tableLayoutStyle, /\.player>\.equips>\.card\{color:#fff5db!important/);
  assert.match(tableLayoutStyle, /\.sk-equipment-empty\[hidden\]\{display:none!important/);
  assert.match(source, /game\.me\.append\(label,empty\)/);
  assert.doesNotMatch(source, /node\.equips\.append\(label/);
});
