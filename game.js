'use strict';

/* ── 정령의 숲 — match-3 ───────────────────────────────────────────
 * 타일 7종 + 특수 아이템 4종
 *   wind     지리산 바람  : 가로 한 줄 제거  (세로 4매치로 생성)
 *   blessing 숲의 축복    : 세로 한 줄 제거  (가로 4매치로 생성)
 *   burst    정령 폭주    : 3x3 제거        (L/T 매치로 생성)
 *   rainbow  무지개 정령석: 교환한 종류 전부 제거 (5매치로 생성)
 * wind/blessing/burst 는 정령 타일 위에 겹쳐 표시, rainbow 는 단독 타일.
 * ────────────────────────────────────────────────────────────── */

const COLS = 8, ROWS = 8;
const TYPES = ['suseu', 'sweetbee', 'nyangure', 'reure', 'neutinamu', 'myangi', 'ryangryang'];
const TILE_SRC = t => `assets/tiles/${t}.png`;
const SPECIAL_SRC = s => `assets/specials/${s}.png`;

const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const comboEl = document.getElementById('combo-banner');
const toastEl = document.getElementById('toast');

/* ── 화면 상태 / 모드 설정 ─────────────────────────────────────── */

const PREFS_KEY = 'spiritforest_prefs';
const prefs = Object.assign(
  { mode: 'endless', duration: 60 },
  JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
);
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

let gameMode = prefs.mode;
let uiState = 'title';
let settingsOrigin = 'title';
const bestKeyFor = mode => 'spiritforest_best_' + mode;
const bestKey = () => bestKeyFor(gameMode);

let grid = [];          // grid[r][c] -> tile | null
let score = 0;
let best = Number(localStorage.getItem(bestKey()) || 0);
let busy = false;
let selected = null;
let bestAtStart = best;   // 신기록 연출용
let recordShown = false;

const sleep = ms => new Promise(res => setTimeout(res, ms));
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

/* ── tiles ─────────────────────────────────────────────────────── */

function makeTile(r, c, type, special = null) {
  const el = document.createElement('div');
  el.className = 'tile';
  const img = document.createElement('img');
  img.className = 'spirit';
  img.src = special === 'rainbow' ? SPECIAL_SRC('rainbow') : TILE_SRC(type);
  el.appendChild(img);
  const tile = { r, c, type, special, el };
  el._tile = tile;
  boardEl.appendChild(el);
  if (special && special !== 'rainbow') attachOverlay(tile);
  return tile;
}

function attachOverlay(tile) {
  const ov = document.createElement('img');
  ov.className = 'overlay';
  ov.src = SPECIAL_SRC(tile.special);
  tile.el.appendChild(ov);
}

function place(tile, r, c) {
  tile.r = r; tile.c = c;
  grid[r][c] = tile;
  render(tile);
}

function render(tile, rowOverride = null) {
  const r = rowOverride === null ? tile.r : rowOverride;
  tile.el.style.transform = `translate(${tile.c * 100}%, ${r * 100}%)`;
}

function applySpecial(tile, special) {
  tile.special = special;
  const spirit = tile.el.querySelector('.spirit');
  if (special === 'rainbow') {
    tile.type = null;
    spirit.src = SPECIAL_SRC('rainbow');
  } else {
    attachOverlay(tile);
  }
  tile.el.classList.add('spawned');
  setTimeout(() => tile.el.classList.remove('spawned'), 400);
}

/* ── board setup ───────────────────────────────────────────────── */

function randTypeAvoiding(r, c) {
  const banned = new Set();
  if (c >= 2 && grid[r][c - 1] && grid[r][c - 2] &&
      grid[r][c - 1].type === grid[r][c - 2].type) banned.add(grid[r][c - 1].type);
  if (r >= 2 && grid[r - 1][c] && grid[r - 2][c] &&
      grid[r - 1][c].type === grid[r - 2][c].type) banned.add(grid[r - 1][c].type);
  const pool = TYPES.filter(t => !banned.has(t));
  return pool[Math.floor(Math.random() * pool.length)];
}

