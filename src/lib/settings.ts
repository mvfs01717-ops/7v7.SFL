import { useSyncExternalStore } from 'react';

// Configurações do aparelho (ficam só neste navegador).
// Desempenho: "auto" liga o modo otimizado sozinho em celulares e aparelhos mais fracos.

export type PerfMode = 'auto' | 'on' | 'off';
const KEY = '7v7-perf';
const listeners = new Set<() => void>();

function read(): PerfMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
  } catch {
    return 'auto';
  }
}
let current: PerfMode = typeof window === 'undefined' ? 'auto' : read();

export function setPerfMode(mode: PerfMode) {
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* navegador bloqueou o armazenamento: vale só até recarregar */
  }
  listeners.forEach((fn) => fn());
}

// Celular (toque + tela pequena) ou aparelho com pouca memória/processador
export function looksLowEnd(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width, window.screen.height) < 700;
  const weak = (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced || (touch && (small || weak));
}

// Bateria baixa (só onde o navegador informa, como Chrome no Android): no modo "auto" liga o modo otimizado sozinho
type BatteryLike = { level: number; charging: boolean; addEventListener: (type: string, fn: () => void) => void };
let lowBattery = false;
let batteryLevel: number | null = null;
let batteryCharging = false;
let batteryStarted = false;
const LOW_ON = 0.2;
const LOW_OFF = 0.25;
function startBattery() {
  if (batteryStarted || typeof navigator === 'undefined') return;
  batteryStarted = true;
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  if (!nav.getBattery) return;
  nav
    .getBattery()
    .then((battery) => {
      const update = () => {
        batteryLevel = battery.level;
        batteryCharging = battery.charging;
        const next = battery.charging ? false : lowBattery ? battery.level < LOW_OFF : battery.level <= LOW_ON;
        lowBattery = next;
        listeners.forEach((fn) => fn());
      };
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
    })
    .catch(() => undefined);
}
if (typeof window !== 'undefined') startBattery();

// Desempenho medido: se a partida roda a menos de ~35 quadros/s por alguns segundos, o modo "auto" liga o modo leve sozinho (vale até fechar a aba)
let slowDevice = false;
try {
  slowDevice = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('7v7-slow') === '1';
} catch {
  /* sem armazenamento */
}
let sampleSum = 0;
let sampleN = 0;
let slowStreak = 0;
export function perfSample(dtMs: number) {
  if (slowDevice || current !== 'auto' || typeof document === 'undefined' || document.hidden) return;
  if (dtMs > 250) return; // aba em segundo plano ou pausa: não conta
  sampleSum += dtMs;
  sampleN += 1;
  if (sampleN < 150) return; // janela de ~150 quadros
  const avg = sampleSum / sampleN;
  sampleSum = 0;
  sampleN = 0;
  slowStreak = avg > 29 ? slowStreak + 1 : 0;
  if (slowStreak >= 2) {
    slowDevice = true;
    try {
      sessionStorage.setItem('7v7-slow', '1');
    } catch {
      /* sem armazenamento */
    }
    listeners.forEach((fn) => fn());
  }
}

export function isLite(mode: PerfMode = current): boolean {
  return mode === 'on' || (mode === 'auto' && (looksLowEnd() || lowBattery || slowDevice));
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function usePerfMode(): PerfMode {
  return useSyncExternalStore(subscribe, () => current, () => 'auto' as PerfMode);
}

// true quando o modo otimizado está valendo (escolhido ou automático, inclusive por bateria baixa)
export function useLite(): boolean {
  return useSyncExternalStore(subscribe, () => isLite(current), () => false);
}

// Estado da bateria para mostrar nas configurações (supported = false no iPhone e em navegadores sem a API)
export function useBattery(): { supported: boolean; low: boolean; level: number | null; charging: boolean } {
  const key = useSyncExternalStore(subscribe, () => `${lowBattery ? 1 : 0}|${batteryLevel ?? ''}|${batteryCharging ? 1 : 0}`, () => '0||0');
  const [low, level, charging] = key.split('|');
  return { supported: level !== '', low: low === '1', level: level === '' ? null : Number(level), charging: charging === '1' };
}
