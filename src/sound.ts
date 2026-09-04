// ── Synthesised audio ──────────────────────────────────────────────────────
// Everything here is generated at runtime from oscillators and noise buffers,
// so the game still ships with no binary assets. That covers the UI sounds, the
// animal calls, the vehicles, the crowd, and the background music, which is a
// small step sequencer rather than a recording.
//
// Browsers block audio until the first gesture, so the context is built lazily.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let muted = localStorage.getItem('taronga-muted') === '1';
let musicOff = localStorage.getItem('taronga-music') === '0';

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOff ? 0 : 0.34;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }
export function isMusicOff() { return musicOff; }

export function setMuted(v: boolean) {
  muted = v;
  localStorage.setItem('taronga-muted', v ? '1' : '0');
  if (master) master.gain.value = v ? 0 : 0.5;
  if (!v) { startAmbient(); startMusic(); }
}

export function setMusicOff(v: boolean) {
  musicOff = v;
  localStorage.setItem('taronga-music', v ? '0' : '1');
  if (musicBus && ctx) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(v ? 0 : 0.34, ctx.currentTime + 0.4);
  }
  if (!v) startMusic();
}

// ── primitives ─────────────────────────────────────────────────────────────
/** One shaped tone. Nearly every sound below is a handful of these. */
function tone(
  freq: number, dur: number, type: OscillatorType = 'square', gain = 0.16,
  delay = 0, slideTo?: number, bus: GainNode | null = null,
) {
  const a = ac();
  if (!a) return;
  const out = bus ?? sfxBus!;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A wobbling tone — the backbone of most animal calls. */
function warble(freq: number, dur: number, depth: number, rate: number, type: OscillatorType = 'sawtooth', gain = 0.14, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const lfo = a.createOscillator();
  const lfoGain = a.createGain();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  lfo.type = 'sine';
  lfo.frequency.value = rate;
  lfoGain.gain.value = depth;
  lfo.connect(lfoGain).connect(osc.frequency);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(sfxBus!);
  osc.start(t0); lfo.start(t0);
  osc.stop(t0 + dur + 0.02); lfo.stop(t0 + dur + 0.02);
}

/** Filtered noise — thumps, hisses, sweeping, steam and crowd wash. */
function noise(dur: number, freq: number, q: number, gain = 0.2, delay = 0, sweepTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const frames = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(sfxBus!);
  src.start(t0);
}

// ── UI and event sounds ────────────────────────────────────────────────────
export const sfx = {
  click:   () => tone(660, 0.045, 'square', 0.09),
  build:   () => { tone(300, 0.05, 'square', 0.12); noise(0.10, 900, 1.2, 0.16); },
  demolish:() => noise(0.22, 420, 0.8, 0.24, 0, 160),
  error:   () => { tone(180, 0.14, 'sawtooth', 0.13); tone(140, 0.16, 'sawtooth', 0.11, 0.05); },
  cash:    () => { tone(1050, 0.07, 'triangle', 0.13); tone(1400, 0.09, 'triangle', 0.12, 0.06); },
  arrive:  () => { tone(520, 0.09, 'triangle', 0.13); tone(780, 0.12, 'triangle', 0.12, 0.08); },
  birth:   () => { [660, 880, 1180].forEach((f, i) => tone(f, 0.13, 'triangle', 0.14, i * 0.09)); },
  death:   () => tone(300, 0.4, 'sine', 0.16, 0, 120),
  escape:  () => { [880, 660, 880, 660].forEach((f, i) => tone(f, 0.13, 'square', 0.15, i * 0.14)); },
  alert:   () => { tone(520, 0.1, 'square', 0.12); tone(400, 0.12, 'square', 0.11, 0.1); },
  talk:    () => { [520, 660, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.11, i * 0.1)); },
  release: () => { [392, 523, 659, 880].forEach((f, i) => tone(f, 0.2, 'sine', 0.13, i * 0.11)); },
  win:     () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, 'triangle', 0.17, i * 0.14)); },
  lose:    () => { [440, 392, 330, 262].forEach((f, i) => tone(f, 0.34, 'sawtooth', 0.14, i * 0.17)); },

  /** A knot of overlapping voices — used when visitors arrive. */
  chatter: () => {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const base = 220 + Math.random() * 260;
      warble(base, 0.16 + Math.random() * 0.12, 22, 11 + Math.random() * 8, 'sawtooth', 0.045, i * 0.09);
    }
  },
  /** Rising "ha-ha-ha" — someone enjoying themselves. */
  laugh: () => {
    const base = 300 + Math.random() * 160;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 2); i++) {
      tone(base * (1 + i * 0.11), 0.075, 'sawtooth', 0.055, i * 0.1, base * (0.8 + i * 0.1));
    }
  },
};

