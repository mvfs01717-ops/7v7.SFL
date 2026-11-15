// Clima e horário da partida. No multiplayer a sala inteira (jogadores e espectadores) usa o mesmo sorteio,
// porque ele vem do código da sala; contra o bot é sorteado a cada partida.

export type TimeOfDay = 'day' | 'afternoon' | 'night';
export type Weather = 'clear' | 'rain';
// rainFrom: minuto em que a chuva começa quando o jogo começa seco (45 = começa a chover no 2º tempo)
export type Ambience = { time: TimeOfDay; weather: Weather; rainFrom?: number };

export const TIME_LABEL: Record<TimeOfDay, string> = { day: '☀️ Dia', afternoon: '🌇 Fim de tarde', night: '🌙 Noite' };
export const WEATHER_LABEL: Record<Weather, string> = { clear: '', rain: '🌧 Chuva' };

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function pickAmbience(seed?: string | null): Ambience {
  const a = seed ? hash(`t-${seed}`) : Math.random();
  const b = seed ? hash(`w-${seed}`) : Math.random();
  const c = seed ? hash(`r-${seed}`) : Math.random();
  const weather: Weather = b < 0.25 ? 'rain' : 'clear';
  return { time: a < 0.4 ? 'night' : a < 0.75 ? 'afternoon' : 'day', weather, ...(weather === 'clear' && c < 0.22 ? { rainFrom: 45 } : {}) };
}

// Tempo no momento da partida: quem começa seco pode virar chuva no 2º tempo
export function weatherAt(a: Ambience, minute: number): Weather {
  return a.weather === 'rain' || (a.rainFrom != null && minute >= a.rainFrom) ? 'rain' : 'clear';
}
// Minuto a partir do qual o gramado está molhado (0 = o jogo todo; Infinity = nunca)
export function wetFromOf(a: Ambience): number {
  return a.weather === 'rain' ? 0 : a.rainFrom ?? Infinity;
}

export function ambienceLabel(a: Ambience, minute = 0) {
  const w = weatherAt(a, minute);
  const forecast = w === 'clear' && a.rainFrom != null ? '⛅ Chuva no 2º tempo' : '';
  return [TIME_LABEL[a.time], WEATHER_LABEL[w], forecast].filter(Boolean).join(' · ');
}
