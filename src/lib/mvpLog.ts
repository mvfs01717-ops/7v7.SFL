// Últimos MVPs de partida deste aparelho (só dados reais: gravados quando a tela de resultado mostra o MVP).
import { useEffect, useState } from 'react';
import type { Player } from '@/lib/game/types';

export type MvpEntry = { key: string; at: number; player: Player; team: { abbreviation: string; primary_color: string }; rating: number; goals: number; assists: number; mine: boolean };

const KEY = '7v7-mvps';
const MAX = 6;
const listeners = new Set<() => void>();

function read(): MvpEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MvpEntry[];
    return Array.isArray(list) ? list.filter((e) => e && e.player && typeof e.rating === 'number') : [];
  } catch {
    return [];
  }
}
let cache: MvpEntry[] | null = null;
const get = () => (cache ??= typeof window === 'undefined' ? [] : read());

export function recordMvp(entry: Omit<MvpEntry, 'at'>) {
  const list = get();
  if (list.some((e) => e.key === entry.key)) return;
  // Guarda só o necessário para desenhar a carta (sem estado de jogo)
  const p = entry.player;
  const slim = { id: p.id, name: p.name, overall: p.overall, primary_position: p.primary_position, alternate_positions: [], team_id: p.team_id, image_url: p.image_url ?? null } as Player;
  cache = [{ ...entry, player: slim, at: Date.now() }, ...list].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento: a lista só não persiste */
  }
  listeners.forEach((fn) => fn());
}

export function useMvpLog(): MvpEntry[] {
  const [list, setList] = useState(get);
  useEffect(() => {
    const fn = () => setList(get());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return list;
}
