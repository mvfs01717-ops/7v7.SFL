// Biblioteca de animações do 7v7: registro com metadados, ligar/desligar, velocidade e contagem de uso.
// Só entram aqui animações que JÁ estão conectadas à partida (campo: MatchPitch). Cada item diz onde e quando é executado.
import { GAITS, type Gait } from '@/lib/game/locomotion';
import { DRIBBLE_MOVES, type DribbleMove } from '@/lib/game/dribbles';

export type AnimCategory = 'locomocao' | 'drible' | 'passe' | 'finalizacao' | 'dominio' | 'defesa';
export const CATEGORY_LABEL: Record<AnimCategory, string> = { locomocao: 'Movimentação (discos)', drible: 'Dribles', dominio: 'Domínio e primeiro toque', passe: 'Passes', finalizacao: 'Finalizações', defesa: 'Defesa e goleiro' };

export type AnimDef = {
  id: string; // identificador único
  category: AnimCategory;
  type: string; // tipo de movimento
  label: string;
  when: string; // condições de execução
  dur: number; // duração em ms (0 = enquanto a condição durar)
  body: string; // movimento corporal
  ball: string; // interação com a bola
  next: string[]; // possíveis animações seguintes
  interrupt: string; // regras de interrupção
  needs: string; // requisitos de atributos
  roles: string; // compatibilidade com funções
};

