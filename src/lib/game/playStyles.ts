// PlayStyles do 7v7: habilidades especiais por jogador (ouro = destaque ao lado da carta, prata = no verso). A FUNÇÃO diz o que o jogador faz em
// campo; o PLAYSTYLE diz o quão bem/de que jeito ele executa certas ações. Funções puras: a partida chama estas funções nos pontos de decisão.
// Nenhum estilo mexe em atributo, nenhum garante resultado, e os efeitos são atenuados por pressão, overall, cansaço e pela regra de acúmulo.
import type { Move, RC } from '@/lib/game/roleLevels';

export type PsGroup = 'ofensivo' | 'defensivo' | 'movimento' | 'especial' | 'goleiro';
export type PsTier = 'gold' | 'silver';
export type PsLv = 1 | 2 | 3; // 1 = Normal, 2 = +, 3 = ++
export type PsDef = { id: string; name: string; icon: string; group: PsGroup; text: string; lv: [string, string, string]; effect: string; defaultTier: PsTier };
export type PsEntry = { lv: 0 | 1 | 2; tier: PsTier };
export type PsRaw = Record<string, PsEntry>;
export type PSet = Record<string, PsLv>;

const d = (id: string, name: string, icon: string, group: PsGroup, text: string, lv: [string, string, string], effect: string, defaultTier: PsTier = 'silver'): PsDef => ({ id, name, icon, group, text, lv, effect, defaultTier });