// ── animal calls ───────────────────────────────────────────────────────────
// Grouped by the kind of noise the animal makes rather than by species, so a
// new species inherits a sensible voice from its family.
const CALLS: Record<string, () => void> = {
  roar: () => {                                    // big cats
    warble(110, 0.55, 26, 7, 'sawtooth', 0.17);
    noise(0.5, 300, 0.7, 0.1, 0.02, 140);
    tone(78, 0.5, 'triangle', 0.1, 0.05, 58);
  },
  trumpet: () => {                                 // elephant
    tone(280, 0.10, 'sawtooth', 0.13, 0, 620);
    tone(640, 0.34, 'sawtooth', 0.15, 0.09, 500);
    noise(0.3, 900, 2.2, 0.05, 0.1);
  },
  hoot: () => {                                    // apes
    [330, 392, 466, 392].forEach((f, i) =>
      tone(f, 0.13, 'sine', 0.13, i * 0.11, f * 1.12));
    noise(0.2, 500, 1.5, 0.05, 0.4);
  },
  growl: () => {                                   // croc, komodo
    warble(64, 0.65, 14, 19, 'square', 0.13);
    noise(0.55, 220, 0.5, 0.11, 0.05, 120);
  },
  boom: () => {                                    // emu, cassowary
    tone(58, 0.5, 'sine', 0.2, 0, 44);
    tone(116, 0.3, 'triangle', 0.08, 0.02, 92);
  },
  chirp: () => {                                   // small marsupials
    [900, 1300, 1050].forEach((f, i) => tone(f, 0.055, 'square', 0.085, i * 0.07, f * 1.3));
  },
  bray: () => {                                    // penguin
    for (let i = 0; i < 3; i++) {
      warble(420, 0.13, 60, 26, 'sawtooth', 0.1, i * 0.17);
    }
  },
  bark: () => {                                    // dingo, sea lion
    tone(300, 0.09, 'square', 0.13, 0, 180);
    tone(260, 0.11, 'square', 0.11, 0.15, 150);
  },
  howl: () => {                                    // dingo, occasionally
    tone(400, 0.7, 'sawtooth', 0.12, 0, 620);
    tone(600, 0.6, 'sine', 0.07, 0.08, 820);
  },
  screech: () => {                                 // devil
    warble(720, 0.36, 180, 24, 'sawtooth', 0.11);
    noise(0.3, 1800, 3, 0.06);
  },
  splash: () => {                                  // platypus
    noise(0.28, 1400, 0.8, 0.14, 0, 400);
    tone(500, 0.09, 'sine', 0.06, 0.02, 300);
  },
};

/** Which voice each species uses. Anything unlisted falls back to a chirp. */
const VOICE: Record<string, keyof typeof CALLS> = {
  tiger: 'roar', lion: 'roar',
  elephant: 'trumpet',
  chimp: 'hoot', gorilla: 'hoot',
  croc: 'growl', komodo: 'growl',
  emu: 'boom', cassowary: 'boom',
  kangaroo: 'chirp', koala: 'growl', wombat: 'chirp', echidna: 'chirp',
  meerkat: 'chirp', redpanda: 'chirp',
  penguin: 'bray',
  dingo: 'howl', sealion: 'bark',
  tasdevil: 'screech',
  platypus: 'splash',
  giraffe: 'boom', zebra: 'bark',
};

export function animalCall(species: string) {
  (CALLS[VOICE[species] ?? 'chirp'] ?? CALLS.chirp)();
}