function newGame() {
  boardEl.innerHTML = '';
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  selected = null;
  score = 0;
  bestAtStart = best;
  recordShown = false;
  fever.energy = 0;
  renderFever();
  ultCharge = 0;
  renderUlt();
  updateScore(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      place(makeTile(r, c, randTypeAvoiding(r, c)), r, c);
  if (!hasMoves()) reshuffle(false);
}

/* ── match detection ───────────────────────────────────────────── */

function findRuns() {
  const runs = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const t = grid[r][c];
      if (!t || !t.type) { c++; continue; }
      let end = c + 1;
      while (end < COLS && grid[r][end] && grid[r][end].type === t.type) end++;
      if (end - c >= 3) runs.push({ dir: 'h', cells: grid[r].slice(c, end) });
      c = end;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const t = grid[r][c];
      if (!t || !t.type) { r++; continue; }
      let end = r + 1;
      while (end < ROWS && grid[end][c] && grid[end][c].type === t.type) end++;
      if (end - r >= 3) {
        const cells = [];
        for (let i = r; i < end; i++) cells.push(grid[i][c]);
        runs.push({ dir: 'v', cells });
      }
      r = end;
    }
  }
  return runs;
}

function hasMatchAt(r, c) {
  const t = grid[r][c];
  if (!t || !t.type) return false;
  let n = 1;
  for (let x = c - 1; x >= 0 && grid[r][x] && grid[r][x].type === t.type; x--) n++;
  for (let x = c + 1; x < COLS && grid[r][x] && grid[r][x].type === t.type; x++) n++;
  if (n >= 3) return true;
  n = 1;
  for (let y = r - 1; y >= 0 && grid[y][c] && grid[y][c].type === t.type; y--) n++;
  for (let y = r + 1; y < ROWS && grid[y][c] && grid[y][c].type === t.type; y++) n++;
  return n >= 3;
}

function swapWouldMatch(a, b) {
  swapInGrid(a, b);
  const ok = hasMatchAt(a.r, a.c) || hasMatchAt(b.r, b.c);
  swapInGrid(a, b);
  return ok;
}

function swapInGrid(a, b) {
  const { r: ar, c: ac } = a;
  const { r: br, c: bc } = b;
  grid[ar][ac] = b; grid[br][bc] = a;
  a.r = br; a.c = bc; b.r = ar; b.c = ac;
}

/* ── special planning (Candy Crush convention) ─────────────────── */

function planSpecials(runs, swapTiles) {
  const plan = [];
  const usedRuns = new Set();
  const planned = new Set();
  const prefer = cells => {
    if (swapTiles) {
      const hit = cells.find(t => swapTiles.includes(t));
      if (hit) return hit;
    }
    return cells[Math.floor(cells.length / 2)];
  };
  const pick = (cells, special) => {
    let t = prefer(cells);
    if ((t.special || planned.has(t))) {
      t = cells.find(x => !x.special && !planned.has(x));
    }
    if (t) { planned.add(t); plan.push({ tile: t, special }); }
  };

  // 5+ in a line → rainbow
  for (const run of runs) {
    if (run.cells.length >= 5) {
      usedRuns.add(run);
      pick(run.cells, 'rainbow');
    }
  }
  // L/T intersection → burst
  const hRuns = runs.filter(r => r.dir === 'h' && !usedRuns.has(r));
  const vRuns = runs.filter(r => r.dir === 'v' && !usedRuns.has(r));
  for (const h of hRuns) {
    for (const v of vRuns) {
      if (usedRuns.has(h) || usedRuns.has(v)) continue;
      const shared = h.cells.find(t => v.cells.includes(t));
      if (shared) {
        usedRuns.add(h); usedRuns.add(v);
        if (!shared.special && !planned.has(shared)) {
          planned.add(shared);
          plan.push({ tile: shared, special: 'burst' });
        }
      }
    }
  }
  // 4 in a line → striped (CC standard: horizontal 4 clears a column, vertical 4 clears a row)
  for (const run of runs) {
    if (usedRuns.has(run) || run.cells.length !== 4) continue;
    usedRuns.add(run);
    pick(run.cells, run.dir === 'h' ? 'blessing' : 'wind');
  }
  return plan;
}

/* ── special effects ───────────────────────────────────────────── */