export const PLAYSTYLES: PsDef[] = [
  // Ofensivos
  d('finalizacaoPrecisa', 'Finalização precisa', '🎯', 'ofensivo', 'Melhora a precisão das finalizações em situações favoráveis.', ['Chuta com mais precisão quando não está pressionado.', 'Escolhe melhor o momento: a precisão sobe quando há espaço.', 'Mantém a precisão mesmo com marcação leve e lê o ângulo.'], 'Chance de acertar o gol sobe até +6% (menos sob pressão).'),
  d('chutePotente', 'Chute potente', '💥', 'ofensivo', 'Aumenta a potência dos chutes sem quebrar a física.', ['Bola mais veloz no chute.', 'Bola ainda mais veloz e difícil de segurar.', 'Chute forte que o goleiro costuma soltar e o bloqueio dificulta.'], 'Bola até 9% mais veloz, rebote do goleiro até +35% e bloqueio até -15%.'),
  d('primeiroToque', 'Primeiro toque', '🧲', 'ofensivo', 'Melhora a qualidade do primeiro contato com a bola.', ['Domina melhor passes fortes.', 'Erra menos o domínio sob pressão e assenta mais rápido.', 'Domínio quase sempre limpo e já direcionado.'], 'Erro de domínio até -30%, controle até 18% mais rápido.'),
  d('passeCirurgico', 'Passe cirúrgico', '🎯', 'ofensivo', 'Aumenta a precisão dos passes a companheiros bem posicionados.', ['Passa com menos erro.', 'Identifica melhor o companheiro em melhores condições de receber.', 'Considera movimento, pressão e espaço futuro do companheiro.'], 'Erro de passe até -30% e preferência por receptor livre.', 'gold'),
  d('visaoDeJogo', 'Visão de jogo', '👁️', 'ofensivo', 'Melhora a identificação de oportunidades de passe e espaços.', ['Enxerga passes verticais livres.', 'Também lê a linha de passe livre.', 'Encontra o passe em espaço que o adversário ainda não fechou.'], 'Bônus em passes verticais com receptor livre e linha limpa.', 'gold'),
  d('driblador', 'Driblador', '🌀', 'ofensivo', 'Aprimora os dribles já existentes.', ['Dribles com mais chance de dar certo.', 'Dribla melhor sob pressão.', 'Domínio máximo do drible, sem ser infalível.'], 'Chance de vencer o drible até +5%.'),
  d('arranqueExplosivo', 'Arranque explosivo', '⚡', 'ofensivo', 'Melhora a aceleração quando há espaço para avançar.', ['Acelera mais com espaço à frente.', 'Arranca mais forte e mais cedo.', 'Arrancada decisiva quando vê o espaço.'], 'Velocidade até +8% quando há espaço livre à frente.'),
  d('bolaColocada', 'Bola colocada', '🏹', 'ofensivo', 'Melhora a execução de chutes colocados.', ['Chuta colocado com mais precisão.', 'Coloca a bola longe do alcance do goleiro.', 'Colocação refinada: o goleiro solta menos e erra mais o canto.'], 'Chutes colocados até +4% de acerto e com menos rebote.'),
  d('cabeceador', 'Cabeceador', '🦅', 'ofensivo', 'Melhora o posicionamento e a execução de disputas aéreas.', ['Disputa melhor bolas altas.', 'Antecipa melhor a queda da bola.', 'Disputa aérea forte, mas ainda depende do duelo.'], 'Chance na disputa aérea até +9%.'),
  d('pivoTecnico', 'Pivô técnico', '🧱', 'ofensivo', 'Melhora a proteção da bola e a capacidade de servir companheiros.', ['Protege melhor a bola de costas.', 'Devolve de primeira com mais frequência.', 'Segura o marcador e serve o companheiro que chega.'], 'Desarme sobre ele até -5% e preferência por passe curto sob pressão.'),
  // Defensivos
  d('desarmePreciso', 'Desarme preciso', '🦶', 'defensivo', 'Melhora a escolha do momento de desarmar.', ['Desarma com mais chance.', 'Escolhe melhor o bote.', 'Bote certeiro, sem faltar com o equilíbrio.'], 'Chance de ganhar o desarme até +5%.'),
  d('interceptador', 'Interceptador', '🧤', 'defensivo', 'Melhora a leitura de trajetórias e interceptações.', ['Corta mais passes.', 'Lê melhor a trajetória do passe.', 'Antecipa jogadas e monta a cobertura se a interceptação falhar.'], 'Chance de cortar passe até +30% e, no ++, cobertura se falhar.', 'gold'),
  d('bloqueador', 'Bloqueador', '🛑', 'defensivo', 'Melhora o posicionamento para bloquear chutes.', ['Bloqueia mais chutes.', 'Fecha a linha do chute com antecedência.', 'Se posiciona na linha do chute e bloqueia com frequência.'], 'Chance de bloquear até +45% e posição na linha do chute.'),
  d('marcacaoIntensa', 'Marcação intensa', '🔒', 'defensivo', 'Aumenta a consistência da pressão e do acompanhamento.', ['Marca mais colado.', 'Mantém a pressão por mais tempo.', 'Marcação grudada e consistente.'], 'Fica mais perto do marcado e pressiona mais rápido.'),
  d('recuperador', 'Recuperador', '🔁', 'defensivo', 'Melhora a reação e o reposicionamento depois de perder uma disputa.', ['Volta mais rápido ao jogo.', 'Reposiciona-se melhor.', 'Quase sempre volta na hora para a posição certa.'], 'Tempo caído após disputa perdida até -30% e recomposição mais rápida.'),
  d('leituraDefensiva', 'Leitura defensiva', '📖', 'defensivo', 'Identifica espaços perigosos e situações de risco.', ['Cobre o atacante livre mais perigoso.', 'Lê o espaço antes da bola chegar.', 'Fecha o espaço certo mesmo com a bola longe.'], 'Posiciona-se no atacante livre mais perigoso.'),
  d('dominanciaAerea', 'Dominância aérea', '🦾', 'defensivo', 'Melhora o posicionamento e a disputa por bolas aéreas.', ['Ganha mais bolas altas.', 'Chega mais cedo à queda da bola.', 'Domina a bola alta na defesa.'], 'Chance na disputa aérea defensiva até +10%.'),
  d('perseguidor', 'Perseguidor', '🐺', 'defensivo', 'Melhora o acompanhamento de adversários em movimento.', ['Acompanha o adversário que corre.', 'Antecipa a corrida do adversário.', 'Persegue sem se deixar passar.'], 'Mira o ponto à frente do adversário e corre mais forte atrás dele.'),
  // Movimentação
  d('desmarcacaoInteligente', 'Desmarcação inteligente', '🧭', 'movimento', 'Procura espaços livres para receber passes.', ['Procura o espaço livre.', 'Escolhe o espaço mais longe dos marcadores.', 'Encontra o espaço livre antes de o passe sair.'], 'Move-se para o ponto mais livre perto de onde joga.'),
  d('infiltracao', 'Infiltração', '🗡️', 'movimento', 'Ataca espaços atrás da defesa.', ['Ataca a profundidade de vez em quando.', 'Escolhe o momento da corrida.', 'Corre nas costas quando o portador está livre.'], 'Corre nas costas da defesa quando o portador não está pressionado.'),
  d('mobilidade', 'Mobilidade', '🔀', 'movimento', 'Varia os movimentos e não fica sempre na mesma região.', ['Troca de região.', 'Alterna zonas com mais frequência.', 'Imprevisível: muda de região em ciclos.'], 'Alterna lado e profundidade em ciclos próprios.'),
  d('apoioConstante', 'Apoio constante', '🤝', 'movimento', 'Oferece opções de passe ao portador.', ['Aparece perto do portador.', 'Escolhe o apoio livre.', 'Sempre uma opção segura.'], 'Fica numa opção livre a 55 a 85 px do portador.'),
  d('contraAtaque', 'Contra-ataque', '🚀', 'movimento', 'Reage rápido depois da recuperação da posse.', ['Sai correndo ao recuperar a bola.', 'Escolhe o corredor livre.', 'Já está no espaço quando o passe sai.'], 'Participa primeiro das corridas do contra-ataque.'),
  d('equilibrioTatico', 'Equilíbrio tático', '⚖️', 'movimento', 'Alterna entre apoiar o ataque e proteger a defesa.', ['Apoia ou protege.', 'Decide pelo momento do jogo.', 'Lê o ritmo (placar e momento) para avançar ou proteger.'], 'Avança ou recua conforme placar, tempo e momento.'),
  d('criadorDeEspaco', 'Criador de espaço', '🧩', 'movimento', 'Atrai a marcação e libera espaços aos companheiros.', ['Puxa o marcador para um lado.', 'Faz a isca quando o portador está livre.', 'Isca no tempo certo para abrir o espaço do companheiro.'], 'Corre para o lado oposto para arrastar o marcador.'),
  d('antecipacao', 'Antecipação', '⏱️', 'movimento', 'Reage melhor a mudanças da jogada e do movimento da bola.', ['Reage mais cedo.', 'Chega antes na bola solta.', 'Lê a mudança e já se move.'], 'Reação até 0,1 s mais rápida na segunda bola e saída antecipada no passe.'),
  // Especiais (raros)
  d('instintoGoleador', 'Instinto goleador', '🔥', 'especial', 'Identifica oportunidades de finalização em situações difíceis.', ['Chuta de situações mais difíceis.', 'Ataca o espaço do gol.', 'Aparece na hora certa para finalizar.'], 'Chuta de mais longe e perde menos precisão sob pressão.', 'gold'),
  d('maestro', 'Maestro', '🎼', 'especial', 'Melhora a organização de sequências de passes.', ['Passa melhor em sequência.', 'Mantém o time apoiado.', 'Distribui o jogo com critério.'], 'Menos erro de passe e passes curtos e verticais melhores.', 'gold'),
  d('muralha', 'Muralha', '🏰', 'especial', 'Prioriza bloqueios, coberturas e proteção de espaços.', ['Cobre espaços.', 'Bloqueia mais.', 'Fecha a defesa e cobre o companheiro.'], 'Bloqueio até +30% e cobertura mais firme.', 'gold'),
  d('decisivo', 'Decisivo', '🏆', 'especial', 'Melhora a tomada de decisão em momentos importantes, sem garantir resultado.', ['Erra menos em jogo apertado.', 'Decide melhor no fim.', 'Mantém a cabeça fria quando vale tudo.'], 'No fim de jogo equilibrado: menos erro e escolhas melhores.', 'gold'),
  // Goleiros
  d('gkReflexo', 'Reflexo rápido', '⚡', 'goleiro', 'Melhora a defesa em chutes de perto.', ['Defende mais chutes de perto.', 'Reage antes ao chute.', 'Reflexo de elite, mas não pega tudo.'], 'Chutes de perto: chance de gol até -6%.'),
  d('gkColocado', 'Defesa de chutes colocados', '🧤', 'goleiro', 'Melhora a defesa de chutes colocados.', ['Alcança mais o canto.', 'Lê o colocado.', 'Anula boa parte do colocado.'], 'Anula até 80% do bônus do chute colocado.'),
  d('gkPotente', 'Defesa de chutes potentes', '🛡️', 'goleiro', 'Melhora a defesa de chutes potentes.', ['Segura mais chutes fortes.', 'Solta menos.', 'Raramente solta o chute forte.'], 'Reduz o rebote e a vantagem do chute potente.'),
  d('gkSaida', 'Saída do gol', '🏃', 'goleiro', 'Sai para cortar bolas nas costas da defesa.', ['Corta algumas bolas nas costas.', 'Sai com critério.', 'Varre bem as costas da defesa.'], 'Chance de cortar passe nas costas até 18% (ligada à função).'),
  d('gkArea', 'Controle da área', '📦', 'goleiro', 'Domina a área em cruzamentos e bolas altas.', ['Fica com algumas bolas altas.', 'Antecipa o cruzamento.', 'Domina a área.'], 'Chance de ficar com cruzamento na área até 35%.'),
  d('gkDistribuicao', 'Distribuição precisa', '🎯', 'goleiro', 'Passes mais precisos para iniciar o jogo.', ['Passa melhor.', 'Escolhe o companheiro livre.', 'Distribui com precisão.'], 'Erro de passe até -30% e preferência por receptor livre.'),
  d('gkReposicao', 'Reposição rápida', '🔄', 'goleiro', 'Repõe a bola rápido depois de segurá-la.', ['Repõe mais rápido.', 'Aproveita a desorganização.', 'Contra-ataque a partir do goleiro.'], 'Decide mais cedo após segurar a bola e, no ++, inicia o contra-ataque.'),
  d('gkLeitura', 'Leitura de finalizações', '🔍', 'goleiro', 'Antecipa a direção das finalizações.', ['Lê o chute.', 'Posiciona-se melhor.', 'Quase sempre no canto certo.'], 'Menos chance de gol e melhor posição.'),
  d('gkUmContraUm', 'Defesa em um contra um', '⚔️', 'goleiro', 'Melhora a defesa quando o atacante está sozinho.', ['Fecha melhor o um contra um.', 'Sai na hora certa.', 'Domínio do um contra um.'], 'Atacante sozinho: chance de gol até -10%.'),
];
export const PS_BY_ID: Record<string, PsDef> = Object.fromEntries(PLAYSTYLES.map((p) => [p.id, p]));
export const PS_GROUP_LABEL: Record<PsGroup, string> = { ofensivo: 'Ofensivos', defensivo: 'Defensivos', movimento: 'Movimentação', especial: 'Especiais', goleiro: 'Goleiros' };
export const TAG_ID: Record<string, string> = {
  'sai-no-contra-ataque': 'contraAtaque', 'isca-para-abrir-espaco': 'criadorDeEspaco', 'ataca-a-profundidade': 'infiltracao', 'desmarca-no-espaco-livre': 'desmarcacaoInteligente',
  'oferece-apoio': 'apoioConstante', 'protege-a-defesa': 'equilibrioTatico', 'apoia-o-ataque': 'equilibrioTatico', 'troca-de-regiao': 'mobilidade', 'apoia-a-sequencia': 'maestro',
  'cobre-o-companheiro': 'muralha', 'protege-o-espaco': 'muralha', 'fecha-a-linha-do-chute': 'bloqueador', 'cobre-o-atacante-livre': 'leituraDefensiva', 'persegue-o-adversario': 'perseguidor',
  'marcacao-grudada': 'marcacaoIntensa', 'recompoe-rapido': 'recuperador', 'recompoe-o-equilibrio': 'equilibrioTatico',
};
export const PS_LV_LABEL = ['Normal', '+', '++'] as const;

