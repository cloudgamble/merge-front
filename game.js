/* Merge Front — a merge-and-battle strategy game.
 * Buy units, merge identical ones to level them up, arrange your formation,
 * then watch the auto-battle. Open index.html in any modern browser to play. */
(() => {
'use strict';

// ---------- Layout (logical pixels; the canvas is scaled to fit the window) ----------
const W = 450, H = 800;
const COLS = 5, ROWS = 3, N_CELLS = COLS * ROWS;
const CELL_W = 84, CELL_H = 78;
const GRID_X = (W - COLS * CELL_W) / 2;
const ENEMY_Y = 96;
const MID_Y = ENEMY_Y + ROWS * CELL_H;          // 330
const PLAYER_Y = MID_Y + 76;                    // 406
const FIELD_BOTTOM = PLAYER_Y + ROWS * CELL_H;  // 640
const PANEL_Y = FIELD_BOTTOM + 10;              // 650
const BATTLE_LIMIT = 90;

const UI = {
  stage: { x: 10, y: 9, w: 100, h: 34 },
  coins: { x: 118, y: 9, w: 146, h: 34 },
  rush:  { x: 270, y: 9, w: 42, h: 34 },
  reset: { x: 316, y: 9, w: 36, h: 34 },
  speed: { x: 358, y: 9, w: 36, h: 34 },
  mute:  { x: 400, y: 9, w: 40, h: 34 },
  buy: {
    inf:  { x: 10,  y: 688, w: 82, h: 102 },
    tank: { x: 98,  y: 688, w: 82, h: 102 },
    air:  { x: 186, y: 688, w: 82, h: 102 },
  },
  fight: { x: 276, y: 688, w: 164, h: 102 },
  cont:  { x: 115, y: 484, w: 220, h: 58 },
};

// ---------- Units & balance ----------
const TYPES = {
  inf:  { name: 'Infantry', hp: 130, dmg: 13, cd: 0.55, range: 150, speed: 34, radius: 15, fly: false },
  tank: { name: 'Tank',     hp: 200, dmg: 26, cd: 1.4,  range: 125, speed: 24, radius: 19, fly: false },
  air:  { name: 'Chopper',  hp: 78,  dmg: 23, cd: 1.0,  range: 180, speed: 44, radius: 17, fly: true  },
};
const TYPE_KEYS = ['inf', 'tank', 'air'];
const BEATS = { tank: 'inf', inf: 'air', air: 'tank' };       // attacker -> type it deals +50% to
const COUNTER_OF = { inf: 'tank', tank: 'air', air: 'inf' };  // type -> what beats it
const TURN = { inf: 8, tank: 3.5, air: 6 };
const ROW_PREF = { tank: 0, inf: 1, air: 2 };                 // row 0 = front line
const COL_ORDER = [2, 1, 3, 0, 4];
const SQUAD = [[[0, 0]], [[1, -7], [-1, 7]], [[4, 0], [-4, -10], [-4, 10]]];

const counterMult = (a, d) => BEATS[a] === d ? 1.5 : BEATS[d] === a ? 0.7 : 1;
const lvlMult = L => Math.pow(2.2, L - 1);    // merged unit beats the two it came from
const unitValue = L => Math.pow(2, L - 1);    // in level-1 units
const unitPower = u => Math.round(10 * lvlMult(u.level));
const sizeScale = L => 0.85 + 0.035 * Math.min(L - 1, 10);
const squadSize = L => L >= 5 ? 3 : L >= 3 ? 2 : 1;

// Enemy strength (in level-1 units) grows geometrically; rewards track it so progress stays tight.
// The ramp softens the first ~10 stages so new players can learn before the curve bites.
const BAL = { base: 3.5, growth: 1.24, ramp: 0.5, rampPerStage: 0.05, rewardPerUnit: 20, rewardFlat: 40, maxEnemyUnits: 10, unitsEvery: 3 };
const budget = stage => stage === 1 ? 2 : Math.max(3, Math.round(
  BAL.base * Math.pow(BAL.growth, stage - 1) * Math.min(1, BAL.ramp + BAL.rampPerStage * stage)));
const reward = stage => Math.round(BAL.rewardPerUnit * budget(stage) + BAL.rewardFlat);
const buyLevel = stage => Math.max(1, Math.floor(Math.log2(budget(stage) / 8)) + 1);
const buyPrice = stage => 100 * unitValue(buyLevel(stage));
const sellPrice = u => Math.round(50 * unitValue(u.level));

const TIER = ['#a7b0a8', '#7cc25a', '#36c2b0', '#4a8fe8', '#a066ea', '#f39c2b', '#ec4f4a', '#ffd23f', '#ff7ad9', '#7af0ff'];
const tierColor = L => TIER[Math.min(L - 1, TIER.length - 1)];
const TEAM = {
  p: { body: '#3e6fb8', dark: '#22406e', bar: '#4fe06a', tile: 'rgba(70,130,255,0.17)' },
  e: { body: '#b8463e', dark: '#6e2622', bar: '#ff5a4a', tile: 'rgba(255,80,70,0.15)' },
};
const TIPS = [
  'Merge 2 identical units to level them up',
  'Counters: Tank > Infantry > Chopper > Tank',
  'Tanks belong up front to soak damage',
  'Choppers have the longest range',
  'Tap any unit to see its stats',
  'Drag a unit onto the FIGHT button to sell it',
];

// ---------- Utilities ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function turnToward(a, b, step) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}
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
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------- Board helpers ----------
function cellRect(team, idx) {
  const col = idx % COLS, row = Math.floor(idx / COLS);
  const x = GRID_X + col * CELL_W;
  const y = team === 'p' ? PLAYER_Y + row * CELL_H : ENEMY_Y + (ROWS - 1 - row) * CELL_H;
  return { x, y, w: CELL_W, h: CELL_H, cx: x + CELL_W / 2, cy: y + CELL_H / 2 };
}
function cellAt(team, x, y) {
  if (x < GRID_X || x >= GRID_X + COLS * CELL_W) return -1;
  const top = team === 'p' ? PLAYER_Y : ENEMY_Y;
  if (y < top || y >= top + ROWS * CELL_H) return -1;
  let row = Math.floor((y - top) / CELL_H);
  if (team === 'e') row = ROWS - 1 - row;
  return row * COLS + Math.floor((x - GRID_X) / CELL_W);
}
function freeCellFor(grid, pref) {
  const rows = [0, 1, 2].sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref) || a - b);
  for (const r of rows) for (const c of COL_ORDER) if (!grid[r * COLS + c]) return r * COLS + c;
  return -1;
}
const armyPower = grid => grid.reduce((s, u) => s + (u ? unitPower(u) : 0), 0);
function firstMergePair(grid) {
  for (let i = 0; i < N_CELLS; i++) for (let j = i + 1; j < N_CELLS; j++) {
    const a = grid[i], b = grid[j];
    if (a && b && a.type === b.type && a.level === b.level) return [i, j];
  }
  return null;
}
function mergeableSet(grid) {
  const s = new Set();
  for (let i = 0; i < N_CELLS; i++) for (let j = i + 1; j < N_CELLS; j++) {
    const a = grid[i], b = grid[j];
    if (a && b && a.type === b.type && a.level === b.level) { s.add(i); s.add(j); }
  }
  return s;
}
function dominantType(grid) {
  const v = { inf: 0, tank: 0, air: 0 };
  for (const u of grid) if (u) v[u.type] += unitValue(u.level);
  return TYPE_KEYS.reduce((a, b) => v[b] > v[a] ? b : a);
}