function effectTargets(tile) {
  const out = [];
  if (tile.special === 'wind') {
    for (let c = 0; c < COLS; c++) out.push(grid[tile.r][c]);
  } else if (tile.special === 'blessing') {
    for (let r = 0; r < ROWS; r++) out.push(grid[r][tile.c]);
  } else if (tile.special === 'burst') {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++)
        if (inBounds(tile.r + dr, tile.c + dc)) out.push(grid[tile.r + dr][tile.c + dc]);
  } else if (tile.special === 'rainbow') {
    // hit indirectly: wipes a random spirit type
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] && grid[r][c].type === type) out.push(grid[r][c]);
  }
  return out;
}

function makeFx(className, styles = {}) {
  const fx = document.createElement('div');
  fx.className = 'fx ' + className;
  Object.assign(fx.style, styles);
  boardEl.appendChild(fx);
  setTimeout(() => fx.remove(), 600);
}

function fxRow(r) { makeFx('fx-row', { top: `calc(var(--cell-h) * ${r})` }); }
function fxCol(c) { makeFx('fx-col', { left: `calc(var(--cell-w) * ${c})` }); }

function fxBurst(r, c, cells = 3) {
  const half = (cells - 1) / 2;
  makeFx('fx-burst', {
    left: `calc(var(--cell-w) * ${c - half})`,
    top: `calc(var(--cell-h) * ${r - half})`,
    width: `calc(var(--cell-w) * ${cells})`,
    height: `calc(var(--cell-h) * ${cells})`,
  });
}

function spawnFx(tile) {
  if (tile.special === 'wind') fxRow(tile.r);
  else if (tile.special === 'blessing') fxCol(tile.c);
  else if (tile.special === 'burst') fxBurst(tile.r, tile.c);
  else makeFx('fx-rainbow');
}

/* 특수+특수 교환 콤보 — 단일 효과보다 강력해진다 */
function comboTargets(a, b) {
  viaJump();
  const r = a.r, c = a.c;            // 콤보 중심 = 움직인 타일 위치
  const set = new Set([a, b]);
  const kinds = [a.special, b.special];
  const addRow = rr => {
    if (rr < 0 || rr >= ROWS) return;
    fxRow(rr);
    for (let i = 0; i < COLS; i++) set.add(grid[rr][i]);
  };
  const addCol = cc => {
    if (cc < 0 || cc >= COLS) return;
    fxCol(cc);
    for (let i = 0; i < ROWS; i++) set.add(grid[i][cc]);
  };

  if (kinds[0] === 'burst' && kinds[1] === 'burst') {
    // 폭주 + 폭주 = 5x5 대폭발
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++)
        if (inBounds(r + dr, c + dc)) set.add(grid[r + dr][c + dc]);
    fxBurst(r, c, 5);
    Sound.play('burst');
    shake(3);
    showCombo('💥 대폭발!!', 5);
  } else if (kinds.includes('burst') || kinds[0] !== kinds[1]) {
    // 폭주+줄 또는 가로+세로 = 3행 + 3열 거대 십자
    addRow(r - 1); addRow(r); addRow(r + 1);
    addCol(c - 1); addCol(c); addCol(c + 1);
    Sound.play('wind');
    Sound.play('blessing');
    shake(3);
    showCombo('⚡ 거대 십자 폭발!! ⚡', 5);
  } else if (kinds[0] === 'wind') {
    // 바람 + 바람 = 3행
    addRow(r - 1); addRow(r); addRow(r + 1);
    Sound.play('wind');
    shake(2);
    showCombo('🌪 트리플 라인!', 4);
  } else {
    // 축복 + 축복 = 3열
    addCol(c - 1); addCol(c); addCol(c + 1);
    Sound.play('blessing');
    shake(2);
    showCombo('🌿 트리플 라인!', 4);
  }
  return set;
}

function expandClears(initial, protectedSet = new Set()) {
  const out = new Set();
  const queue = [...initial];
  while (queue.length) {
    const t = queue.pop();
    if (!t || out.has(t) || protectedSet.has(t)) continue;
    out.add(t);
    if (t.special) {
      spawnFx(t);
      Sound.play(t.special);          // wind/blessing/burst/rainbow 발동음
      if (t.special === 'burst') shake(2);
      if (t.special === 'rainbow') shake(3);
      viaJump();
      effectTargets(t).forEach(x => queue.push(x));
    }
  }
  return out;
}