// ---------- Compatibilidade ----------
// Conflitos: comportamentos que se atrapalham (o de maior nível vence; empate: o primeiro cadastrado). Sinergias: se complementam (+10% nos dois).
const CONFLICTS: [string, string][] = [
  ['apoioConstante', 'infiltracao'],
  ['apoioConstante', 'mobilidade'],
  ['apoioConstante', 'criadorDeEspaco'],
  ['infiltracao', 'equilibrioTatico'],
  ['marcacaoIntensa', 'leituraDefensiva'],
  ['perseguidor', 'leituraDefensiva'],
  ['chutePotente', 'bolaColocada'],
  ['muralha', 'perseguidor'],
  ['equilibrioTatico', 'contraAtaque'],
];
const SYNERGY: [string, string][] = [
  ['passeCirurgico', 'visaoDeJogo'],
  ['maestro', 'passeCirurgico'],
  ['maestro', 'visaoDeJogo'],
  ['interceptador', 'leituraDefensiva'],
  ['desarmePreciso', 'marcacaoIntensa'],
  ['infiltracao', 'arranqueExplosivo'],
  ['finalizacaoPrecisa', 'instintoGoleador'],
  ['primeiroToque', 'driblador'],
  ['bloqueador', 'muralha'],
  ['contraAtaque', 'arranqueExplosivo'],
  ['criadorDeEspaco', 'desmarcacaoInteligente'],
  ['cabeceador', 'dominanciaAerea'],
];
export const MAX_STYLES = 6;
export function conflictsOf(id: string): string[] {
  return CONFLICTS.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
}
export function synergiesOf(id: string): string[] {
  return SYNERGY.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
}

