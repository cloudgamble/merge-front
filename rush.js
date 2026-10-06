/* Front Rush — a gate-runner companion to Merge Front.
 * Steer your squad through math gates (shoot them to pump the numbers), mow down
 * incoming warriors, and shred a boss every 10 waves. Pick a level, a difficulty,
 * and a 100-wave, 200-wave, or endless run. Clearing a run unlocks a harder level. */
(() => {
'use strict';

// ---------- Layout & camera ----------
const W = 450, H = 800, TAU = Math.PI * 2;
const ROAD = 5;                                   // road half-width in world units
const CAM_BACK = 20, CAM_H = 13.5, FOCAL = 800, HORIZON = 118;
const SPAWN_AHEAD = 112, FADE_FROM = 88, BULLET_RANGE = 52, BULLET_SPEED = 60;
const SEG_LEN = 44, SEG_START = 24, BOSS_EVERY = 10, DECOR_SPAN = 170;
const MAX_FIGS = 150;
const SAVE_KEY = 'frontrush.v1';

// ---------- Balance ----------
// Enemies are sized against an "expected" squad for each wave, so the curve holds
// over 200 waves. A squad that snowballs ahead pulls enemies up by lead^rubber.
const BAL = {
  tierMult: 1.35, fireRate: 2, waveSeconds: 2.4, lethality: 0.35, bossSeconds: 6, finalBoss: 2.5,
  pressure: 0.0065, rubber: 0.7, rubberKill: 0.8, pumpShots: 20, crateSeconds: 0.8, smashShare: 0.04,
  aimShare: 0.8, aimRange: 24, bulletTurn: 40,
  rampWaves: 12, multLeadCap: 4,
  lateGrowth: 1.2, armorK: 0.06,   // upgrade price growth past level 15; armor's diminishing-returns rate
  lateCompound: 1.035,             // past level 20, Firepower and Fire Rate compound by this much per level
};
const expN = k => 5 + 3 * k + 0.02 * k * k;
const expTierF = k => Math.pow(BAL.tierMult, k / 5.5);   // bosses + LV UP gates ≈ one troop level per 5.5 waves
const expDps = k => expN(k) * BAL.fireRate * expTierF(k);

const LEVELS = [
  { name: 'Green Valley',  mult: 1,    sky: ['#5fb4ee', '#cdeeff'], sun: '#fff6c8', hills: ['#8fb8a0', '#6f9a63'], ground: ['#5f9a3e', '#57903a'], road: '#6b6f78', shoulder: '#b8a272', curb: ['#e94b3c', '#ffffff'], line: '#ffffff', decor: ['tree', 'tree', 'bush', 'rock'] },
  { name: 'Dust Canyon',   mult: 1.4,  sky: ['#f0a35e', '#ffe2b8'], sun: '#fff1c2', hills: ['#c9875a', '#b0703f'], ground: ['#d9a865', '#cf9c58'], road: '#8c7b69', shoulder: '#a86d3e', curb: ['#ffffff', '#c9542b'], line: '#ffe9a8', decor: ['cactus', 'cactus', 'rock', 'rock'] },
  { name: 'Frost Pass',    mult: 1.95, sky: ['#8fb0d6', '#eef5fc'], sun: '#ffffff', hills: ['#c3d3e6', '#a9bfd8'], ground: ['#e9f0f7', '#dde7f1'], road: '#7a8593', shoulder: '#c9d6e3', curb: ['#3a7bd5', '#ffffff'], line: '#ffffff', decor: ['pine', 'pine', 'pine', 'rock'] },
  { name: 'Ember Ridge',   mult: 2.7,  sky: ['#2a1020', '#b4482a'], sun: '#ffb36b', hills: ['#4a2026', '#331820'], ground: ['#3b2b27', '#33241f'], road: '#47403f', shoulder: '#2a1c18', curb: ['#ff6a2a', '#2a2a2a'], line: '#ffb36b', decor: ['lava', 'rock', 'lava', 'deadtree'] },
  { name: 'Night Harbor',  mult: 3.8,  sky: ['#081028', '#27407a'], sun: '#e8f0ff', hills: ['#1a2a4a', '#13203a'], ground: ['#1f2b42', '#1a2538'], road: '#343a48', shoulder: '#2a3142', curb: ['#5ad1ff', '#20304a'], line: '#5ad1ff', decor: ['lamp', 'lamp', 'box', 'bush'] },
  { name: 'Iron Fortress', mult: 5.3,  sky: ['#3f4550', '#a8b0ba'], sun: '#e8e8e8', hills: ['#5d636c', '#4b5058'], ground: ['#5b6066', '#53585e'], road: '#2e3136', shoulder: '#45484e', curb: ['#ffd23f', '#1e1e1e'], line: '#ffd23f', decor: ['pylon', 'pylon', 'wreck', 'rock'] },
  { name: 'Jungle Delta',  mult: 7.4,  sky: ['#6fc3b8', '#d9f5e8'], sun: '#fff6d0', hills: ['#5a9a7a', '#3f7d5a'], ground: ['#2f7d3a', '#2a7134'], road: '#5d5a52', shoulder: '#6b5434', curb: ['#ffd23f', '#2a2a2a'], line: '#ffffff', decor: ['palm', 'palm', 'fern', 'bush'] },
  { name: 'Storm Coast',   mult: 10.4, sky: ['#3d4a5c', '#9fb2c4'], sun: '#dfe8f0', hills: ['#4a5868', '#3b4756'], ground: ['#b9ab8a', '#ad9f7e'], road: '#55595f', shoulder: '#8a8172', curb: ['#ffffff', '#d33a2c'], line: '#ffffff', decor: ['grass', 'post', 'rock', 'grass'], weather: 'rain' },
  { name: 'Crystal Caves', mult: 14.5, sky: ['#140e24', '#3b2a5c'], sun: null,      hills: ['#2a1f40', '#1f1730'], ground: ['#2a2238', '#251e32'], road: '#3b3548', shoulder: '#2a2236', curb: ['#b46cff', '#3a2a55'], line: '#d9b3ff', decor: ['crystal', 'crystal', 'stalag', 'rock'] },
  { name: 'Moon Base',     mult: 20.3, sky: ['#05060c', '#1c2238'], sun: '#7ab8ff', hills: ['#5a5e68', '#44474f'], ground: ['#8d9097', '#868990'], road: '#3c3f46', shoulder: '#6d7078', curb: ['#7af0ff', '#2a2e36'], line: '#7af0ff', decor: ['dome', 'antenna', 'crater', 'rock'], weather: 'stars' },
  { name: 'Sky Citadel',   mult: 28.4, sky: ['#7fb3ff', '#ffe9f2'], sun: '#fff3c4', hills: ['#ffffff', '#eef2fb'], ground: ['#f2f5ff', '#e6ecf9'], road: '#6a6f8a', shoulder: '#c9cfe6', curb: ['#ffd23f', '#ffffff'], line: '#ffd23f', decor: ['cloud', 'pillar', 'pillar', 'banner'] },
  { name: 'Black Citadel', mult: 39.8, sky: ['#140608', '#4a0f14'], sun: '#ff3b2f', hills: ['#2a0c10', '#1d080b'], ground: ['#1e1a1c', '#1a1618'], road: '#2a2628', shoulder: '#120f10', curb: ['#ff3b2f', '#111111'], line: '#ff3b2f', decor: ['spike', 'pylon', 'lava', 'wreck'] },
];
// Brutal and up unlock per level, each by clearing the tier below it there.
const DIFFS = [
  { name: 'EASY',      enemy: 0.7,  color: '#5fd67a' },
  { name: 'NORMAL',    enemy: 1,    color: '#ffb43a' },
  { name: 'HARD',      enemy: 1.45, color: '#ff5a4a' },
  { name: 'BRUTAL',    enemy: 2.2,  color: '#ff4fa0' },
  { name: 'NIGHTMARE', enemy: 3.5,  color: '#a77bff' },
  { name: 'INFERNO',   enemy: 6,    color: '#ff7a1a' },
];
// Payouts grow a little faster than toughness, so the hardest thing you can clear always pays best.
const COIN_EXP = 1.15;
for (const lv of LEVELS) lv.coins = Math.round(Math.pow(lv.mult, COIN_EXP) * 10) / 10;
for (const d of DIFFS) d.coins = Math.round(Math.pow(d.enemy, COIN_EXP) * 10) / 10;
const DAILY_MODE = 3, DAILY_WAVES = 30, HEAD_START = 50;
const MODES = [
  { name: '100 WAVES', waves: 100, bonus: 250 },
  { name: '200 WAVES', waves: 200, bonus: 800 },
  { name: 'ENDLESS',   waves: Infinity, bonus: 0 },
  { name: 'DAILY',     waves: DAILY_WAVES, bonus: 0 },
];
const DAILY_MODS = [
  { id: 'giants',   name: 'GIANTS',      desc: 'Every warrior is an elite' },
  { id: 'bossrush', name: 'BOSS RUSH',   desc: 'A boss every 5 waves' },
  { id: 'glass',    name: 'GLASS CANNON', desc: 'Double damage, enemies hit twice as hard' },
  { id: 'multi',    name: 'MULTIPLIERS', desc: 'x2 and x3 gates everywhere' },
  { id: 'crates',   name: 'SUPPLY DROP', desc: 'A crate every wave' },
  { id: 'blitz',    name: 'BLITZ',       desc: 'Everything moves 40% faster' },
];
const modName = id => (DAILY_MODS.find(m => m.id === id) || { name: id }).name;
// Prices climb steeply for the first 15 levels, then more gently (BAL.lateGrowth per level).
const priceCurve = (base, early) => l => Math.round(base * (l <= 15
  ? Math.pow(early, l)
  : Math.pow(early, 15) * Math.pow(BAL.lateGrowth, l - 15)));
const armorKeep = l => 1 / (1 + BAL.armorK * l);
// Linear for the first 20 levels, then compounding, so late power keeps pace with late prices.
const linThenCompound = per => l => l <= 20 ? 1 + per * l : (1 + per * 20) * Math.pow(BAL.lateCompound, l - 20);
const dmgMult = linThenCompound(0.25), rateMult = linThenCompound(0.12);
const pctText = m => fmt((m - 1) * 100) + '%';
const UPGRADES = [
  { key: 'troops', name: 'RECRUITS',     info: l => `Start with ${1 + 2 * l} troops`,                    cost: priceCurve(25, 1.45) },
  { key: 'dmg',    name: 'FIREPOWER',    info: l => `+${pctText(dmgMult(l))} damage`,                   cost: priceCurve(30, 1.42) },
  { key: 'rate',   name: 'FIRE RATE',    info: l => `+${pctText(rateMult(l))} fire rate`,               cost: priceCurve(30, 1.42) },
  { key: 'armor',  name: 'ARMOR',        info: l => `Lose ${Math.round((1 - armorKeep(l)) * 100)}% fewer troops`, cost: priceCurve(40, 1.42) },
  { key: 'boss',   name: 'BOSS SLAYER',  info: l => `+${30 * l}% damage to bosses`,                     cost: priceCurve(35, 1.42) },
  { key: 'crate',  name: 'CRATE HUNTER', info: l => `Crates +${25 * l}% troops, ${Math.round(crateChance(l) * 100)}% spawn`, cost: priceCurve(25, 1.42) },
  { key: 'loot',   name: 'LOOT',         info: l => `+${12 * l}% coins`,                                cost: priceCurve(40, 1.5) },
];
function crateChance(l) { return Math.min(0.55, 0.3 + 0.015 * l); }
const BOSS_NAMES = ['IRON WARLORD', 'BONE CRUSHER', 'GRIM TITAN', 'THE COLOSSUS', 'WAR CHIEF', 'SKULLBREAKER'];
const TIER = ['#a7b0a8', '#7cc25a', '#36c2b0', '#4a8fe8', '#a066ea', '#f39c2b', '#ec4f4a', '#ffd23f', '#ff7ad9', '#7af0ff'];
const tierColor = L => TIER[Math.min(L - 1, TIER.length - 1)];
const SLOTS = Array.from({ length: MAX_FIGS }, (_, i) => {
  const a = i * 2.39996, r = 0.24 * Math.sqrt(i + 0.5);
  return [Math.cos(a) * r, Math.sin(a) * r * 0.75];
});

// ---------- Utilities ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
function fmt(n) {
  n = Math.round(n);
  if (n < 10000) return n.toLocaleString('en-US');
  for (const [v, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (n >= v) { const x = n / v; return (x >= 100 ? x.toFixed(0) : x.toFixed(1)) + s; }
  }
  return String(n);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function proj(x, z, h = 0) {
  const s = FOCAL / (z + CAM_BACK);
  return { x: W / 2 + x * s, y: HORIZON + (CAM_H - h) * s, s };
}

// ---------- Persistent progress ----------
// Saves are forward-compatible: missing fields fall back to defaults, unknown ones are ignored,
// and unlocks are re-derived from clears so levels added later open up for existing players.
const SAVE_VERSION = 2;
const STAT_KEYS = ['kills', 'bosses', 'runs', 'bestCrowd', 'bestTier', 'jackpots', 'dailies'];
const defaultMeta = () => ({
  v: SAVE_VERSION, coins: 0, muted: false, speed: 1, headStart: false,
  up: Object.fromEntries(UPGRADES.map(u => [u.key, 0])),
  sel: { level: 0, diff: 1, mode: 0 },
  levels: LEVELS.map((_, i) => ({ unlocked: i === 0, c100: false, c200: false, hard: false, best: 0, maxDiff: -1 })),
  stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])),
  goals: {},
  daily: { date: '', level: 0, diff: 1, mods: [], done: false, best: 0 },
});
const meta = defaultMeta();
function save() {
  meta.v = SAVE_VERSION;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') applySave(s);
  } catch (e) { /* corrupt save: keep defaults */ }
}
function applySave(s) {
  Object.assign(meta, defaultMeta());
  {
    const num = v => Math.max(0, Math.floor(Number(v)) || 0);
    meta.coins = num(s.coins);
    meta.muted = !!s.muted;
    meta.speed = [1, 2, 3].includes(s.speed) ? s.speed : 1;
    meta.headStart = !!s.headStart;
    if (s.stats) for (const k of STAT_KEYS) meta.stats[k] = num(s.stats[k]);
    if (s.goals && typeof s.goals === 'object') for (const k of Object.keys(s.goals)) meta.goals[k] = !!s.goals[k];
    if (s.daily && typeof s.daily.date === 'string') {
      meta.daily = {
        date: s.daily.date, level: clamp(num(s.daily.level), 0, LEVELS.length - 1), diff: clamp(num(s.daily.diff), 0, DIFFS.length - 1),
        mods: Array.isArray(s.daily.mods) ? s.daily.mods.filter(id => DAILY_MODS.some(m => m.id === id)) : [],
        done: !!s.daily.done, best: num(s.daily.best),
      };
    }
    for (const u of UPGRADES) meta.up[u.key] = Math.max(0, Math.floor(Number(s.up && s.up[u.key])) || 0);
    if (s.sel) {
      meta.sel.level = clamp(Math.floor(s.sel.level) || 0, 0, LEVELS.length - 1);
      meta.sel.diff = clamp(Math.floor(s.sel.diff) || 0, 0, DIFFS.length - 1);
      meta.sel.mode = clamp(Math.floor(s.sel.mode) || 0, 0, MODES.length - 1);
    }
    if (Array.isArray(s.levels)) s.levels.forEach((l, i) => {
      if (!meta.levels[i] || !l) return;
      // v1 saves didn't record which tier a clear was on: Hard is known, anything else counts as Normal.
      const maxDiff = Number.isInteger(l.maxDiff) ? clamp(l.maxDiff, -1, DIFFS.length - 1)
        : l.hard ? 2 : (l.c100 || l.c200) ? 1 : -1;
      Object.assign(meta.levels[i], { unlocked: i === 0 || !!l.unlocked, c100: !!l.c100, c200: !!l.c200, hard: !!l.hard, best: Math.max(0, Math.floor(l.best) || 0), maxDiff });
    });
    for (let i = 1; i < meta.levels.length; i++) {
      const prev = meta.levels[i - 1];
      if (prev.c100 || prev.c200) meta.levels[i].unlocked = true;
    }
    if (!meta.levels[meta.sel.level].unlocked) meta.sel.level = 0;
    meta.sel.diff = bestAllowedDiff(meta.sel.level, meta.sel.diff);
    if (meta.sel.mode >= DAILY_MODE) meta.sel.mode = 0;
  }
}
const diffUnlocked = (L, d) => d <= 2 || meta.levels[L].maxDiff >= d - 1;
const headStartOk = (L, d) => meta.levels[L].maxDiff >= d;
function bestAllowedDiff(L, d) {
  while (d > 0 && !diffUnlocked(L, d)) d--;
  return d;
}