async function clearTiles(set) {
  if (!set.size) return;
  const per = set.size > 15 ? 3 : 6;     // 대량 제거 시 파티클 수 제한
  for (const t of set) {
    spawnParticles(t, per);
    grid[t.r][t.c] = null;
    t.el.classList.add('clearing');
  }
  await sleep(240);
  for (const t of set) t.el.remove();
}

/* ── gravity & refill ──────────────────────────────────────────── */

async function applyGravity() {
  let moved = false;
  const landed = [];
  for (let c = 0; c < COLS; c++) {
    const survivors = [];
    for (let r = ROWS - 1; r >= 0; r--)
      if (grid[r][c]) survivors.push(grid[r][c]);
    let r = ROWS - 1;
    for (const t of survivors) {
      if (t.r !== r) { moved = true; landed.push(t); }
      grid[t.r] && (grid[t.r][c] = null);
      t.r = r; grid[r][c] = t;
      render(t);
      r--;
    }
    let spawnDepth = 1;
    for (; r >= 0; r--) {
      const t = makeTile(r, c, TYPES[Math.floor(Math.random() * TYPES.length)]);
      grid[r][c] = t;
      render(t, -spawnDepth);            // start above the board
      t.el.getBoundingClientRect();      // force reflow before animating down
      render(t);
      spawnDepth++;
      moved = true;
      landed.push(t);
    }
  }
  if (moved) {
    await sleep(260);
    for (const t of landed) t.el.classList.add('land');   // 착지 바운스
    setTimeout(() => landed.forEach(t => t.el.classList.remove('land')), 280);
  }
}

/* ── resolve loop ──────────────────────────────────────────────── */

async function resolveBoard(swapTiles = null) {
  let cascade = 0;
  while (true) {
    const runs = findRuns();
    if (!runs.length) break;
    cascade++;
    const plan = planSpecials(runs, swapTiles);
    const spawnSet = new Set(plan.map(p => p.tile));
    const matched = new Set();
    for (const run of runs)
      for (const t of run.cells)
        if (!spawnSet.has(t)) matched.add(t);
    const cleared = expandClears(matched, spawnSet);
    const gained = updateScore(cleared.size * 10 * cascade + plan.length * 50);
    addFever(cleared.size * 2.5 + (cascade - 1) * 6);
    Sound.play('pop', cascade);
    if (plan.length) Sound.play('spawn');
    if (cleared.size >= 10) { Sound.play('bigclear'); shake(cleared.size >= 18 ? 3 : 2); }
    if (cascade >= 2) {
      showCombo(comboText(cascade), Math.min(cascade, 5));
      Sound.play('combo', cascade);
      if (cascade >= 3) shake(1);
    }
    floatScore(gained, cleared);
    for (const p of plan) applySpecial(p.tile, p.special);
    await clearTiles(cleared);
    await applyGravity();
    swapTiles = null;
  }
  if (!hasMoves()) {
    showToast('가능한 이동이 없어 정령들을 섞어요!');
    Sound.play('shuffle');
    await sleep(700);
    reshuffle(true);
  }
}

function comboText(n) {
  if (n >= 6) return `미쳤다!! 연쇄 x${n}!!`;
  return { 2: '연쇄 x2!', 3: '연쇄 x3! 좋아요!', 4: '연쇄 x4! 대단해요!', 5: '연쇄 x5! 환상적!!' }[n];
}

/* ── swapping ──────────────────────────────────────────────────── */

async function animateSwap(a, b) {
  swapInGrid(a, b);
  render(a); render(b);
  await sleep(200);
}

