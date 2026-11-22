// Biblioteca de animações do 7v7: registro com metadados, ligar/desligar, velocidade e contagem de uso.
// Só entram aqui animações que JÁ estão conectadas à partida (campo: MatchPitch). Cada item diz onde e quando é executado.
import { GAITS, type Gait } from '@/lib/game/locomotion';
import { DRIBBLE_MOVES, type DribbleMove } from '@/lib/game/dribbles';

export type AnimCategory = 'locomocao' | 'drible' | 'passe' | 'finalizacao' | 'dominio' | 'defesa' | 'ia';
export const CATEGORY_LABEL: Record<AnimCategory, string> = { locomocao: 'Movimentação (discos)', drible: 'Dribles', dominio: 'Domínio e primeiro toque', passe: 'Passes', finalizacao: 'Finalizações', defesa: 'Defesa e goleiro', ia: 'Jogabilidade emergente' };

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

type DDef = Omit<AnimDef, 'id' | 'category'>;
const dd = (label: string, when: string, dur: number, body: string, ball: string, next: string[], needs: string, roles: string, prep = ''): DDef => ({
  type: 'drible', label, when, dur, body: prep ? `${prep} ${body}` : body, ball, next, interrupt: 'Se o marcador desarma, a jogada acaba e a posse muda', needs, roles,
});
const DRIBBLE_DEF: Record<DribbleMove, DDef> = {
  finta: dd('Finta de corpo simulada', 'Marcador à frente; escolha padrão', 740, 'balanço do disco para um lado e saída pelo outro', 'Bola balança junto ao disco e sai pelo lado da arrancada', ['aceleracao', 'direcao'], 'Sem exigência', 'Todas', 'Preparação: aproxima do marcador.'),
  pedalada: dd('Pedalada simples', 'Marcador à frente, pouca pressão, jogador técnico', 810, 'disco oscila uma vez de um lado a outro, depois sai por fora', 'Bola circula no lado do engano e acompanha a saída', ['aceleracao', 'corte'], 'Overall ≥ 78 (abaixo disso erra mais)', 'Pontas (wg-inf, wg-wide), meias criativos', 'Preparação: reduz o ritmo diante do marcador.'),
  pedaladaDupla: dd('Pedalada dupla', 'Marcador próximo, jogador muito técnico', 1000, 'duas oscilações em sequência, uma para cada lado, e saída pelo lado aberto', 'Bola oscila junto ao disco nas duas fintas', ['aceleracao', 'velocidade'], 'Overall ≥ 83', 'Pontas e meias criativos', 'Preparação: para de frente ao marcador.'),
  corte: dd('Corte seco', 'Jogador aberto, perto da linha lateral', 560, 'finge para um lado e corta bruscamente para o outro', 'Bola muda de lado num toque', ['aceleracao', 'velocidade'], 'Overall ≥ 70', 'Pontas e laterais'),
  corteDentro: dd('Corte para dentro', 'Marcador pelo lado de fora; escape para o meio do campo', 550, 'finge a linha de fundo e fecha para dentro', 'Bola acompanha o corte em diagonal ao gol', ['fintaChute', 'aceleracao'], 'Sem exigência', 'Pontas (wg-inf, at-fin)', 'Preparação: leve toque para o lado de fora.'),
  corteFora: dd('Corte para fora', 'Marcador pelo lado de dentro; escape para a lateral', 550, 'finge o meio e abre para a linha lateral', 'Bola acompanha o corte para o lado', ['aceleracao', 'velocidade'], 'Sem exigência', 'Pontas e laterais (wg-wide)', 'Preparação: toque curto para dentro.'),
  corteExplosivo: dd('Corte explosivo', 'Espaço livre à frente e marcador próximo', 430, 'apoio curto (disco se comprime) e explosão diagonal em velocidade máxima', 'Bola vai à frente no momento da explosão', ['velocidade'], 'Overall ≥ 80', 'Pontas e atacantes móveis', 'Preparação: planta o disco.'),
  caneta: dd('Caneta', 'Marcador a 16–60 px e espaço livre atrás dele, sem outro adversário perto', 750, 'avança quase em linha reta contra o marcador', 'Bola passa entre as pernas do marcador e o disco a recupera atrás dele', ['aceleracao'], 'Overall ≥ 80; só existe com espaço real atrás do marcador', 'Pontas e meias criativos (wg-inf, mc-inf)'),
  giro: dd('Giro de 360°', 'Marcador colado, pressão alta', 840, 'disco gira uma volta completa protegendo a bola', 'Bola fica do lado oposto ao marcador', ['aceleracao', 'protecao'], 'Overall ≥ 80', 'Pivôs e meias (at-pivot, mc-play)'),
  giro180: dd('Giro de 180°', 'Pressão alta; escapa para trás/lado mantendo a posse', 830, 'disco gira meia volta de costas para o marcador e sai na direção oposta', 'Bola protegida no lado oposto ao marcador; a jogada recua para reorganizar', ['recomeco', 'direcao'], 'Overall ≥ 76', 'Pivôs, volantes e zagueiros construtores'),
  direcao: dd('Finta de direção', 'Pouco espaço à frente', 800, 'mostra uma direção, inclina para um lado e sai pelo oposto', 'Bola acompanha a mudança', ['aceleracao', 'curto'], 'Overall ≥ 70', 'Atacantes móveis e meias'),
  puxada: dd('Puxada para trás', 'Marcador a menos de 45 px, vindo de frente', 630, 'disco recua e comprime; o marcador se projeta e o disco sai pelo lado', 'Bola é puxada para trás junto ao disco', ['direcao', 'aceleracao'], 'Overall ≥ 72', 'Pivôs, atacantes de referência'),
  zigzag: dd('Zigue-zague', 'Espaço à frente e marcador próximo', 860, 'dois deslocamentos laterais alternados avançando e saída pelo lado oposto', 'Bola acompanha cada mudança de lado', ['aceleracao'], 'Overall ≥ 76', 'Pontas e atacantes móveis'),
  sequencia: dd('Mudança de direção em sequência', 'Pouco espaço, marcador colado', 870, 'três mudanças de direção curtas e rápidas e saída', 'Bola presa ao disco em toques curtos', ['aceleracao'], 'Overall ≥ 80', 'Meias criativos e pontas'),
  mudRitmo: dd('Mudança de ritmo', 'Espaço livre à frente, pouca pressão', 820, 'quase para (ritmo lento) e arranca em seguida', 'Bola ao pé durante a pausa e empurrada na arrancada', ['velocidade', 'corteExplosivo'], 'Overall ≥ 74', 'Pontas, box-to-box e atacantes móveis'),
  elastico: dd('Elástico', 'Marcador próximo; jogador muito técnico', 430, 'mostra uma direção e inverte rapidamente para a outra', 'Bola se estica para o lado do engano e volta com o disco', ['aceleracao', 'velocidade'], 'Overall ≥ 82', 'Pontas e meias criativos', 'Preparação: ombro para o lado falso.'),
  elasticoReverso: dd('Elástico reverso', 'Marcador próximo; jogador de elite', 440, 'vai primeiro para o lado de escape e inverte, passando pelo lado contrário do marcador', 'Bola se estica e volta; o marcador é puxado para o lado errado', ['aceleracao'], 'Overall ≥ 85', 'Pontas e meias criativos (wg-inf, mc-inf)'),
  fintaChute: dd('Finta de chute', 'Perto do gol e de frente, marcador a menos de 75 px', 820, 'disco recua e comprime como num chute; o marcador se joga e o disco sai pelo lado', 'Bola recua levemente e sai pelo lado livre', ['direcao', 'aceleracao'], 'Overall ≥ 78', 'Atacantes (at-fin, at-f9)'),
  fintaPasse: dd('Finta de passe', 'Existe companheiro livre à frente e marcador próximo', 830, 'disco olha para o corredor de passe, o marcador escorrega para esse lado e o disco sai pelo outro', 'Bola desloca para o lado do passe fingido', ['aceleracao'], 'Overall ≥ 76', 'Meias e pontas criadores (mc-play, wg-play)'),
  protecao: dd('Proteção de bola', 'Pressão alta e jogador forte de costas', 760, 'disco inclinado e largo entre o marcador e a bola', 'Bola no lado oposto ao marcador', ['giro', 'direcao', 'giro180'], 'Sem exigência', 'Pivôs e volantes (at-pivot, mc-hold)'),
  aceleracao: dd('Aceleração', 'Espaço livre à frente, pouca pressão', 580, 'disco estica e acelera passando por fora', 'Bola empurrada à frente', ['velocidade'], 'Sem exigência', 'Pontas e box-to-box (wg-wide, mc-b2b)'),
  curto: dd('Drible curto', 'Marcador perto, espaço apertado', 740, 'toques curtos e rápidos, o disco vibra', 'Bola colada ao disco', ['direcao', 'finta'], 'Sem exigência', 'Meias (mc-play, wg-play)'),
  velocidade: dd('Drible em velocidade', 'Longe do gol, muito espaço, sem pressão', 900, 'corrida longa em velocidade máxima passando por fora', 'Bola em toques longos', ['finta'], 'Overall ≥ 74', 'Pontas e atacantes móveis'),
};

