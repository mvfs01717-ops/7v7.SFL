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

// FOCO: complementa a função (muda prioridades de movimentação). Cada função só aceita os focos que fazem sentido para ela.
export type Focus = 'def' | 'bal' | 'off' | 'sup' | 'free';
export const FOCUS_LABEL: Record<Focus, string> = { def: 'Defensivo', bal: 'Equilibrado', off: 'Ofensivo', sup: 'Apoio', free: 'Liberdade' };
export const FOCUS_BY_ROLE: Record<string, Focus[]> = {
  'gk-trad': ['def', 'bal'], 'gk-build': ['bal', 'sup'], 'gk-libero': ['def', 'bal', 'free'],
  'df-build': ['def', 'bal', 'sup'], 'df-mark': ['def', 'bal'], 'df-anti': ['def', 'bal', 'free'], 'df-aggr': ['bal', 'off'],
  'mc-play': ['bal', 'off', 'sup', 'free'], 'mc-b2b': ['def', 'bal', 'off'], 'mc-hold': ['def', 'bal', 'sup'], 'mc-inf': ['bal', 'off', 'free'],
  'wg-wide': ['def', 'bal', 'off'], 'wg-inf': ['bal', 'off', 'free'], 'wg-play': ['bal', 'sup', 'free'], 'wg-bal': ['def', 'bal', 'off'],
  'at-fin': ['bal', 'off'], 'at-f9': ['bal', 'sup', 'free'], 'at-pivot': ['bal', 'sup', 'off'], 'at-mobile': ['bal', 'off', 'free'],
};
export const focusOptions = (roleId: string): Focus[] => FOCUS_BY_ROLE[roleId] ?? ['bal'];
export const cleanFocus = (roleId: string, value: unknown): Focus => (focusOptions(roleId).includes(value as Focus) ? (value as Focus) : 'bal');

export type Fit = 'ideal' | 'compativel' | 'alternativa';
export const FIT_LABEL: Record<Fit, string> = { ideal: 'Função ideal', compativel: 'Função compatível', alternativa: 'Função alternativa' };
export const FIT_TEXT: Record<Fit, string> = {
  ideal: 'O perfil de posições do jogador combina com a função.',
  compativel: 'O jogador consegue desempenhar bem a função.',
  alternativa: 'Pode atuar nela, mas não é a especialidade dele.',
};

