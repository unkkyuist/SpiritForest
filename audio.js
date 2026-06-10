'use strict';

/* ── 사운드 매니저 ──────────────────────────────────────────────
 * SFX : WebAudio 합성 (파일 불필요)
 * BGM : assets/audio/bgm*.mp3 재생목록 순환
 * 설정: localStorage 'spiritforest_audio' (토글/볼륨/트랙)
 * ────────────────────────────────────────────────────────────── */

const Sound = (() => {
  const LS_KEY = 'spiritforest_audio';
  const settings = Object.assign(
    { sfxOn: true, bgmOn: true, sfxVol: 0.8, bgmVol: 0.45, track: 0 },
    JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  );
  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(settings));

  /* ── WebAudio (SFX) ── */
  let ctx = null, sfxGain = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      sfxGain = ctx.createGain();
      sfxGain.gain.value = settings.sfxVol;
      sfxGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.4, delay = 0, slide = 0 } = {}) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, { vol = 0.4, delay = 0, filter = 1200, q = 1, slideTo = 0 } = {}) {
    const t0 = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(filter, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const fx = {
    swap()     { tone(330, 0.07, { type: 'square', vol: 0.12, slide: 130 }); },
    select()   { tone(520, 0.05, { type: 'triangle', vol: 0.15 }); },
    invalid()  { tone(150, 0.1, { type: 'sawtooth', vol: 0.18 });
                 tone(115, 0.14, { type: 'sawtooth', vol: 0.18, delay: 0.09 }); },
    pop(n = 1) { const f = 420 * Math.pow(1.13, Math.min(n, 8)) * (0.97 + Math.random() * 0.06);
                 tone(f, 0.13, { type: 'triangle', vol: 0.32 });
                 tone(f * 2, 0.07, { vol: 0.1, delay: 0.01 }); },
    spawn()    { [660, 880, 1175].forEach((f, i) => tone(f, 0.13, { vol: 0.22, delay: i * 0.05 })); },
    wind()     { noise(0.42, { filter: 800, q: 2.5, vol: 0.5, slideTo: 2600 }); },
    blessing() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, { type: 'triangle', vol: 0.2, delay: i * 0.06 })); },
    burst()    { noise(0.32, { filter: 450, q: 0.8, vol: 0.55 });
                 tone(75, 0.36, { vol: 0.55, slide: -35 }); },
    rainbow()  { const sc = [1047, 1175, 1319, 1568, 1760, 2093];
                 for (let i = 0; i < 7; i++) tone(sc[Math.floor(Math.random() * sc.length)], 0.16, { vol: 0.16, delay: i * 0.05 }); },
    combo(n = 2) { const base = 392 * Math.pow(1.122, Math.min(n, 7));
                 [1, 1.26, 1.5].forEach((m, i) => tone(base * m, 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.03 })); },
    bigclear() { tone(95, 0.4, { vol: 0.45, slide: -45 });
                 noise(0.4, { filter: 700, q: 0.7, vol: 0.35 }); },
    fever()    { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, { type: 'square', vol: 0.13, delay: i * 0.07 }));
                 noise(0.5, { filter: 3000, q: 1, vol: 0.12, delay: 0.35 }); },
    shuffle()  { noise(0.5, { filter: 1600, q: 3, vol: 0.28, slideTo: 350 }); },
    ultimate() { noise(0.6, { filter: 250, q: 1.5, vol: 0.32, slideTo: 4200 });           // 라이저
                 tone(58, 0.5, { vol: 0.6, slide: -22, delay: 0.55 });                     // 임팩트
                 noise(0.35, { filter: 600, q: 0.8, vol: 0.5, delay: 0.55 });
                 [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
                   tone(f, 0.35, { type: 'triangle', vol: 0.2, delay: 0.62 + i * 0.07 })); },
    ultReady() { [880, 1109, 1319].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.12, delay: i * 0.07 })); },
    record()   { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.06 })); },
  };

  function play(name, ...args) {
    if (!settings.sfxOn || !fx[name]) return;
    try { ensureCtx(); fx[name](...args); } catch (e) { /* 오디오 미지원 환경 무시 */ }
  }

  /* ── BGM ── */
  const TRACKS = [
    { file: 'assets/audio/bgm1.mp3', name: 'Walking By' },
    { file: 'assets/audio/bgm2.mp3', name: '걸어가는 길 (Jazz)' },
    { file: 'assets/audio/bgm3.mp3', name: '내 토끼를 부탁해' },
  ];
  const bgm = new Audio();
  bgm.preload = 'none';
  bgm.addEventListener('ended', () => changeTrack(1));

  function applyBgm() {
    bgm.volume = settings.bgmVol;
    if (settings.bgmOn) {
      const want = TRACKS[settings.track].file;
      if (!bgm.src.endsWith(want)) bgm.src = want;
      bgm.play().catch(() => {});   // 첫 제스처 전 autoplay 차단은 무시
    } else {
      bgm.pause();
    }
    updateUI();
  }

  function changeTrack(dir) {
    settings.track = (settings.track + dir + TRACKS.length) % TRACKS.length;
    save();
    bgm.src = TRACKS[settings.track].file;
    if (settings.bgmOn) bgm.play().catch(() => {});
    updateUI();
  }

  /* ── 설정 패널 UI ── */
  const $ = id => document.getElementById(id);

  function updateUI() {
    $('sfx-on').checked = settings.sfxOn;
    $('bgm-on').checked = settings.bgmOn;
    $('sfx-vol').value = Math.round(settings.sfxVol * 100);
    $('bgm-vol').value = Math.round(settings.bgmVol * 100);
    $('track-name').textContent = '♪ ' + TRACKS[settings.track].name;
    $('sound-btn').textContent = (settings.sfxOn || settings.bgmOn) ? '🔊' : '🔇';
  }

  function initUI() {
    $('sound-btn').addEventListener('click', e => {
      e.stopPropagation();
      $('sound-panel').classList.toggle('hidden');
    });
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#sound-panel') && !e.target.closest('#sound-btn'))
        $('sound-panel').classList.add('hidden');
    });
    $('sfx-on').addEventListener('change', e => { settings.sfxOn = e.target.checked; save(); updateUI(); if (settings.sfxOn) play('select'); });
    $('bgm-on').addEventListener('change', e => { settings.bgmOn = e.target.checked; save(); applyBgm(); });
    $('sfx-vol').addEventListener('input', e => {
      settings.sfxVol = e.target.value / 100; save();
      if (sfxGain) sfxGain.gain.value = settings.sfxVol;
    });
    $('sfx-vol').addEventListener('change', () => play('pop', 2));
    $('bgm-vol').addEventListener('input', e => { settings.bgmVol = e.target.value / 100; save(); bgm.volume = settings.bgmVol; });
    $('track-prev').addEventListener('click', () => changeTrack(-1));
    $('track-next').addEventListener('click', () => changeTrack(1));

    // 브라우저 autoplay 정책: 첫 사용자 제스처에서 오디오 시작
    const kick = () => { ensureCtx(); applyBgm(); document.removeEventListener('pointerdown', kick); };
    document.addEventListener('pointerdown', kick);
    updateUI();
  }

  document.addEventListener('DOMContentLoaded', initUI);

  return { play, settings };
})();