// ---------- Enemy generation (seeded per stage, so retries face the same army) ----------
const THEMES = [
  { name: 'Mixed Battalion',   w: [1, 1, 1] },
  { name: 'Infantry Horde',    w: [4, 1, 1] },
  { name: 'Armored Column',    w: [1, 4, 1] },
  { name: 'Air Wing',          w: [1, 1, 4] },
  { name: 'Ground Assault',    w: [2, 2, 0.4] },
  { name: 'Strike Group',      w: [0.4, 2, 2] },
  { name: 'Airborne Division', w: [2, 0.4, 2] },
];
function genEnemy(stage) {
  const rnd = mulberry32(stage * 7919 + 1013);
  const theme = stage <= 2 ? { name: 'Scout Patrol', w: [1, 0, 0] }
    : stage === 3 ? { name: 'Light Armor', w: [1, 1, 0] }
    : THEMES[Math.floor(rnd() * THEMES.length)];
  const total = theme.w.reduce((a, b) => a + b, 0);
  const heaviest = TYPE_KEYS[theme.w.indexOf(Math.max(...theme.w))];
  const pickType = () => {
    let r = rnd() * total;
    for (let i = 0; i < 3; i++) { r -= theme.w[i]; if (r < 0) return TYPE_KEYS[i]; }
    return heaviest;
  };

  const maxUnits = Math.min(BAL.maxEnemyUnits, 2 + Math.floor(stage / BAL.unitsEvery));
  const units = [];
  let rem = budget(stage);
  while (rem >= 1 && units.length < maxUnits) {
    let L = Math.max(1, Math.floor(Math.log2(rem / (maxUnits - units.length))) + 1);
    if (stage > 1 && rnd() < 0.3 && unitValue(L + 1) <= rem) L++;
    while (unitValue(L) > rem) L--;
    units.push({ type: pickType(), level: L });
    rem -= unitValue(L);
  }
  // Spend whatever is left by upgrading the weakest units.
  for (;;) {
    units.sort((a, b) => a.level - b.level);
    const u = units.find(u => unitValue(u.level) <= rem);
    if (!u) break;
    rem -= unitValue(u.level);
    u.level++;
  }

  const grid = Array(N_CELLS).fill(null);
  units.sort((a, b) => ROW_PREF[a.type] - ROW_PREF[b.type] || b.level - a.level);
  for (const u of units) {
    const pref = rnd() < 0.15 ? Math.floor(rnd() * ROWS) : ROW_PREF[u.type];
    const i = freeCellFor(grid, pref);
    if (i >= 0) grid[i] = u;
  }
  return { grid, name: theme.name };
}

// ---------- State ----------
const SAVE_KEY = 'mergefront.v1';
const state = { stage: 1, coins: 0, grid: Array(N_CELLS).fill(null), muted: false, speed: 1, hasMerged: false };
let enemy = { grid: Array(N_CELLS).fill(null), name: '' };
let phase = 'prep';   // prep | battle | result
let fighters = [], projectiles = [], particles = [], floaters = [], decals = [];
let battleTime = 0, battleEndTimer = 0, battleOutcome = null, lastResult = null, resultTime = 0;
let shake = 0, time = 0, displayCoins = 0;
let drag = null, pressedBtn = null;
const pointer = { x: -1, y: -1 };
let toastMsg = '', toastTime = 0, infoText = '', infoTime = 0;
const cellPop = Array(N_CELLS).fill(0);

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      stage: state.stage, coins: state.coins, grid: state.grid,
      muted: state.muted, speed: state.speed, hasMerged: state.hasMerged,
    }));
  } catch (e) { /* storage unavailable (private mode etc.) */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s || !Array.isArray(s.grid) || s.grid.length !== N_CELLS) return false;
    state.stage = Math.max(1, Math.floor(s.stage) || 1);
    state.coins = Math.max(0, Math.floor(Number(s.coins)) || 0);
    state.grid = s.grid.map(u => u && TYPES[u.type] && u.level >= 1 ? { type: u.type, level: Math.floor(u.level) } : null);
    state.muted = !!s.muted;
    state.speed = [1, 2, 3].includes(s.speed) ? s.speed : 1;
    state.hasMerged = !!s.hasMerged;
    return true;
  } catch (e) { return false; }
}
function clearBattle() {
  fighters = []; projectiles = []; decals = []; floaters = [];
  battleOutcome = null; drag = null;
}
function newGame() {
  state.stage = 1;
  state.coins = 300;
  state.grid = Array(N_CELLS).fill(null);
  state.grid[1] = { type: 'inf', level: 1 };
  state.grid[3] = { type: 'inf', level: 1 };
  state.hasMerged = false;
  enemy = genEnemy(state.stage);
  clearBattle();
  phase = 'prep';
  displayCoins = state.coins;
  save();
}
function rescueIfStuck() {
  if (!state.grid.some(Boolean) && state.coins < buyPrice(state.stage)) {
    state.grid[freeCellFor(state.grid, 1)] = { type: 'inf', level: buyLevel(state.stage) };
    toast('Reinforcements have arrived!');
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
  if (!actx || state.muted) return false;
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
  shot()    { if (ok('shot', 45)) noise(0.05, 0.05, 3500); },
  cannon()  { if (ok('cannon', 70)) { noise(0.3, 0.13, 900); tone(110, 0.2, 'sine', 0.1, 0.4); } },
  missile() { if (ok('missile', 60)) noise(0.35, 0.05, 2200); },
  hit()     { if (ok('hit', 60)) noise(0.25, 0.08, 1200); },
  boom()    { if (ok('boom', 80)) { noise(0.6, 0.22, 700); tone(70, 0.4, 'sine', 0.12, 0.5); } },
  merge()   { if (ok('merge', 50)) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, 0, i * 0.055)); },
  buy()     { if (ok('buy', 40)) { tone(880, 0.08, 'square', 0.04); tone(1320, 0.1, 'square', 0.04, 0, 0.06); } },
  error()   { if (ok('error', 100)) tone(160, 0.18, 'sawtooth', 0.05, 0.8); },
  click()   { if (ok('click', 30)) tone(620, 0.04, 'square', 0.035); },
  horn()    { if (ok('horn', 200)) { tone(392, 0.18, 'sawtooth', 0.05); tone(523, 0.3, 'sawtooth', 0.05, 0, 0.16); } },
  win()     { if (ok('win', 500)) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 0, i * 0.11)); },
  lose()    { if (ok('lose', 500)) [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.05, 0, i * 0.16)); },
};

// ---------- Effects ----------
function addP(p) { if (particles.length < 700) particles.push(p); }
function explosion(x, y, s) {
  addP({ k: 'flash', x, y, life: 0.12, max: 0.12, size: 24 * s, color: '#fff3c4' });
  addP({ k: 'ring', x, y, life: 0.4, max: 0.4, size: 30 * s, color: '#ffe7b0' });
  const n = Math.round(9 * s);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), v = rand(20, 110) * s, l = rand(0.25, 0.55);
    addP({ k: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, size: rand(4, 9) * s, color: ['#fff0a0', '#ffb347', '#ff6a2a'][i % 3] });
  }
  for (let i = 0; i < n * 0.7; i++) {
    const a = rand(0, 6.283), v = rand(8, 40) * s, l = rand(0.7, 1.3);
    addP({ k: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: l, max: l, size: rand(6, 11) * s });
  }
  for (let i = 0; i < n * 0.6; i++) {
    const a = rand(0, 6.283), v = rand(80, 200) * s, l = rand(0.2, 0.45);
    addP({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, size: 2, color: '#ffe08a' });
  }
}
function sparks(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), v = rand(40, 120), l = rand(0.1, 0.25);
    addP({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, size: 1.5, color });
  }
}
function mergeFx(x, y, level) {
  const col = tierColor(level);
  addP({ k: 'ring', x, y, life: 0.5, max: 0.5, size: 50, color: col });
  addP({ k: 'flash', x, y, life: 0.22, max: 0.22, size: 38, color: col });
  addP({ k: 'beam', x, y, life: 0.55, max: 0.55, size: 30, color: col });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * 6.283, v = rand(60, 150), l = rand(0.4, 0.8);
    addP({ k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, size: rand(3, 6), color: i % 2 ? col : '#ffffff', rot: rand(0, 6) });
  }
}
function floater(x, y, text, color, size = 14, life = 0.9) {
  if (floaters.length >= 60) return null;
  const f = { x, y, text, color, size, life, max: life };
  floaters.push(f);
  return f;
}
function toast(msg) { toastMsg = msg; toastTime = 1.8; }
function updateFx(dt) {
  for (const p of particles) {
    p.life -= dt;
    if (p.vx !== undefined) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.pow(p.k === 'smoke' ? 0.96 : p.k === 'spark' ? 0.9 : 0.92, dt * 60);
      p.vx *= k; p.vy *= k;
    }
    if (p.k === 'smoke') { p.vy -= 12 * dt; p.size += 10 * dt; }
    if (p.k === 'trail') p.size += 6 * dt;
    if (p.k === 'star') p.rot += dt * 6;
  }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.life -= dt; f.y -= 32 * dt; }
  floaters = floaters.filter(f => f.life > 0);
}