// Usa só dados reais: posição principal e posições alternativas do jogador
export function roleFit(player: Player, slot: Position, role: Role): Fit {
  // Função cadastrada pelo administrador: avançado/especialista = ideal; básico = compatível
  const registered = (player as { role_mastery?: Record<string, { lv?: number }> | null }).role_mastery?.[role.id];
  if (registered) return registered.lv ? 'ideal' : 'compativel';
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
type Saved = Partial<Record<Position, { role: string; player: string; focus?: string }>>;
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
export function saveRole(slot: Position, player: Player, roleId: string, focus: Focus = 'bal') {
  try {
    const all = loadRoles();
    all[slot] = { role: roleId, player: player.id, focus: cleanFocus(roleId, focus) };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  window.dispatchEvent(new Event(ROLES_EVENT));
}
export function roleOf(slot: Position, player: Player | undefined, saved: Saved = loadRoles()): { role: Role; custom: boolean; focus: Focus } {
  const entry = saved[slot];
  const role = entry && player && entry.player === player.id ? roleById(entry.role) : undefined;
  if (role && role.sector === SECTOR_OF[slot]) {
    // Foco: o que o jogador escolheu; se nunca escolheu, o foco que o administrador cadastrou para essa função
    const registered = (player as { role_mastery?: Record<string, { focus?: string }> | null }).role_mastery?.[role.id]?.focus;
    return { role, custom: true, focus: cleanFocus(role.id, entry?.focus ?? registered) };
  }
  const base = defaultRole(slot);
  const registered = (player as { role_mastery?: Record<string, { focus?: string }> | null } | undefined)?.role_mastery?.[base.id]?.focus;
  return { role: base, custom: false, focus: cleanFocus(base.id, registered) };
}

// ---- Domínio das funções (cadastrado pelo administrador no banco: players.role_mastery) ----
export type Mastery = 0 | 1 | 2;
export type RoleEntry = { lv: Mastery; style?: string; focus?: Focus };
export type RoleMastery = Record<string, RoleEntry>;
export const MASTERY: { lv: Mastery; label: string; sym: string }[] = [
  { lv: 0, label: 'Básico', sym: '' },
  { lv: 1, label: 'Avançado', sym: '+' },
  { lv: 2, label: 'Especialista', sym: '++' },
];
export const SECTOR_ABBR: Record<Sector, string> = { GK: 'GOL', DEF: 'ZAG', MID: 'MC', WING: 'PONTA', ATT: 'ATA' };
export const ROLE_STYLES = ['Defender', 'Antecipar', 'Pressionar', 'Construir', 'Equilibrar', 'Criar jogadas', 'Abrir o campo', 'Infiltrar', 'Movimentar', 'Segurar a bola', 'Finalizar'];
export const DEFAULT_STYLE: Record<string, string> = {
  'gk-trad': 'Defender', 'gk-build': 'Construir', 'gk-libero': 'Antecipar',
  'df-build': 'Construir', 'df-mark': 'Defender', 'df-anti': 'Antecipar', 'df-aggr': 'Pressionar',
  'mc-play': 'Criar jogadas', 'mc-b2b': 'Equilibrar', 'mc-hold': 'Defender', 'mc-inf': 'Infiltrar',
  'wg-wide': 'Abrir o campo', 'wg-inf': 'Infiltrar', 'wg-play': 'Criar jogadas', 'wg-bal': 'Equilibrar',
  'at-fin': 'Finalizar', 'at-f9': 'Criar jogadas', 'at-pivot': 'Segurar a bola', 'at-mobile': 'Movimentar',
};

// Só funções dos setores em que o jogador realmente joga (posição principal + alternativas)
export function rolesForPositions(primary: Position, alternates: Position[] = []): Role[] {
  const sectors = new Set<Sector>([SECTOR_OF[primary], ...alternates.map((item) => SECTOR_OF[item])]);
  return ROLES.filter((role) => sectors.has(role.sector));
}

export function cleanMastery(raw: unknown, allowed?: Role[]): RoleMastery {
  const out: RoleMastery = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const role of allowed ?? ROLES) {
    const entry = (raw as Record<string, any>)[role.id];
    if (!entry || typeof entry !== 'object') continue;
    const lv = entry.lv === 1 || entry.lv === 2 ? entry.lv : 0;
    const style = typeof entry.style === 'string' && ROLE_STYLES.includes(entry.style) ? entry.style : undefined;
    const focus = focusOptions(role.id).includes(entry.focus) && entry.focus !== 'bal' ? (entry.focus as Focus) : undefined;
    out[role.id] = { lv, ...(style ? { style } : {}), ...(focus ? { focus } : {}) };
  }
  return out;
}

// Funções cadastradas do jogador, da maior para a menor especialidade
export function masteryList(player: Pick<Player, 'primary_position' | 'alternate_positions'> & { role_mastery?: unknown }): { role: Role; entry: RoleEntry }[] {
  const clean = cleanMastery(player.role_mastery, rolesForPositions(player.primary_position, player.alternate_positions));
  return ROLES.filter((role) => clean[role.id]).map((role) => ({ role, entry: clean[role.id] })).sort((a, b) => b.entry.lv - a.entry.lv);
}

// Etiqueta do Draft: "Defensor ++ · Defender · ZAG"
export function roleTag(player: Parameters<typeof masteryList>[0]) {
  const top = masteryList(player)[0];
  if (!top) return null;
  return {
    name: top.role.name,
    sym: MASTERY[top.entry.lv].sym,
    style: top.entry.style ?? DEFAULT_STYLE[top.role.id],
    sector: SECTOR_ABBR[top.role.sector],
  };
}