// ---------- Leitura e limpeza ----------
export function cleanStyles(raw: unknown, isGK?: boolean): PsRaw {
  const out: PsRaw = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of PLAYSTYLES) {
    const e = (raw as Record<string, any>)[def.id];
    if (!e || typeof e !== 'object') continue;
    if (isGK !== undefined && (def.group === 'goleiro') !== isGK) continue;
    out[def.id] = { lv: e.lv === 2 ? 2 : e.lv === 1 ? 1 : 0, tier: e.tier === 'gold' ? 'gold' : e.tier === 'silver' ? 'silver' : def.defaultTier };
  }
  return out;
}
// Conjunto efetivo para a partida: aplica conflitos e o limite de estilos. Quem tem muitos estilos tem cada efeito atenuado (acúmulo controlado).
export function resolveStyles(raw: unknown, isGK: boolean): PSet {
  const clean = cleanStyles(raw, isGK);
  const ids = Object.keys(clean);
  const drop = new Set<string>();
  for (const [a, b] of CONFLICTS) {
    if (!clean[a] || !clean[b] || drop.has(a) || drop.has(b)) continue;
    drop.add(clean[a].lv >= clean[b].lv && ids.indexOf(a) <= ids.indexOf(b) ? b : clean[a].lv > clean[b].lv ? b : a);
  }
  const kept = ids.filter((i) => !drop.has(i)).slice(0, MAX_STYLES);
  const out: PSet = {};
  kept.forEach((i) => { out[i] = (clean[i].lv + 1) as PsLv; });
  return out;
}
export const hasStyles = (s: PSet | undefined): boolean => !!s && Object.keys(s).length > 0;
// Atenuação por quantidade: até 3 estilos valem 100%; depois cada um vale menos (nunca soma descontrolada)
const damp = (s: PSet): number => {
  const n = Object.keys(s).length;
  return n <= 3 ? 1 : 3 / n;
};
// Força do estilo, de 0 a 1 (Normal 0,55; + 0,8; ++ 1), atenuada e com bônus de 10% por sinergia presente
const K = [0, 0.55, 0.8, 1];
export function kOf(s: PSet | undefined, id: string): number {
  if (!s || !s[id]) return 0;
  let k = K[s[id]] * damp(s);
  if (synergiesOf(id).some((o) => s[o])) k *= 1.1;
  return Math.min(1, k);
}
const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- Efeitos nas ações ----------
export type ShotCtx = { pressure: number; toGoal: number; alone: boolean; placed: boolean };
// Resultado do chute: ajuste da chance de acertar o gol, velocidade da bola, rebote do goleiro e chance de bloqueio (multiplicadores)
export function shotMods(shooter: PSet | undefined, gk: PSet | undefined, c: ShotCtx): { onTarget: number; speed: number; rebound: number; block: number } {
  let on = 0;
  let speed = 1;
  let reb = 1;
  let blk = 1;
  const fav = 1 - c.pressure * 0.8;
  on += kOf(shooter, 'finalizacaoPrecisa') * 0.06 * fav;
  on += kOf(shooter, 'instintoGoleador') * 0.04 * (0.5 + 0.5 * c.pressure);
  if (c.placed) on += (kOf(shooter, 'bolaColocada') * 0.04 + kOf(shooter, 'finalizacaoPrecisa') * 0.01) * fav;
  on += kOf(shooter, 'decisivo') * 0.015;
  const pw = kOf(shooter, 'chutePotente');
  if (pw) {
    speed *= 1 - 0.09 * pw;
    reb *= 1 + 0.35 * pw;
    blk *= 1 - 0.15 * pw;
  }
  if (c.placed) reb *= 1 - kOf(shooter, 'bolaColocada') * 0.2;
  // Goleiro
  const placedCut = c.placed ? 0.8 * kOf(gk, 'gkColocado') : 0;
  on -= placedCut * (kOf(shooter, 'bolaColocada') * 0.04);
  if (c.placed) on -= kOf(gk, 'gkColocado') * 0.02;
  if (c.toGoal < 150) on -= kOf(gk, 'gkReflexo') * 0.06;
  if (c.alone) on -= kOf(gk, 'gkUmContraUm') * 0.1;
  on -= kOf(gk, 'gkLeitura') * 0.04;
  const gp = kOf(gk, 'gkPotente');
  if (gp) {
    reb *= 1 - 0.25 * gp;
    speed += 0.06 * gp * (pw ? 1 : 0);
  }
  return { onTarget: on, speed: cl(speed, 0.85, 1.06), rebound: cl(reb, 0.4, 1.5), block: blk };
}
// Alcance de chute: o instinto goleador chuta de mais longe (px extras)
export const shotRangeBonus = (s: PSet | undefined): number => kOf(s, 'instintoGoleador') * 30;