// ---------- Daily challenge & goals ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
// One challenge per calendar day: a level you've unlocked, at the toughest tier you've beaten there, plus two twists.
function ensureDaily() {
  const key = todayKey();
  if (meta.daily.date === key) return meta.daily;
  const rnd = mulberry32(hashStr(key));
  const open = meta.levels.map((l, i) => l.unlocked ? i : -1).filter(i => i >= 0);
  const level = open[Math.floor(rnd() * open.length)];
  const a = Math.floor(rnd() * DAILY_MODS.length);
  let b = Math.floor(rnd() * (DAILY_MODS.length - 1));
  if (b >= a) b++;
  meta.daily = { date: key, level, diff: clamp(meta.levels[level].maxDiff, 1, DIFFS.length - 1), mods: [DAILY_MODS[a].id, DAILY_MODS[b].id], done: false, best: 0 };
  save();
  return meta.daily;
}
const dailyPrize = () => Math.round(1500 * LEVELS[meta.daily.level].coins * DIFFS[meta.daily.diff].coins * (1 + 0.12 * meta.up.loot));
const topTier = m => m.levels.reduce((a, l) => Math.max(a, l.maxDiff), -1);
const GOALS = [
  { id: 'kills1',  name: 'FIRST BLOOD',     desc: 'Defeat 100 warriors',            target: 100,   value: m => m.stats.kills,     reward: 300 },
  { id: 'kills2',  name: 'EXTERMINATOR',    desc: 'Defeat 10,000 warriors',         target: 1e4,   value: m => m.stats.kills,     reward: 6000 },
  { id: 'kills3',  name: 'ANNIHILATOR',     desc: 'Defeat 250,000 warriors',        target: 2.5e5, value: m => m.stats.kills,     reward: 120000 },
  { id: 'kills4',  name: 'EXTINCTION',      desc: 'Defeat 5,000,000 warriors',      target: 5e6,   value: m => m.stats.kills,     reward: 6e6 },
  { id: 'boss1',   name: 'GIANT SLAYER',    desc: 'Defeat 10 bosses',               target: 10,    value: m => m.stats.bosses,    reward: 1000 },
  { id: 'boss2',   name: 'TITAN HUNTER',    desc: 'Defeat 250 bosses',              target: 250,   value: m => m.stats.bosses,    reward: 60000 },
  { id: 'boss3',   name: 'BOSS NEMESIS',    desc: 'Defeat 2,500 bosses',            target: 2500,  value: m => m.stats.bosses,    reward: 2e6 },
  { id: 'crowd1',  name: 'PLATOON',         desc: 'Lead 100 troops at once',        target: 100,   value: m => m.stats.bestCrowd, reward: 400 },
  { id: 'crowd2',  name: 'BATTALION',       desc: 'Lead 1,000 troops at once',      target: 1000,  value: m => m.stats.bestCrowd, reward: 8000 },
  { id: 'crowd3',  name: 'LEGION',          desc: 'Lead 10,000 troops at once',     target: 1e4,   value: m => m.stats.bestCrowd, reward: 150000 },
  { id: 'jackpot', name: 'TOOK THE BAIT',   desc: 'Go through a +99 gate',          target: 1,     value: m => m.stats.jackpots,  reward: 500 },
  { id: 'tier',    name: 'ELITE FORCE',     desc: 'Reach troop level 30 in a run',  target: 30,    value: m => m.stats.bestTier,  reward: 40000 },
  { id: 'lv6',     name: 'FORTRESS FALLEN', desc: 'Clear LV 6 Iron Fortress',       target: 1,     value: m => +(m.levels[5].maxDiff >= 0),  reward: 60000 },
  { id: 'lv9',     name: 'DEEP DELVER',     desc: 'Clear LV 9 Crystal Caves',       target: 1,     value: m => +(m.levels[8].maxDiff >= 0),  reward: 600000 },
  { id: 'lv12',    name: 'CONQUEROR',       desc: 'Clear LV 12 Black Citadel',      target: 1,     value: m => +(m.levels[11].maxDiff >= 0), reward: 8e6 },
  { id: 'brutal',  name: 'BRUTAL',          desc: 'Clear any level on Brutal',      target: 1,     value: m => +(topTier(m) >= 3), reward: 150000 },
  { id: 'night',   name: 'NIGHTMARE',       desc: 'Clear any level on Nightmare',   target: 1,     value: m => +(topTier(m) >= 4), reward: 1.5e6 },
  { id: 'inferno', name: 'INFERNO',         desc: 'Clear any level on Inferno',     target: 1,     value: m => +(topTier(m) >= 5), reward: 2e7 },
  { id: 'endless', name: 'NO END IN SIGHT', desc: 'Reach wave 250 in Endless',      target: 250,   value: m => Math.max(...m.levels.map(l => l.best)), reward: 300000 },
  { id: 'daily1',  name: 'DAILY DUTY',      desc: 'Complete a daily challenge',     target: 1,     value: m => m.stats.dailies,   reward: 2000 },
  { id: 'daily7',  name: 'TOUR OF DUTY',    desc: 'Complete 7 daily challenges',    target: 7,     value: m => m.stats.dailies,   reward: 80000 },
];
function checkGoals() {
  const done = [];
  for (const g of GOALS) {
    if (meta.goals[g.id] || g.value(meta) < g.target) continue;
    meta.goals[g.id] = true;
    meta.coins += g.reward;
    done.push(g);
  }
  if (done.length) save();
  return done;
}
const BACKUP_PREFIX = 'FRONTRUSH1-';
function exportSave() {
  save();
  const code = BACKUP_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
  try { if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {}); } catch (e) { /* clipboard blocked */ }
  window.prompt('Your Front Rush backup code (also copied to the clipboard). Keep it somewhere safe:', code);
  toast('Backup code ready');
}
function importSave() {
  const code = window.prompt('Paste a Front Rush backup code to restore it. This replaces the current progress.');
  if (!code) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim().replace(BACKUP_PREFIX, '')))));
    if (!data || typeof data !== 'object' || !data.up || !Array.isArray(data.levels)) throw new Error('not a save');
    applySave(data);
    save();
    toMenu();
    toast('Save restored!');
    sfx.crate();
  } catch (e) {
    toast("That code didn't work");
    sfx.error();
  }
}

// ---------- Audio (tiny synth, no assets) ----------
let actx = null, noiseBuf = null;
const sfxLast = {};
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.6), actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function ok(key, gap) {
  if (!actx || meta.muted || SIM) return false;
  const now = performance.now();
  if (sfxLast[key] && now - sfxLast[key] < gap) return false;
  sfxLast[key] = now;
  return true;
}
function tone(freq, dur, type = 'square', vol = 0.08, slide = 0, delay = 0) {
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq) {
  const t = actx.currentTime;
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(60, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(actx.destination);
  s.start(t); s.stop(t + dur);
}
const sfx = {
  shot()   { if (ok('shot', 70)) noise(0.04, 0.035, 4000); },
  pop()    { if (ok('pop', 50)) { noise(0.12, 0.06, 1500); tone(240, 0.08, 'square', 0.03, 0.5); } },
  hurt()   { if (ok('hurt', 90)) tone(180, 0.12, 'sawtooth', 0.05, 0.6); },
  good()   { if (ok('good', 120)) [660, 880, 1175].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, 0, i * 0.05)); },
  bad()    { if (ok('bad', 120)) [440, 330, 247].forEach((f, i) => tone(f, 0.14, 'sawtooth', 0.05, 0, i * 0.06)); },
  pump()   { if (ok('pump', 60)) tone(900 + Math.random() * 200, 0.04, 'square', 0.025); },
  boom()   { if (ok('boom', 90)) { noise(0.5, 0.2, 800); tone(70, 0.35, 'sine', 0.12, 0.5); } },
  smash()  { if (ok('smash', 200)) { noise(0.7, 0.28, 500); tone(55, 0.5, 'sine', 0.16, 0.5); } },
  crate()  { if (ok('crate', 100)) [784, 1047, 1319].forEach((f, i) => tone(f, 0.1, 'square', 0.04, 0, i * 0.05)); },
  horn()   { if (ok('horn', 400)) { tone(196, 0.3, 'sawtooth', 0.06); tone(147, 0.5, 'sawtooth', 0.06, 0, 0.25); } },
  stage()  { if (ok('stage', 400)) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, 0, i * 0.08)); },
  win()    { if (ok('win', 800)) [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.24, 'triangle', 0.09, 0, i * 0.11)); },
  lose()   { if (ok('lose', 800)) [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.05, 0, i * 0.16)); },
  click()  { if (ok('click', 30)) tone(620, 0.04, 'square', 0.035); },
  error()  { if (ok('error', 100)) tone(160, 0.18, 'sawtooth', 0.05, 0.8); },
};

// ---------- State ----------
let SIM = false;            // true while the balance simulator runs (no effects/sound)
let mode = 'menu';          // menu | shop | run | over
let run = null, demo = null, result = null;
let paused = false, overT = 0, time = 0, shake = 0, keyDir = 0;
let particles = [], floaters = [];
let toastMsg = '', toastTime = 0;
let steer = null, pressedBtn = null, levelPage = 0, goalsPage = 0;
const PER_PAGE = 6, GOALS_PER_PAGE = 8;
const pointer = { x: -1, y: -1 };

function newRun(level, diff, modeIdx, isDemo = false, opts = {}) {
  const r = {
    level, diff, modeIdx, maxWaves: MODES[modeIdx].waves, demo: isDemo,
    mods: new Set(opts.mods || []), headStart: !!opts.headStart, startWave: 0,
    dist: 0, x: 0, targetX: 0, N: isDemo ? 16 : 1 + 2 * meta.up.troops, tier: 1, wave: 0, stage: 1, seg: 0,
    enemies: [], props: [], bosses: [], gates: [], bullets: [], figs: [], decor: [],
    fireAcc: 0, kills: 0, bossKills: 0, coins: 0, time: 0, ended: null, endTimer: 0, finished: false, losses: {},
    maxN: 0, jackpots: 0,
    banner: null, hintT: isDemo ? 0 : 4.5, lockWas: false,
  };
  if (r.headStart) {
    // Skip the opening waves with the squad a typical run would have by then.
    r.wave = r.seg = r.startWave = HEAD_START;
    r.stage = Math.floor(HEAD_START / BOSS_EVERY) + 1;
    r.dist = HEAD_START * SEG_LEN;
    r.N = Math.max(r.N, Math.round(expN(HEAD_START)));
    r.tier = 1 + Math.round(HEAD_START / 5.5);
  }
  const types = LEVELS[level].decor;
  for (let i = 0; i < 30; i++) r.decor.push(makeDecor(types, r.dist + rand(-8, DECOR_SPAN - 8)));
  return r;
}
function makeDecor(types, d) {
  const side = Math.random() < 0.5 ? -1 : 1;
  return { type: types[Math.floor(Math.random() * types.length)], x: side * rand(6.4, 13), d, sc: rand(0.8, 1.25) };
}
const crowdR = () => 0.24 * Math.sqrt(Math.min(run.N, MAX_FIGS) + 0.5) + 0.3;
const shotDmg = () => Math.pow(BAL.tierMult, run.tier - 1) * dmgMult(meta.up.dmg) * (run.mods.has('glass') ? 2 : 1);
const shotsPerSoldier = () => BAL.fireRate * rateMult(meta.up.rate);
const runSpeed = () => Math.min(18, 9 + 0.5 * (run.stage - 1) + 0.6 * Math.min(run.level, 5)) * (run.mods.has('blitz') ? 1.4 : 1);
const bossEvery = () => run.mods.has('bossrush') ? 5 : BOSS_EVERY;
const coinMult = () => LEVELS[run.level].coins * DIFFS[run.diff].coins * (1 + 0.12 * meta.up.loot) * (run.modeIdx === DAILY_MODE ? 2 : 1);
// Enemy toughness for wave k. Level/difficulty multipliers ease in over the first waves;
// a squad that pulls ahead of the expected curve drags enemies up with it.
function threat(k) {
  const ramp = m => 1 + (m - 1) * Math.min(1, k / BAL.rampWaves);
  const lead = Math.max(1, run.N * Math.pow(BAL.tierMult, run.tier - 1) / (expN(k) * expTierF(k)));
  const leadN = Math.max(1, run.N / expN(k));
  const over = Math.max(0, k - 200);                 // past wave 200, endless runs ramp exponentially
  const lv = ramp(LEVELS[run.level].mult), df = ramp(DIFFS[run.diff].enemy);
  return {
    hp: lv * df * (1 + BAL.pressure * k) * Math.pow(1.025, over) * Math.pow(lead, BAL.rubber),
    kill: Math.sqrt(lv) * df * Math.pow(1.012, over) * Math.pow(leadN, BAL.rubberKill),
    lead,
  };
}

// ---------- Effects ----------
function addP(p) {
  if (SIM || particles.length >= 600) return;
  p.d = run.dist + p.z;
  particles.push(p);
}
function puff(x, z, h, color, n, spd = 2.5) {
  for (let i = 0; i < n; i++) {
    const l = rand(0.25, 0.5);
    addP({ k: 'puff', x, z, h, vx: rand(-spd, spd), vz: rand(-spd, spd), vh: rand(1, 4), life: l, max: l, size: rand(0.08, 0.16), color });
  }
}
function explode(x, z, h, s) {
  addP({ k: 'flash', x, z, h, life: 0.14, max: 0.14, size: 1.2 * s, color: '#fff3c4' });
  addP({ k: 'ring', x, z, h: 0.05, life: 0.4, max: 0.4, size: 2.2 * s, color: '#ffe7b0' });
  for (let i = 0; i < 10 * s; i++) {
    const l = rand(0.3, 0.6);
    addP({ k: 'fire', x, z, h, vx: rand(-4, 4) * s, vz: rand(-4, 4) * s, vh: rand(1, 5) * s, life: l, max: l, size: rand(0.18, 0.4) * s, color: ['#fff0a0', '#ffb347', '#ff6a2a'][i % 3] });
  }
  for (let i = 0; i < 6 * s; i++) {
    const l = rand(0.7, 1.2);
    addP({ k: 'smoke', x, z, h, vx: rand(-1.5, 1.5), vz: rand(-1.5, 1.5), vh: rand(0.5, 2), life: l, max: l, size: rand(0.3, 0.6) * s });
  }
}
function floater(text, x, y, color, size = 18, life = 1) {
  if (!SIM && floaters.length < 40) floaters.push({ text, x, y, color, size, life, max: life });
}
function floatAt(text, wx, wz, wh, color, size, life) {
  const p = proj(wx, wz, wh);
  floater(text, p.x, p.y, color, size, life);
}
function banner(title, sub, color = '#ffd84a') { run.banner = { title, sub, color, t: 2, max: 2 }; }
function toast(msg) { toastMsg = msg; toastTime = 1.8; }
function updateFx(dt) {
  for (const p of particles) {
    p.life -= dt;
    if (p.vx !== undefined) {
      p.x += p.vx * dt; p.d += p.vz * dt; p.h += p.vh * dt;
      if (p.k === 'smoke') { p.vh = Math.max(p.vh, 0.6); p.size += 0.5 * dt; }
      else { p.vh -= 12 * dt; if (p.h < 0) { p.h = 0; p.vh *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } }
    }
  }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.life -= dt; f.y -= 38 * dt; }
  floaters = floaters.filter(f => f.life > 0);
}