// ── vehicles ───────────────────────────────────────────────────────────────
const VEHICLE: Record<string, () => void> = {
  monorail: () => {                                // electric whoosh + door chime
    noise(0.55, 700, 1.1, 0.09, 0, 1800);
    tone(880, 0.1, 'sine', 0.09, 0.5);
    tone(1170, 0.14, 'sine', 0.08, 0.6);
  },
  train: () => {                                   // whistle then four chuffs
    tone(720, 0.22, 'square', 0.1, 0, 640);
    tone(960, 0.2, 'square', 0.07, 0.03, 860);
    for (let i = 0; i < 4; i++) noise(0.13, 260, 0.7, 0.1, 0.28 + i * 0.15, 90);
  },
  cablecar: () => {                                // cable hum and a clunk
    tone(140, 0.7, 'triangle', 0.07);
    warble(210, 0.7, 6, 5, 'sine', 0.05);
    noise(0.12, 420, 2, 0.09, 0.55);
  },
  safari: () => {                                  // diesel rumble
    warble(72, 0.8, 9, 17, 'square', 0.1);
    noise(0.7, 180, 0.6, 0.07, 0.05);
  },
};

export function vehicleSound(type: string) { (VEHICLE[type] ?? VEHICLE.train)(); }

// ── background music ───────────────────────────────────────────────────────
// A tiny step sequencer. Patterns are written on a pentatonic scale, which is
// what gives them the loose "jungle" feel, over a syncopated tom-and-shaker
// groove. Notes are MIDI numbers; `_` holds and `.` rests.
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Track {
  name: string;
  bpm: number;
  lead: (number | null)[];
  bass: (number | null)[];
  perc: string[];        // k kick, t tom, s shaker, h hat, . rest
}

const _ = null;
const TRACKS: Track[] = [
  {
    name: 'Bushwalk',
    bpm: 104,
    lead: [
      69, _, 72, _, 74, _, 72, _, 69, _, 67, _, 69, _, _, _,
      72, _, 74, _, 76, _, 74, _, 72, _, 69, _, 67, _, _, _,
    ],
    bass: [
      45, _, _, _, 45, _, 52, _, 43, _, _, _, 43, _, 50, _,
      41, _, _, _, 41, _, 48, _, 43, _, _, _, 45, _, 47, _,
    ],
    perc: [
      'k', '.', 's', '.', 't', '.', 's', '.', 'k', '.', 's', '.', 't', 's', '.', 's',
      'k', '.', 's', '.', 't', '.', 's', 'k', '.', 't', 's', '.', 't', 's', 's', '.',
    ],
  },
  {
    name: 'Canopy',
    bpm: 132,
    lead: [
      76, 74, 72, _, 74, _, 69, _, 72, 74, 76, _, 79, _, 76, _,
      74, 72, 69, _, 67, _, 69, _, 72, _, 74, 72, 69, _, _, _,
    ],
    bass: [
      45, _, 45, _, 52, _, 45, _, 43, _, 43, _, 50, _, 43, _,
      41, _, 41, _, 48, _, 41, _, 45, _, 45, _, 52, 50, 48, _,
    ],
    perc: [
      'k', 'h', 's', 'h', 'k', 'h', 's', 't', 'k', 'h', 's', 'h', 't', 't', 's', 'h',
      'k', 'h', 's', 'h', 'k', 't', 's', 'h', 'k', 'h', 't', 's', 'k', 's', 's', 't',
    ],
  },
  {
    name: 'Billabong',
    bpm: 84,
    lead: [
      64, _, _, 67, _, 69, _, _, 72, _, 69, _, 67, _, _, _,
      69, _, _, 72, _, 74, _, _, 72, _, 69, _, 67, _, 64, _,
    ],
    bass: [
      40, _, _, _, _, _, 47, _, 45, _, _, _, _, _, 43, _,
      38, _, _, _, _, _, 45, _, 40, _, _, _, _, _, 47, _,
    ],
    perc: [
      'k', '.', '.', '.', 's', '.', '.', '.', 'k', '.', '.', 's', '.', '.', 't', '.',
      'k', '.', '.', '.', 's', '.', '.', 't', 'k', '.', '.', 's', '.', '.', '.', '.',
    ],
  },
];

let musicTimer: number | null = null;
let trackIndex = Math.floor(Math.random() * TRACKS.length);
let step = 0;
let loops = 0;
let nextNoteTime = 0;