const GAIT_DEF: Record<Gait, Omit<AnimDef, 'id' | 'category'>> = {
  parado: { type: 'postura', label: 'Parado (postura)', when: 'Velocidade quase zero', dur: 0, body: 'Disco parado, sem rastro nem indicador de direção', ball: 'Bola parada ou sob domínio', next: ['caminhada', 'arrancada'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Todas' },
  caminhada: { type: 'locomoção', label: 'Caminhada', when: 'Até 30% da velocidade máxima', dur: 0, body: 'Disco se desloca devagar, sem esticada', ball: 'Condução curta', next: ['leve', 'parado', 'freada'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Todas' },
  leve: { type: 'locomoção', label: 'Corrida leve', when: '30% a 58% da velocidade máxima', dur: 0, body: 'Disco com leve pulsar no ritmo da corrida', ball: 'Condução normal', next: ['corrida', 'caminhada', 'direcao'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Todas' },
  corrida: { type: 'locomoção', label: 'Corrida normal', when: '58% a 82% da velocidade máxima', dur: 0, body: 'Disco estica de leve na direção da corrida e deixa rastro curto', ball: 'Condução em ritmo', next: ['sprint', 'leve', 'direcao', 'freada'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Todas' },
  sprint: { type: 'locomoção', label: 'Sprint', when: 'Acima de 82% da velocidade máxima', dur: 0, body: 'Disco estica na direção do movimento, rastro de velocidade e pulsar mais forte', ball: 'Condução em velocidade (toque mais longo)', next: ['freada', 'direcao', 'corrida'], interrupt: 'Livre', needs: 'Fôlego: cansaço reduz a velocidade máxima', roles: 'Todas' },
  arrancada: { type: 'ação', label: 'Arrancada explosiva', when: 'Aceleração forte saindo de baixa velocidade', dur: 260, body: 'Disco se projeta à frente, rastro longo e indicador de direção aceso', ball: 'Toque à frente', next: ['sprint', 'corrida'], interrupt: 'Ao final', needs: 'Nenhum', roles: 'Todas (mais comum em pontas e atacantes móveis)' },
  freada: { type: 'ação', label: 'Parada brusca / desaceleração', when: 'Desaceleração forte vindo de velocidade alta', dur: 260, body: 'Disco se comprime no eixo do movimento, rastro some rápido', ball: 'Bola controlada junto ao pé', next: ['caminhada', 'parado', 'arrancada'], interrupt: 'Ao final', needs: 'Nenhum', roles: 'Todas' },
  direcao: { type: 'ação', label: 'Mudança de direção', when: 'Giro rápido da trajetória em velocidade', dur: 260, body: 'Disco se contrai na curva, indicador de direção gira e a curva marca o gramado', ball: 'Bola acompanha o giro', next: ['corrida', 'arrancada'], interrupt: 'Ao final', needs: 'Nenhum', roles: 'Todas' },
  lateral: { type: 'locomoção', label: 'Corrida lateral', when: 'Corpo voltado para a bola e movimento de lado (defensores)', dur: 0, body: 'Disco de frente para a bola enquanto se desloca de lado', ball: 'Sem bola (acompanha o portador)', next: ['costas', 'corrida'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Defensivas, laterais e volantes' },
  costas: { type: 'locomoção', label: 'Deslocamento de costas', when: 'Recuo olhando para a bola', dur: 0, body: 'Disco recua de frente para a bola', ball: 'Sem bola (recomposição)', next: ['lateral', 'corrida'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Defensivas, laterais e volantes' },
};

const DRIBBLE_DEF: Record<DribbleMove, Omit<AnimDef, 'id' | 'category'>> = {
  finta: { type: 'drible', label: 'Finta de corpo', when: 'Marcador à frente; escolha padrão', dur: 740, body: 'Balanço do tronco para um lado e saída pelo outro', ball: 'Bola balança junto ao pé e sai pelo lado da arrancada', next: ['aceleracao', 'direcao'], interrupt: 'Se o marcador desarma, a jogada acaba e a posse muda', needs: 'Chance sobe com a diferença de overall', roles: 'Todas' },
  pedalada: { type: 'drible', label: 'Pedalada', when: 'Marcador à frente, pouca pressão, jogador técnico', dur: 810, body: 'Tronco oscila rápido duas vezes, base se abre', ball: 'Bola circula, depois sai por fora', next: ['aceleracao', 'corte'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Mais comum com overall alto e criatividade', roles: 'Pontas (wg-inf, wg-wide), meias criativos' },
  corte: { type: 'drible', label: 'Corte seco', when: 'Jogador aberto, perto da linha lateral', dur: 560, body: 'Fecha rápido para um lado e corta bruscamente para o outro', ball: 'Bola muda de lado num toque', next: ['aceleracao', 'velocidade'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Ousadia', roles: 'Pontas e laterais' },
  caneta: { type: 'drible', label: 'Caneta', when: 'Marcador muito próximo; risco alto, recompensa alta', dur: 750, body: 'Avança quase em linha reta contra o marcador', ball: 'Bola passa entre as pernas do marcador e o jogador a recupera atrás dele', next: ['aceleracao'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Overall bem acima do marcador compensa o risco', roles: 'Pontas e meias criativos (wg-inf, mc-inf)' },
  giro: { type: 'drible', label: 'Giro com a bola', when: 'Marcador colado, pressão alta', dur: 840, body: 'Corpo gira 360° protegendo a bola', ball: 'Bola fica do lado oposto ao marcador', next: ['aceleracao', 'protecao'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Criatividade', roles: 'Pivôs e meias (at-pivot, mc-play)' },
  direcao: { type: 'drible', label: 'Mudança de direção', when: 'Pouco espaço à frente', dur: 800, body: 'Inclina para um lado e sai pelo outro', ball: 'Bola acompanha a mudança', next: ['aceleracao', 'curto'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Nenhum', roles: 'Atacantes móveis e meias' },
  protecao: { type: 'drible', label: 'Proteção de bola', when: 'Pressão alta e jogador forte de costas', dur: 760, body: 'Corpo inclinado e largo entre marcador e bola', ball: 'Bola no pé mais distante do marcador', next: ['giro', 'direcao'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Coletivo', roles: 'Pivôs e volantes (at-pivot, mc-hold)' },
  aceleracao: { type: 'drible', label: 'Aceleração', when: 'Espaço livre à frente, pouca pressão', dur: 580, body: 'Corpo alonga, passada máxima', ball: 'Bola empurrada à frente', next: ['velocidade'], interrupt: 'Se o marcador alcança, a jogada acaba', needs: 'Ousadia', roles: 'Pontas e box-to-box (wg-wide, mc-b2b)' },
  curto: { type: 'drible', label: 'Drible curto', when: 'Marcador perto, espaço apertado', dur: 740, body: 'Toques curtos e rápidos, tronco vibra', ball: 'Bola colada ao pé', next: ['direcao', 'finta'], interrupt: 'Se o marcador desarma, a jogada acaba', needs: 'Coletivo', roles: 'Meias (mc-play, wg-play)' },
  velocidade: { type: 'drible', label: 'Drible em velocidade', when: 'Longe do gol, muito espaço, sem pressão', dur: 900, body: 'Corrida longa em velocidade máxima passando por fora', ball: 'Bola em toques longos', next: ['finta'], interrupt: 'Se o marcador alcança, a jogada acaba', needs: 'Ousadia', roles: 'Pontas e atacantes móveis' },
};


const FX_DEF: { id: string; category: AnimCategory; label: string; type: string; when: string; dur: number; body: string; ball: string; next: string[]; interrupt: string; needs: string; roles: string }[] = [
  { id: 'fx.touch', category: 'dominio', label: 'Amortecimento no domínio', type: 'domínio', when: 'Todo passe ou bola que chega ao jogador', dur: 320, body: 'Disco comprime no eixo da bola e cede um pouco, depois volta', ball: 'A bola passa a acompanhar o disco; passes fortes amortecem mais', next: ['loc.arrancada', 'dri.giro', 'fx.pass'], interrupt: 'Dribles e desarmes têm prioridade sobre a pose', needs: 'Nenhum (força do passe muda a intensidade)', roles: 'Todas' },
  { id: 'fx.pass', category: 'passe', label: 'Contato e impulso do passe', type: 'passe', when: 'Todo passe', dur: 240, body: 'Recuo curto e avanço do disco na direção do passe; anel de impacto nos passes fortes', ball: 'A bola sai na direção do avanço, com trajetória e arco do passe', next: ['fx.touch'], interrupt: 'Dribles e desarmes têm prioridade sobre a pose', needs: 'Nenhum', roles: 'Todas' },
  { id: 'fx.shot', category: 'finalizacao', label: 'Preparação e impacto do chute', type: 'finalização', when: 'Todo chute de um jogador de linha', dur: 450, body: 'Preparação: disco recua e comprime por 150 ms com a bola parada. Contato: avanço forte, esticada e clarão', ball: 'A bola só sai depois da preparação; chutes mais rápidos têm impacto maior e mais rastro', next: ['fx.save', 'fx.touch'], interrupt: 'Se o chute for desligado aqui, sai sem preparação', needs: 'Nenhum (a duração do chute define a força)', roles: 'Todas' },
  { id: 'fx.save', category: 'defesa', label: 'Impacto da defesa do goleiro', type: 'defesa', when: 'Chute que chega ao goleiro', dur: 380, body: 'Goleiro absorve o impacto: comprime e cede, com anel azul e clarão', ball: 'A bola passa a ficar com o goleiro', next: ['fx.pass'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Goleiros (tradicional, construtor e líbero)' },
];
export const LIBRARY: AnimDef[] = [
  ...FX_DEF,
  ...GAITS.map((g) => ({ id: `loc.${g}`, category: 'locomocao' as const, ...GAIT_DEF[g] })),
  ...DRIBBLE_MOVES.map((m) => ({ id: `dri.${m}`, category: 'drible' as const, ...DRIBBLE_DEF[m] })),
];
export const defOf = (id: string): AnimDef | undefined => LIBRARY.find((a) => a.id === id);

// Configuração do administrador (neste aparelho) e contagem de uso
export type AnimSettings = Record<string, { on?: boolean; speed?: number }>;
const KEY = 'sfl7v7.anim.v1';
const USE_KEY = 'sfl7v7.anim.use.v1';
let cache: AnimSettings | null = null;
const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento */ } };

export function loadAnimSettings(): AnimSettings { if (!cache) cache = read<AnimSettings>(KEY, {}); return cache; }
export function saveAnimSettings(next: AnimSettings) { cache = next; write(KEY, next); }
export const animOn = (id: string): boolean => loadAnimSettings()[id]?.on !== false;
export const animSpeed = (id: string): number => { const v = loadAnimSettings()[id]?.speed; return typeof v === 'number' ? Math.max(0.5, Math.min(1.8, v)) : 1; };

let uses: Record<string, number> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
export function countUse(id: string) {
  uses[id] = (uses[id] ?? 0) + 1;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const total = read<Record<string, number>>(USE_KEY, {});
    Object.entries(uses).forEach(([k, v]) => { total[k] = (total[k] ?? 0) + v; });
    uses = {};
    write(USE_KEY, total);
  }, 5000);
}
export const loadUses = (): Record<string, number> => {
  const total = read<Record<string, number>>(USE_KEY, {});
  Object.entries(uses).forEach(([k, v]) => { total[k] = (total[k] ?? 0) + v; });
  return total;
};
export const clearUses = () => { uses = {}; write(USE_KEY, {}); };