async function trySwap(a, b) {
  if (busy || !a || !b || a === b) return;
  if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
  busy = true;
  deselect();

  const aRainbow = a.special === 'rainbow', bRainbow = b.special === 'rainbow';

  if (aRainbow || bRainbow) {
    Sound.play('swap');
    await animateSwap(a, b);
    const rainbow = aRainbow ? a : b;
    const other = aRainbow ? b : a;
    rainbow.special = null;                      // 자체 효과 중복 발동 방지
    spawnFxRainbow();
    Sound.play('rainbow');
    shake(3);
    viaJump();
    const initial = new Set([rainbow, other]);
    if (bRainbow && aRainbow) {                  // 무지개 + 무지개 = 전체 제거
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (grid[r][c]) initial.add(grid[r][c]);
    } else if (other.type) {                     // 해당 종류 전부 제거
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (grid[r][c] && grid[r][c].type === other.type) initial.add(grid[r][c]);
    }
    const cleared = expandClears(initial);
    const gained = updateScore(cleared.size * 15);
    addFever(cleared.size * 2.5);
    floatScore(gained, cleared);
    await clearTiles(cleared);
    await applyGravity();
    await resolveBoard();
  } else if (a.special && b.special) {           // 특수 + 특수 = 강화 콤보
    Sound.play('swap');
    await animateSwap(a, b);
    const initial = comboTargets(a, b);
    a.special = null;                            // 콤보로 소모 — 단일 효과 중복 발동 방지
    b.special = null;
    const cleared = expandClears(initial);       // 휩쓸린 다른 특수는 연쇄 발동
    const gained = updateScore(cleared.size * 12);
    addFever(cleared.size * 2.5);
    floatScore(gained, cleared);
    await clearTiles(cleared);
    await applyGravity();
    await resolveBoard();
  } else if (swapWouldMatch(a, b)) {
    Sound.play('swap');
    await animateSwap(a, b);
    await resolveBoard([a, b]);
  } else {                                       // 무효 이동 → 되돌리기
    Sound.play('invalid');
    await animateSwap(a, b);
    await animateSwap(a, b);
  }
  busy = false;
}

function spawnFxRainbow() {
  const fx = document.createElement('div');
  fx.className = 'fx fx-rainbow';
  boardEl.appendChild(fx);
  setTimeout(() => fx.remove(), 500);
}

/* ── moves & reshuffle ─────────────────────────────────────────── */

function hasMoves() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t) continue;
      if (t.special === 'rainbow') return true;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!inBounds(r + dr, c + dc)) continue;
        const n = grid[r + dr][c + dc];
        if (!n) continue;
        if (t.special && n.special) return true;
        if (swapWouldMatch(t, n)) return true;
      }
    }
  }
  return false;
}

function reshuffle(animate) {
  const tiles = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c]) tiles.push(grid[r][c]);

  for (let attempt = 0; attempt < 80; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    let k = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const t = tiles[k++];
        t.r = r; t.c = c; grid[r][c] = t;
      }
    if (findRuns().length === 0 && hasMoves()) {
      tiles.forEach(t => render(t));
      return;
    }
  }
  newGame(); // 섞기 실패 시 새 보드
}

/* ── 마스코트 비아: 아이템 발동 시 신나서 점프 ──────────────────── */

const viaEl = document.getElementById('via');
const VIA_IDLE = 'assets/via/idle.png';
const VIA_JUMP = 'assets/via/jump.png';
new Image().src = VIA_JUMP;          // 점프 이미지 미리 로드 (깜빡임 방지)
let viaTimer = null;

function viaJump(dur = 1200) {
  viaEl.src = VIA_JUMP;
  viaEl.classList.add('jump');
  clearTimeout(viaTimer);
  viaTimer = setTimeout(() => {
    viaEl.classList.remove('jump');
    viaEl.src = VIA_IDLE;
  }, dur);
}

/* ── 도파민: 파티클 / 점수 팝업 / 흔들림 / 피버 ─────────────────── */

const wrapEl = document.getElementById('board-wrap');
const feverBarEl = document.getElementById('fever-bar');

const TYPE_COLOR = {
  suseu: '#cfe9ff', sweetbee: '#ffd95e', nyangure: '#8fa0e8', reure: '#ffeec2',
  neutinamu: '#8ed06c', myangi: '#cfcfcf', ryangryang: '#aef0dd',
};

