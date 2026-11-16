// Sons curtos do jogo, gerados no próprio aparelho (sem arquivos de áudio). Podem ser desligados nas configurações.
import { useSyncExternalStore } from 'react';

const KEY = '7v7-sound';
const listeners = new Set<() => void>();
let on = true;
try {
  on = localStorage.getItem(KEY) !== 'off';
} catch {
  on = true;
}
export const soundOn = () => on;
export function setSound(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off');
  } catch {
    /* sem armazenamento */
  }
  listeners.forEach((fn) => fn());
}
export function useSound() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => on,
    () => true,
  );
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// "Tonk" metálico da bola na trave
export function playPost(volume = 0.22) {
  if (!on || document.hidden) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.setValueAtTime(volume, t);
  out.gain.exponentialRampToValueAtTime(0.0008, t + 0.9);
  out.connect(ac.destination);
  [[820, 1], [1310, 0.55], [2140, 0.3]].forEach(([freq, level]) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.97, t + 0.8);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + level * 0.6);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.95);
  });
  // estalo seco do impacto
  const len = Math.floor(ac.sampleRate * 0.04);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ac.createBufferSource();
  const ng = ac.createGain();
  ng.gain.value = 0.6;
  noise.buffer = buf;
  noise.connect(ng).connect(out);
  noise.start(t);
}

// Fanfarra do MVP: pancada grave quando "MVP" aparece, notas subindo enquanto a carta voa e acorde brilhante quando ela pousa
export function playMvp(volume = 0.2) {
  if (!on || document.hidden) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.value = volume;
  out.connect(ac.destination);
  const tone = (freq: number, start: number, dur: number, type: OscillatorType, level: number, to?: number) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t + start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + start + dur);
    g.gain.setValueAtTime(0.0001, t + start);
    g.gain.exponentialRampToValueAtTime(level, t + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + start + dur);
    osc.connect(g).connect(out);
    osc.start(t + start);
    osc.stop(t + start + dur + 0.05);
  };
  tone(150, 0.15, 0.6, 'sine', 1.6, 45);
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 1.0 + i * 0.28, 0.3, 'triangle', 0.5));
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(f, 2.0, 1.4, 'triangle', 0.45 - i * 0.05);
    tone(f * 2, 2.0, 0.9, 'sine', 0.12);
  });
}