// ---------- Player actions ----------
function buy(type) {
  const price = buyPrice(state.stage);
  if (state.coins < price) { toast('Not enough coins'); sfx.error(); return; }
  const i = freeCellFor(state.grid, ROW_PREF[type]);
  if (i < 0) { toast('Board full: merge or sell units'); sfx.error(); return; }
  state.coins -= price;
  state.grid[i] = { type, level: buyLevel(state.stage) };
  cellPop[i] = 1;
  const r = cellRect('p', i);
  sparks(r.cx, r.cy, 10, tierColor(state.grid[i].level));
  sfx.buy();
  save();
}
function dropUnit(from, to) {
  const g = state.grid, a = g[from], b = g[to];
  if (!b) {
    g[to] = a; g[from] = null; cellPop[to] = 0.5; sfx.click();
  } else if (a.type === b.type && a.level === b.level) {
    g[to] = { type: a.type, level: a.level + 1 }; g[from] = null;
    cellPop[to] = 1.4;
    const r = cellRect('p', to);
    mergeFx(r.cx, r.cy, g[to].level);
    floater(r.cx, r.cy - 30, 'LEVEL ' + g[to].level + '!', tierColor(g[to].level), 18, 1.1);
    state.hasMerged = true;
    sfx.merge();
  } else {
    g[to] = a; g[from] = b; cellPop[to] = cellPop[from] = 0.5; sfx.click();
  }
  save();
}
function sell(from) {
  const u = state.grid[from], v = sellPrice(u), r = cellRect('p', from);
  state.coins += v;
  state.grid[from] = null;
  floater(r.cx, r.cy - 20, '+' + fmt(v), '#ffd84a', 16);
  sparks(r.cx, r.cy, 12, '#ffd84a');
  sfx.buy();
  rescueIfStuck();
  save();
}
function showInfo(u, prefix) {
  const T = TYPES[u.type], m = lvlMult(u.level);
  infoText = `${prefix}Lv${u.level} ${T.name} · HP ${fmt(T.hp * m)} · ATK ${fmt(T.dmg * m)} · beats ${TYPES[BEATS[u.type]].name}`;
  infoTime = 4;
}

// ---------- Battle ----------
function makeFighter(u, team, x, y) {
  const T = TYPES[u.type], m = lvlMult(u.level);
  return {
    type: u.type, level: u.level, team, fly: T.fly,
    x: x + rand(-5, 5), y: y + rand(-3, 3),
    hp: T.hp * m, maxHp: T.hp * m, dmg: T.dmg * m, hpShown: 1,
    range: T.range, speed: T.speed, r: T.radius * sizeScale(u.level),
    angle: team === 'p' ? -Math.PI / 2 : Math.PI / 2,
    cd: rand(0.15, 0.6) * T.cd, retarget: 0, target: null,
    dead: false, flash: 0, recoil: 0, dist: 0, pod: 1, phase: rand(0, 6.28),
  };
}
function setupFighters(pGrid, eGrid) {
  fighters = [];
  pGrid.forEach((u, i) => { if (u) { const r = cellRect('p', i); fighters.push(makeFighter(u, 'p', r.cx, r.cy)); } });
  eGrid.forEach((u, i) => { if (u) { const r = cellRect('e', i); fighters.push(makeFighter(u, 'e', r.cx, r.cy)); } });
  projectiles = []; decals = []; floaters = [];
  battleTime = 0; battleEndTimer = 0; battleOutcome = null;
}
function startBattle() {
  if (!state.grid.some(Boolean)) { toast('Buy some units first!'); sfx.error(); return; }
  setupFighters(state.grid, enemy.grid);
  particles = [];
  drag = null;
  phase = 'battle';
  sfx.horn();
}
const aimY = t => t.fly ? t.y - 12 * sizeScale(t.level) : t.y;