function spawnParticles(tile, n = 5) {
  const cw = boardEl.clientWidth / COLS, ch = boardEl.clientHeight / ROWS;
  const cx = (tile.c + 0.5) * cw, cy = (tile.r + 0.5) * ch;
  const color = TYPE_COLOR[tile.type] || '#ffffff';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.background = color;
    p.style.color = color;
    const size = 4 + Math.random() * 6;
    p.style.width = p.style.height = size + 'px';
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    boardEl.appendChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = cw * (0.7 + Math.random() * 1.4);
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist - ch * 0.35}px)) scale(0)`, opacity: 0 },
    ], { duration: 420 + Math.random() * 280, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => p.remove();
  }
}

function floatScore(points, tiles) {
  if (!points || !tiles.size) return;
  const cw = boardEl.clientWidth / COLS, ch = boardEl.clientHeight / ROWS;
  let sx = 0, sy = 0;
  for (const t of tiles) { sx += (t.c + 0.5) * cw; sy += (t.r + 0.5) * ch; }
  const el = document.createElement('div');
  el.className = 'float-score' + (fever.active ? ' fever' : '');
  el.textContent = '+' + points.toLocaleString();
  el.style.left = (sx / tiles.size) + 'px';
  el.style.top = (sy / tiles.size) + 'px';
  boardEl.appendChild(el);
  el.animate([
    { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%,-180%) scale(1)', opacity: 0 },
  ], { duration: 850, easing: 'ease-out' }).onfinish = () => el.remove();
}

function shake(level) {
  const cls = 'shake-' + Math.min(3, Math.max(1, level));
  wrapEl.classList.remove('shake-1', 'shake-2', 'shake-3');
  void wrapEl.offsetWidth;
  wrapEl.classList.add(cls);
  setTimeout(() => wrapEl.classList.remove(cls), 500);
}

const FEVER_MAX = 100, FEVER_DURATION = 8000;
const fever = { energy: 0, active: false };

setInterval(() => {                       // 게이지 자연 감소
  if (!fever.active && fever.energy > 0) {
    fever.energy = Math.max(0, fever.energy - 0.7);
    renderFever();
  }
}, 250);

function addFever(n) {
  if (fever.active) return;
  fever.energy = Math.min(FEVER_MAX, fever.energy + n);
  renderFever();
  if (fever.energy >= FEVER_MAX) startFever();
}

function startFever() {
  fever.active = true;
  document.body.classList.add('fever');
  Sound.play('fever');
  showCombo('🔥 피버 타임! 점수 x2 🔥', 5);
  shake(2);
  const start = Date.now();
  const drain = setInterval(() => {
    const left = 1 - (Date.now() - start) / FEVER_DURATION;
    feverBarEl.style.width = Math.max(0, left * 100) + '%';
    if (left <= 0) { clearInterval(drain); endFever(); }
  }, 100);
}

function endFever() {
  fever.active = false;
  fever.energy = 0;
  document.body.classList.remove('fever');
  renderFever();
  showToast('피버 종료! 게이지를 다시 모아보세요');
}

function renderFever() {
  feverBarEl.style.width = (fever.energy / FEVER_MAX * 100) + '%';
}

/* ── 필살기: 무지개 정령석 2개 강림 ─────────────────────────────── */

const ULT_COST = 2500;          // 충전에 필요한 누적 점수
const ultBtn = document.getElementById('ult-btn');
let ultCharge = 0;

function addUlt(points) {
  if (ultCharge >= ULT_COST) return;
  ultCharge = Math.min(ULT_COST, ultCharge + points);
  renderUlt();
  if (ultCharge >= ULT_COST) {
    Sound.play('ultReady');
    showToast('✨ 필살기 준비 완료! 버튼을 누르세요!');
  }
}

function renderUlt() {
  ultBtn.style.setProperty('--ult', Math.round(ultCharge / ULT_COST * 100));
  ultBtn.classList.toggle('ready', ultCharge >= ULT_COST);
  ultBtn.title = `필살기 ${Math.round(ultCharge / ULT_COST * 100)}%`;
}

async function activateUltimate() {
  if (busy || ultCharge < ULT_COST) return;
  const candidates = grid.flat().filter(t => t && t.type && !t.special);
  if (candidates.length < 2) return;
  busy = true;
  ultCharge = 0;
  renderUlt();
  Sound.play('ultimate');
  viaJump(2200);

  // 1) 라이저: 보드가 진동하며 밝아짐
  document.body.classList.add('ult-charging');
  await sleep(580);
  document.body.classList.remove('ult-charging');

  // 2) 임팩트: 섬광 + 강한 흔들림
  const flashEl = document.getElementById('flash');
  flashEl.classList.remove('go');
  void flashEl.offsetWidth;
  flashEl.classList.add('go');
  shake(3);
  showCombo('✨ 무지개 정령석 강림! ✨', 5);

  // 3) 무지개 빔 2발 (서로 떨어진 위치 선호)
  const t1 = candidates[Math.floor(Math.random() * candidates.length)];
  const far = candidates.filter(t => t !== t1 && Math.abs(t.r - t1.r) + Math.abs(t.c - t1.c) > 2);
  const pool2 = far.length ? far : candidates.filter(t => t !== t1);
  const t2 = pool2[Math.floor(Math.random() * pool2.length)];
  strikeRainbow(t1);
  setTimeout(() => strikeRainbow(t2), 300);

  await sleep(1000);
  busy = false;
}

function strikeRainbow(tile) {
  const cw = boardEl.clientWidth / COLS, ch = boardEl.clientHeight / ROWS;
  // 하늘에서 떨어지는 무지개 빔
  const beam = document.createElement('div');
  beam.className = 'fx-beam';
  beam.style.left = (tile.c * cw) + 'px';
  boardEl.appendChild(beam);
  setTimeout(() => beam.remove(), 600);
  // 확산 링
  const ring = document.createElement('div');
  ring.className = 'fx-ring';
  const cx = (tile.c + 0.5) * cw, cy = (tile.r + 0.5) * ch;
  boardEl.appendChild(ring);
  ring.animate([
    { left: cx + 'px', top: cy + 'px', width: '0px', height: '0px', opacity: 1, transform: 'translate(-50%,-50%)' },
    { left: cx + 'px', top: cy + 'px', width: cw * 3.4 + 'px', height: cw * 3.4 + 'px', opacity: 0, transform: 'translate(-50%,-50%)' },
  ], { duration: 550, easing: 'ease-out' }).onfinish = () => ring.remove();
  // 무지개 파티클 + 변신
  spawnRainbowParticles(tile, 16);
  applySpecial(tile, 'rainbow');
  Sound.play('rainbow');
}

const RAINBOW_COLORS = ['#ff6b6b', '#ffb347', '#ffd93d', '#8ed06c', '#6bc5ff', '#b388ff'];

function spawnRainbowParticles(tile, n = 14) {
  const cw = boardEl.clientWidth / COLS, ch = boardEl.clientHeight / ROWS;
  const cx = (tile.c + 0.5) * cw, cy = (tile.r + 0.5) * ch;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const color = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
    p.style.background = color;
    p.style.color = color;
    const size = 5 + Math.random() * 7;
    p.style.width = p.style.height = size + 'px';
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    boardEl.appendChild(p);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const dist = cw * (1 + Math.random() * 1.8);
    p.animate([
      { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(0)`, opacity: 0 },
    ], { duration: 550 + Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => p.remove();
  }
}