const FX_DEF: { id: string; category: AnimCategory; label: string; type: string; when: string; dur: number; body: string; ball: string; next: string[]; interrupt: string; needs: string; roles: string }[] = [
  { id: 'fx.touch', category: 'dominio', label: 'Amortecimento no domínio', type: 'domínio', when: 'Todo passe ou bola que chega ao jogador', dur: 320, body: 'Disco comprime no eixo da bola e cede um pouco, depois volta', ball: 'A bola passa a acompanhar o disco; passes fortes amortecem mais', next: ['loc.arrancada', 'dri.giro', 'fx.pass'], interrupt: 'Dribles e desarmes têm prioridade sobre a pose', needs: 'Nenhum (força do passe muda a intensidade)', roles: 'Todas' },
  { id: 'fx.pass', category: 'passe', label: 'Contato e impulso do passe', type: 'passe', when: 'Todo passe', dur: 240, body: 'Recuo curto e avanço do disco na direção do passe; anel de impacto nos passes fortes', ball: 'A bola sai na direção do avanço, com trajetória e arco do passe', next: ['fx.touch'], interrupt: 'Dribles e desarmes têm prioridade sobre a pose', needs: 'Nenhum', roles: 'Todas' },
  { id: 'fx.shot', category: 'finalizacao', label: 'Preparação e impacto do chute', type: 'finalização', when: 'Todo chute de um jogador de linha', dur: 450, body: 'Preparação: disco recua e comprime por 150 ms com a bola parada. Contato: avanço forte, esticada e clarão', ball: 'A bola só sai depois da preparação; chutes mais rápidos têm impacto maior e mais rastro', next: ['fx.save', 'fx.touch'], interrupt: 'Se o chute for desligado aqui, sai sem preparação', needs: 'Nenhum (a duração do chute define a força)', roles: 'Todas' },
  { id: 'fx.save', category: 'defesa', label: 'Impacto da defesa do goleiro', type: 'defesa', when: 'Chute que chega ao goleiro', dur: 380, body: 'Goleiro absorve o impacto: comprime e cede, com anel azul e clarão', ball: 'A bola passa a ficar com o goleiro', next: ['fx.pass'], interrupt: 'Livre', needs: 'Nenhum', roles: 'Goleiros (tradicional, construtor e líbero)' },
  { id: 'dom.amortecimento', category: 'dominio', label: 'Amortecimento', type: 'domínio', when: 'Passe forte (rápido) que chega ao jogador', dur: 420, body: 'Disco comprime e cede; a bola passa do disco e perde velocidade até assentar', ball: 'A bola sobra à frente (12 a 26 px) e desacelera; a decisão seguinte demora mais, principalmente com overall baixo', next: ['dom.primeira', 'fx.pass'], interrupt: 'Desarme tem prioridade', needs: 'Passe com duração curta', roles: 'Todas' },
  { id: 'dom.orientado', category: 'dominio', label: 'Domínio orientado', type: 'domínio', when: 'Há espaço livre ao lado e/ou marcador perto', dur: 300, body: 'O primeiro toque leva a bola e o disco para o lado com mais espaço', ball: 'A bola sai deslocada para o espaço livre; o disco acompanha com arrancada curta e decide logo', next: ['loc.arrancada', 'dri.finta'], interrupt: 'Desarme tem prioridade', needs: 'Espaço livre de 62 px ou mais ao lado', roles: 'Todas; mais frequente com overall alto' },
  { id: 'dom.primeira', category: 'dominio', label: 'Domínio de primeira (toque único)', type: 'domínio', when: 'Jogo corrido, overall bom, chute ou companheiro livre à frente', dur: 120, body: 'Toque único com clarão: a bola nem assenta', ball: 'A decisão (passe ou chute) vem em ~30 ms, sem pausa para controlar', next: ['fx.shot', 'fx.pass'], interrupt: 'Desarme tem prioridade', needs: 'Overall médio ou alto, companheiro livre ou perto do gol', roles: 'Atacantes e meias' },
  { id: 'dom.erro', category: 'dominio', label: 'Erro de domínio e recuperação', type: 'domínio', when: 'Passe forte, marcador colado e overall baixo (só jogo corrido)', dur: 650, body: 'A bola escapa e o disco corre atrás dela', ball: 'A bola rola solta com atrito. Se o jogador alcança, recupera; se um adversário chega antes, rouba a posse', next: ['dom.recupera'], interrupt: 'Adversário que chega antes ganha a bola', needs: 'Só em passes de rotina; nunca nas jogadas do plano', roles: 'Todas; mais frequente com overall baixo' },
  { id: 'dom.protecao', category: 'dominio', label: 'Proteção da posse', type: 'domínio', when: 'Marcador colado no portador', dur: 520, body: 'O corpo fica entre a bola e o marcador; anel âmbar', ball: 'A bola passa para o lado oposto ao marcador; o desarme fica 10% mais difícil', next: ['dri.protecao', 'fx.pass'], interrupt: 'Termina quando o marcador se afasta', needs: 'Marcador a menos de 46 px', roles: 'Todas' },
  { id: 'dom.aereo', category: 'dominio', label: 'Domínio após bola aérea', type: 'domínio', when: 'Passe com arco (cruzamento, inversão, reposição)', dur: 520, body: 'A bola cai, quica e o disco a amortece em seguida', ball: 'A bola desce com quique e leva mais tempo para assentar', next: ['fx.pass'], interrupt: 'Desarme tem prioridade', needs: 'Passe com arco de 12 ou mais', roles: 'Todas' },
  { id: 'def.emPe', category: 'defesa', label: 'Desarme em pé', type: 'defesa', when: 'Marcador colado, de frente para o portador', dur: 260, body: 'O marcador dá o bote de frente e disputa a bola', ball: 'Quem tem overall maior leva vantagem; vencer devolve a bola ao marcador', next: ['fx.pass'], interrupt: 'Resultado imediato', needs: 'Marcador a menos de 30 px', roles: 'Todas as posições de campo' },
  { id: 'def.carrinho', category: 'defesa', label: 'Carrinho', type: 'defesa', when: 'Marcador por trás ou de lado, ou portador em velocidade', dur: 330, body: 'Disco desliza e estica no ataque à bola', ball: 'Bem encaixado (por trás e bola veloz) tem mais chance; mal encaixado deixa o marcador fora da jogada por mais tempo', next: ['fx.pass'], interrupt: 'Resultado imediato', needs: 'Marcador a menos de 30 px', roles: 'Todas as posições de campo' },
  { id: 'def.disputa', category: 'defesa', label: 'Disputa de bola (ombro a ombro)', type: 'defesa', when: 'Forças parecidas e portador devagar ou protegendo', dur: 360, body: 'Os dois discos se empurram no contato, com anel laranja', ball: 'A chance se aproxima de 50% entre os dois', next: ['fx.pass'], interrupt: 'Resultado imediato', needs: 'Diferença de overall de até 7', roles: 'Todas as posições de campo' },
  { id: 'def.linha', category: 'defesa', label: 'Fechamento da linha de passe', type: 'defesa', when: 'Adversário com a bola e outros atacantes livres', dur: 0, body: 'O marcador se posiciona entre a bola e o jogador que marca', ball: 'Passes de rotina que passam perto dele podem ser cortados; a bola para no ponto do corte', next: ['fx.touch'], interrupt: 'Muda quando a bola muda de lado', needs: 'Distância portador-marcado entre 70 e 340 px', roles: 'Todas as posições de campo' },
  { id: 'def.cobertura', category: 'defesa', label: 'Cobertura defensiva e pressão coordenada', type: 'defesa', when: 'Um companheiro pressiona e outro está perto da bola', dur: 0, body: 'O segundo defensor mais perto fecha atrás do que pressiona, do lado do gol', ball: 'Desarmes têm +4% de chance por cobertura por perto (até 2)', next: ['def.emPe'], interrupt: 'Termina quando a bola sai da zona', needs: 'Pressionador a menos de 240 px', roles: 'Todas as posições de campo' },
  { id: 'def.area', category: 'defesa', label: 'Proteção da área e recuo defensivo', type: 'defesa', when: 'Bola a menos de 240 px do próprio gol', dur: 0, body: 'Zagueiros e meio recuam e fecham o centro', ball: 'Menos espaço na frente do gol; a bola fica mais difícil de penetrar', next: ['def.emPe'], interrupt: 'Termina quando a bola se afasta', needs: 'Bola perto do gol', roles: 'ZAG e MC' },
  { id: 'ia.segundabola', category: 'ia', label: 'Segunda bola e rebote', type: 'inteligência', when: 'Rebote do goleiro, bola na trave, chute bloqueado, disputa que rebenta a bola', dur: 2600, body: 'Quem chega calcula onde a bola vai estar (atrito) e corre para lá, com tempo de reação pelo overall e cansaço; até 3 discos disputam', ball: 'A bola rola solta com atrito e quica nas bordas; o vencedor sai da chegada, do overall e de um pouco de acaso; a posse pode trocar', next: ['ia.contra', 'fx.touch'], interrupt: 'Termina quando alguém pega a bola', needs: 'Overall, velocidade, fôlego e posição de todos os discos', roles: 'Todos exceto goleiro' },
  { id: 'ia.bloqueio', category: 'ia', label: 'Chute bloqueado', type: 'inteligência', when: 'Chute de rotina com defensor perto da linha do chute (não colado no chutador)', dur: 420, body: 'O defensor se joga na linha e o disco recebe o impacto', ball: 'A bola desvia refletida pelo ângulo do contato e vira segunda bola; só em chutes de rotina, nunca no gol do plano', next: ['ia.segundabola'], interrupt: 'Chance depende da distância à linha e do overall', needs: 'Defensor a até 24 px da linha do chute', roles: 'Todas as posições de campo' },
  { id: 'ia.contra', category: 'ia', label: 'Contra-ataque', type: 'inteligência', when: 'Logo após recuperar a bola (desarme, interceptação, segunda bola)', dur: 900, body: 'O jogador lê espaço nas costas da defesa, adversários perto, companheiro livre e passe vertical; atacantes arrancam à frente', ball: 'Lançamento vertical ou condução rápida; se o campo está fechado, segura a posse e reorganiza', next: ['fx.pass', 'loc.arrancada'], interrupt: 'Só a primeira decisão após a recuperação', needs: 'Placar e tempo mudam a vontade de arriscar', roles: 'Todas as posições de campo' },
  { id: 'ia.adapta', category: 'ia', label: 'Adaptação por região', type: 'inteligência', when: 'O adversário insiste sempre pelo mesmo lado', dur: 0, body: 'A marcação desloca até 48 px para a faixa mais usada (esquerda, centro ou direita)', ball: 'Menos espaço na região favorita do adversário; só usa o que a simulação já mostrou (decai em ~22 s)', next: ['def.linha'], interrupt: 'Muda quando o adversário muda de lado', needs: 'Pelo menos 4 construções observadas', roles: 'Todas as posições de campo' },
  { id: 'ia.passeerrado', category: 'ia', label: 'Passe com erro de direção', type: 'inteligência', when: 'Passe de rotina com marcador perto, passe longo ou forte, overall baixo ou cansaço', dur: 0, body: 'O disco chuta com direção torta', ball: 'A bola sai desviada; se o desvio é pequeno o companheiro se estica para alcançar, se é grande a bola fica sem dono e vira segunda bola. Nunca nas jogadas do plano', next: ['ia.segundabola', 'def.linha'], interrupt: 'Chance de 1% a 28% conforme pressão, distância, força, overall e cansaço', needs: 'Todos os discos de linha', roles: 'Todas as posições de campo' },
  { id: 'ia.fadiga', category: 'ia', label: 'Fadiga que muda o jogo', type: 'inteligência', when: 'Jogador com fôlego baixo (cálculo de esforço do App)', dur: 0, body: 'Sem animação própria: muda as chances', ball: 'Cansado erra mais o domínio e o passe, demora mais para controlar, perde mais desarmes e dribles e chega mais tarde na segunda bola', next: ['dom.erro', 'ia.passeerrado', 'def.emPe'], interrupt: 'Recupera com descanso e substituição', needs: 'Fôlego do jogador', roles: 'Todas as posições de campo' },
  { id: 'ia.momento', category: 'ia', label: 'Momento da partida', type: 'inteligência', when: 'Sempre (soma pressão a cada segundo)', dur: 0, body: 'Barra fina no topo do campo mostra quem está por cima', ball: 'Finalizações, posse com campo ganho, recuperações e bolas ganhas somam pressão (decai em ~40 s); o time por cima arrisca mais e a narração avisa', next: ['ia.contra'], interrupt: 'Decai com o tempo', needs: 'Posse, posição da bola e lances', roles: 'Time inteiro' },
  { id: 'ia.escanteio.curto', category: 'ia', label: 'Escanteio curto', type: 'inteligência', when: 'Escanteios do plano (variação sorteada fugindo do que já foi usado)', dur: 1300, body: 'Cobrador toca para um companheiro perto do canto, que levanta na área', ball: 'Duas passadas em vez de uma; o adversário que já viu a variação duas vezes manda um marcador esperar o toque', next: ['fx.pass'], interrupt: 'O desfecho do lance continua o do plano', needs: 'Pelo menos 3 jogadores de linha', roles: 'Cobradores e meias' },
  { id: 'ia.escanteio.primeira', category: 'ia', label: 'Escanteio na primeira trave', type: 'inteligência', when: 'Escanteios do plano', dur: 600, body: 'Cobrança rasteira e rápida para o homem na primeira trave', ball: 'Bola mais baixa e veloz; o adversário que já viu a variação coloca um marcador na primeira trave', next: ['fx.pass'], interrupt: 'O desfecho do lance continua o do plano', needs: 'Nenhum', roles: 'Cobradores e atacantes' },
  { id: 'rol.niveis', category: 'ia', label: 'Níveis de função (Normal, + e ++)', type: 'inteligência', when: 'Jogador com função cadastrada em + ou ++ (ADM > jogador > funções)', dur: 0, body: 'Sem animação própria: muda onde o disco se coloca e o que decide', ball: 'Passe mais vertical ou seguro, antecipação maior, menos erro de passe e domínio, goleiro com mais saídas e menos rebote (cada função tem o seu conjunto)', next: ['ia.passeerrado', 'def.linha'], interrupt: 'Pressão, cansaço e overall reduzem o efeito', needs: 'Nível cadastrado no jogador', roles: 'Todas as funções' },
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

// Teste em partida: força um drible específico (ADM > Animações > "Forçar"). Vale neste aparelho até ser desligado.
const FORCE_KEY = 'sfl7v7.anim.force';
export function forcedAnim(): string | null { try { return localStorage.getItem(FORCE_KEY); } catch { return null; } }
export function setForcedAnim(id: string | null) { try { if (id) localStorage.setItem(FORCE_KEY, id); else localStorage.removeItem(FORCE_KEY); } catch { /* sem armazenamento */ } }
