import type { Player, Position } from '@/lib/game/types';

// Funções dos jogadores (7v7). A formação e as posições continuam fixas: a função só define COMO o jogador atua.
// O projeto só tem overall e posições (principal + alternativas) por jogador. A compatibilidade usa só isso,
// sem alterar overall nem inventar atributos.

export type Sector = 'GK' | 'DEF' | 'MID' | 'WING' | 'ATT';
export const SECTOR_OF: Record<Position, Sector> = { GK: 'GK', LB: 'DEF', RB: 'DEF', CM: 'MID', LF: 'WING', RF: 'WING', CF: 'ATT' };
export const SECTOR_POSITIONS: Record<Sector, Position[]> = { GK: ['GK'], DEF: ['LB', 'RB'], MID: ['CM'], WING: ['LF', 'RF'], ATT: ['CF'] };
export const SECTOR_LABEL: Record<Sector, string> = { GK: 'Goleiro', DEF: 'Zagueiro', MID: 'Meio-campista', WING: 'Ponta', ATT: 'Atacante' };

export type Role = { id: string; sector: Sector; name: string; icon: string; text: string; goal: string; base?: boolean; lean: Position[] };

export const ROLES: Role[] = [
  { id: 'gk-trad', sector: 'GK', name: 'Goleiro tradicional', icon: '🧤', text: 'Fica na linha do gol e foca em defender chutes e cruzamentos.', goal: 'Segurança máxima debaixo das traves.', base: true, lean: [] },
  { id: 'gk-build', sector: 'GK', name: 'Goleiro construtor', icon: '🎯', text: 'Participa da saída de bola com passes curtos e precisos.', goal: 'Começar as jogadas desde trás.', lean: ['CM'] },
  { id: 'gk-libero', sector: 'GK', name: 'Goleiro líbero', icon: '🧹', text: 'Sai da área para cortar bolas longas e cobrir as costas da defesa.', goal: 'Permitir uma defesa mais adiantada.', lean: ['LB', 'RB'] },
  { id: 'df-build', sector: 'DEF', name: 'Zagueiro construtor', icon: '🏗️', text: 'Sai jogando com qualidade e acha os meio-campistas.', goal: 'Iniciar o ataque pela defesa.', lean: ['CM'] },
  { id: 'df-mark', sector: 'DEF', name: 'Marcador', icon: '🔒', text: 'Gruda no atacante rival e não deixa ele virar.', goal: 'Neutralizar o melhor atacante adversário.', base: true, lean: [] },
  { id: 'df-anti', sector: 'DEF', name: 'Antecipador', icon: '👁️', text: 'Lê a jogada e corta o passe antes da bola chegar.', goal: 'Roubar a bola sem precisar do desarme.', base: true, lean: ['CM'] },
  { id: 'df-aggr', sector: 'DEF', name: 'Defensor agressivo', icon: '💢', text: 'Sai da linha para pressionar quem recebe de costas.', goal: 'Sufocar o rival e recuperar a bola alto.', lean: ['CM'] },
  { id: 'mc-play', sector: 'MID', name: 'Armador', icon: '🧠', text: 'Organiza o jogo e procura o passe que quebra a defesa.', goal: 'Criar as chances de gol do time.', lean: ['LF', 'RF'] },
  { id: 'mc-b2b', sector: 'MID', name: 'Box-to-box', icon: '🔋', text: 'Corre de uma área à outra: ajuda a defender e a atacar.', goal: 'Equilíbrio entre marcação e apoio ofensivo.', base: true, lean: [] },
  { id: 'mc-hold', sector: 'MID', name: 'Volante', icon: '🛡️', text: 'Protege a defesa e recupera a bola à frente dos zagueiros.', goal: 'Dar segurança para o resto do time atacar.', lean: ['LB', 'RB'] },
  { id: 'mc-inf', sector: 'MID', name: 'Meia infiltrador', icon: '🗡️', text: 'Chega de trás para dentro da área em velocidade.', goal: 'Surpreender a defesa com chegadas ao gol.', lean: ['CF'] },
  { id: 'wg-wide', sector: 'WING', name: 'Ponta aberto', icon: '↔️', text: 'Abre o campo, joga na linha lateral e cruza.', goal: 'Esticar a defesa rival e criar espaço no meio.', base: true, lean: [] },
  { id: 'wg-inf', sector: 'WING', name: 'Infiltrador', icon: '🌀', text: 'Corta para dentro e ataca a área.', goal: 'Finalizar de dentro e atrair marcação.', lean: ['CF', 'CM'] },
  { id: 'wg-play', sector: 'WING', name: 'Armador lateral', icon: '🎼', text: 'Sai da ponta para organizar e distribuir o jogo.', goal: 'Dar mais criação pelos lados.', lean: ['CM'] },
  { id: 'wg-bal', sector: 'WING', name: 'Ponta equilibrado', icon: '⚖️', text: 'Alterna entre abrir o campo e entrar, conforme o jogo.', goal: 'Ser opção em qualquer situação.', base: true, lean: [] },
  { id: 'at-fin', sector: 'ATT', name: 'Finalizador', icon: '⚽', text: 'Fica na área esperando a bola para finalizar.', goal: 'Transformar as chances em gols.', base: true, lean: [] },
  { id: 'at-f9', sector: 'ATT', name: 'Falso 9', icon: '🎭', text: 'Recua para buscar o jogo e abre espaço para os pontas.', goal: 'Confundir a marcação e ligar o time.', lean: ['CM'] },
  { id: 'at-pivot', sector: 'ATT', name: 'Pivô', icon: '💪', text: 'Segura a bola de costas e deixa os companheiros chegarem.', goal: 'Dar ponto de apoio para o ataque.', base: true, lean: [] },
  { id: 'at-mobile', sector: 'ATT', name: 'Atacante móvel', icon: '🏃', text: 'Se movimenta pelos lados e puxa os zagueiros.', goal: 'Abrir espaços e atacar a profundidade.', lean: ['LF', 'RF'] },
];