function findTarget(f) {
  let best = null, bestScore = Infinity;
  for (const e of fighters) {
    if (e.dead || e.team === f.team) continue;
    const m = counterMult(f.type, e.type);
    const score = Math.hypot(e.x - f.x, e.y - f.y) * (m > 1 ? 0.8 : m < 1 ? 1.15 : 1);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
function fire(f, t) {
  const s = sizeScale(f.level), alt = f.fly ? 12 * s : 0;
  const cos = Math.cos(f.angle), sin = Math.sin(f.angle);
  const world = (lx, ly) => [f.x + (lx * cos - ly * sin) * s, f.y - alt + (lx * sin + ly * cos) * s];
  const mult = counterMult(f.type, t.type), crit = mult > 1;
  const dmg = f.dmg * mult * rand(0.9, 1.1);
  f.recoil = 1;
  if (f.type === 'inf') {
    const pts = SQUAD[squadSize(f.level) - 1];
    pts.forEach(([ox, oy], i) => {
      const [mx, my] = world(ox + 15, oy + 3.6);
      projectiles.push({ kind: 'bullet', x: mx, y: my, target: t, tx: t.x, ty: aimY(t), dmg: dmg / pts.length, crit, team: f.team, speed: 720, vx: 0, vy: 0, delay: i * 0.07, life: 2 });
    });
    sfx.shot();
  } else if (f.type === 'tank') {
    const [mx, my] = world(25, 0);
    projectiles.push({ kind: 'shell', x: mx, y: my, target: t, tx: t.x, ty: aimY(t), dmg, crit, team: f.team, speed: 400, vx: 0, vy: 0, delay: 0, life: 3, d0: Math.max(1, Math.hypot(t.x - mx, aimY(t) - my)) });
    addP({ k: 'flash', x: mx, y: my, life: 0.08, max: 0.08, size: 12, color: '#fff2b0' });
    for (let i = 0; i < 4; i++) addP({ k: 'smoke', x: mx, y: my, vx: cos * rand(10, 40) + rand(-10, 10), vy: sin * rand(10, 40) + rand(-10, 10), life: 0.6, max: 0.6, size: rand(3, 6) });
    sfx.cannon();
  } else {
    f.pod = -f.pod;
    const [mx, my] = world(2, 12.5 * f.pod);
    const a = f.angle + rand(-0.25, 0.25);
    projectiles.push({ kind: 'missile', x: mx, y: my, target: t, tx: t.x, ty: aimY(t), dmg, crit, team: f.team, speed: 150, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, delay: 0, life: 3, trail: 0 });
    sfx.missile();
  }
}
function kill(t) {
  t.hp = 0;
  t.dead = true;
  explosion(t.x, aimY(t), 1.1 + Math.min(t.level, 12) * 0.07);
  decals.push({ k: 'scorch', x: t.x, y: t.y, r: 16 + t.level * 1.5 });
  if (t.type !== 'inf') decals.push({ k: 'wreck', type: t.type, level: t.level, team: t.team, x: t.x, y: t.y, angle: t.angle + rand(-0.4, 0.4), smoke: 4 });
  shake = Math.min(10, shake + 2.5 + t.level * 0.4);
  sfx.boom();
}
function damage(t, dmg, crit) {
  t.hp -= dmg;
  t.flash = 0.08;
  // Hits landing in quick succession share one number so bursts don't stack into clutter.
  const fl = t.floater;
  if (fl && fl.life > 0 && fl.max - fl.life < 0.25) {
    fl.amount += dmg;
    fl.text = fmt(fl.amount);
    if (crit) { fl.color = '#ffd23f'; fl.size = 14; }
  } else {
    t.floater = floater(t.x + rand(-10, 10), aimY(t) - t.r - 14, fmt(dmg), crit ? '#ffd23f' : '#ffffff', crit ? 14 : 11, 0.7);
    if (t.floater) t.floater.amount = dmg;
  }
  if (t.hp <= 0) kill(t);
}
function impact(p) {
  if (p.target && !p.target.dead) damage(p.target, p.dmg, p.crit);
  if (p.kind === 'bullet') sparks(p.x, p.y, 3, '#ffe28a');
  else { explosion(p.x, p.y, p.kind === 'shell' ? 0.75 : 0.6); sfx.hit(); }
}
function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (p.delay > 0) { p.delay -= dt; continue; }
    if (!p.started) {
      p.started = true;
      if (p.kind === 'bullet') addP({ k: 'flash', x: p.x, y: p.y, life: 0.05, max: 0.05, size: 6, color: '#fff2b0' });
    }
    if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = aimY(p.target); }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 0.001;
    if (p.kind === 'missile') {
      p.speed = Math.min(540, p.speed + 1100 * dt);
      const want = Math.atan2(dy, dx);
      const a = d < 60 ? want : turnToward(Math.atan2(p.vy, p.vx), want, dt * 10);
      p.vx = Math.cos(a) * p.speed; p.vy = Math.sin(a) * p.speed;
      p.trail -= dt;
      if (p.trail <= 0) { p.trail = 0.018; addP({ k: 'trail', x: p.x, y: p.y, life: 0.4, max: 0.4, size: 2.2 }); }
    } else {
      p.vx = dx / d * p.speed; p.vy = dy / d * p.speed;
    }
    if (d <= p.speed * dt + 5) { p.x = p.tx; p.y = p.ty; impact(p); p.done = true; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) p.done = true;
  }
  projectiles = projectiles.filter(p => !p.done);
}
function separate() {
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    if (a.dead) continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const b = fighters[j];
      if (b.dead || a.fly !== b.fly) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.9, d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d > 0.01 ? dx / d : rand(-1, 1), ny = d > 0.01 ? dy / d : rand(-1, 1);
      const push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
    }
    a.x = clamp(a.x, 14, W - 14);
    a.y = clamp(a.y, ENEMY_Y + 10, FIELD_BOTTOM - 10);
  }
}
function stepBattle(dt) {
  battleTime += dt;
  for (const f of fighters) {
    if (f.dead) continue;
    f.cd -= dt;
    f.flash = Math.max(0, f.flash - dt);
    f.recoil = Math.max(0, f.recoil - dt * 5);
    f.hpShown = Math.max(f.hp / f.maxHp, f.hpShown - dt * 0.6);
    f.retarget -= dt;
    if (!f.target || f.target.dead || f.retarget <= 0) { f.target = findTarget(f); f.retarget = rand(0.4, 0.7); }
    const t = f.target;
    if (!t) continue;
    const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy) || 0.001;
    const want = Math.atan2(dy, dx);
    f.angle = turnToward(f.angle, want, dt * TURN[f.type]);
    if (d > f.range) {
      const sp = f.speed * dt;
      f.x += dx / d * sp; f.y += dy / d * sp; f.dist += sp;
    } else if (f.cd <= 0 && Math.abs(angleDiff(f.angle, want)) < 0.3) {
      fire(f, t);
      f.cd = TYPES[f.type].cd * rand(0.85, 1.15);
    }
  }
  separate();
  updateProjectiles(dt);
  for (const w of decals) {
    if (w.smoke > 0) {
      w.smoke -= dt;
      if (Math.random() < dt * 7) addP({ k: 'smoke', x: w.x + rand(-5, 5), y: w.y - 4, vx: rand(-5, 5), vy: -15, life: 1.2, max: 1.2, size: rand(4, 7) });
    }
  }
}
function outcomeNow() {
  let p = false, e = false;
  for (const f of fighters) if (!f.dead) { if (f.team === 'p') p = true; else e = true; }
  if (!e) return 'win';
  if (!p) return 'lose';
  if (battleTime > BATTLE_LIMIT) return 'timeout';
  return null;
}
function endBattle(outcome) {
  const win = outcome === 'win', stage = state.stage;
  const coins = win ? reward(stage) : Math.round(reward(stage) * 0.25);
  battleOutcome = outcome;
  battleEndTimer = 1.5;
  lastResult = { win, timeout: outcome === 'timeout', stage, coins, dom: dominantType(enemy.grid), shopUp: win && buyLevel(stage + 1) > buyLevel(stage) };
  state.coins += coins;
  if (win) { state.stage++; enemy = genEnemy(state.stage); }
  save();
  if (win) sfx.win(); else sfx.lose();
}
function updateBattle(dt) {
  stepBattle(dt);
  if (!battleOutcome) {
    const o = outcomeNow();
    if (o) endBattle(o);
  } else if ((battleEndTimer -= dt) <= 0) {
    phase = 'result';
    resultTime = 0;
  }
}
function backToPrep() {
  clearBattle();
  phase = 'prep';
  for (let i = 0; i < N_CELLS; i++) if (state.grid[i]) cellPop[i] = 0.8;
  rescueIfStuck();
  save();
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
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.18); ctx.strokeStyle = '#9a5f08'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(154,95,8,0.6)'; ctx.stroke();
}
function coinText(amount, cx, cy, size, prefix = '', color = '#ffd84a') {
  const str = prefix + fmt(amount);
  ctx.font = font(size);
  const r = size * 0.5, w = ctx.measureText(str).width, x0 = cx - (r * 2 + 5 + w) / 2;
  coinIcon(x0 + r, cy, r);
  text(str, x0 + r * 2 + 5, cy, size, color, 'left');
}
function badge(c, x, y, level, r = 9) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = tierColor(level); c.fill();
  c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.stroke();
  c.fillStyle = '#10141a';
  c.font = font(level >= 10 ? r * 1.05 : r * 1.25, 900);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(level), x, y + 0.5);
}