// Passe: erro, e bônus de escolha do receptor (livre, vertical, linha limpa, movimento). free = distância do receptor ao adversário mais perto.
export function passErrMul(passer: PSet | undefined, clutch = false): number {
  let m = 1;
  m *= 1 - kOf(passer, 'passeCirurgico') * 0.3;
  m *= 1 - kOf(passer, 'maestro') * 0.12;
  m *= 1 - kOf(passer, 'gkDistribuicao') * 0.3;
  if (clutch) m *= 1 - kOf(passer, 'decisivo') * 0.15;
  return Math.max(0.35, m);
}
export type PassCand = { free: number; fwd: number; laneOpen: boolean; mv: number; dist: number; pressured: boolean };
export function passBiasStyle(passer: PSet | undefined, c: PassCand, clutch = false): number {
  let b = 0;
  const free = cl((c.free - 45) / 60, 0, 1);
  b += kOf(passer, 'passeCirurgico') * 0.25 * free;
  b += kOf(passer, 'passeCirurgico') * 0.15 * cl(c.mv, 0, 1) * free * (passer && passer.passeCirurgico === 3 ? 1 : 0);
  b += kOf(passer, 'gkDistribuicao') * 0.2 * free;
  if (c.fwd > 0.5 && c.free > 70) b += kOf(passer, 'visaoDeJogo') * 0.2 + (c.laneOpen ? kOf(passer, 'visaoDeJogo') * 0.12 * (passer && passer.visaoDeJogo >= 2 ? 1 : 0) : 0);
  b += kOf(passer, 'maestro') * 0.1 * (c.dist < 140 ? 1 : 0.4) + kOf(passer, 'maestro') * 0.06 * cl(c.fwd, 0, 1);
  if (c.pressured && c.dist < 120) b += kOf(passer, 'pivoTecnico') * 0.14;
  if (clutch) b += kOf(passer, 'decisivo') * 0.1 * free;
  return b;
}
// Domínio
export function contactMods(r: PSet | undefined): { cons: number; hold: number } {
  const k = kOf(r, 'primeiroToque');
  return { cons: 1 - k * 0.3, hold: 1 - k * 0.18 };
}
export const dribbleChanceMod = (s: PSet | undefined, pressure: number): number => kOf(s, 'driblador') * (0.04 + 0.01 * pressure);
export const tackleStyleMod = (def: PSet | undefined, holder: PSet | undefined): number => kOf(def, 'desarmePreciso') * 0.05 + kOf(def, 'muralha') * 0.01 - kOf(holder, 'pivoTecnico') * 0.05;
export function laneStyle(def: PSet | undefined): { cut: number; read: number; cover: boolean } {
  const k = kOf(def, 'interceptador');
  return { cut: 1 + k * 0.3, read: k * (def && def.interceptador === 3 ? 0.04 : 0), cover: !!def && def.interceptador === 3 };
}
export const blockStyle = (def: PSet | undefined): number => 1 + kOf(def, 'bloqueador') * 0.45 + kOf(def, 'muralha') * 0.3;
// Disputa aérea (bola alta): bônus de quem ataca a bola
export const aerialBonus = (s: PSet | undefined): number => kOf(s, 'cabeceador') * 0.09 + kOf(s, 'dominanciaAerea') * 0.1 + kOf(s, 'gkArea') * 0.0;
export const gkClaim = (s: PSet | undefined): number => kOf(s, 'gkArea') * 0.35;
export const gkSweep = (s: PSet | undefined): number => kOf(s, 'gkSaida') * 0.18;
export const stumbleMul = (s: PSet | undefined): number => 1 - kOf(s, 'recuperador') * 0.3;
export const reactBonus = (s: PSet | undefined): number => kOf(s, 'antecipacao') * 0.1 + kOf(s, 'recuperador') * 0.02;
export const burstMul = (s: PSet | undefined, space: boolean): number => (space ? 1 + kOf(s, 'arranqueExplosivo') * 0.08 : 1);
export const gkQuick = (s: PSet | undefined): { delay: number; counter: boolean } => ({ delay: 1 - kOf(s, 'gkReposicao') * 0.5, counter: !!s && s.gkReposicao === 3 });