// ---------- Level generation ----------
const gateGood = s => s.op === '+' || s.op === 'x' || s.op === 'tier';
function gateValue(s, N) {
  switch (s.op) {
    case '+': return N + s.v;
    case '-': return N - s.v;
    case 'x': return N * s.v;
    case '/': return N / s.v;
    default: return N * BAL.tierMult;
  }
}
function makeGatePair(k, lead) {
  const g = expN(k), r = Math.random();
  const P = (a, b) => ({ op: '+', v: Math.max(1, Math.round(g * rand(a, b))) });
  const M = (a, b) => ({ op: '-', v: Math.max(1, Math.round(g * rand(a, b))) });
  let a, b, jackpot = false;
  if (k === 0) { a = { op: '+', v: 4 }; b = { op: '+', v: 8 }; }
  else if (run.mods.has('multi') && r < 0.6) { a = { op: 'x', v: Math.random() < 0.4 ? 3 : 2 }; b = P(0.3, 0.55); }
  else if (k % 7 === 5) { a = { op: 'tier', v: 1 }; b = P(0.3, 0.5); }
  else if (k >= 4 && g < 150 && r < 0.09) { a = { op: '+', v: 1 }; b = { op: '+', v: 99 }; jackpot = true; }  // the classic ad bait
  else if (k >= 3 && r < 0.25 && lead < BAL.multLeadCap) { a = { op: 'x', v: k >= 30 && Math.random() < 0.25 ? 3 : 2 }; b = P(0.3, 0.55); }
  else if (k >= 3 && r < 0.55) { a = P(0.2, 0.4); b = M(0.15, 0.3); }
  else if (k >= 8 && r < 0.66) { a = M(0.12, 0.25); b = { op: '/', v: 2 }; }
  else { a = P(0.05, 0.12); b = P(0.3, 0.5); }
  const [left, right] = Math.random() < 0.5 ? [a, b] : [b, a];
  for (const s of [left, right]) { s.pump = 0; s.pulse = 0; }
  // The better-looking side is guarded by the thicker half of the wave.
  const guard = gateValue(right, 100) >= gateValue(left, 100) ? 1 : -1;
  return { left, right, guard, jackpot };
}
function makeEnemy(x, d, hp, power, elite) {
  const speed = (elite ? 2.2 : rand(2.6, 3.4)) * (run.mods.has('blitz') ? 1.4 : 1);
  return { x, d, hp, max: hp, power, elite, r: elite ? 0.55 : 0.36, speed, ph: rand(0, TAU), flash: 0, dead: false, charge: rand(26, 32) };
}
function spawnWave(k, d, th, gate) {
  let count = Math.min(26, 4 + Math.floor(k / 3));
  let elites = (k >= 6 ? 1 + Math.floor(k / 30) : 0) + (gate.jackpot ? 2 : 0);
  const giants = run.mods.has('giants');
  if (giants) { elites += Math.ceil(count / 3); count = 0; }
  const units = count + elites * 5;                      // an elite counts as five warriors
  const hp = expDps(k) * BAL.waveSeconds * Math.min(1, 0.35 + k / 12) * th.hp / units;   // gentle first waves
  const power = Math.max(1, Math.round(BAL.lethality * expN(k) * th.kill * (run.mods.has('glass') ? 2 : 1) / units));
  const rows = Math.ceil(count / 7);
  for (let i = 0; i < count; i++) {
    const side = Math.random() < 0.62 ? gate.guard : -gate.guard;
    run.enemies.push(makeEnemy(side * rand(0.4, ROAD - 0.5), d + rand(0, rows * 1.1), hp, power, false));
  }
  for (let i = 0; i < elites; i++) {
    const side = giants && Math.random() >= 0.62 ? -gate.guard : gate.guard;
    run.enemies.push(makeEnemy(side * rand(1, ROAD - 1), d - 1.2 - (giants ? rand(0, 5) : i * 0.6), hp * 5, power * 5, true));
  }
  if (k >= 2 && Math.random() < 0.3) {
    const n = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      run.props.push({ kind: 'barrel', x: rand(-ROAD + 0.8, ROAD - 0.8), d: d - 3 - i * 1.5, hp: expDps(k) * 0.12 * th.hp, max: expDps(k) * 0.12 * th.hp, r: 0.45, blast: hp * 3, flash: 0, dead: false });
    }
  }
}
function spawnCrate(k, d, tm) {
  const hp = expDps(k) * BAL.crateSeconds * tm;
  const reward = Math.max(2, Math.round(expN(k) * 0.15 * (1 + 0.25 * meta.up.crate)));
  run.props.push({ kind: 'crate', x: (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 3.2), d, hp, max: hp, r: 0.6, reward, flash: 0, dead: false });
}
function spawnBoss(k, d, tm, final) {
  const hp = expDps(k) * BAL.bossSeconds * Math.min(1, 0.45 + k / 36) * tm * (final ? BAL.finalBoss : 1);
  run.bosses.push({
    k, d, x: 0, hp, max: hp, final, alive: true, smashT: 2.2, flash: 0, step: 0,
    name: final ? 'SUPREME OVERLORD' : BOSS_NAMES[Math.floor(k / bossEvery()) % BOSS_NAMES.length],
  });
}
function genSegment(k) {
  const d0 = SEG_START + k * SEG_LEN, final = k === run.maxWaves - 1;
  const bossWave = final || k % bossEvery() === bossEvery() - 1;
  const th = threat(k);
  const gate = final ? null : makeGatePair(k, th.lead);
  if (bossWave) spawnBoss(k, d0 + 14, th.hp, final);
  else if (k > 0) spawnWave(k, d0 + 12, th, gate);
  if (!bossWave && Math.random() < (k === 0 || run.mods.has('crates') ? 1 : crateChance(meta.up.crate))) spawnCrate(k, d0 + 4, th.hp);
  if (gate) run.gates.push({ k, d: d0 + SEG_LEN - 6, tm: th.hp, ...gate, passed: false, chosen: null, fade: 1 });
}

// ---------- Run simulation ----------
function loseTroops(n, src) {
  if (n <= 0 || run.N <= 0) return;
  n = Math.floor(n * armorKeep(meta.up.armor) + Math.random());   // random rounding keeps small hits fair
  if (n <= 0) return;
  run.losses[src] = (run.losses[src] || 0) + Math.min(n, run.N);
  run.N = Math.max(0, run.N - n);
  sfx.hurt();
}
function killEnemy(e) {
  e.dead = true;
  run.kills++;
  puff(e.x, e.d - run.dist, 0.6, e.elite ? '#7a3a9a' : '#c0392b', e.elite ? 12 : 6, 3);
  sfx.pop();
}
function destroyProp(o) {
  o.dead = true;
  const z = o.d - run.dist;
  if (o.kind === 'crate') {
    run.N += o.reward;
    puff(o.x, z, 0.6, '#c9934f', 14, 3.5);
    floatAt('+' + fmt(o.reward), o.x, z, 1.6, '#7fd0ff', 22, 1.1);
    sfx.crate();
  } else {
    explode(o.x, z, 0.5, 1.4);
    shake = Math.min(10, shake + 4);
    for (const e of run.enemies) {
      if (!e.dead && Math.hypot(e.x - o.x, e.d - o.d) < 2.4) {
        e.hp -= o.blast;
        if (e.hp <= 0) killEnemy(e);
      }
    }
    sfx.boom();
  }
}
function killBoss(b) {
  b.alive = false;
  run.bossKills++;
  run.tier++;
  const z = b.d - run.dist;
  explode(b.x, z, 2, 3);
  explode(b.x - 1, z, 1, 2);
  explode(b.x + 1, z, 3, 2);
  shake = 14;
  run.coins += (30 + 2 * b.k) * coinMult();
  banner('BOSS DOWN!', 'TROOPS LEVEL UP!', '#ffd23f');
  sfx.boom();
  sfx.stage();
  waveCleared(b.k);
}
function pumpGate(g, s, dmg) {
  s.pump += dmg;
  const unit = expTierF(g.k) * BAL.pumpShots * g.tm;
  const soft = Math.max(4, 0.5 * expN(g.k));
  for (let i = 0; i < 500; i++) {
    const cost = unit * (1 + Math.abs(s.v) / soft);
    if (s.pump < cost) break;
    s.pump -= cost;
    if (s.op === '+') s.v++;
    else if (s.v > 1) s.v--;
    else { s.op = '+'; s.v = 0; }
    s.pulse = 1;
  }
  if (s.pulse === 1) sfx.pump();
}
function applyGate(s, g) {
  const before = run.N;
  if (g && g.jackpot && s.op === '+' && s.v >= 99) run.jackpots++;
  switch (s.op) {
    case '+': run.N += s.v; break;
    case '-': run.N = Math.max(0, run.N - s.v); break;
    case 'x': run.N *= s.v; break;
    case '/': run.N = Math.ceil(run.N / s.v); break;
  }
  if (run.N < before) run.losses.gate = (run.losses.gate || 0) + before - run.N;
  switch (s.op) {
    case 'tier': run.tier++; break;
  }
  run.N = Math.min(run.N, 1e12);
  const good = gateGood(s);
  const label = s.op === 'tier' ? 'LEVEL UP!' : (run.N >= before ? '+' : '−') + fmt(Math.abs(run.N - before));
  floatAt(label, run.x, 0.5, 2.6, good ? '#7fd0ff' : '#ff6b5e', 30, 1.2);
  if (good) { sfx.good(); puff(run.x, 0.3, 0.8, s.op === 'tier' ? '#ffd23f' : '#7fd0ff', 18, 4); }
  else { sfx.bad(); shake = Math.min(10, shake + 5); }
}
function waveCleared(k) {
  run.wave = Math.max(run.wave, k + 1);
  run.coins += (5 + Math.floor(k / 5)) * coinMult();
  const st = Math.floor(run.wave / BOSS_EVERY) + 1;
  if (st > run.stage) {
    run.stage = st;
    if (!run.banner) banner('STAGE ' + st, 'SPEED UP!', '#7fd0ff');
    sfx.stage();
  }
  if (run.wave === run.maxWaves - 1) banner('FINAL WAVE!', 'DEFEAT THE OVERLORD', '#ff5a4a');
  if (run.wave >= run.maxWaves) endRun('victory');
}
function endRun(how) {
  if (run.ended) return;
  run.ended = how;
  run.endTimer = how === 'victory' ? 2.4 : 1.6;
  if (how === 'victory') {
    run.coins += MODES[run.modeIdx].bonus * coinMult();
    banner('VICTORY!', 'LEVEL CLEAR', '#6dff8a');
    sfx.win();
  } else {
    sfx.lose();
  }
}
function fire(dt) {
  if (!run.figs.length || run.N <= 0) return;
  const sps = run.N * shotsPerSoldier(), dps = sps * shotDmg();
  const vis = clamp(sps, 3, SIM ? 20 : 48);
  // Charging enemies draw most of the fire (nearest first); the rest flies straight ahead.
  const threats = [];
  for (const e of run.enemies) {
    if (!e.dead && e.charging && e.d - run.dist < BAL.aimRange) threats.push(e);
  }
  threats.sort((a, b) => a.d - b.d);
  run.fireAcc += dt * vis;
  while (run.fireAcc >= 1) {
    run.fireAcc -= 1;
    const f = run.figs[Math.floor(Math.random() * run.figs.length)];
    const b = { x: run.x + f.ox + rand(-0.05, 0.05), z: f.oz + 0.4, dmg: dps / vis, vx: 0, target: null };
    if (threats.length && Math.random() < BAL.aimShare) {
      b.target = threats[Math.floor(Math.random() * Math.random() * Math.min(threats.length, 6))];
    }
    run.bullets.push(b);
    addP({ k: 'flash', x: b.x + 0.2, z: f.oz + 0.2, h: 1.0, life: 0.05, max: 0.05, size: 0.18, color: '#fff2b0' });
  }
  sfx.shot();
}
function updateBullets(dt) {
  // Every shootable thing, nearest first; bullets pierce with whatever damage is left.
  const targets = [];
  for (const e of run.enemies) if (!e.dead) targets.push({ z: e.d - run.dist, r: e.r, o: e, kind: 'enemy' });
  for (const o of run.props) if (!o.dead) targets.push({ z: o.d - run.dist, r: o.r, o, kind: 'prop' });
  for (const b of run.bosses) if (b.alive) targets.push({ z: b.d - run.dist, r: 1.7, o: b, kind: 'boss' });
  for (const g of run.gates) if (!g.passed) targets.push({ z: g.d - run.dist, r: 0, o: g, kind: 'gate' });
  targets.sort((a, b) => a.z - b.z);
  const step = BULLET_SPEED * dt;
  for (const b of run.bullets) {
    if (b.target) {
      if (b.target.dead || b.target.d - run.dist < b.z) b.target = null;
      else {
        const dx = clamp(b.target.x - b.x, -BAL.bulletTurn * dt, BAL.bulletTurn * dt);
        b.x += dx;
        b.vx = dx / Math.max(dt, 1e-6);
      }
    }
    const z0 = b.z, z1 = b.z + step;
    for (const t of targets) {
      if (t.z + t.r + 0.5 < z0) continue;
      if (t.z - t.r > z1) break;
      const o = t.o;
      if (t.kind === 'gate') {
        const s = b.x < 0 ? o.left : o.right;
        if (s.op === '+' || s.op === '-') { pumpGate(o, s, b.dmg); b.dmg = 0; }
      } else {
        if (t.kind === 'boss' ? !o.alive : o.dead) continue;
        if (Math.abs(o.x - b.x) > t.r + 0.1) continue;
        const mul = t.kind === 'boss' ? 1 + 0.3 * meta.up.boss : 1;
        const dealt = Math.min(b.dmg * mul, o.hp);
        o.hp -= dealt;
        b.dmg -= dealt / mul;
        if (!(o.flashCd > 0)) { o.flash = 0.05; o.flashCd = 0.22; }
        if (o.hp <= o.max * 1e-9) {
          if (t.kind === 'enemy') killEnemy(o);
          else if (t.kind === 'prop') destroyProp(o);
          else killBoss(o);
        }
      }
      if (b.dmg <= 1e-9) {
        b.done = true;
        if (!SIM && Math.random() < 0.5) addP({ k: 'spark', x: b.x, z: t.z, h: 0.9, vx: rand(-3, 3), vz: rand(-2, 0), vh: rand(1, 3), life: 0.15, max: 0.15, size: 0.06, color: '#ffe28a' });
        break;
      }
    }
    b.z = z1;
    if (b.z > BULLET_RANGE) b.done = true;
  }
  run.bullets = run.bullets.filter(b => !b.done);
}
function updateEnemies(dt) {
  const R = crowdR();
  for (const e of run.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.flashCd = (e.flashCd || 0) - dt;
    if (!e.charging && e.d - run.dist < e.charge) e.charging = true;
    if (e.charging) e.d -= e.speed * dt;
    const z = e.d - run.dist;
    if (!run.ended && z < 14) e.x += clamp(run.x - e.x, -2.2 * dt, 2.2 * dt);
    if (!run.ended && z < R * 0.75 + e.r && z > -R && Math.abs(e.x - run.x) < R + e.r) {
      e.dead = true;
      loseTroops(e.power, e.elite ? 'elite' : 'warrior');
      puff(e.x, z, 0.6, '#c0392b', 5, 3);
      addP({ k: 'flash', x: e.x, z, h: 0.7, life: 0.1, max: 0.1, size: 0.6, color: '#ffffff' });
    } else if (z < -6) {
      e.dead = true;
    }
  }
  run.enemies = run.enemies.filter(e => !e.dead);
  for (const o of run.props) {
    o.flash = Math.max(0, o.flash - dt);
    o.flashCd = (o.flashCd || 0) - dt;
    if (o.d - run.dist < -6) o.dead = true;
  }
  run.props = run.props.filter(o => !o.dead);
}
function updateBosses(dt) {
  const R = crowdR();
  for (const b of run.bosses) {
    if (!b.alive) continue;
    b.flash = Math.max(0, b.flash - dt);
    b.flashCd = (b.flashCd || 0) - dt;
    const z = b.d - run.dist, reach = R * 0.75 + 2.2;
    if (run.ended || z > 40) continue;
    b.x += clamp(run.x - b.x, -1.2 * dt, 1.2 * dt);
    if (z > reach) {
      b.d -= (z < 18 ? 2.2 : 0.8) * dt;
      b.step += dt;
    } else if ((b.smashT -= dt) <= 0) {
      b.smashT = 1.6;
      loseTroops(Math.ceil(run.N * BAL.smashShare) + Math.ceil(expN(b.k) * 0.02 * DIFFS[run.diff].enemy), 'boss');
      explode(b.x, z - 1.6, 0, 1.3);
      addP({ k: 'ring', x: run.x, z: 0, h: 0.05, life: 0.5, max: 0.5, size: R + 2, color: '#ffffff' });
      shake = Math.min(14, shake + 9);
      sfx.smash();
    }
  }
  run.bosses = run.bosses.filter(b => b.alive || b.d - run.dist > -8);
}
function updateGates(dt) {
  for (const g of run.gates) {
    g.left.pulse = Math.max(0, g.left.pulse - dt * 4);
    g.right.pulse = Math.max(0, g.right.pulse - dt * 4);
    if (g.passed) g.fade = Math.max(0, g.fade - dt * 2.5);
    if (!g.passed && !run.ended && g.d - run.dist <= 0) {
      g.passed = true;
      g.chosen = run.x < 0 ? 'left' : 'right';
      applyGate(g[g.chosen], g);
      waveCleared(g.k);
    }
  }
  run.gates = run.gates.filter(g => g.d - run.dist > -8 && g.fade > 0);
}
function updateFigs(dt) {
  const want = Math.min(Math.max(0, Math.floor(run.N)), MAX_FIGS);
  while (run.figs.length < want) {
    const [ox, oz] = SLOTS[run.figs.length];
    run.figs.push({ ox: ox * 0.2, oz: oz * 0.2 - 0.4, ph: rand(0, TAU), born: 0.25 });
  }
  while (run.figs.length > want) {
    const f = run.figs.pop();
    puff(run.x + f.ox, f.oz, 0.6, '#5b8fe0', 5, 2.5);
  }
  const k = Math.min(1, dt * 7);
  for (let i = 0; i < run.figs.length; i++) {
    const f = run.figs[i], [ox, oz] = SLOTS[i];
    f.ox += (ox - f.ox) * k;
    f.oz += (oz - f.oz) * k;
    f.born = Math.max(0, f.born - dt);
  }
}
function updateDecor() {
  const types = LEVELS[run.level].decor;
  for (let i = 0; i < run.decor.length; i++) {
    if (run.decor[i].d - run.dist < -8) run.decor[i] = makeDecor(types, run.decor[i].d + DECOR_SPAN);
  }
}
function updateRun(dt) {
  const r = run;
  r.time += dt;
  r.hintT -= dt;
  if (r.banner && (r.banner.t -= dt) <= 0) r.banner = null;
  if (r.demo) { r.dist += 6 * dt; updateFigs(dt); updateDecor(); return; }

  const lock = r.bosses.some(b => b.alive && b.d - r.dist < 16);
  if (lock && !r.lockWas && !r.banner) { banner('BOSS FIGHT!', r.bosses.find(b => b.alive).name, '#ff5a4a'); sfx.horn(); }
  r.lockWas = lock;
  if (!lock && r.ended !== 'dead') r.dist += runSpeed() * dt;
  while (r.seg < r.maxWaves && SEG_START + r.seg * SEG_LEN - r.dist < SPAWN_AHEAD) genSegment(r.seg++);

  if (!r.ended) {
    const lim = ROAD - crowdR() * 0.6 - 0.2;
    r.targetX = clamp(r.targetX + keyDir * 9 * dt, -lim, lim);
    r.x += clamp(r.targetX - r.x, -13 * dt, 13 * dt);
    fire(dt);
  }
  updateFigs(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateBosses(dt);
  updateGates(dt);
  updateDecor();
  r.maxN = Math.max(r.maxN, r.N);
  if (!r.ended && r.N <= 0) endRun('dead');
  if (r.ended && !r.finished && (r.endTimer -= dt) <= 0) finishRun();
}
function finishRun() {
  run.finished = true;
  const lv = meta.levels[run.level], st = meta.stats, win = run.ended === 'victory';
  let unlocked = null, tierUnlocked = null, newBest = false, prize = 0;
  if (win && run.modeIdx <= 1) {
    if (run.modeIdx === 0) lv.c100 = true; else lv.c200 = true;
    if (run.diff >= 2) lv.hard = true;
    if (run.diff > lv.maxDiff) {
      if (run.diff >= 2 && run.diff + 1 < DIFFS.length && lv.maxDiff < run.diff) tierUnlocked = run.diff + 1;
      lv.maxDiff = run.diff;
    }
    const next = meta.levels[run.level + 1];
    if (next && !next.unlocked) { next.unlocked = true; unlocked = run.level + 1; }
  }
  if (run.modeIdx === 2 && run.wave > lv.best) { lv.best = run.wave; newBest = true; }
  if (run.modeIdx === DAILY_MODE) {
    meta.daily.best = Math.max(meta.daily.best, run.wave);
    if (win && !meta.daily.done) { meta.daily.done = true; prize = dailyPrize(); run.coins += prize; st.dailies++; }
  }
  st.runs++;
  st.kills += run.kills;
  st.bosses += run.bossKills;
  st.jackpots += run.jackpots;
  st.bestCrowd = Math.max(st.bestCrowd, Math.round(run.maxN));
  st.bestTier = Math.max(st.bestTier, run.tier);
  const earned = Math.round(run.coins);
  meta.coins += earned;
  const goals = checkGoals();
  result = {
    how: run.ended, level: run.level, diff: run.diff, modeIdx: run.modeIdx, wave: run.wave, maxWaves: run.maxWaves,
    kills: run.kills, bosses: run.bossKills, tier: run.tier, earned, unlocked, tierUnlocked, newBest, prize, goals,
  };
  mode = 'over';
  overT = 0;
  paused = false;
  save();
}
function startRun(level, diff, modeIdx, opts = {}) {
  const daily = modeIdx === DAILY_MODE;
  if (!daily) {
    diff = bestAllowedDiff(level, diff);
    meta.sel = { level, diff, mode: modeIdx };
  }
  save();
  const headStart = !daily && meta.headStart && headStartOk(level, diff);
  run = newRun(level, diff, modeIdx, false, { mods: opts.mods, headStart });
  particles = []; floaters = [];
  mode = 'run';
  paused = false;
  steer = null;
  if (daily) banner('DAILY CHALLENGE', run.mods.size ? [...run.mods].map(modName).join(' + ') : '', '#ffd84a');
  else if (headStart) banner('HEAD START', `WAVE ${HEAD_START + 1}`, '#7fd0ff');
  sfx.horn();
}
function startDaily() {
  const d = ensureDaily();
  if (d.done) { toast("Today's challenge is done. New one tomorrow!"); sfx.error(); return; }
  startRun(d.level, d.diff, DAILY_MODE, { mods: d.mods });
}
function toMenu() {
  mode = 'menu';
  levelPage = Math.floor(meta.sel.level / PER_PAGE);
  paused = false;
  demo = newRun(meta.sel.level, 0, 0, true);
  run = demo;
  particles = []; floaters = [];
}

// ---------- Rendering ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
}
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const font = (size, weight = 800) => `${weight} ${size}px ${FONT}`;
function text(str, x, y, size, color, align = 'center', weight = 800, stroke = 'rgba(0,0,0,0.6)') {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function coinIcon(x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff3a6'); g.addColorStop(0.6, '#ffc93a'); g.addColorStop(1, '#d48a12');
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.18); ctx.strokeStyle = '#9a5f08'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU);
  ctx.strokeStyle = 'rgba(154,95,8,0.6)'; ctx.stroke();
}
function coinText(amount, cx, cy, size, prefix = '', color = '#ffd84a') {
  const str = prefix + fmt(amount);
  ctx.font = font(size);
  const r = size * 0.5, w = ctx.measureText(str).width, x0 = cx - (r * 2 + 5 + w) / 2;
  coinIcon(x0 + r, cy, r);
  text(str, x0 + r * 2 + 5, cy, size, color, 'left');
}
function badge(x, y, level, r = 9) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = tierColor(level); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke();
  ctx.fillStyle = '#10141a';
  ctx.font = font(level >= 10 ? r * 1.05 : r * 1.25, 900);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(level), x, y + 0.5);
}
function star(x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23f' : 'rgba(255,255,255,0.18)';
  ctx.fill();
  if (filled) { ctx.lineWidth = 1; ctx.strokeStyle = '#9a6a08'; ctx.stroke(); }
}
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill();
}