export const rolesFor = (position: Position): Role[] => ROLES.filter((role) => role.sector === SECTOR_OF[position]);
export const defaultRole = (position: Position): Role => rolesFor(position).find((role) => role.base) ?? rolesFor(position)[0];
export const roleById = (id: string | undefined): Role | undefined => ROLES.find((role) => role.id === id);

export type Fit = 'ideal' | 'compativel' | 'alternativa';
export const FIT_LABEL: Record<Fit, string> = { ideal: 'Função ideal', compativel: 'Função compatível', alternativa: 'Função alternativa' };
export const FIT_TEXT: Record<Fit, string> = {
  ideal: 'O perfil de posições do jogador combina com a função.',
  compativel: 'O jogador consegue desempenhar bem a função.',
  alternativa: 'Pode atuar nela, mas não é a especialidade dele.',
};

// Usa só dados reais: posição principal e posições alternativas do jogador
export function roleFit(player: Player, slot: Position, role: Role): Fit {
  const group = SECTOR_POSITIONS[SECTOR_OF[slot]];
  const inGroup = group.includes(player.primary_position);
  const alts = player.alternate_positions ?? [];
  const primaryLean = role.lean.includes(player.primary_position);
  const altLean = alts.some((alt) => role.lean.includes(alt));
  if (inGroup && (role.base || primaryLean || altLean)) return 'ideal';
  if (primaryLean || altLean) return 'compativel';
  if (role.base && alts.some((alt) => group.includes(alt))) return 'compativel';
  return 'alternativa';
}

// Persistência: uma função por vaga, ligada ao jogador que estava nela (se o jogador mudar, volta ao padrão)
type Saved = Partial<Record<Position, { role: string; player: string }>>;
const KEY = 'sfl7v7.roles.v1';
export const ROLES_EVENT = 'sfl-roles-changed';

export function loadRoles(): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
export function saveRole(slot: Position, player: Player, roleId: string) {
  try {
    const all = loadRoles();
    all[slot] = { role: roleId, player: player.id };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  window.dispatchEvent(new Event(ROLES_EVENT));
}
export function roleOf(slot: Position, player: Player | undefined, saved: Saved = loadRoles()): { role: Role; custom: boolean } {
  const entry = saved[slot];
  const role = entry && player && entry.player === player.id ? roleById(entry.role) : undefined;
  return role && role.sector === SECTOR_OF[slot] ? { role, custom: true } : { role: defaultRole(slot), custom: false };
}
