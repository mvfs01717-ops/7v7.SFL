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