ultBtn.addEventListener('click', activateUltimate);

/* ── UI ────────────────────────────────────────────────────────── */

function updateScore(delta) {
  if (fever.active && delta > 0) delta *= 2;
  score += delta;
  scoreEl.textContent = score.toLocaleString();
  if (delta > 0) {
    addUlt(delta);
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
    if (!recordShown && bestAtStart > 0 && score > bestAtStart) {
      recordShown = true;
      Sound.play('record');
      showToast('🏆 신기록 달성!');
    }
  }
  if (score > best) {
    best = score;
    localStorage.setItem(bestKey(), String(best));
  }
  bestEl.textContent = best.toLocaleString();
  return delta;
}

function showCombo(text, level = 2) {
  comboEl.textContent = text;
  comboEl.dataset.level = level;
  comboEl.classList.remove('show');
  void comboEl.offsetWidth;
  comboEl.classList.add('show');
}

let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function select(tile) {
  deselect();
  selected = tile;
  tile.el.classList.add('selected');
  Sound.play('select');
}

function deselect() {
  if (selected) selected.el.classList.remove('selected');
  selected = null;
}

/* ── input: click-select & swipe ───────────────────────────────── */

let drag = null;

boardEl.addEventListener('pointerdown', e => {
  if (busy) return;
  const el = e.target.closest('.tile');
  if (!el) return;
  drag = { tile: el._tile, x: e.clientX, y: e.clientY, swiped: false };
});

window.addEventListener('pointermove', e => {
  if (!drag || drag.swiped || busy) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) < 20) return;
  drag.swiped = true;
  const t = drag.tile;
  const dir = Math.abs(dx) > Math.abs(dy)
    ? [0, Math.sign(dx)]
    : [Math.sign(dy), 0];
  const nr = t.r + dir[0], nc = t.c + dir[1];
  if (inBounds(nr, nc) && grid[nr][nc]) trySwap(t, grid[nr][nc]);
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  const { tile, swiped } = drag;
  drag = null;
  if (swiped || busy) return;
  // click-select model
  if (selected === tile) { deselect(); return; }
  if (selected && Math.abs(selected.r - tile.r) + Math.abs(selected.c - tile.c) === 1) {
    trySwap(selected, tile);
  } else {
    select(tile);
  }
});