function playStep(t: Track, i: number, at: number) {
  const a = ac();
  if (!a || !musicBus) return;

  const lead = t.lead[i];
  if (lead) {
    // two detuned pulses give the lead a fatter chiptune body
    tone(midi(lead), 0.16, 'square', 0.075, at - a.currentTime, undefined, musicBus);
    tone(midi(lead) * 1.005, 0.16, 'square', 0.045, at - a.currentTime + 0.012, undefined, musicBus);
  }
  const bass = t.bass[i];
  if (bass) tone(midi(bass), 0.24, 'triangle', 0.13, at - a.currentTime, undefined, musicBus);

  const p = t.perc[i];
  const d = at - a.currentTime;
  if (p === 'k') {
    const osc = a.createOscillator(); const g = a.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.13);
    g.gain.setValueAtTime(0.22, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    osc.connect(g).connect(musicBus);
    osc.start(at); osc.stop(at + 0.17);
  } else if (p === 't') {
    tone(190, 0.16, 'sine', 0.13, d, 120, musicBus);
  } else if (p === 's') {
    percNoise(0.06, 3200, 1.4, 0.05, at);
  } else if (p === 'h') {
    percNoise(0.03, 6500, 2.0, 0.03, at);
  }
}

/** Percussion noise routed through the music bus rather than the sfx bus. */
function percNoise(dur: number, freq: number, q: number, gain: number, at: number) {
  const a = ac();
  if (!a || !musicBus) return;
  const frames = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(musicBus);
  src.start(at);
}

/**
 * Look-ahead scheduler. setInterval alone is far too jittery for music, so we
 * queue every note that falls due in the next fifth of a second.
 */
function musicTick() {
  const a = ac();
  if (!a || muted) return;
  const t = TRACKS[trackIndex];
  const stepDur = 60 / t.bpm / 4;              // sixteenth notes
  if (nextNoteTime < a.currentTime) nextNoteTime = a.currentTime + 0.06;
  while (nextNoteTime < a.currentTime + 0.2) {
    playStep(t, step % t.lead.length, nextNoteTime);
    nextNoteTime += stepDur;
    step++;
    if (step % t.lead.length === 0) {
      loops++;
      if (loops >= 2) {                        // move on after two times through
        loops = 0;
        step = 0;
        trackIndex = (trackIndex + 1) % TRACKS.length;
        return;
      }
    }
  }
}

export function startMusic() {
  if (musicTimer !== null || muted || musicOff) return;
  if (!ac()) return;
  nextNoteTime = 0;
  musicTimer = window.setInterval(musicTick, 40);
}

export function currentTrackName(): string { return TRACKS[trackIndex].name; }

// ── park ambience ──────────────────────────────────────────────────────────
let ambientOn = false;
let crowdSize = 0;
let zooSpecies: string[] = [];

/** Fed from the UI each frame so the ambience follows what's actually there. */
export function setAmbience(guests: number, species: string[]) {
  crowdSize = guests;
  zooSpecies = species;
}

export function startAmbient() {
  if (ambientOn || muted) return;
  if (!ac()) return;
  ambientOn = true;
  const tick = () => {
    if (muted) { ambientOn = false; return; }
    // crowd wash, louder the busier the park is
    const crowd = Math.min(1, crowdSize / 60);
    if (crowdSize > 0) {
      noise(2.4, 300 + Math.random() * 160, 0.6, 0.012 + crowd * 0.045);
      if (Math.random() < 0.16 + crowd * 0.3) sfx.chatter();
      if (Math.random() < 0.06 + crowd * 0.16) sfx.laugh();
    }
    // one of your own animals calling out
    if (zooSpecies.length && Math.random() < 0.42) {
      animalCall(zooSpecies[Math.floor(Math.random() * zooSpecies.length)]);
    } else if (Math.random() < 0.4) {
      const base = 1500 + Math.random() * 900;   // generic bush bird
      tone(base, 0.09, 'sine', 0.04);
      tone(base * 1.28, 0.07, 'sine', 0.03, 0.11);
    }
    window.setTimeout(tick, 2400 + Math.random() * 2800);
  };
  tick();
}

// ── event routing ──────────────────────────────────────────────────────────
let lastChatter = -1e9;

/** Map a simulation event name onto a sound. */
export function playEvent(kind: string) {
  if (kind.startsWith('call:')) { animalCall(kind.slice(5)); return; }
  if (kind.startsWith('ride:')) { vehicleSound(kind.slice(5)); return; }
  if (kind === 'guest') {
    // guests arrive constantly; only let a few of them be audible
    const now = performance.now();
    if (now - lastChatter < 2600) return;
    lastChatter = now;
    if (Math.random() < 0.35) sfx.laugh(); else sfx.chatter();
    return;
  }
  const fn = (sfx as Record<string, (() => void) | undefined>)[kind];
  if (fn) fn();
}