// --- world backdrop ---
const STARS = (() => { const rnd = mulberry32(99); return Array.from({ length: 70 }, () => [rnd() * W, rnd() * (HORIZON - 20), rnd() * 1.2 + 0.4]); })();
const HILLS = [0, 1].map(layer => {
  const rnd = mulberry32(7 + layer * 31), pts = [];
  for (let i = 0; i <= 18; i++) pts.push([i / 18 * W, HORIZON - (layer ? 8 : 18) - rnd() * (layer ? 16 : 30)]);
  return pts;
});
function drawSky(th) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 10);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 10);
  if (th.weather === 'stars') for (const [x, y, r] of STARS) circle(x, y, r, `rgba(255,255,255,${0.5 + 0.4 * Math.sin(time * 2 + x)})`);
  if (th.sun) {
    const sg = ctx.createRadialGradient(340, 66, 4, 340, 66, 60);
    sg.addColorStop(0, hexA(th.sun, 0.9)); sg.addColorStop(0.35, hexA(th.sun, 0.35)); sg.addColorStop(1, hexA(th.sun, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(280, 6, 120, 120);
    circle(340, 66, 18, th.sun);
  }
  HILLS.forEach((pts, layer) => {
    ctx.fillStyle = th.hills[layer];
    ctx.beginPath();
    ctx.moveTo(0, HORIZON + 2);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(W, HORIZON + 2);
    ctx.closePath();
    ctx.fill();
  });
}
function quad(x0, x1, z0, z1, color) {
  const a = proj(x0, z0), b = proj(x1, z0), c = proj(x1, z1), d = proj(x0, z1);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
}
function drawGround(th, dist) {
  ctx.fillStyle = th.ground[0];
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  const P = 12;
  for (let n = Math.floor((dist - 8) / P); n * P - dist < 160; n++) {
    if (n % 2) continue;
    quad(-90, 90, Math.max(-8, n * P - dist), n * P + P / 2 - dist, th.ground[1]);
  }
  quad(-ROAD - 0.9, ROAD + 0.9, -8, 400, th.shoulder);
  quad(-ROAD, ROAD, -8, 400, th.road);
  for (let n = Math.floor((dist - 8) / 2); n * 2 - dist < 130; n++) {
    const z0 = Math.max(-8, n * 2 - dist), z1 = n * 2 + 2 - dist, col = th.curb[(n % 2 + 2) % 2];
    quad(-ROAD - 0.35, -ROAD, z0, z1, col);
    quad(ROAD, ROAD + 0.35, z0, z1, col);
  }
  for (let n = Math.floor((dist - 8) / 5); n * 5 - dist < 150; n++) {
    quad(-0.09, 0.09, Math.max(-8, n * 5 - dist), n * 5 + 2.4 - dist, th.line);
  }
  // haze where the road meets the horizon
  const hz = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 70);
  hz.addColorStop(0, hexA(th.sky[1], 0.85)); hz.addColorStop(1, hexA(th.sky[1], 0));
  ctx.fillStyle = hz;
  ctx.fillRect(0, HORIZON, W, 70);
}