document.getElementById('restart').addEventListener('click', () => {
  if (busy) return;
  startGame(gameMode);
});

/* ── 화면 전환 (시작 / 설정 / 게임 종료) ────────────────────────── */

const overlayEl = document.getElementById('overlay');
const screens = {
  title: document.getElementById('screen-title'),
  settings: document.getElementById('screen-settings'),
  gameover: document.getElementById('screen-gameover'),
};
const timerBoxEl = document.getElementById('timer-box');
const timerEl = document.getElementById('timer');
const durationRowEl = document.getElementById('duration-row');
const durationSelectEl = document.getElementById('duration-select');

function showScreen(name) {
  uiState = name;
  if (!name) {
    overlayEl.classList.add('hidden');
    return;
  }
  overlayEl.classList.remove('hidden');
  for (const key in screens) screens[key].classList.toggle('hidden', key !== name);
  if (name === 'title') updateTitleBest();
}

function updateTitleBest() {
  document.getElementById('title-best-score').textContent =
    Number(localStorage.getItem(bestKeyFor(prefs.mode)) || 0).toLocaleString();
}

function openSettings(origin) {
  settingsOrigin = origin;
  document.querySelector(`input[name="game-mode"][value="${prefs.mode}"]`).checked = true;
  durationSelectEl.value = String(prefs.duration);
  durationRowEl.classList.toggle('hidden', prefs.mode !== 'timeattack');
  showScreen('settings');
}

function startGame(mode) {
  prefs.mode = mode;
  savePrefs();
  gameMode = mode;
  best = Number(localStorage.getItem(bestKey()) || 0);
  bestEl.textContent = best.toLocaleString();
  busy = false;
  stopTimer();
  timerBoxEl.classList.toggle('hidden', mode !== 'timeattack');
  showScreen(null);
  newGame();
  if (mode === 'timeattack') startTimer(prefs.duration);
}

/* ── 타임어택 타이머 ──────────────────────────────────────────── */

let timerInterval = null;
let timeLeft = 0;

function startTimer(duration) {
  timeLeft = duration;
  timerEl.textContent = timeLeft;
  timerBoxEl.classList.remove('warn');
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = Math.max(0, timeLeft);
    timerBoxEl.classList.toggle('warn', timeLeft > 0 && timeLeft <= 10);
    if (timeLeft <= 0) {
      stopTimer();
      endTimeAttack();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  timerBoxEl.classList.remove('warn');
}

function endTimeAttack() {
  busy = true;
  Sound.play('timeup');
  shake(2);
  document.getElementById('final-score').textContent = score.toLocaleString();
  document.getElementById('final-best').textContent = best.toLocaleString();
  showScreen('gameover');
}

/* ── 화면 버튼 이벤트 ─────────────────────────────────────────── */

document.getElementById('start-btn').addEventListener('click', () => startGame(prefs.mode));
document.getElementById('open-settings-btn').addEventListener('click', () => openSettings('title'));
document.getElementById('settings-back-btn').addEventListener('click', () => {
  showScreen(settingsOrigin === 'title' ? 'title' : null);
});
document.getElementById('home-btn').addEventListener('click', () => {
  stopTimer();
  showScreen('title');
});
document.getElementById('retry-btn').addEventListener('click', () => startGame(gameMode));
document.getElementById('gameover-home-btn').addEventListener('click', () => showScreen('title'));
document.getElementById('sound-btn').addEventListener('click', () => openSettings('game'));

document.querySelectorAll('input[name="game-mode"]').forEach(radio => {
  radio.addEventListener('change', e => {
    prefs.mode = e.target.value;
    savePrefs();
    durationRowEl.classList.toggle('hidden', prefs.mode !== 'timeattack');
  });
});

durationSelectEl.addEventListener('change', e => {
  prefs.duration = Number(e.target.value);
  savePrefs();
});

/* ── go ────────────────────────────────────────────────────────── */

newGame();
showScreen('title');
