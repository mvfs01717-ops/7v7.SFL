// Dados do "Mapa da partida" (mapa de calor e rede de passes).
// O campo (MatchPitch) grava as posições dos jogadores e os passes enquanto a partida roda e a tela de
// resultado mostra. As posições são normalizadas: os dois times sempre atacam para a direita.

export const MAP_COLS = 24;
export const MAP_ROWS = 14;

export type MapSlot = {
  key: string; // user-CM, bot-LF...
  side: 'user' | 'bot';
  pos: string;
  name: string;
  grid: number[]; // MAP_ROWS * MAP_COLS
  n: number; // amostras
  sx: number; // soma das posições normalizadas (0 a 1) para a posição média
  sy: number;
};

export type MatchMapData = {
  slots: Record<string, MapSlot>;
  passes: Record<string, number>; // 'user-CM>user-LF' -> quantidade
  samples: number;
};

export const createMatchMap = (): MatchMapData => ({ slots: {}, passes: {}, samples: 0 });

export function recordMapSample(
  map: MatchMapData,
  slots: { key: string; side: 'user' | 'bot'; pos: string; name: string; x: number; y: number }[],
  bounds: { x0: number; x1: number; y0: number; y1: number },
) {
  map.samples += 1;
  for (const slot of slots) {
    let u = (slot.x - bounds.x0) / (bounds.x1 - bounds.x0);
    const v = (slot.y - bounds.y0) / (bounds.y1 - bounds.y0);
    if (slot.side === 'bot') u = 1 - u; // o visitante ataca para a esquerda: espelha
    const cu = Math.min(1, Math.max(0, u));
    const cv = Math.min(1, Math.max(0, v));
    let entry = map.slots[slot.key];
    if (!entry) {
      entry = { key: slot.key, side: slot.side, pos: slot.pos, name: slot.name, grid: new Array(MAP_ROWS * MAP_COLS).fill(0), n: 0, sx: 0, sy: 0 };
      map.slots[slot.key] = entry;
    }
    entry.name = slot.name;
    entry.grid[Math.min(MAP_ROWS - 1, Math.floor(cv * MAP_ROWS)) * MAP_COLS + Math.min(MAP_COLS - 1, Math.floor(cu * MAP_COLS))] += 1;
    entry.n += 1;
    entry.sx += cu;
    entry.sy += cv;
  }
}

export function recordMapPass(map: MatchMapData, from: string, to: string) {
  const id = `${from}>${to}`;
  map.passes[id] = (map.passes[id] ?? 0) + 1;
}