// Unit art is drawn facing +x in local space, then rotated into place.
function soldier(c, body, dark, tc, recoil) {
  const rb = -recoil * 2;
  c.fillStyle = '#262626'; c.fillRect(2 + rb, 2.4, 13, 2.4);
  c.fillStyle = dark; c.fillRect(-7.5, -4, 3.5, 8);
  c.fillStyle = body;
  c.beginPath(); c.ellipse(0, 0, 5, 8, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = dark; c.lineWidth = 1.2; c.stroke();
  c.beginPath(); c.ellipse(5 + rb, 3.6, 3, 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = tc;
  c.beginPath(); c.arc(0.5, 0, 4.6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath(); c.arc(-0.5, -1.5, 1.6, 0, Math.PI * 2); c.fill();
}
function drawSquad(c, level, body, dark, tc, o) {
  const pts = SQUAD[squadSize(level) - 1];
  pts.forEach(([ox, oy], i) => {
    const sway = o.walk ? Math.sin(o.walk * 0.35 + i * 2) * 1.2 : 0;
    c.save();
    c.translate(ox + sway, oy);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(1.5, 2, 8, 9, 0, 0, Math.PI * 2); c.fill();
    soldier(c, body, dark, tc, o.recoil || 0);
    c.restore();
  });
}
function drawTank(c, body, dark, tc, o) {
  const tr = (o.walk || 0) % 4;
  c.fillStyle = '#2a2a2a';
  rr(c, -17, -14, 34, 8, 2.5); c.fill();
  rr(c, -17, 6, 34, 8, 2.5); c.fill();
  c.fillStyle = '#474747';
  for (let i = -16 + tr; i < 16; i += 4) { c.fillRect(i, -14, 1.6, 8); c.fillRect(i, 6, 1.6, 8); }
  rr(c, -15, -9.5, 30, 19, 4);
  c.fillStyle = body; c.fill();
  c.strokeStyle = dark; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = dark; c.fillRect(-14, -6, 4, 12);
  c.fillStyle = tc; c.fillRect(10, -8, 3, 16);
  const rb = -(o.recoil || 0) * 4;
  c.fillStyle = '#2f2f2f'; c.fillRect(4 + rb, -2.2, 19, 4.4);
  c.fillStyle = '#1d1d1d'; c.fillRect(20 + rb, -3, 4.5, 6);
  c.fillStyle = tc;
  c.beginPath(); c.arc(0, 0, 8.2, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.beginPath(); c.arc(-2.2, -2.6, 2.8, 0, Math.PI * 2); c.fill();
}
function drawHeli(c, body, dark, tc, rotor, o) {
  c.fillStyle = body;
  c.fillRect(-23, -1.8, 17, 3.6);
  rr(c, -26, -5.5, 4, 11, 1.5); c.fill();
  c.fillStyle = dark; c.fillRect(-3, -12.5, 5, 25);
  c.fillStyle = '#2e2e2e';
  rr(c, -5, -14.5, 10, 4, 2); c.fill();
  rr(c, -5, 10.5, 10, 4, 2); c.fill();
  c.fillStyle = body;
  c.beginPath(); c.ellipse(2, 0, 11.5, 6.8, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = dark; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = tc;
  c.beginPath(); c.ellipse(8.5, 0, 4.6, 4.2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath(); c.ellipse(9.5, -1.4, 2, 1.3, 0, 0, Math.PI * 2); c.fill();
  if (o.wreck) return;
  c.fillStyle = 'rgba(25,25,25,0.16)';
  c.beginPath(); c.arc(1, 0, 18, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(25,25,25,0.8)'; c.lineWidth = 2.2; c.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const a = rotor + i * Math.PI / 2, dx = Math.cos(a) * 18, dy = Math.sin(a) * 18;
    c.beginPath(); c.moveTo(1 - dx, -dy); c.lineTo(1 + dx, dy); c.stroke();
  }
  c.lineCap = 'butt';
  c.fillStyle = '#1a1a1a';
  c.beginPath(); c.arc(1, 0, 2.2, 0, Math.PI * 2); c.fill();
}
function drawUnit(c, type, level, x, y, angle, team, o = {}) {
  const s = (o.scale || 1) * sizeScale(level);
  let body = TEAM[team].body, dark = TEAM[team].dark, tc = tierColor(level);
  if (o.flash) { body = '#ffffff'; tc = '#ffffff'; }
  if (o.wreck) { body = '#3b3b3b'; dark = '#1e1e1e'; tc = '#2c2c2c'; }
  const t = o.time || 0, ph = o.phase || 0;
  c.save();
  c.translate(x, y);
  if (level >= 6 && !o.wreck && !o.noGlow) {
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 32 * s);
    g.addColorStop(0, hexA(tierColor(level), 0.5));
    g.addColorStop(1, hexA(tierColor(level), 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, 32 * s, 0, Math.PI * 2); c.fill();
  }
  if (type === 'air' && !o.wreck) {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(3, 6 * s, 15 * s, 8 * s, 0, 0, Math.PI * 2); c.fill();
    c.translate(0, -12 * s + Math.sin(t * 3 + ph) * 1.5);
  } else if (type === 'tank') {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(1.5, 3, 20 * s, 16 * s, 0, 0, Math.PI * 2); c.fill();
  }
  c.rotate(angle);
  c.scale(s, s);
  if (type === 'inf') drawSquad(c, level, body, dark, tc, o);
  else if (type === 'tank') drawTank(c, body, dark, tc, o);
  else drawHeli(c, body, dark, tc, t * 22 + ph, o);
  c.restore();
}

const bgCanvas = document.createElement('canvas');
function buildBackground() {
  const S = 2;
  bgCanvas.width = W * S;
  bgCanvas.height = H * S;
  const b = bgCanvas.getContext('2d');
  b.scale(S, S);
  b.fillStyle = '#121a25';
  b.fillRect(0, 0, W, H);
  const top = ENEMY_Y - 8, bot = FIELD_BOTTOM + 8;
  const g = b.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, '#6a8442'); g.addColorStop(0.5, '#7b984c'); g.addColorStop(1, '#68833f');
  b.fillStyle = g;
  b.fillRect(0, top, W, bot - top);
  const rnd = mulberry32(42);
  for (let i = 0; i < 16; i++) {
    b.fillStyle = `rgba(120,95,60,${0.1 + rnd() * 0.12})`;
    b.beginPath();
    b.ellipse(rnd() * W, top + rnd() * (bot - top), 20 + rnd() * 40, 10 + rnd() * 20, rnd() * 3, 0, Math.PI * 2);
    b.fill();
  }
  const mg = b.createLinearGradient(0, MID_Y, 0, PLAYER_Y);
  mg.addColorStop(0, 'rgba(115,88,56,0)'); mg.addColorStop(0.5, 'rgba(115,88,56,0.4)'); mg.addColorStop(1, 'rgba(115,88,56,0)');
  b.fillStyle = mg;
  b.fillRect(0, MID_Y - 10, W, PLAYER_Y - MID_Y + 20);
  for (let i = 0; i < 280; i++) {
    const x = rnd() * W, y = top + rnd() * (bot - top);
    b.strokeStyle = rnd() < 0.5 ? 'rgba(55,85,32,0.6)' : 'rgba(155,185,95,0.45)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(x, y); b.lineTo(x - 2, y - 4 - rnd() * 3);
    b.moveTo(x, y); b.lineTo(x + 2, y - 3 - rnd() * 3);
    b.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = top + rnd() * (bot - top), r = 1.5 + rnd() * 3;
    b.fillStyle = 'rgba(90,90,80,0.55)';
    b.beginPath(); b.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(200,200,180,0.35)';
    b.beginPath(); b.ellipse(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.4, 0, 0, Math.PI * 2); b.fill();
  }
  const v = b.createLinearGradient(0, 0, W, 0);
  v.addColorStop(0, 'rgba(0,0,0,0.25)'); v.addColorStop(0.12, 'rgba(0,0,0,0)');
  v.addColorStop(0.88, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
  b.fillStyle = v;
  b.fillRect(0, top, W, bot - top);
}

function drawTiles() {
  ctx.globalAlpha = phase === 'prep' ? 1 : 0.35;
  for (const team of ['e', 'p']) {
    for (let i = 0; i < N_CELLS; i++) {
      const r = cellRect(team, i);
      rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10);
      ctx.fillStyle = TEAM[team].tile; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (phase === 'prep' && drag && drag.moved) {
    const to = cellAt('p', pointer.x, pointer.y);
    if (to >= 0 && to !== drag.from) {
      const a = state.grid[drag.from], b = state.grid[to];
      const merge = b && a.type === b.type && a.level === b.level;
      const r = cellRect('p', to);
      rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10);
      ctx.lineWidth = 3;
      ctx.strokeStyle = merge ? `rgba(110,255,140,${0.7 + Math.sin(time * 12) * 0.3})` : 'rgba(255,255,255,0.8)';
      ctx.stroke();
      if (merge) { ctx.fillStyle = 'rgba(110,255,140,0.18)'; ctx.fill(); }
    }
  }
}
function chevron(x, y) {
  for (let k = 0; k < 2; k++) {
    const yy = y + k * 5;
    ctx.beginPath(); ctx.moveTo(x - 5, yy + 3); ctx.lineTo(x, yy - 2); ctx.lineTo(x + 5, yy + 3);
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#6dff8a'; ctx.stroke();
  }
}
function drawPrepUnits() {
  for (let i = 0; i < N_CELLS; i++) {
    const u = enemy.grid[i];
    if (!u) continue;
    const r = cellRect('e', i);
    drawUnit(ctx, u.type, u.level, r.cx, r.cy + 4, Math.PI / 2, 'e', { time, phase: i });
    badge(ctx, r.x + 14, r.y + 14, u.level, 9);
  }
  const ms = mergeableSet(state.grid);
  for (let i = 0; i < N_CELLS; i++) {
    const u = state.grid[i];
    if (!u) continue;
    const r = cellRect('p', i);
    const lifted = drag && drag.moved && drag.from === i;
    ctx.globalAlpha = lifted ? 0.3 : 1;
    const bob = Math.sin(time * 2.2 + i * 1.3) * 1.2;
    drawUnit(ctx, u.type, u.level, r.cx, r.cy + 4 + bob, -Math.PI / 2, 'p', { time, phase: i, scale: 1 + cellPop[i] * cellPop[i] * 0.3 });
    ctx.globalAlpha = 1;
    badge(ctx, r.x + 14, r.y + 14, u.level, 9);
    if (ms.has(i) && !lifted) chevron(r.x + r.w - 15, r.y + 12 + Math.abs(Math.sin(time * 4 + i)) * -3);
  }
}
function drawTutorial() {
  if (phase !== 'prep' || drag || state.stage > 2 || state.hasMerged) return;
  const pair = firstMergePair(state.grid);
  if (!pair) return;
  const ra = cellRect('p', pair[0]), rb = cellRect('p', pair[1]);
  const cyc = (time % 1.8) / 1.8, p = clamp((cyc - 0.15) / 0.6, 0, 1), e = p * p * (3 - 2 * p);
  const x = lerp(ra.cx, rb.cx, e), y = lerp(ra.cy, rb.cy, e) - Math.sin(e * Math.PI) * 22;
  const alpha = cyc < 0.85 ? 1 : (1 - cyc) / 0.15;
  const u = state.grid[pair[0]];
  ctx.globalAlpha = 0.55 * alpha;
  drawUnit(ctx, u.type, u.level, x, y, -Math.PI / 2, 'p', { time, scale: 1.1 });
  ctx.globalAlpha = 0.9 * alpha;
  ctx.beginPath(); ctx.arc(x + 12, y + 16, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawDecals() {
  for (const d of decals) {
    if (d.k !== 'scorch') continue;
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    g.addColorStop(0, 'rgba(25,20,15,0.55)'); g.addColorStop(1, 'rgba(25,20,15,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const d of decals) if (d.k === 'wreck') drawUnit(ctx, d.type, d.level, d.x, d.y, d.angle, d.team, { wreck: true });
}
function drawFighter(f) {
  drawUnit(ctx, f.type, f.level, f.x, f.y, f.angle, f.team, { time, phase: f.phase, flash: f.flash > 0, recoil: f.recoil, walk: f.dist });
}
function drawHpBar(f) {
  const yy = aimY(f) - f.r - 12;
  const w = 26 + Math.min(f.level, 10) * 1.4, h = 4, x = f.x - w / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 1, yy - 1, w + 2, h + 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, yy, w * f.hpShown, h);
  ctx.fillStyle = TEAM[f.team].bar; ctx.fillRect(x, yy, w * (f.hp / f.maxHp), h);
  badge(ctx, x - 6, yy + 2, f.level, 6);
}
function drawProjectiles() {
  for (const p of projectiles) {
    if (p.delay > 0) continue;
    if (p.kind === 'bullet') {
      ctx.strokeStyle = p.team === 'p' ? '#fff6a0' : '#ffd0a0';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (p.kind === 'shell') {
      const prog = clamp(1 - Math.hypot(p.tx - p.x, p.ty - p.y) / p.d0, 0, 1);
      const h = Math.sin(prog * Math.PI) * Math.min(40, p.d0 * 0.18);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath(); ctx.arc(p.x, p.y - h, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcf6a';
      ctx.beginPath(); ctx.arc(p.x, p.y - h, 1.8, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(-11 - Math.random() * 4, 0); ctx.lineTo(-5, 2); ctx.fill();
      ctx.fillStyle = '#e6e6e6'; ctx.fillRect(-5, -1.6, 10, 3.2);
      ctx.fillStyle = TEAM[p.team].body; ctx.fillRect(3, -1.6, 3, 3.2);
      ctx.restore();
    }
  }
}
function drawBattle() {
  drawDecals();
  const alive = fighters.filter(f => !f.dead).sort((a, b) => a.y - b.y);
  for (const f of alive) if (!f.fly) drawFighter(f);
  drawProjectiles();
  for (const f of alive) if (f.fly) drawFighter(f);
  for (const f of alive) drawHpBar(f);
}
function drawParticles() {
  for (const p of particles) {
    if (p.k !== 'smoke' && p.k !== 'trail') continue;
    const a = p.life / p.max;
    ctx.globalAlpha = (p.k === 'trail' ? 0.45 : 0.35) * a;
    ctx.fillStyle = p.k === 'trail' ? '#e8e8e8' : '#4a4a4a';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = p.life / p.max;
    switch (p.k) {
      case 'flash':
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2); ctx.fill();
        break;
      case 'fire':
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2); ctx.fill();
        break;
      case 'ring':
        ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 + p.size * (1 - a), 0, Math.PI * 2); ctx.stroke();
        break;
      case 'spark':
        ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
        break;
      case 'star': {
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.3, -s * 0.3); ctx.lineTo(s, 0); ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s); ctx.lineTo(-s * 0.3, s * 0.3); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'beam': {
        ctx.globalAlpha = a * 0.6;
        const g = ctx.createLinearGradient(0, p.y - 70, 0, p.y + 20);
        g.addColorStop(0, hexA(p.color, 0)); g.addColorStop(1, hexA(p.color, 0.9));
        ctx.fillStyle = g;
        const w = p.size * (0.5 + 0.5 * a);
        ctx.fillRect(p.x - w / 2, p.y - 70, w, 90);
        break;
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
function drawFloaters() {
  for (const f of floaters) {
    const age = f.max - f.life;
    ctx.globalAlpha = Math.min(1, (f.life / f.max) * 2.5);
    text(f.text, f.x, f.y, f.size * (1 + Math.max(0, 0.12 - age) * 4), f.color, 'center', 900, 'rgba(0,0,0,0.75)');
  }
  ctx.globalAlpha = 1;
}
function pill(r, fill = 'rgba(0,0,0,0.35)') {
  rr(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
}
function iconButton(id, r, draw) {
  const pressed = pressedBtn === id && inRect(pointer, r);
  rr(ctx, r.x, r.y, r.w, r.h, 9);
  ctx.fillStyle = pressed ? '#3a4a60' : '#243143'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
  draw(r.x + r.w / 2, r.y + r.h / 2);
}
function drawTopBar() {
  ctx.fillStyle = '#121a25';
  ctx.fillRect(0, 0, W, 52);
  pill(UI.stage);
  text('STAGE ' + state.stage, UI.stage.x + UI.stage.w / 2, UI.stage.y + UI.stage.h / 2, 15, '#ffffff');
  pill(UI.coins);
  coinIcon(UI.coins.x + 19, UI.coins.y + 17, 11);
  text(fmt(displayCoins), UI.coins.x + 38, UI.coins.y + 17, 18, '#ffd84a', 'left');

  const rp = pressedBtn === 'rush' && inRect(pointer, UI.rush);
  rr(ctx, UI.rush.x, UI.rush.y, UI.rush.w, UI.rush.h, 9);
  ctx.fillStyle = rp ? '#c4561c' : phase === 'prep' ? '#e8741e' : '#5a4436'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  text('RUSH', UI.rush.x + UI.rush.w / 2, UI.rush.y + 13, 10, '#ffffff', 'center', 900, null);
  text('»', UI.rush.x + UI.rush.w / 2, UI.rush.y + 25, 13, '#ffffff', 'center', 900, null);
  iconButton('reset', UI.reset, (x, y) => {
    ctx.strokeStyle = '#cfd9e6'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 8, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke();
    ctx.fillStyle = '#cfd9e6';
    const ax = x + Math.cos(-Math.PI * 0.35) * 8, ay = y + Math.sin(-Math.PI * 0.35) * 8;
    ctx.beginPath(); ctx.moveTo(ax + 4, ay - 4); ctx.lineTo(ax + 3, ay + 4); ctx.lineTo(ax - 4, ay + 1); ctx.closePath(); ctx.fill();
  });
  iconButton('speed', UI.speed, (x, y) => text(state.speed + 'x', x, y + 1, 14, state.speed > 1 ? '#ffd84a' : '#cfd9e6', 'center', 900, null));
  iconButton('mute', UI.mute, (x, y) => {
    ctx.fillStyle = '#cfd9e6';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 1, y - 9);
    ctx.lineTo(x + 1, y + 9); ctx.lineTo(x - 5, y + 4); ctx.lineTo(x - 9, y + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = state.muted ? '#ff6b5e' : '#cfd9e6'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (state.muted) { ctx.moveTo(x + 4, y - 5); ctx.lineTo(x + 11, y + 5); ctx.moveTo(x + 11, y - 5); ctx.lineTo(x + 4, y + 5); }
    else { ctx.arc(x + 2, y, 6, -0.9, 0.9); ctx.moveTo(x + 2 + Math.cos(-0.9) * 10, y + Math.sin(-0.9) * 10); ctx.arc(x + 2, y, 10, -0.9, 0.9); }
    ctx.stroke();
  });
}
function hpBar(x, y, w, h, frac, color, label) {
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  if (frac > 0) { rr(ctx, x, y, Math.max(h, w * frac), h, h / 2); ctx.fillStyle = color; ctx.fill(); }
  text(label, x + 8, y + h / 2 + 0.5, 10, '#ffffff', 'left', 900, 'rgba(0,0,0,0.6)');
}
function drawStrip() {
  const y = 52, cy = y + 19;
  ctx.fillStyle = '#18222f';
  ctx.fillRect(0, y, W, 36);
  if (phase === 'prep') {
    text('ENEMY: ' + enemy.name.toUpperCase(), 14, cy, 13, '#ff9c94', 'left');
    text('WIN', W - 104, cy, 11, '#9fb0c6', 'right', 800, null);
    coinText(reward(state.stage), W - 54, cy, 14);
  } else {
    let php = 0, pmax = 0, ehp = 0, emax = 0;
    for (const f of fighters) {
      if (f.team === 'p') { php += Math.max(0, f.hp); pmax += f.maxHp; }
      else { ehp += Math.max(0, f.hp); emax += f.maxHp; }
    }
    hpBar(14, cy - 7, 170, 14, pmax ? php / pmax : 0, '#4f9bff', 'YOU');
    hpBar(W - 184, cy - 7, 170, 14, emax ? ehp / emax : 0, '#ff5a4a', 'ENEMY');
    text(Math.max(0, Math.ceil(BATTLE_LIMIT - battleTime)) + 's', W / 2, cy, 13, '#ffffff');
  }
}
function drawMidBand() {
  if (phase !== 'prep') return;
  const pp = armyPower(state.grid), ep = armyPower(enemy.grid), y0 = MID_Y + 4;
  rr(ctx, 10, y0, W - 20, 68, 12);
  ctx.fillStyle = 'rgba(10,16,24,0.55)'; ctx.fill();
  text('YOU ' + fmt(pp), 22, y0 + 14, 13, '#8fc1ff', 'left');
  text(fmt(ep) + ' ENEMY', W - 22, y0 + 14, 13, '#ff8f86', 'right');
  text('POWER', W / 2, y0 + 14, 11, '#c9d4e2', 'center', 800, null);
  const bx = 22, bw = W - 44, by = y0 + 25, bh = 9;
  const frac = pp + ep > 0 ? pp / (pp + ep) : 0.5;
  rr(ctx, bx, by, bw, bh, 4.5); ctx.fillStyle = '#ff5a4a'; ctx.fill();
  if (frac > 0) { rr(ctx, bx, by, Math.max(bh, bw * frac), bh, 4.5); ctx.fillStyle = '#4f9bff'; ctx.fill(); }
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bw * frac - 1, by - 2, 2, bh + 4);

  const ly = y0 + 52, order = ['tank', 'inf', 'air', 'tank'];
  text('COUNTERS', 92, ly, 10, '#9fb0c6', 'right', 800, null);
  order.forEach((t, i) => {
    const x = 120 + i * 62;
    drawUnit(ctx, t, 3, x, ly + 2, -Math.PI / 2, 'p', { time, scale: 0.55, phase: i, noGlow: true });
    if (i < order.length - 1) text('>', x + 31, ly, 14, '#ffd84a', 'center', 900, null);
  });
  text('+50%', 120 + 3 * 62 + 42, ly, 10, '#ffd84a', 'center', 800, null);
}
function drawBuyButton(type) {
  const r = UI.buy[type], price = buyPrice(state.stage), L = buyLevel(state.stage);
  const can = state.coins >= price && state.grid.some(u => !u);
  const pressed = pressedBtn === 'buy:' + type && inRect(pointer, r);
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  if (pressed) ctx.scale(0.94, 0.94);
  ctx.translate(-r.w / 2, -r.h / 2);
  const g = ctx.createLinearGradient(0, 0, 0, r.h);
  g.addColorStop(0, can ? '#4d8ee8' : '#4a5260');
  g.addColorStop(1, can ? '#2b5aa6' : '#323843');
  rr(ctx, 0, 0, r.w, r.h, 12);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
  text(TYPES[type].name.toUpperCase(), r.w / 2, 13, 10, '#ffffff', 'center', 900, null);
  drawUnit(ctx, type, L, r.w / 2, 50, -Math.PI / 2, 'p', { time, phase: TYPE_KEYS.indexOf(type), noGlow: true });
  badge(ctx, 14, 28, L, 8);
  coinText(price, r.w / 2, r.h - 15, 13, '', can ? '#ffd84a' : '#9aa3ad');
  ctx.restore();
}
function drawTrash(x, y) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 11, y - 12, 22, 3);
  ctx.fillRect(x - 4, y - 15, 8, 3);
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 7); ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 7, y + 12); ctx.lineTo(x - 7, y + 12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  for (const dx of [-3.5, 0, 3.5]) { ctx.beginPath(); ctx.moveTo(x + dx, y - 4); ctx.lineTo(x + dx, y + 9); ctx.stroke(); }
}
function drawFightButton() {
  const r = UI.fight;
  const selling = drag && drag.moved;
  const hover = selling && inRect(pointer, r);
  const pressed = pressedBtn === 'fight' && inRect(pointer, r);
  const sc = pressed ? 0.95 : selling ? (hover ? 1.04 : 1) : 1 + Math.sin(time * 4) * 0.025;
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(sc, sc);
  ctx.translate(-r.w / 2, -r.h / 2);
  const g = ctx.createLinearGradient(0, 0, 0, r.h);
  if (selling) { g.addColorStop(0, hover ? '#ff5a4f' : '#8a3a36'); g.addColorStop(1, hover ? '#b8241c' : '#5a2220'); }
  else { g.addColorStop(0, '#ffb43a'); g.addColorStop(1, '#e8541e'); }
  rr(ctx, 0, 0, r.w, r.h, 16);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  if (selling) {
    drawTrash(r.w / 2, 30);
    text('SELL', r.w / 2, 60, 18, '#ffffff');
    coinText(sellPrice(state.grid[drag.from]), r.w / 2, 84, 14, '+');
  } else {
    rr(ctx, 6, 5, r.w - 12, r.h * 0.42, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    text('FIGHT!', r.w / 2, r.h / 2 - 6, 32, '#ffffff', 'center', 900, '#7a2a08');
    text('STAGE ' + state.stage, r.w / 2, r.h / 2 + 26, 12, '#fff3d6', 'center', 800, null);
  }
  ctx.restore();
}
function drawPanel() {
  const g = ctx.createLinearGradient(0, PANEL_Y, 0, H);
  g.addColorStop(0, '#1b2636'); g.addColorStop(1, '#0f1620');
  ctx.fillStyle = g;
  ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, PANEL_Y, W, 1);

  let line;
  if (phase !== 'prep') line = phase === 'battle' ? 'Battle in progress…' : '';
  else if (infoTime > 0) line = infoText;
  else if (state.stage <= 2 && !state.hasMerged && firstMergePair(state.grid)) line = 'Drag a unit onto a matching one to MERGE!';
  else if (state.stage === 1 && state.hasMerged) line = 'Nice! Buy more units or tap FIGHT to attack.';
  else line = 'Tip: ' + TIPS[Math.floor(time / 6) % TIPS.length];
  text(line, W / 2, PANEL_Y + 19, 12, infoTime > 0 && phase === 'prep' ? '#ffffff' : '#a9b8cc', 'center', 700, null);

  ctx.globalAlpha = phase === 'prep' ? 1 : 0.45;
  for (const t of TYPE_KEYS) drawBuyButton(t);
  drawFightButton();
  ctx.globalAlpha = 1;
}
function drawDragged() {
  if (!drag || !drag.moved) return;
  const u = state.grid[drag.from];
  if (!u) return;
  drawUnit(ctx, u.type, u.level, pointer.x, pointer.y - 6, -Math.PI / 2, 'p', { time, scale: 1.25 });
  badge(ctx, pointer.x - 24, pointer.y - 30, u.level, 9);
}
function drawBattleBanner() {
  if (phase !== 'battle' || battleTime > 0.9) return;
  const t = battleTime / 0.9;
  ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
  text('FIGHT!', W / 2, (MID_Y + PLAYER_Y) / 2, 52 * (1 + Math.max(0, 0.2 - t) * 2), '#ffd84a', 'center', 900, '#5a1a00');
  ctx.globalAlpha = 1;
}
function drawResult() {
  const r = lastResult;
  if (!r) return;
  ctx.fillStyle = `rgba(6,10,18,${0.65 * clamp(resultTime * 4, 0, 1)})`;
  ctx.fillRect(0, 0, W, H);
  const k = easeOutBack(clamp(resultTime * 3, 0, 1));
  ctx.save();
  ctx.translate(W / 2, 410); ctx.scale(k, k); ctx.translate(-W / 2, -410);
  const px = 40, py = 262, pw = W - 80, ph = 300;
  rr(ctx, px, py, pw, ph, 20);
  ctx.fillStyle = '#1c2838'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = r.win ? '#ffd23f' : '#6b7a8f'; ctx.stroke();
  rr(ctx, px + 30, py - 24, pw - 60, 50, 14);
  ctx.fillStyle = r.win ? '#3cb95a' : '#c4473e'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  text(r.win ? 'VICTORY!' : r.timeout ? "TIME'S UP" : 'DEFEAT', W / 2, py + 1, 28, '#ffffff', 'center', 900, 'rgba(0,0,0,0.4)');
  text(r.win ? `Stage ${r.stage} cleared` : `Stage ${r.stage} held strong`, W / 2, py + 56, 17, '#dfe8f5');
  text(r.win ? 'SPOILS OF WAR' : 'SALVAGE', W / 2, py + 90, 11, '#9fb0c6', 'center', 800, null);
  coinText(r.coins, W / 2, py + 118, 26, '+');
  if (r.win) {
    if (r.shopUp) text(`Shop upgraded: Lv${buyLevel(r.stage + 1)} units now for sale!`, W / 2, py + 166, 13, '#6dff8a', 'center', 800, null);
    else text(`Next up: Stage ${r.stage + 1}`, W / 2, py + 166, 13, '#c9d4e2', 'center', 700, null);
  } else {
    text(`Enemy is mostly ${TYPES[r.dom].name}.`, W / 2, py + 158, 13, '#c9d4e2', 'center', 700, null);
    text(`Counter with ${TYPES[COUNTER_OF[r.dom]].name} and merge up!`, W / 2, py + 178, 13, '#ffd84a', 'center', 800, null);
  }
  const b = UI.cont, pressed = pressedBtn === 'cont' && inRect(pointer, b);
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.scale(pressed ? 0.95 : 1, pressed ? 0.95 : 1);
  ctx.translate(-b.w / 2, -b.h / 2);
  const g = ctx.createLinearGradient(0, 0, 0, b.h);
  g.addColorStop(0, r.win ? '#5fd67a' : '#ffb43a');
  g.addColorStop(1, r.win ? '#2f9d4a' : '#e8541e');
  rr(ctx, 0, 0, b.w, b.h, 14);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  text(r.win ? 'NEXT STAGE' : 'TRY AGAIN', b.w / 2, b.h / 2 + 1, 20, '#ffffff', 'center', 900, 'rgba(0,0,0,0.35)');
  ctx.restore();
  ctx.restore();
}
function drawToast() {
  if (toastTime <= 0) return;
  ctx.globalAlpha = Math.min(1, toastTime * 3);
  ctx.font = font(14);
  const w = ctx.measureText(toastMsg).width + 36, y = (MID_Y + PLAYER_Y) / 2;
  rr(ctx, W / 2 - w / 2, y - 18, w, 36, 18);
  ctx.fillStyle = 'rgba(10,14,20,0.9)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();
  text(toastMsg, W / 2, y + 1, 14, '#ffffff', 'center', 800, null);
  ctx.globalAlpha = 1;
}
function render() {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.6, rand(-shake, shake) * 0.6);
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawTiles();
  if (phase === 'prep') drawPrepUnits(); else drawBattle();
  drawParticles();
  drawFloaters();
  ctx.restore();
  drawMidBand();
  drawTutorial();
  drawStrip();
  drawTopBar();
  drawPanel();
  drawBattleBanner();
  drawDragged();
  if (phase === 'result') drawResult();
  drawToast();
}

// ---------- Input ----------
function toLocal(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}
function buttonAt(p) {
  if (phase === 'result') return inRect(p, UI.cont) ? 'cont' : null;
  for (const k of ['reset', 'speed', 'mute']) if (inRect(p, UI[k])) return k;
  if (phase !== 'prep') return null;
  if (inRect(p, UI.rush)) return 'rush';
  for (const t of TYPE_KEYS) if (inRect(p, UI.buy[t])) return 'buy:' + t;
  if (inRect(p, UI.fight)) return 'fight';
  return null;
}
function press(b) {
  sfx.click();
  if (b === 'mute') { state.muted = !state.muted; save(); }
  else if (b === 'speed') { state.speed = state.speed % 3 + 1; save(); }
  else if (b === 'reset') { if (window.confirm('Start a new game? All progress will be lost.')) newGame(); }
  else if (b === 'fight') startBattle();
  else if (b === 'rush') { save(); window.location.href = 'rush.html'; }
  else if (b === 'cont') backToPrep();
  else if (b.startsWith('buy:')) buy(b.slice(4));
}
canvas.addEventListener('pointerdown', e => {
  initAudio();
  const p = toLocal(e);
  pointer.x = p.x; pointer.y = p.y;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
  const b = buttonAt(p);
  if (b) { pressedBtn = b; return; }
  if (phase !== 'prep') return;
  const i = cellAt('p', p.x, p.y);
  if (i >= 0 && state.grid[i]) { drag = { from: i, sx: p.x, sy: p.y, moved: false }; return; }
  const j = cellAt('e', p.x, p.y);
  if (j >= 0 && enemy.grid[j]) showInfo(enemy.grid[j], 'Enemy ');
});
canvas.addEventListener('pointermove', e => {
  const p = toLocal(e);
  pointer.x = p.x; pointer.y = p.y;
  if (drag && !drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
});
canvas.addEventListener('pointerup', e => {
  const p = toLocal(e);
  pointer.x = p.x; pointer.y = p.y;
  if (pressedBtn) {
    const b = pressedBtn;
    pressedBtn = null;
    if (buttonAt(p) === b) press(b);
    return;
  }
  if (!drag) return;
  const d = drag;
  drag = null;
  if (phase !== 'prep' || !state.grid[d.from]) return;
  if (!d.moved) { showInfo(state.grid[d.from], ''); return; }
  if (inRect(p, UI.fight)) { sell(d.from); return; }
  const to = cellAt('p', p.x, p.y);
  if (to >= 0 && to !== d.from) dropUnit(d.from, to);
});
canvas.addEventListener('pointercancel', () => { drag = null; pressedBtn = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  initAudio();
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (phase === 'prep') startBattle();
    else if (phase === 'result') backToPrep();
  } else if (phase === 'prep' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    buy(TYPE_KEYS[+e.code.slice(5) - 1]);
  }
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------- Main loop ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  time += dt;
  if (phase === 'battle') {
    for (let i = 0; i < state.speed && phase === 'battle'; i++) { updateBattle(dt); updateFx(dt); }
  } else {
    updateFx(dt);
  }
  if (phase === 'result') resultTime += dt;
  shake = Math.max(0, shake - dt * 30);
  for (let i = 0; i < N_CELLS; i++) cellPop[i] = Math.max(0, cellPop[i] - dt * 3);
  toastTime -= dt;
  infoTime -= dt;
  displayCoins += (state.coins - displayCoins) * Math.min(1, dt * 8);
  if (Math.abs(state.coins - displayCoins) < 1) displayCoins = state.coins;
  render();
  requestAnimationFrame(frame);
}

resize();
buildBackground();
if (load()) { enemy = genEnemy(state.stage); rescueIfStuck(); displayCoins = state.coins; }
else newGame();
requestAnimationFrame(frame);

// Hooks for automated balance testing (test.html); harmless in normal play.
window.MergeFront = {
  BAL, TYPES, BEATS, COUNTER_OF, ROW_PREF, N_CELLS, genEnemy, budget, reward, buyLevel, buyPrice, sellPrice,
  unitValue, freeCellFor, state, startBattle,
  simulate(pGrid, eGrid, dt = 1 / 60) {
    setupFighters(pGrid, eGrid);
    let o = null;
    while (!o) { stepBattle(dt); particles.length = 0; floaters.length = 0; o = outcomeNow(); }
    const res = { outcome: o, time: battleTime, survivors: fighters.filter(f => !f.dead && f.team === 'p').length };
    clearBattle();
    return res;
  },
};
})();