// ---------- Movimentação ----------
// Devolve UMA movimentação (prioridade fixa por situação) para não haver estilos puxando em direções opostas a cada quadro.
const cl2 = cl;
function freeSpot(c: RC, cx: number, cy: number, R: number): { x: number; y: number; gap: number } {
  let best = { x: cx, y: cy, gap: 0 };
  let bs = -1e9;
  for (let k = 0; k < 9; k += 1) {
    const a = (k * Math.PI) / 4;
    const px = cl2(k === 8 ? cx : cx + Math.cos(a) * R, c.x0 + 12, c.x1 - 12);
    const py = cl2(k === 8 ? cy : cy + Math.sin(a) * R, c.y0 + 12, c.y1 - 12);
    let m = 90;
    for (const o of c.opps) m = Math.min(m, Math.hypot(o.x - px, o.y - py));
    const s = m - 0.25 * Math.hypot(px - cx, py - cy);
    if (s > bs) {
      bs = s;
      best = { x: px, y: py, gap: m };
    }
  }
  return best;
}
export function styleMove(s: PSet, c: RC, counterOn: boolean): Move | null {
  const sc = (0.7 + 0.3 * cl2((c.self.ovr - 55) / 40, 0, 1)) * (1 - 0.35 * c.tired);
  const h = c.holder && c.holder.key !== c.self.key ? c.holder : undefined;
  const mk = (x: number, y: number, w: number, tag: string, speed?: number): Move => ({ x: cl2(x, c.x0 + 12, c.x1 - 12), y: cl2(y, c.y0 + 12, c.y1 - 12), w: cl2(w * sc, 0, 0.8), tag, speed });
  const cyc = (p: number) => (c.t / p + c.seed) % 1;
  const oppLine = c.opps.length ? (c.d > 0 ? Math.max(...c.opps.map((o) => o.x)) : Math.min(...c.opps.map((o) => o.x))) : c.oppGX;
  if (c.own) {
    if (counterOn && kOf(s, 'contraAtaque')) {
      const k = kOf(s, 'contraAtaque');
      return mk(c.self.x + c.d * (120 + 80 * k), cl2(c.midY + (c.self.y - c.midY) * 0.8, c.y0 + 30, c.y1 - 30), 0.6 + 0.2 * k, 'sai-no-contra-ataque', 1.4);
    }
    if (!h) return null;
    const k1 = kOf(s, 'criadorDeEspaco');
    if (k1 && (c.holderPressure < 0.55 || s.criadorDeEspaco === 3) && c.prog > 0.35 && cyc(5) < 0.5) {
      return mk(h.x + c.d * 40, c.midY - Math.sign(h.y - c.midY || 1) * 95 * (0.6 + 0.4 * k1), 0.5 * (0.6 + 0.4 * k1), 'isca-para-abrir-espaco');
    }
    const k2 = kOf(s, 'infiltracao');
    if (k2 && c.holderPressure < 0.5 && c.prog > 0.4 && cyc(3 + 2 * (1 - k2)) < 0.55) return mk(oppLine + c.d * 16, c.midY + (c.self.y - c.midY) * 0.6, 0.55 + 0.15 * k2, 'ataca-a-profundidade', 1.2);
    const k3 = kOf(s, 'desmarcacaoInteligente');
    if (k3) {
      const sp = freeSpot(c, c.self.x, c.self.y, 55 + 25 * k3);
      if (sp.gap > 40) return mk(sp.x, sp.y, 0.4 + 0.2 * k3, 'desmarca-no-espaco-livre');
    }
    const k4 = kOf(s, 'apoioConstante');
    if (k4) {
      const sp = freeSpot(c, h.x - c.d * 55, h.y + (Math.sign(c.midY - h.y) || 1) * 55, 40);
      return mk(sp.x, sp.y, 0.4 + 0.2 * k4, 'oferece-apoio');
    }
    const k5 = kOf(s, 'equilibrioTatico');
    if (k5) {
      const tempo = c.mom * 0.5 + c.u * 0.5 + (c.prog - 0.5);
      return tempo < -0.1 ? mk(c.ownGX + (c.ball.x - c.ownGX) * 0.45, c.self.y, 0.45 * k5 + 0.1, 'protege-a-defesa') : tempo > 0.1 ? mk(h.x + c.d * 60, c.self.y, 0.4 * k5 + 0.1, 'apoia-o-ataque') : null;
    }
    const k6 = kOf(s, 'mobilidade');
    if (k6) {
      const ph = Math.sin(c.t * (0.5 + 0.5 * c.seed) + c.seed * 9);
      return mk(c.self.x + c.d * 25 * ph, cl2(c.self.y + 70 * k6 * Math.cos(c.t * 0.6 + c.seed * 7), c.y0 + 30, c.y1 - 30), 0.35 + 0.15 * k6, 'troca-de-regiao');
    }
    const k7 = kOf(s, 'maestro');
    if (k7 && c.holderPressure > 0.3) return mk(h.x - c.d * 60, h.y + (Math.sign(c.midY - h.y) || 1) * 50, 0.35 * k7 + 0.1, 'apoia-a-sequencia');
    return null;
  }
  // Sem a bola
  if (h) {
    const km = kOf(s, 'muralha');
    if (km) {
      const defs = c.mates.filter((m) => m.pos === 'LB' || m.pos === 'RB');
      const pressing = defs.filter((m) => Math.hypot(m.x - h.x, m.y - h.y) < 120)[0];
      if (pressing) return mk(pressing.x - c.d * 55, pressing.y + (c.midY - pressing.y) * 0.4, 0.4 + 0.2 * km, 'cobre-o-companheiro');
      return mk(c.ownGX + c.d * 85, c.midY + (h.y - c.midY) * 0.45, 0.3 + 0.15 * km, 'protege-o-espaco');
    }
    const kb = kOf(s, 'bloqueador');
    if (kb && Math.abs(h.x - c.ownGX) < 330) return mk(h.x + (c.ownGX - h.x) * 0.3, h.y + (c.midY - h.y) * 0.3, 0.35 + 0.25 * kb, 'fecha-a-linha-do-chute');
    const kl = kOf(s, 'leituraDefensiva');
    if (kl) {
      let tgt: { x: number; y: number } | null = null;
      let best = -1e9;
      for (const o of c.opps) {
        if (o.key === h.key) continue;
        const free = Math.min(90, c.mates.reduce((m, q) => Math.min(m, Math.hypot(q.x - o.x, q.y - o.y)), 999));
        const sc2 = free - Math.abs(o.x - c.ownGX) * 0.2;
        if (sc2 > best) {
          best = sc2;
          tgt = o;
        }
      }
      if (tgt) return mk(tgt.x - c.d * 32, tgt.y, 0.35 + 0.2 * kl, 'cobre-o-atacante-livre');
    }
  }
  const mo = c.markOpp;
  if (mo) {
    const kp = kOf(s, 'perseguidor');
    if (kp) return mk(mo.x + (mo.vx ?? 0) * 0.5 * kp - c.d * 16, mo.y + (mo.vy ?? 0) * 0.5 * kp, 0.45 + 0.2 * kp, 'persegue-o-adversario', 1.1 + 0.1 * kp);
    const ki = kOf(s, 'marcacaoIntensa');
    if (ki) return mk(mo.x - c.d * 20, mo.y, 0.4 + 0.25 * ki, 'marcacao-grudada', 1 + 0.12 * ki);
  }
  const kr = kOf(s, 'recuperador');
  if (kr && c.prog < 0.55) return mk(c.ownGX + (c.ball.x - c.ownGX) * 0.5, c.self.y, 0.3 + 0.2 * kr, 'recompoe-rapido', 1.1);
  const ke = kOf(s, 'equilibrioTatico');
  if (ke && c.prog < 0.5) return mk(c.ownGX + (c.ball.x - c.ownGX) * 0.45, c.midY + (c.ball.y - c.midY) * 0.4, 0.35 * ke + 0.1, 'recompoe-o-equilibrio');
  return null;
}