// --- sprites (all drawn at a ground point px,py with u = pixels per world unit) ---
function shadow(px, py, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, TAU); ctx.fill();
}
function drawSoldier(px, py, u, tier, ph, born) {
  u *= 1 - born * 2;
  const st = Math.sin(time * 15 + ph), bob = Math.abs(st) * 0.04 * u;
  shadow(px, py, 0.27 * u, 0.09 * u);
  const hip = py - 0.36 * u - bob;
  ctx.fillStyle = '#26324a';
  ctx.fillRect(px - 0.15 * u, hip, 0.12 * u, py - Math.max(0, st) * 0.09 * u - hip);
  ctx.fillRect(px + 0.03 * u, hip, 0.12 * u, py - Math.max(0, -st) * 0.09 * u - hip);
  rr(ctx, px - 0.22 * u, hip - 0.42 * u, 0.44 * u, 0.46 * u, 0.12 * u);
  ctx.fillStyle = '#3e6fb8'; ctx.fill();
  rr(ctx, px - 0.14 * u, hip - 0.38 * u, 0.28 * u, 0.3 * u, 0.06 * u);
  ctx.fillStyle = '#2a4f88'; ctx.fill();
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(px + 0.17 * u, hip - 0.72 * u, 0.07 * u, 0.44 * u);
  const hy = hip - 0.56 * u;
  circle(px, hy, 0.15 * u, '#e2b48c');
  ctx.fillStyle = tierColor(tier);
  ctx.beginPath(); ctx.arc(px, hy - 0.02 * u, 0.175 * u, Math.PI, TAU); ctx.fill();
  ctx.fillRect(px - 0.19 * u, hy - 0.04 * u, 0.38 * u, 0.06 * u);
}
function drawWarrior(px, py, u, ph, elite, flash) {
  u *= elite ? 1.45 : 1;
  const st = Math.sin(time * 11 + ph), bob = Math.abs(st) * 0.05 * u;
  const skin = flash ? '#ffffff' : elite ? '#5a2f6e' : '#8c2f2a';
  const dark = flash ? '#ffffff' : elite ? '#341a42' : '#4e1915';
  shadow(px, py, 0.34 * u, 0.1 * u);
  const hip = py - 0.4 * u - bob;
  ctx.fillStyle = dark;
  ctx.fillRect(px - 0.19 * u, hip, 0.14 * u, py - Math.max(0, st) * 0.1 * u - hip);
  ctx.fillRect(px + 0.05 * u, hip, 0.14 * u, py - Math.max(0, -st) * 0.1 * u - hip);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(px - 0.2 * u, hip); ctx.lineTo(px + 0.2 * u, hip);
  ctx.lineTo(px + 0.31 * u, hip - 0.5 * u); ctx.lineTo(px - 0.31 * u, hip - 0.5 * u);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b1a10';
  ctx.fillRect(px - 0.21 * u, hip - 0.09 * u, 0.42 * u, 0.08 * u);
  ctx.fillStyle = '#cfcfcf';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(px + sx * 0.18 * u, hip - 0.5 * u);
    ctx.lineTo(px + sx * 0.44 * u, hip - 0.66 * u);
    ctx.lineTo(px + sx * 0.33 * u, hip - 0.42 * u);
    ctx.closePath(); ctx.fill();
  }
  const hy = hip - 0.64 * u;
  circle(px, hy, 0.17 * u, flash ? '#ffffff' : '#3b3d48');
  ctx.fillStyle = '#efe4c8';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(px + sx * 0.12 * u, hy - 0.1 * u);
    ctx.quadraticCurveTo(px + sx * 0.34 * u, hy - 0.16 * u, px + sx * 0.3 * u, hy - 0.4 * u);
    ctx.lineTo(px + sx * 0.06 * u, hy - 0.14 * u);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(px - 0.09 * u, hy - 0.02 * u, 0.06 * u, 0.04 * u);
  ctx.fillRect(px + 0.03 * u, hy - 0.02 * u, 0.06 * u, 0.04 * u);
  ctx.save();
  ctx.translate(px + 0.32 * u, hip - 0.3 * u);
  ctx.rotate(-0.5 + st * 0.25);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-0.04 * u, -0.5 * u, 0.08 * u, 0.5 * u);
  rr(ctx, -0.09 * u, -0.66 * u, 0.18 * u, 0.22 * u, 0.06 * u);
  ctx.fillStyle = '#4a3220'; ctx.fill();
  ctx.restore();
  if (elite) {
    ctx.beginPath(); ctx.arc(px - 0.3 * u, hip - 0.26 * u, 0.22 * u, 0, TAU);
    ctx.fillStyle = flash ? '#ffffff' : '#8a8f9c'; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.04 * u); ctx.strokeStyle = '#4b4f59'; ctx.stroke();
    ctx.fillStyle = '#ff5a4a';
    ctx.beginPath();
    ctx.moveTo(px - 0.3 * u, hip - 0.38 * u); ctx.lineTo(px - 0.2 * u, hip - 0.26 * u);
    ctx.lineTo(px - 0.3 * u, hip - 0.14 * u); ctx.lineTo(px - 0.4 * u, hip - 0.26 * u);
    ctx.closePath(); ctx.fill();
  }
}
function drawBoss(px, py, s, b) {
  const u = s * (b.final ? 3.6 : 3);
  const flash = b.flash > 0;
  const st = Math.sin(b.step * 5), bob = Math.abs(st) * 0.03 * u;
  const body = flash ? '#6a6d7c' : b.final ? '#2a2d36' : '#3d3f4a';
  const trim = flash ? '#ff8a7a' : b.final ? '#ffd23f' : '#9b2f28';
  shadow(px, py, 0.5 * u, 0.13 * u);
  const hip = py - 0.42 * u - bob;
  ctx.fillStyle = '#23242b';
  ctx.fillRect(px - 0.22 * u, hip, 0.17 * u, py - hip);
  ctx.fillRect(px + 0.05 * u, hip, 0.17 * u, py - hip);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(px - 0.24 * u, hip + 0.02 * u); ctx.lineTo(px + 0.24 * u, hip + 0.02 * u);
  ctx.lineTo(px + 0.38 * u, hip - 0.52 * u); ctx.lineTo(px - 0.38 * u, hip - 0.52 * u);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(px - 0.25 * u, hip - 0.1 * u, 0.5 * u, 0.06 * u);
  ctx.beginPath();
  ctx.moveTo(px, hip - 0.44 * u); ctx.lineTo(px + 0.1 * u, hip - 0.3 * u);
  ctx.lineTo(px, hip - 0.16 * u); ctx.lineTo(px - 0.1 * u, hip - 0.3 * u);
  ctx.closePath(); ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(px + sx * 0.36 * u, hip - 0.5 * u, 0.13 * u, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8d8d8';
    for (let i = 0; i < 3; i++) {
      const bx = px + sx * (0.28 + i * 0.07) * u;
      ctx.beginPath();
      ctx.moveTo(bx - 0.03 * u, hip - 0.58 * u); ctx.lineTo(bx + sx * 0.02 * u, hip - 0.74 * u); ctx.lineTo(bx + 0.03 * u, hip - 0.58 * u);
      ctx.closePath(); ctx.fill();
    }
  }
  const hy = hip - 0.66 * u;
  circle(px, hy, 0.16 * u, body);
  ctx.fillStyle = trim;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = px + (i - 2) * 0.06 * u;
    ctx.moveTo(x - 0.03 * u, hy - 0.12 * u); ctx.lineTo(x, hy - 0.26 * u); ctx.lineTo(x + 0.03 * u, hy - 0.12 * u);
  }
  ctx.fill();
  ctx.fillStyle = b.final ? '#7af0ff' : '#ff3b2f';
  ctx.fillRect(px - 0.09 * u, hy - 0.01 * u, 0.06 * u, 0.035 * u);
  ctx.fillRect(px + 0.03 * u, hy - 0.01 * u, 0.06 * u, 0.035 * u);
  // hammer: raised during wind-up, slammed down on impact
  const a = b.smashT < 0.5 ? lerp(0.6, -2.3, 1 - b.smashT / 0.5) : 0.6;
  ctx.save();
  ctx.translate(px + 0.4 * u, hip - 0.4 * u);
  ctx.rotate(a);
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(-0.03 * u, -0.05 * u, 0.06 * u, 0.62 * u);
  rr(ctx, -0.16 * u, 0.5 * u, 0.32 * u, 0.2 * u, 0.04 * u);
  ctx.fillStyle = flash ? '#9a9fac' : '#6e7380'; ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(-0.16 * u, 0.57 * u, 0.32 * u, 0.04 * u);
  ctx.restore();
  // health bar over the head
  const bw = 0.9 * u, by = hy - 0.38 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(px - bw / 2 - 2, by - 2, bw + 4, 10);
  ctx.fillStyle = '#ff5a4a'; ctx.fillRect(px - bw / 2, by, bw * Math.max(0, b.hp / b.max), 6);
}
function drawGate(g, z, alpha) {
  const near = proj(0, z), u = near.s;
  const sides = [[g.left, -ROAD, 0, 'left'], [g.right, 0, ROAD, 'right']];
  for (const [s, x0, x1, name] of sides) {
    const a = proj(x0, z, 0), b = proj(x1, z, 0), top = proj(x0, z, 2.7);
    const good = gateGood(s), chosen = g.passed && g.chosen === name;
    const col = s.op === 'tier' ? [255, 196, 60] : s.op === 'x' ? [70, 210, 110] : good ? [64, 150, 255] : [255, 70, 60];
    const fade = g.passed ? (chosen ? 0.9 : 0.25) * g.fade : 1;
    ctx.globalAlpha = alpha * fade;
    const gx = a.x + 0.14 * u, gw = b.x - a.x - 0.28 * u, gy = top.y, gh = a.y - 0.15 * u - top.y;
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
    grad.addColorStop(0, `rgba(${col},0.75)`); grad.addColorStop(1, `rgba(${col},0.35)`);
    ctx.fillStyle = grad;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.lineWidth = Math.max(1.5, 0.06 * u);
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + s.pulse * 0.45})`;
    ctx.strokeRect(gx, gy, gw, gh);
    const label = s.op === '+' ? '+' + fmt(s.v) : s.op === '-' ? '−' + fmt(s.v) : s.op === 'x' ? '×' + s.v : s.op === '/' ? '÷' + s.v : 'LV UP';
    const size = Math.min(54, u * (label.length > 4 ? 0.8 : 1.05)) * (1 + s.pulse * 0.25);
    if (size > 6) {
      text(label, gx + gw / 2, gy + gh * 0.52, size, '#ffffff', 'center', 900, 'rgba(0,0,0,0.45)');
      if (s.op === '+' || s.op === '-') {
        // pump meter: progress toward the next tick from shooting the gate
        const unit = expTierF(g.k) * BAL.pumpShots * g.tm * (1 + Math.abs(s.v) / Math.max(4, 0.5 * expN(g.k)));
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(gx + gw * 0.15, gy + gh * 0.82, gw * 0.7, Math.max(2, 0.08 * u));
        ctx.fillStyle = '#ffffff'; ctx.fillRect(gx + gw * 0.15, gy + gh * 0.82, gw * 0.7 * clamp(s.pump / unit, 0, 1), Math.max(2, 0.08 * u));
      }
    }
  }
  ctx.globalAlpha = alpha * (g.passed ? g.fade : 1);
  for (const x of [-ROAD, 0, ROAD]) {
    const a = proj(x, z, 0), t = proj(x, z, 2.9);
    ctx.fillStyle = '#d9dde3';
    ctx.fillRect(a.x - 0.12 * u, t.y, 0.24 * u, a.y - t.y);
    ctx.fillStyle = '#9aa1ab';
    ctx.fillRect(a.x - 0.12 * u, t.y, 0.06 * u, a.y - t.y);
  }
  ctx.globalAlpha = 1;
}
function drawProp(o, z) {
  const p = proj(o.x, z), u = p.s;
  if (o.kind === 'crate') {
    const a = proj(o.x - 0.6, z, 0), b = proj(o.x + 0.6, z, 1.2), back = proj(o.x - 0.6, z + 1.2, 1.2), backR = proj(o.x + 0.6, z + 1.2, 1.2);
    ctx.fillStyle = o.flash > 0 ? '#ffffff' : '#c9934f';
    ctx.beginPath(); ctx.moveTo(a.x, b.y); ctx.lineTo(b.x, b.y); ctx.lineTo(backR.x, backR.y); ctx.lineTo(back.x, back.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = o.flash > 0 ? '#ffffff' : '#b07a3c';
    ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    ctx.strokeStyle = '#7a5126'; ctx.lineWidth = Math.max(1, 0.06 * u);
    ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
    ctx.beginPath(); ctx.moveTo(a.x, b.y); ctx.lineTo(b.x, a.y); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    if (u > 6) {
      text('+' + fmt(o.reward), p.x, (a.y + b.y) / 2, Math.min(30, 0.55 * u), '#ffffff', 'center', 900, 'rgba(60,30,0,0.7)');
      hpBarWorld(p.x, b.y - 0.25 * u, 1.1 * u, o.hp / o.max, '#ffd84a');
    }
  } else {
    const top = proj(o.x, z, 1.0), rx = 0.42 * u;
    ctx.fillStyle = o.flash > 0 ? '#ffffff' : '#d33a2c';
    ctx.fillRect(p.x - rx, top.y, rx * 2, p.y - top.y);
    ctx.beginPath(); ctx.ellipse(p.x, top.y, rx, rx * 0.3, 0, 0, TAU);
    ctx.fillStyle = o.flash > 0 ? '#ffffff' : '#e85a48'; ctx.fill();
    ctx.fillStyle = '#7a1d16';
    ctx.fillRect(p.x - rx, top.y + (p.y - top.y) * 0.25, rx * 2, 0.07 * u);
    ctx.fillRect(p.x - rx, top.y + (p.y - top.y) * 0.72, rx * 2, 0.07 * u);
    ctx.fillStyle = '#ffd23f';
    const cy = top.y + (p.y - top.y) * 0.5;
    ctx.beginPath(); ctx.moveTo(p.x, cy - 0.17 * u); ctx.lineTo(p.x + 0.17 * u, cy + 0.13 * u); ctx.lineTo(p.x - 0.17 * u, cy + 0.13 * u); ctx.closePath(); ctx.fill();
  }
}
function hpBarWorld(x, y, w, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * clamp(frac, 0, 1), 3);
}
function drawDecor(o, z) {
  const p = proj(o.x, z), u = p.s * o.sc, x = p.x, y = p.y;
  switch (o.type) {
    case 'tree':
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 0.12 * u, y - 1.2 * u, 0.24 * u, 1.2 * u);
      circle(x, y - 2 * u, 0.85 * u, '#3f7f35');
      circle(x - 0.5 * u, y - 1.55 * u, 0.6 * u, '#4f9a42');
      circle(x + 0.5 * u, y - 1.6 * u, 0.62 * u, '#468f3c');
      circle(x - 0.2 * u, y - 2.25 * u, 0.35 * u, 'rgba(255,255,255,0.12)');
      break;
    case 'bush':
      circle(x - 0.35 * u, y - 0.35 * u, 0.4 * u, '#4a8a3a');
      circle(x + 0.3 * u, y - 0.35 * u, 0.42 * u, '#3f7d32');
      circle(x, y - 0.55 * u, 0.45 * u, '#55983f');
      break;
    case 'rock':
      ctx.fillStyle = o.x > 0 ? '#7f8388' : '#8b8f94';
      ctx.beginPath();
      ctx.moveTo(x - 0.6 * u, y); ctx.lineTo(x - 0.45 * u, y - 0.5 * u); ctx.lineTo(x, y - 0.7 * u);
      ctx.lineTo(x + 0.5 * u, y - 0.45 * u); ctx.lineTo(x + 0.65 * u, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(x - 0.4 * u, y - 0.45 * u); ctx.lineTo(x, y - 0.65 * u); ctx.lineTo(x + 0.1 * u, y - 0.35 * u); ctx.closePath(); ctx.fill();
      break;
    case 'cactus':
      ctx.fillStyle = '#4f8f3a';
      rr(ctx, x - 0.16 * u, y - 1.9 * u, 0.32 * u, 1.9 * u, 0.15 * u); ctx.fill();
      rr(ctx, x - 0.62 * u, y - 1.45 * u, 0.24 * u, 0.7 * u, 0.12 * u); ctx.fill();
      rr(ctx, x + 0.38 * u, y - 1.7 * u, 0.24 * u, 0.8 * u, 0.12 * u); ctx.fill();
      ctx.fillRect(x - 0.5 * u, y - 0.9 * u, 0.4 * u, 0.18 * u);
      ctx.fillRect(x + 0.1 * u, y - 1.05 * u, 0.4 * u, 0.18 * u);
      break;
    case 'pine':
      ctx.fillStyle = '#5a3d25'; ctx.fillRect(x - 0.1 * u, y - 0.6 * u, 0.2 * u, 0.6 * u);
      for (let i = 0; i < 3; i++) {
        const by = y - 0.5 * u - i * 0.85 * u, w = (1 - i * 0.25) * 0.9 * u;
        ctx.fillStyle = '#2f5d3a';
        ctx.beginPath(); ctx.moveTo(x - w, by); ctx.lineTo(x, by - 1.3 * u); ctx.lineTo(x + w, by); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(x - w * 0.35, by - 0.85 * u); ctx.lineTo(x, by - 1.3 * u); ctx.lineTo(x + w * 0.35, by - 0.85 * u); ctx.closePath(); ctx.fill();
      }
      break;
    case 'lava': {
      const g = ctx.createRadialGradient(x, y - 0.3 * u, 0, x, y - 0.3 * u, 1.2 * u);
      g.addColorStop(0, 'rgba(255,120,40,0.45)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 1.2 * u, y - 1.5 * u, 2.4 * u, 2.4 * u);
      ctx.fillStyle = '#231a18';
      ctx.beginPath(); ctx.moveTo(x - 0.7 * u, y); ctx.lineTo(x - 0.4 * u, y - 0.8 * u); ctx.lineTo(x + 0.2 * u, y - 0.95 * u); ctx.lineTo(x + 0.7 * u, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = Math.max(1, 0.06 * u);
      ctx.beginPath(); ctx.moveTo(x - 0.3 * u, y - 0.1 * u); ctx.lineTo(x - 0.1 * u, y - 0.5 * u); ctx.lineTo(x + 0.15 * u, y - 0.7 * u); ctx.stroke();
      break;
    }
    case 'deadtree':
      ctx.strokeStyle = '#1e1614'; ctx.lineWidth = Math.max(1, 0.18 * u); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 2.2 * u);
      ctx.moveTo(x, y - 1.3 * u); ctx.lineTo(x - 0.6 * u, y - 1.9 * u);
      ctx.moveTo(x, y - 1.7 * u); ctx.lineTo(x + 0.55 * u, y - 2.3 * u); ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    case 'lamp': {
      const g = ctx.createRadialGradient(x, y - 3.4 * u, 0, x, y - 3.4 * u, 1.4 * u);
      g.addColorStop(0, 'rgba(255,231,160,0.55)'); g.addColorStop(1, 'rgba(255,231,160,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 1.4 * u, y - 4.8 * u, 2.8 * u, 2.8 * u);
      ctx.fillStyle = '#5a6170'; ctx.fillRect(x - 0.06 * u, y - 3.5 * u, 0.12 * u, 3.5 * u);
      circle(x, y - 3.45 * u, 0.2 * u, '#ffe7a0');
      break;
    }
    case 'box':
      ctx.fillStyle = '#6b5a44'; ctx.fillRect(x - 0.5 * u, y - 0.9 * u, 1 * u, 0.9 * u);
      ctx.strokeStyle = '#3d3226'; ctx.lineWidth = Math.max(1, 0.05 * u); ctx.strokeRect(x - 0.5 * u, y - 0.9 * u, 1 * u, 0.9 * u);
      break;
    case 'pylon':
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(x - 0.7 * u, y - 0.8 * u, 1.4 * u, 0.8 * u);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 0.7 * u, y - 0.62 * u, 1.4 * u, 0.22 * u);
      ctx.fillStyle = '#1e1e1e';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 0.6 * u + i * 0.35 * u, y - 0.62 * u, 0.14 * u, 0.22 * u);
      break;
    case 'wreck':
      ctx.fillStyle = '#2c2f33';
      rr(ctx, x - 0.9 * u, y - 0.6 * u, 1.8 * u, 0.6 * u, 0.1 * u); ctx.fill();
      rr(ctx, x - 0.4 * u, y - 0.95 * u, 0.8 * u, 0.4 * u, 0.12 * u); ctx.fill();
      ctx.fillRect(x + 0.3 * u, y - 0.85 * u, 0.9 * u, 0.12 * u);
      break;
    case 'palm': {
      const lean = o.x > 0 ? 0.5 : -0.5, tx = x + lean * u, ty = y - 2.8 * u;
      ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = Math.max(1, 0.2 * u); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - 1.6 * u, tx, ty); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#2f8a3c';
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        ctx.beginPath(); ctx.ellipse(tx + Math.cos(a) * 0.7 * u, ty + Math.sin(a) * 0.35 * u + 0.25 * u, 0.8 * u, 0.18 * u, a, 0, TAU); ctx.fill();
      }
      circle(tx - 0.1 * u, ty + 0.15 * u, 0.12 * u, '#6b4a2b');
      circle(tx + 0.12 * u, ty + 0.18 * u, 0.12 * u, '#6b4a2b');
      break;
    }
    case 'fern':
      ctx.fillStyle = '#3e9a48';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.45;
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 0.4 * u, y + Math.sin(a) * 0.4 * u, 0.5 * u, 0.12 * u, a, 0, TAU); ctx.fill();
      }
      break;
    case 'grass':
      ctx.strokeStyle = '#a99a62'; ctx.lineWidth = Math.max(1, 0.05 * u);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const bx = x + (i - 3) * 0.12 * u; ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + 0.1 * u, y - 0.4 * u, bx + (i - 3) * 0.08 * u, y - 0.8 * u); }
      ctx.stroke();
      break;
    case 'post':
      ctx.fillStyle = '#6b5236'; ctx.fillRect(x - 0.12 * u, y - 1.3 * u, 0.24 * u, 1.3 * u);
      ctx.fillStyle = '#8a6a48'; ctx.fillRect(x - 0.16 * u, y - 1.38 * u, 0.32 * u, 0.12 * u);
      break;
    case 'crystal': {
      const g = ctx.createRadialGradient(x, y - 0.6 * u, 0, x, y - 0.6 * u, 1.4 * u);
      g.addColorStop(0, 'rgba(180,108,255,0.45)'); g.addColorStop(1, 'rgba(180,108,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 1.4 * u, y - 2 * u, 2.8 * u, 2.8 * u);
      for (const [dx, h, w, c] of [[-0.35, 1.1, 0.22, '#9a5cff'], [0.05, 1.7, 0.28, '#c9a0ff'], [0.4, 0.9, 0.2, '#7af0ff']]) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x + (dx - w) * u, y); ctx.lineTo(x + dx * u, y - h * u); ctx.lineTo(x + (dx + w) * u, y); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'stalag':
      ctx.fillStyle = '#3a3048';
      ctx.beginPath(); ctx.moveTo(x - 0.5 * u, y); ctx.lineTo(x - 0.05 * u, y - 2.4 * u); ctx.lineTo(x + 0.5 * u, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(x - 0.3 * u, y); ctx.lineTo(x - 0.05 * u, y - 2.2 * u); ctx.lineTo(x - 0.1 * u, y); ctx.closePath(); ctx.fill();
      break;
    case 'dome':
      ctx.fillStyle = '#c9ced8';
      ctx.beginPath(); ctx.arc(x, y, 1.1 * u, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#7af0ff'; ctx.fillRect(x - 0.9 * u, y - 0.45 * u, 1.8 * u, 0.14 * u);
      ctx.fillStyle = '#8f96a3'; ctx.fillRect(x - 1.15 * u, y - 0.08 * u, 2.3 * u, 0.08 * u);
      break;
    case 'antenna':
      ctx.strokeStyle = '#9aa1ab'; ctx.lineWidth = Math.max(1, 0.07 * u);
      ctx.beginPath(); ctx.moveTo(x - 0.3 * u, y); ctx.lineTo(x, y - 2.6 * u); ctx.lineTo(x + 0.3 * u, y); ctx.stroke();
      ctx.fillStyle = '#d9dde3';
      ctx.beginPath(); ctx.ellipse(x + 0.35 * u, y - 2.1 * u, 0.4 * u, 0.22 * u, -0.6, 0, TAU); ctx.fill();
      circle(x, y - 2.65 * u, 0.09 * u, Math.sin(time * 4) > 0 ? '#ff3b2f' : '#5a1a16');
      break;
    case 'crater':
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y, 1.2 * u, 0.32 * u, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, 0.06 * u);
      ctx.beginPath(); ctx.ellipse(x, y - 0.03 * u, 1.2 * u, 0.32 * u, 0, Math.PI, TAU); ctx.stroke();
      break;
    case 'cloud':
      circle(x - 0.6 * u, y - 0.4 * u, 0.55 * u, 'rgba(255,255,255,0.95)');
      circle(x + 0.1 * u, y - 0.65 * u, 0.75 * u, '#ffffff');
      circle(x + 0.8 * u, y - 0.35 * u, 0.5 * u, 'rgba(255,255,255,0.95)');
      break;
    case 'pillar':
      ctx.fillStyle = '#e8e2d4'; ctx.fillRect(x - 0.3 * u, y - 3 * u, 0.6 * u, 3 * u);
      ctx.fillStyle = '#d2cab8';
      ctx.fillRect(x - 0.42 * u, y - 3.15 * u, 0.84 * u, 0.2 * u);
      ctx.fillRect(x - 0.42 * u, y - 0.2 * u, 0.84 * u, 0.2 * u);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + 0.08 * u, y - 2.95 * u, 0.12 * u, 2.75 * u);
      break;
    case 'banner': {
      ctx.fillStyle = '#b8a86a'; ctx.fillRect(x - 0.05 * u, y - 3 * u, 0.1 * u, 3 * u);
      const wave = Math.sin(time * 3 + o.d) * 0.12 * u;
      ctx.fillStyle = '#d33a2c';
      ctx.beginPath(); ctx.moveTo(x + 0.05 * u, y - 2.9 * u); ctx.lineTo(x + 1 * u, y - 2.75 * u + wave); ctx.lineTo(x + 0.05 * u, y - 2.2 * u); ctx.closePath(); ctx.fill();
      break;
    }
    case 'spike':
      for (const [dx, h] of [[-0.4, 1.1], [0, 1.6], [0.4, 1.0]]) {
        ctx.fillStyle = '#2a2628';
        ctx.beginPath(); ctx.moveTo(x + (dx - 0.18) * u, y); ctx.lineTo(x + dx * u, y - h * u); ctx.lineTo(x + (dx + 0.18) * u, y); ctx.closePath(); ctx.fill();
        circle(x + dx * u, y - h * u, 0.06 * u, '#ff3b2f');
      }
      break;
  }
}
function drawParticles(dist) {
  for (const p of particles) {
    const z = p.d - dist;
    if (z < -CAM_BACK + 2) continue;
    const s = proj(p.x, z, p.h), a = p.life / p.max, r = p.size * s.s;
    switch (p.k) {
      case 'smoke':
        ctx.globalAlpha = 0.35 * a; circle(s.x, s.y, r, '#4a4a4a'); break;
      case 'puff':
        ctx.globalAlpha = a; circle(s.x, s.y, r, p.color); break;
      case 'ring': {
        ctx.globalAlpha = a;
        const g = proj(p.x, z, 0);
        ctx.strokeStyle = p.color; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.ellipse(g.x, g.y, p.size * (1 - a * 0.7) * g.s, p.size * (1 - a * 0.7) * g.s * 0.3, 0, 0, TAU); ctx.stroke();
        break;
      }
      default:
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        circle(s.x, s.y, p.k === 'flash' ? r * (0.6 + 0.4 * a) : r * (0.4 + 0.6 * a), p.color);
        ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
}
function fadeAt(z) { return clamp((SPAWN_AHEAD - z) / (SPAWN_AHEAD - FADE_FROM), 0, 1); }
function drawWorld() {
  const r = run, th = LEVELS[r.level], dist = r.dist;
  drawSky(th);
  drawGround(th, dist);
  const list = [];
  for (const o of r.decor) { const z = o.d - dist; if (z > -7 && z < SPAWN_AHEAD) list.push([z, () => drawDecor(o, z)]); }
  for (const g of r.gates) { const z = g.d - dist; if (z > -7 && z < SPAWN_AHEAD) list.push([z, () => drawGate(g, z, fadeAt(z))]); }
  for (const o of r.props) { const z = o.d - dist; if (z > -7 && z < SPAWN_AHEAD) list.push([z, () => { ctx.globalAlpha = fadeAt(z); drawProp(o, z); ctx.globalAlpha = 1; }]); }
  for (const e of r.enemies) {
    const z = e.d - dist;
    if (z > -7 && z < SPAWN_AHEAD) list.push([z, () => {
      const p = proj(e.x, z);
      ctx.globalAlpha = fadeAt(z);
      drawWarrior(p.x, p.y, p.s, e.charging ? e.ph : e.ph * 0.3 - time * 8, e.elite, e.flash > 0);
      if (e.hp < e.max && p.s > 8) hpBarWorld(p.x, p.y - (e.elite ? 1.75 : 1.25) * p.s, 0.7 * p.s, e.hp / e.max, '#ff5a4a');
      ctx.globalAlpha = 1;
    }]);
  }
  for (const b of r.bosses) {
    if (!b.alive) continue;
    const z = b.d - dist;
    if (z > -7 && z < SPAWN_AHEAD) list.push([z, () => { const p = proj(b.x, z); ctx.globalAlpha = fadeAt(z); drawBoss(p.x, p.y, p.s, b); ctx.globalAlpha = 1; }]);
  }
  for (const b of r.bullets) list.push([b.z, () => {
    const a = proj(b.x - b.vx * 0.018, b.z - 1.1, 0.95), c = proj(b.x, b.z, 0.95);
    ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = Math.max(1.5, 0.09 * c.s); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.lineCap = 'butt';
  }]);
  for (const f of r.figs) list.push([f.oz, () => { const p = proj(r.x + f.ox, f.oz); drawSoldier(p.x, p.y, p.s, r.tier, f.ph, f.born); }]);
  list.sort((a, b) => b[0] - a[0]);
  for (const [, draw] of list) draw();
  drawParticles(dist);
  if (th.weather === 'rain') {
    ctx.strokeStyle = 'rgba(200,215,235,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 80; i++) {
      const x = (i * 97.3 + time * 60) % (W + 40) - 20, y = (i * 53.7 + time * 700) % H;
      ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16);
    }
    ctx.stroke();
  }
  if (r.N > 0 && !r.demo) {
    const p = proj(r.x, crowdR() * 0.75, 1.55), label = fmt(r.N);
    ctx.font = font(18, 900);
    const w = Math.max(48, ctx.measureText(label).width + 40);
    rr(ctx, p.x - w / 2, p.y - 15, w, 30, 15);
    ctx.fillStyle = 'rgba(20,40,80,0.85)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7fb6ff'; ctx.stroke();
    badge(p.x - w / 2 + 14, p.y, r.tier, 9);
    text(label, p.x + 10, p.y + 1, 18, '#ffffff', 'center', 900, null);
  }
}

// --- HUD & screens ---
function pill(r, fill = 'rgba(0,0,0,0.4)') {
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
}
function button(r, label, colors, size = 20, sub = null, id = null) {
  const pressed = id && pressedBtn === id && inRect(pointer, r);
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  if (pressed) ctx.scale(0.95, 0.95);
  ctx.translate(-r.w / 2, -r.h / 2);
  const g = ctx.createLinearGradient(0, 0, 0, r.h);
  g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
  rr(ctx, 0, 0, r.w, r.h, Math.min(16, r.h / 3));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  text(label, r.w / 2, sub ? r.h / 2 - 7 : r.h / 2 + 1, size, '#ffffff', 'center', 900, 'rgba(0,0,0,0.35)');
  if (sub) text(sub, r.w / 2, r.h / 2 + 14, 11, 'rgba(255,255,255,0.85)', 'center', 700, null);
  ctx.restore();
}
function iconBtn(id, r, draw) {
  const pressed = pressedBtn === id && inRect(pointer, r);
  rr(ctx, r.x, r.y, r.w, r.h, 9);
  ctx.fillStyle = pressed ? '#3a4a60' : 'rgba(20,30,45,0.8)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
  draw(r.x + r.w / 2, r.y + r.h / 2);
}
function speakerIcon(x, y) {
  ctx.fillStyle = '#cfd9e6';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 1, y - 9);
  ctx.lineTo(x + 1, y + 9); ctx.lineTo(x - 5, y + 4); ctx.lineTo(x - 9, y + 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = meta.muted ? '#ff6b5e' : '#cfd9e6'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (meta.muted) { ctx.moveTo(x + 4, y - 5); ctx.lineTo(x + 11, y + 5); ctx.moveTo(x + 11, y - 5); ctx.lineTo(x + 4, y + 5); }
  else { ctx.arc(x + 2, y, 6, -0.9, 0.9); ctx.moveTo(x + 2 + Math.cos(-0.9) * 10, y + Math.sin(-0.9) * 10); ctx.arc(x + 2, y, 10, -0.9, 0.9); }
  ctx.stroke();
}
const RUN_UI = {
  wave: { x: 10, y: 8, w: 150, h: 32 },
  coins: { x: 168, y: 8, w: 132, h: 32 },
  speed: { x: 304, y: 8, w: 42, h: 32 },
  mute: { x: 350, y: 8, w: 42, h: 32 },
  pause: { x: 398, y: 8, w: 42, h: 32 },
  resume: { x: 100, y: 360, w: 250, h: 62 },
  quit: { x: 100, y: 438, w: 250, h: 52 },
};
function drawRunHud() {
  const r = run;
  const g = ctx.createLinearGradient(0, 0, 0, 74);
  g.addColorStop(0, 'rgba(10,16,26,0.75)'); g.addColorStop(1, 'rgba(10,16,26,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 74);
  pill(RUN_UI.wave);
  const waveLabel = r.modeIdx === DAILY_MODE ? 'DAILY' : 'WAVE';
  text(r.maxWaves === Infinity ? `WAVE ${r.wave + 1}` : `${waveLabel} ${Math.min(r.wave + 1, r.maxWaves)}/${r.maxWaves}`, RUN_UI.wave.x + RUN_UI.wave.w / 2, RUN_UI.wave.y + 17, 15, '#ffffff');
  pill(RUN_UI.coins);
  coinIcon(RUN_UI.coins.x + 18, RUN_UI.coins.y + 16, 10);
  text(fmt(r.coins), RUN_UI.coins.x + 34, RUN_UI.coins.y + 17, 16, '#ffd84a', 'left');
  iconBtn('speed', RUN_UI.speed, (x, y) => text(meta.speed + 'x', x, y + 1, 14, meta.speed > 1 ? '#ffd84a' : '#cfd9e6', 'center', 900, null));
  iconBtn('mute', RUN_UI.mute, speakerIcon);
  iconBtn('pause', RUN_UI.pause, (x, y) => { ctx.fillStyle = '#cfd9e6'; ctx.fillRect(x - 7, y - 8, 5, 16); ctx.fillRect(x + 2, y - 8, 5, 16); });

  // progress: whole run for 100/200, current stage for endless; red ticks mark bosses
  const bx = 10, by = 47, bw = W - 20, bh = 6;
  const span = r.maxWaves === Infinity ? BOSS_EVERY : r.maxWaves;
  const done = r.maxWaves === Infinity ? r.wave % BOSS_EVERY : r.wave;
  rr(ctx, bx, by, bw, bh, 3); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  if (done > 0) { rr(ctx, bx, by, Math.max(bh, bw * done / span), bh, 3); ctx.fillStyle = '#5fd67a'; ctx.fill(); }
  for (let w = bossEvery(); w <= span; w += bossEvery()) {
    ctx.fillStyle = w <= done ? '#ffd23f' : '#ff5a4a';
    ctx.fillRect(bx + bw * w / span - 1.5, by - 2, 3, bh + 4);
  }
  text(`STAGE ${r.stage}`, 14, 64, 11, '#cfe0f5', 'left', 800);
  const tag = r.mods.size ? [...r.mods].map(modName).join(' · ') : `${LEVELS[r.level].name.toUpperCase()} · ${DIFFS[r.diff].name}`;
  text(tag, W - 14, 64, 10, r.mods.size ? '#ffd84a' : 'rgba(220,230,245,0.75)', 'right', 700);

  const boss = r.bosses.find(b => b.alive && b.d - r.dist < 45);
  if (boss) {
    rr(ctx, 40, 76, W - 80, 34, 10); ctx.fillStyle = 'rgba(30,8,8,0.8)'; ctx.fill();
    text(boss.name, W / 2, 86, 12, '#ffb3ad', 'center', 900, null);
    rr(ctx, 52, 96, W - 104, 8, 4); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    if (boss.hp > 0) { rr(ctx, 52, 96, Math.max(8, (W - 104) * boss.hp / boss.max), 8, 4); ctx.fillStyle = '#ff5a4a'; ctx.fill(); }
  }
  if (r.hintT > 0) {
    ctx.globalAlpha = Math.min(1, r.hintT);
    const sway = Math.sin(time * 4) * 30;
    text('DRAG TO STEER', W / 2, H - 70, 18, '#ffffff', 'center', 900);
    circle(W / 2 + sway, H - 38, 12, 'rgba(255,255,255,0.85)');
    text('◀', W / 2 - 60, H - 38, 16, '#ffffff', 'center', 900, null);
    text('▶', W / 2 + 60, H - 38, 16, '#ffffff', 'center', 900, null);
    ctx.globalAlpha = 1;
  }
  if (r.banner) {
    const b = r.banner, t = 1 - b.t / b.max;
    const k = t < 0.15 ? easeOutBack(t / 0.15) : 1;
    ctx.globalAlpha = b.t < 0.4 ? b.t / 0.4 : 1;
    ctx.save(); ctx.translate(W / 2, 250); ctx.scale(k, k);
    text(b.title, 0, 0, 40, b.color, 'center', 900, 'rgba(0,0,0,0.7)');
    if (b.sub) text(b.sub, 0, 36, 16, '#ffffff', 'center', 800, 'rgba(0,0,0,0.7)');
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
function drawPause() {
  ctx.fillStyle = 'rgba(6,10,18,0.7)'; ctx.fillRect(0, 0, W, H);
  text('PAUSED', W / 2, 290, 40, '#ffffff', 'center', 900);
  button(RUN_UI.resume, 'RESUME', ['#5fd67a', '#2f9d4a'], 22, null, 'resume');
  button(RUN_UI.quit, 'QUIT RUN', ['#6b7a8f', '#46536a'], 18, 'keeps coins earned so far', 'quit');
}

const MENU = {
  coins: { x: 10, y: 9, w: 150, h: 34 },
  mute: { x: 396, y: 9, w: 44, h: 34 },
  page: i => ({ x: 300 + i * 70, y: 110, w: 64, h: 24 }),
  card: j => ({ x: 14 + (j % 3) * 144, y: 140 + Math.floor(j / 3) * 88, w: 134, h: 80 }),
  diff: i => ({ x: 14 + (i % 3) * 145, y: 338 + Math.floor(i / 3) * 42, w: 132, h: 36 }),
  len: i => ({ x: 14 + i * 145, y: 444, w: 132, h: 50 }),
  head: { x: 14, y: 502, w: 422, h: 30 },
  shop: { x: 14, y: 562, w: 150, h: 60 },
  start: { x: 174, y: 562, w: 262, h: 60 },
  daily: { x: 14, y: 632, w: 205, h: 46 },
  goals: { x: 231, y: 632, w: 205, h: 46 },
  back: { x: 115, y: 686, w: 220, h: 30 },
  backup: { x: 40, y: 726, w: 175, h: 36 },
  restore: { x: 235, y: 726, w: 175, h: 36 },
};
const multText = m => '×' + (m >= 100 ? fmt(m) : m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, ''));
function lockIcon(cx, cy, col = '#cfd9e6', k = 1) {
  ctx.strokeStyle = col; ctx.lineWidth = 3 * k;
  ctx.beginPath(); ctx.arc(cx, cy - 4 * k, 7 * k, Math.PI, TAU); ctx.stroke();
  rr(ctx, cx - 11 * k, cy - 4 * k, 22 * k, 17 * k, 3 * k); ctx.fillStyle = col; ctx.fill();
}
function coinPill() {
  pill(MENU.coins);
  coinIcon(MENU.coins.x + 19, MENU.coins.y + 17, 11);
  text(fmt(meta.coins), MENU.coins.x + 38, MENU.coins.y + 18, 18, '#ffd84a', 'left');
}
function drawMenu() {
  ctx.fillStyle = 'rgba(8,12,20,0.55)'; ctx.fillRect(0, 0, W, H);
  coinPill();
  iconBtn('mute', MENU.mute, speakerIcon);
  text('FRONT RUSH', W / 2, 66, 40, '#ffd84a', 'center', 900, '#5a1a00');
  text('GATE RUNNER · SHOOT · MULTIPLY', W / 2, 96, 11, '#dfe8f5', 'center', 800, 'rgba(0,0,0,0.6)');

  text('LEVEL', 16, 122, 12, '#9fb0c6', 'left', 900, null);
  for (let p = 0; p * PER_PAGE < LEVELS.length; p++) {
    const r = MENU.page(p), sel = levelPage === p;
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = sel ? '#4d8ee8' : 'rgba(20,30,45,0.85)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    text(`${p * PER_PAGE + 1}–${Math.min(LEVELS.length, (p + 1) * PER_PAGE)}`, r.x + r.w / 2, r.y + r.h / 2 + 1, 11, '#ffffff', 'center', 900, null);
  }
  for (let j = 0; j < PER_PAGE; j++) {
    const i = levelPage * PER_PAGE + j;
    if (i >= LEVELS.length) break;
    const lv = LEVELS[i], r = MENU.card(j), st = meta.levels[i], sel = meta.sel.level === i;
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, lv.sky[0]); g.addColorStop(0.45, lv.sky[1]); g.addColorStop(0.45, lv.ground[0]); g.addColorStop(1, lv.ground[1]);
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = lv.road;
    ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 - 6, r.y + r.h * 0.45); ctx.lineTo(r.x + r.w / 2 + 6, r.y + r.h * 0.45); ctx.lineTo(r.x + r.w / 2 + 40, r.y + r.h); ctx.lineTo(r.x + r.w / 2 - 40, r.y + r.h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x, r.y + r.h - 32, r.w, 32);
    ctx.restore();
    text(`LV ${i + 1}`, r.x + 10, r.y + 13, 12, '#ffffff', 'left', 900);
    if (st.maxDiff >= 3) text(DIFFS[st.maxDiff].name, r.x + r.w - 8, r.y + 13, 9, DIFFS[st.maxDiff].color, 'right', 900);
    text(lv.name.toUpperCase(), r.x + r.w / 2, r.y + r.h - 22, 11, '#ffffff', 'center', 900, 'rgba(0,0,0,0.6)');
    [st.c100, st.c200, st.maxDiff >= 2].forEach((f, k) => star(r.x + r.w / 2 - 16 + k * 16, r.y + r.h - 8, 6, f));
    if (!st.unlocked) {
      rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fillStyle = 'rgba(10,14,22,0.72)'; ctx.fill();
      lockIcon(r.x + r.w / 2, r.y + r.h / 2 - 8);
      text(`Clear LV ${i}`, r.x + r.w / 2, r.y + r.h - 12, 10, '#cfd9e6', 'center', 800, null);
    }
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.lineWidth = sel ? 3.5 : 1.5;
    ctx.strokeStyle = sel ? '#ffd84a' : 'rgba(255,255,255,0.25)'; ctx.stroke();
  }

  const L = meta.sel.level, st = meta.levels[L];
  text('DIFFICULTY', 16, 326, 12, '#9fb0c6', 'left', 900, null);
  DIFFS.forEach((d, i) => {
    const r = MENU.diff(i), sel = meta.sel.diff === i, open = diffUnlocked(L, i);
    rr(ctx, r.x, r.y, r.w, r.h, 11);
    ctx.fillStyle = sel ? d.color : open ? 'rgba(20,30,45,0.85)' : 'rgba(12,16,24,0.85)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = sel ? '#ffffff' : hexA(d.color, open ? 0.6 : 0.25); ctx.stroke();
    if (open) {
      text(d.name, r.x + r.w / 2, r.y + 13, 13, sel ? '#ffffff' : d.color, 'center', 900, sel ? 'rgba(0,0,0,0.35)' : null);
      text(`coins ${multText(d.coins)}`, r.x + r.w / 2, r.y + 27, 9, sel ? '#ffffff' : '#9fb0c6', 'center', 700, null);
    } else {
      lockIcon(r.x + 18, r.y + r.h / 2 + 2, hexA(d.color, 0.7), 0.55);
      text(d.name, r.x + r.w / 2 + 8, r.y + 13, 12, hexA(d.color, 0.7), 'center', 900, null);
      text(`clear ${DIFFS[i - 1].name} here`, r.x + r.w / 2 + 8, r.y + 27, 9, '#7d8a9c', 'center', 700, null);
    }
  });

  text('RUN LENGTH', 16, 432, 12, '#9fb0c6', 'left', 900, null);
  MODES.slice(0, 3).forEach((m, i) => {
    const r = MENU.len(i), sel = meta.sel.mode === i;
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = sel ? '#4d8ee8' : 'rgba(20,30,45,0.85)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = sel ? '#ffffff' : 'rgba(77,142,232,0.6)'; ctx.stroke();
    text(m.name, r.x + r.w / 2, r.y + 18, 15, '#ffffff', 'center', 900, sel ? 'rgba(0,0,0,0.35)' : null);
    const sub = i === 2 ? (st.best ? `best: wave ${st.best}` : 'how far can you go?') : (i === 0 ? st.c100 : st.c200) ? 'CLEARED ✓' : `${m.waves / BOSS_EVERY} bosses`;
    text(sub, r.x + r.w / 2, r.y + 36, 10, sel ? '#ffffff' : '#9fb0c6', 'center', 700, null);
  });

  const hsOk = headStartOk(L, meta.sel.diff), hsOn = hsOk && meta.headStart, hr = MENU.head;
  rr(ctx, hr.x, hr.y, hr.w, hr.h, 15);
  ctx.fillStyle = hsOn ? '#2f8a4f' : 'rgba(20,30,45,0.85)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = hsOn ? '#6dff8a' : 'rgba(255,255,255,0.2)'; ctx.stroke();
  const hsText = !hsOk ? `HEAD START · clear this level on ${DIFFS[meta.sel.diff].name} to unlock`
    : hsOn ? `HEAD START: ON · begin at wave ${HEAD_START + 1}` : `HEAD START: OFF · tap to begin at wave ${HEAD_START + 1}`;
  text(hsText, hr.x + hr.w / 2, hr.y + hr.h / 2 + 1, 11, hsOk ? '#ffffff' : '#7d8a9c', 'center', 800, null);

  const cm = LEVELS[L].coins * DIFFS[meta.sel.diff].coins;
  const info = meta.sel.mode === 2 ? `Coins ${multText(cm)} · survive as long as you can`
    : `Coins ${multText(cm)} · boss every ${BOSS_EVERY} waves · each stage speeds up`;
  text(info, W / 2, 547, 11, '#cfd9e6', 'center', 700, null);

  button(MENU.shop, 'UPGRADES', ['#4d8ee8', '#2b5aa6'], 17, null, 'shop');
  button(MENU.start, 'START', ['#ffb43a', '#e8541e'], 30, null, 'start');
  const d = ensureDaily();
  button(MENU.daily, 'DAILY CHALLENGE', d.done ? ['#5a6472', '#3c4450'] : ['#a066ea', '#6b3fb0'], 14,
    d.done ? 'DONE ✓ · new one tomorrow' : `LV ${d.level + 1} ${DIFFS[d.diff].name} · prize ${fmt(dailyPrize())}`, 'daily');
  const doneGoals = GOALS.filter(g => meta.goals[g.id]).length;
  button(MENU.goals, 'GOALS', ['#36c2b0', '#1f8a7c'], 14, `${doneGoals} / ${GOALS.length} complete`, 'goals');
  ctx.globalAlpha = pressedBtn === 'back' ? 0.6 : 1;
  text('◀  BACK TO MERGE FRONT', W / 2, MENU.back.y + MENU.back.h / 2, 13, '#cfd9e6', 'center', 800, null);
  ctx.globalAlpha = 1;
  for (const [id, label] of [['backup', 'BACKUP SAVE'], ['restore', 'RESTORE SAVE']]) {
    const r = MENU[id], pressed = pressedBtn === id && inRect(pointer, r);
    rr(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = pressed ? '#3a4a60' : 'rgba(20,30,45,0.85)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();
    text(label, r.x + r.w / 2, r.y + r.h / 2 + 1, 12, '#cfd9e6', 'center', 800, null);
  }
}

const SHOP = {
  card: i => ({ x: 14, y: 100 + i * 84, w: 422, h: 76 }),
  buy: i => ({ x: 308, y: 100 + i * 84 + 12, w: 116, h: 52 }),
  back: { x: 125, y: 696, w: 200, h: 50 },
};
function upgradeIcon(key, ix, iy) {
  if (key === 'troops') { drawSoldier(ix - 8, iy + 15, 27, 3, 0, 0); drawSoldier(ix + 8, iy + 17, 27, 3, 2, 0); }
  else if (key === 'dmg') {
    ctx.save(); ctx.translate(ix, iy); ctx.rotate(-0.6);
    rr(ctx, -5, -15, 10, 25, 5); ctx.fillStyle = '#ffd84a'; ctx.fill();
    ctx.fillStyle = '#b07a3c'; ctx.fillRect(-5, 6, 10, 9);
    ctx.restore();
  } else if (key === 'rate') {
    ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    for (const dx of [-7, 5]) { ctx.beginPath(); ctx.moveTo(ix + dx - 5, iy - 10); ctx.lineTo(ix + dx + 5, iy); ctx.lineTo(ix + dx - 5, iy + 10); ctx.stroke(); }
  } else if (key === 'armor') {
    ctx.fillStyle = '#9aa7ba';
    ctx.beginPath(); ctx.moveTo(ix, iy - 15); ctx.lineTo(ix + 13, iy - 9); ctx.quadraticCurveTo(ix + 12, iy + 9, ix, iy + 16); ctx.quadraticCurveTo(ix - 12, iy + 9, ix - 13, iy - 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a8fe8'; ctx.fillRect(ix - 2.5, iy - 9, 5, 18); ctx.fillRect(ix - 8, iy - 3, 16, 5);
  } else if (key === 'boss') {
    circle(ix, iy - 2, 12, '#3d3f4a');
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) { const x = ix + (i - 1) * 7; ctx.beginPath(); ctx.moveTo(x - 4, iy - 11); ctx.lineTo(x, iy - 20); ctx.lineTo(x + 4, iy - 11); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#ff3b2f'; ctx.fillRect(ix - 7, iy - 3, 5, 3); ctx.fillRect(ix + 2, iy - 3, 5, 3);
  } else if (key === 'crate') {
    ctx.fillStyle = '#b07a3c'; ctx.fillRect(ix - 13, iy - 11, 26, 22);
    ctx.strokeStyle = '#7a5126'; ctx.lineWidth = 2; ctx.strokeRect(ix - 13, iy - 11, 26, 22);
    ctx.beginPath(); ctx.moveTo(ix - 13, iy - 11); ctx.lineTo(ix + 13, iy + 11); ctx.moveTo(ix + 13, iy - 11); ctx.lineTo(ix - 13, iy + 11); ctx.stroke();
  } else coinIcon(ix, iy, 15);
}
function drawShop() {
  ctx.fillStyle = 'rgba(8,12,20,0.8)'; ctx.fillRect(0, 0, W, H);
  coinPill();
  text('UPGRADES', W / 2, 74, 30, '#ffffff', 'center', 900);
  UPGRADES.forEach((u, i) => {
    const r = SHOP.card(i), lvl = meta.up[u.key], cost = u.cost(lvl), can = meta.coins >= cost;
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = 'rgba(28,40,56,0.95)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
    const ix = r.x + 38, iy = r.y + r.h / 2;
    circle(ix, iy, 25, 'rgba(255,255,255,0.08)');
    upgradeIcon(u.key, ix, iy);
    text(u.name, r.x + 74, r.y + 20, 15, '#ffffff', 'left', 900);
    text(`LV ${lvl}`, r.x + 74 + ctx.measureText(u.name).width + 10, r.y + 21, 11, '#ffd84a', 'left', 900, null);
    text(u.info(lvl), r.x + 74, r.y + 42, 11, '#cfd9e6', 'left', 700, null);
    text('next: ' + u.info(lvl + 1), r.x + 74, r.y + 60, 10, '#6dff8a', 'left', 700, null);
    const b = SHOP.buy(i), pressed = pressedBtn === 'buy' + i && inRect(pointer, b);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2); if (pressed) ctx.scale(0.95, 0.95); ctx.translate(-b.w / 2, -b.h / 2);
    const g = ctx.createLinearGradient(0, 0, 0, b.h);
    g.addColorStop(0, can ? '#5fd67a' : '#4a5260'); g.addColorStop(1, can ? '#2f9d4a' : '#323843');
    rr(ctx, 0, 0, b.w, b.h, 12); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
    text('UPGRADE', b.w / 2, 15, 10, '#ffffff', 'center', 900, null);
    coinText(cost, b.w / 2, 35, 14, '', can ? '#ffffff' : '#9aa3ad');
    ctx.restore();
  });
  button(SHOP.back, 'BACK', ['#6b7a8f', '#46536a'], 20, null, 'back');
}

const GOALS_UI = {
  row: i => ({ x: 14, y: 96 + i * 66, w: 422, h: 58 }),
  prev: { x: 14, y: 636, w: 90, h: 50 },
  next: { x: 346, y: 636, w: 90, h: 50 },
  back: { x: 125, y: 636, w: 200, h: 50 },
};
const goalPages = () => Math.ceil(GOALS.length / GOALS_PER_PAGE);
function drawGoals() {
  ctx.fillStyle = 'rgba(8,12,20,0.82)'; ctx.fillRect(0, 0, W, H);
  coinPill();
  text('GOALS', W / 2, 72, 30, '#ffffff', 'center', 900);
  GOALS.slice(goalsPage * GOALS_PER_PAGE, (goalsPage + 1) * GOALS_PER_PAGE).forEach((g, i) => {
    const r = GOALS_UI.row(i), done = !!meta.goals[g.id], cur = Math.min(g.value(meta), g.target);
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = done ? 'rgba(40,90,60,0.9)' : 'rgba(28,40,56,0.95)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = done ? '#6dff8a' : 'rgba(255,255,255,0.15)'; ctx.stroke();
    text((done ? '✓ ' : '') + g.name, r.x + 12, r.y + 15, 13, done ? '#6dff8a' : '#ffffff', 'left', 900, null);
    text(g.desc, r.x + 12, r.y + 31, 10, '#cfd9e6', 'left', 700, null);
    const bw = 230;
    rr(ctx, r.x + 12, r.y + 42, bw, 6, 3); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    if (cur > 0) { rr(ctx, r.x + 12, r.y + 42, Math.max(6, bw * cur / g.target), 6, 3); ctx.fillStyle = done ? '#6dff8a' : '#4d8ee8'; ctx.fill(); }
    if (g.target > 1) text(`${fmt(cur)} / ${fmt(g.target)}`, r.x + 18 + bw, r.y + 45, 9, '#9fb0c6', 'left', 700, null);
    coinText(g.reward, r.x + r.w - 62, r.y + r.h / 2, 14, done ? '' : '+', done ? '#9fb0c6' : '#ffd84a');
  });
  button(GOALS_UI.back, 'BACK', ['#6b7a8f', '#46536a'], 20, null, 'back');
  if (goalPages() > 1) {
    button(GOALS_UI.prev, '◀', goalsPage > 0 ? ['#4d8ee8', '#2b5aa6'] : ['#3a4250', '#2a303a'], 20, null, 'goalsPrev');
    button(GOALS_UI.next, '▶', goalsPage < goalPages() - 1 ? ['#4d8ee8', '#2b5aa6'] : ['#3a4250', '#2a303a'], 20, null, 'goalsNext');
    text(`PAGE ${goalsPage + 1} / ${goalPages()}`, W / 2, 704, 11, '#9fb0c6', 'center', 800, null);
  }
}

const OVER = {
  primary: { x: 75, y: 488, w: 300, h: 62 },
  left: { x: 75, y: 562, w: 145, h: 50 },
  right: { x: 230, y: 562, w: 145, h: 50 },
  single: { x: 125, y: 562, w: 200, h: 50 },
};
function overButtons() {
  const r = result;
  if (r.modeIdx === DAILY_MODE) {
    return r.how === 'victory' ? [['primary', 'MENU', ['#5fd67a', '#2f9d4a'], 'menu']]
      : [['primary', 'RETRY DAILY', ['#ffb43a', '#e8541e'], 'retry'], ['single', 'MENU', ['#6b7a8f', '#46536a'], 'menu']];
  }
  if (r.how === 'victory' && r.level + 1 < LEVELS.length) {
    return [['primary', 'NEXT LEVEL', ['#5fd67a', '#2f9d4a'], 'next'], ['left', 'RETRY', ['#ffb43a', '#e8541e'], 'retry'], ['right', 'MENU', ['#6b7a8f', '#46536a'], 'menu']];
  }
  return [['primary', r.how === 'victory' ? 'PLAY AGAIN' : 'RETRY', ['#ffb43a', '#e8541e'], 'retry'], ['single', 'MENU', ['#6b7a8f', '#46536a'], 'menu']];
}
function drawOver() {
  const r = result;
  ctx.fillStyle = `rgba(6,10,18,${0.7 * clamp(overT * 4, 0, 1)})`;
  ctx.fillRect(0, 0, W, H);
  const k = easeOutBack(clamp(overT * 3, 0, 1));
  ctx.save(); ctx.translate(W / 2, 400); ctx.scale(k, k); ctx.translate(-W / 2, -400);
  const win = r.how === 'victory';
  rr(ctx, 36, 170, W - 72, 460, 20);
  ctx.fillStyle = '#1c2838'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = win ? '#ffd23f' : '#6b7a8f'; ctx.stroke();
  rr(ctx, 66, 146, W - 132, 50, 14);
  ctx.fillStyle = win ? '#3cb95a' : '#c4473e'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  const title = win ? (r.modeIdx === DAILY_MODE ? 'DAILY COMPLETE!' : 'LEVEL CLEAR!') : r.how === 'quit' ? 'RUN ENDED' : 'SQUAD WIPED OUT';
  text(title, W / 2, 172, 24, '#ffffff', 'center', 900, 'rgba(0,0,0,0.4)');
  text(`LV ${r.level + 1} ${LEVELS[r.level].name.toUpperCase()} · ${DIFFS[r.diff].name} · ${MODES[r.modeIdx].name}`, W / 2, 222, 11, '#9fb0c6', 'center', 800, null);
  const waveText = r.maxWaves === Infinity ? `WAVE ${r.wave}` : `WAVE ${r.wave} / ${r.maxWaves}`;
  text(waveText, W / 2, 262, 30, '#ffffff', 'center', 900);
  if (r.newBest) text('NEW BEST!', W / 2, 292, 14, '#6dff8a', 'center', 900, null);
  const stats = [['KILLS', fmt(r.kills)], ['BOSSES', String(r.bosses)], ['TROOP LV', String(r.tier)]];
  stats.forEach(([label, val], i) => {
    const x = 90 + i * 135;
    text(val, x, 330, 20, '#ffffff', 'center', 900, null);
    text(label, x, 352, 10, '#9fb0c6', 'center', 800, null);
  });
  text('COINS EARNED', W / 2, 390, 11, '#9fb0c6', 'center', 800, null);
  coinText(r.earned, W / 2, 418, 26, '+');
  const notes = [];
  if (r.prize) notes.push([`DAILY PRIZE INCLUDED: +${fmt(r.prize)}`, '#ffd84a']);
  if (r.unlocked !== null) notes.push([`LV ${r.unlocked + 1} ${LEVELS[r.unlocked].name.toUpperCase()} UNLOCKED!`, '#6dff8a']);
  if (r.tierUnlocked !== null) notes.push([`${DIFFS[r.tierUnlocked].name} UNLOCKED ON THIS LEVEL!`, DIFFS[r.tierUnlocked].color]);
  for (const g of r.goals) notes.push([`GOAL: ${g.name} +${fmt(g.reward)}`, '#7fd0ff']);
  if (!notes.length && !win) notes.push(['Spend coins on UPGRADES in the menu to get further', '#cfd9e6']);
  const shown = notes.length > 3 ? [...notes.slice(0, 2), [`+${notes.length - 2} more goals complete`, '#7fd0ff']] : notes;
  shown.forEach(([msg, col], i) => text(msg, W / 2, 444 + i * 16, 12, col, 'center', 900, null));
  for (const [slot, label, colors, id] of overButtons()) button(OVER[slot], label, colors, slot === 'primary' ? 22 : 17, null, id);
  ctx.restore();
}
function drawToast() {
  if (toastTime <= 0) return;
  ctx.globalAlpha = Math.min(1, toastTime * 3);
  ctx.font = font(14);
  const w = ctx.measureText(toastMsg).width + 36, y = 140;
  rr(ctx, W / 2 - w / 2, y - 18, w, 36, 18);
  ctx.fillStyle = 'rgba(10,14,20,0.92)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();
  text(toastMsg, W / 2, y + 1, 14, '#ffffff', 'center', 800, null);
  ctx.globalAlpha = 1;
}
function render() {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawWorld();
  for (const f of floaters) {
    const age = f.max - f.life;
    ctx.globalAlpha = Math.min(1, (f.life / f.max) * 2.5);
    text(f.text, f.x, f.y, f.size * (1 + Math.max(0, 0.12 - age) * 4), f.color, 'center', 900, 'rgba(0,0,0,0.75)');
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (mode === 'menu') drawMenu();
  else if (mode === 'shop') drawShop();
  else if (mode === 'goals') drawGoals();
  else if (mode === 'run') { drawRunHud(); if (paused) drawPause(); }
  else if (mode === 'over') drawOver();
  drawToast();
}

// ---------- Input ----------
function toLocal(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}
function buttonAt(p) {
  if (mode === 'menu') {
    if (inRect(p, MENU.mute)) return 'mute';
    for (let pg = 0; pg * PER_PAGE < LEVELS.length; pg++) if (inRect(p, MENU.page(pg))) return 'page' + pg;
    for (let j = 0; j < PER_PAGE; j++) {
      const i = levelPage * PER_PAGE + j;
      if (i < LEVELS.length && inRect(p, MENU.card(j))) return 'level' + i;
    }
    for (let i = 0; i < DIFFS.length; i++) if (inRect(p, MENU.diff(i))) return 'diff' + i;
    for (let i = 0; i < 3; i++) if (inRect(p, MENU.len(i))) return 'len' + i;
    if (inRect(p, MENU.head)) return 'head';
    if (inRect(p, MENU.daily)) return 'daily';
    if (inRect(p, MENU.goals)) return 'goals';
    if (inRect(p, MENU.shop)) return 'shop';
    if (inRect(p, MENU.start)) return 'start';
    if (inRect(p, MENU.back)) return 'back';
    if (inRect(p, MENU.backup)) return 'backup';
    if (inRect(p, MENU.restore)) return 'restore';
  } else if (mode === 'shop') {
    for (let i = 0; i < UPGRADES.length; i++) if (inRect(p, SHOP.buy(i))) return 'buy' + i;
    if (inRect(p, SHOP.back)) return 'back';
  } else if (mode === 'goals') {
    if (inRect(p, GOALS_UI.back)) return 'back';
    if (inRect(p, GOALS_UI.prev)) return 'goalsPrev';
    if (inRect(p, GOALS_UI.next)) return 'goalsNext';
  } else if (mode === 'run') {
    if (paused) {
      if (inRect(p, RUN_UI.resume)) return 'resume';
      if (inRect(p, RUN_UI.quit)) return 'quit';
      return null;
    }
    if (inRect(p, RUN_UI.speed)) return 'speed';
    if (inRect(p, RUN_UI.mute)) return 'mute';
    if (inRect(p, RUN_UI.pause)) return 'pause';
  } else if (mode === 'over') {
    for (const [slot, , , id] of overButtons()) if (inRect(p, OVER[slot])) return id;
  }
  return null;
}
function press(b) {
  sfx.click();
  if (b === 'mute') { meta.muted = !meta.muted; save(); }
  else if (b === 'speed') { meta.speed = meta.speed % 3 + 1; save(); }
  else if (b.startsWith('page')) levelPage = +b.slice(4);
  else if (b.startsWith('level')) {
    const i = +b.slice(5);
    if (!meta.levels[i].unlocked) { toast(`Clear a 100 or 200 run on LV ${i} first`); sfx.error(); return; }
    meta.sel.level = i;
    meta.sel.diff = bestAllowedDiff(i, meta.sel.diff);
    save();
    demo = newRun(i, 0, 0, true); run = demo;
  }
  else if (b.startsWith('diff')) {
    const i = +b.slice(4);
    if (!diffUnlocked(meta.sel.level, i)) { toast(`Clear ${DIFFS[i - 1].name} on this level first`); sfx.error(); return; }
    meta.sel.diff = i; save();
  }
  else if (b.startsWith('len')) { meta.sel.mode = +b.slice(3); save(); }
  else if (b === 'head') {
    if (!headStartOk(meta.sel.level, meta.sel.diff)) { toast(`Clear this level on ${DIFFS[meta.sel.diff].name} first`); sfx.error(); return; }
    meta.headStart = !meta.headStart; save();
  }
  else if (b === 'daily') startDaily();
  else if (b === 'goals') {
    const got = checkGoals();
    if (got.length) toast(`${got.length} goal${got.length > 1 ? 's' : ''} complete: +${fmt(got.reduce((a, g) => a + g.reward, 0))} coins`);
    goalsPage = 0; mode = 'goals';
  }
  else if (b === 'goalsPrev') goalsPage = Math.max(0, goalsPage - 1);
  else if (b === 'goalsNext') goalsPage = Math.min(goalPages() - 1, goalsPage + 1);
  else if (b === 'shop') mode = 'shop';
  else if (b === 'backup') exportSave();
  else if (b === 'restore') importSave();
  else if (b === 'start') startRun(meta.sel.level, meta.sel.diff, meta.sel.mode);
  else if (b === 'back') {
    if (mode === 'shop' || mode === 'goals') mode = 'menu';
    else { save(); window.location.href = 'index.html'; }
  }
  else if (b.startsWith('buy')) {
    const u = UPGRADES[+b.slice(3)], cost = u.cost(meta.up[u.key]);
    if (meta.coins < cost) { toast('Not enough coins'); sfx.error(); return; }
    meta.coins -= cost; meta.up[u.key]++; save(); sfx.crate();
  }
  else if (b === 'pause') paused = true;
  else if (b === 'resume') paused = false;
  else if (b === 'quit') { paused = false; run.ended = 'quit'; finishRun(); }
  else if (b === 'retry') { if (result.modeIdx === DAILY_MODE) startDaily(); else startRun(result.level, result.diff, result.modeIdx); }
  else if (b === 'next') { meta.sel.level = result.level + 1; startRun(result.level + 1, result.diff, result.modeIdx); }
  else if (b === 'menu') toMenu();
}
canvas.addEventListener('pointerdown', e => {
  initAudio();
  const p = toLocal(e);
  pointer.x = p.x; pointer.y = p.y;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
  const b = buttonAt(p);
  if (b) { pressedBtn = b; return; }
  if (mode === 'run' && !paused && !run.ended) steer = { px: p.x, startX: run.targetX };
});
canvas.addEventListener('pointermove', e => {
  const p = toLocal(e);
  pointer.x = p.x; pointer.y = p.y;
  if (steer && mode === 'run') run.targetX = steer.startX + (p.x - steer.px) / 40;
});
canvas.addEventListener('pointerup', e => {
  const p = toLocal(e);
  pointer.x = p.x; pointer.y = p.y;
  steer = null;
  if (pressedBtn) {
    const b = pressedBtn;
    pressedBtn = null;
    if (buttonAt(p) === b) press(b);
  }
});
canvas.addEventListener('pointercancel', () => { steer = null; pressedBtn = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
const keys = new Set();
window.addEventListener('keydown', e => {
  initAudio();
  keys.add(e.code);
  if (e.repeat) return;
  if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'run' && !run.ended) paused = !paused;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (mode === 'menu') startRun(meta.sel.level, meta.sel.diff, meta.sel.mode);
    else if (mode === 'over') press(overButtons()[0][3]);
    else if (mode === 'run' && paused) paused = false;
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (mode === 'run' && !run.ended) paused = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'run' && !run.ended) paused = true; });
window.addEventListener('resize', resize);

// ---------- Main loop ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  time += dt;
  keyDir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  if (!(mode === 'run' && paused)) {
    const steps = mode === 'run' ? meta.speed : 1;
    for (let i = 0; i < steps; i++) { updateRun(dt); updateFx(dt); }
  }
  if (mode === 'over') overT += dt;
  shake = Math.max(0, shake - dt * 30);
  toastTime -= dt;
  render();
  requestAnimationFrame(frame);
}

resize();
load();
toMenu();
{
  const got = checkGoals();
  if (got.length) toast(`${got.length} goal${got.length > 1 ? 's' : ''} already complete: +${fmt(got.reduce((a, g) => a + g.reward, 0))} coins`);
}
requestAnimationFrame(frame);

// Hooks for automated balance testing (rush-test.html); harmless in normal play.
function botSteer(bot, picks) {
  const g = run.gates.find(g => !g.passed && g.d - run.dist > 0);
  if (!g) return;
  if (bot === 'random') {
    if (!picks.has(g)) picks.set(g, Math.random() < 0.5 ? -1 : 1);
    run.targetX = picks.get(g) * 3;
    return;
  }
  const vl = gateValue(g.left, run.N), vr = gateValue(g.right, run.N), cur = Math.sign(run.targetX) || 1;
  let side = vr > vl ? 1 : -1;
  if (side !== cur && Math.abs(vr - vl) < 0.04 * Math.max(vl, vr)) side = cur;
  run.targetX = side * 3;
}
window.FrontRush = {
  BAL, LEVELS, DIFFS, MODES, UPGRADES, GOALS, DAILY_MODS, meta, expN, expDps, ensureDaily, checkGoals,
  simulate({ level = 0, diff = 1, modeIdx = 0, up = {}, bot = 'smart', dt = 1 / 30, maxTime = 3600, mods = [], headStart = false } = {}) {
    const savedUp = { ...meta.up }, savedRun = run;
    Object.assign(meta.up, Object.fromEntries(UPGRADES.map(u => [u.key, 0])), up);
    SIM = true;
    run = newRun(level, diff, modeIdx, false, { mods, headStart });
    const picks = new Map(), trace = [];
    let lastWave = -1;
    while (!run.ended && run.time < maxTime) {
      botSteer(bot, picks);
      updateRun(dt);
      if (run.wave !== lastWave) { lastWave = run.wave; trace.push(`${run.wave}:${Math.round(run.N)}`); }
    }
    const res = { result: run.ended || 'timeout', wave: run.wave, N: Math.round(run.N), tier: run.tier, kills: run.kills, coins: Math.round(run.coins), time: Math.round(run.time), trace, losses: run.losses };
    run = savedRun;
    SIM = false;
    Object.assign(meta.up, savedUp);
    return res;
  },
  startRun, state: () => ({ mode, run, meta, paused, levelPage, goalsPage, result }),
};
})();
