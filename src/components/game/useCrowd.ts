import { useEffect, useMemo, useRef, useState } from 'react';
import { slotOf } from '@/lib/game/helpers';
import type { MatchEvent, Player, Team } from '@/lib/game/types';

// Lógica da torcida: cantos de cada time e reações aos lances. Só visual: não muda o resultado.
// O campo (MatchPitch) desenha as arquibancadas com o estado devolvido aqui.

type Side = 'user' | 'bot';
export type CrowdMood = 'idle' | 'hype' | 'sad' | 'tense';
export type CrowdBubble = { text: string; mood: CrowdMood; key: number };
export type CrowdState = { mood: { user: CrowdMood; bot: CrowdMood }; bubbles: { user: CrowdBubble | null; bot: CrowdBubble | null }; noise: number };
type Mood = CrowdMood;
type Bubble = CrowdBubble;

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const chantsFor = (name: string, abbr: string) => ({
  ambient: [
    `É ${name}! É ${name}!`,
    `Olê olê olê, ${abbr}! ${abbr}!`,
    `${name}, ${name}, ${name}!`,
    `Vamos, ${name}! Joga por nós!`,
    `Aqui é ${name}, ninguém cala essa torcida!`,
    `Canta, ${abbr}! Canta mais alto!`,
    `Hoje a casa é nossa, ${name}!`,
    `Pra cima deles, ${abbr}!`,
  ],
  late: [`Segura, ${name}! Falta pouco!`, `Até o último minuto, ${abbr}!`, `Todo mundo junto, ${name}!`],
  goal: [
    `GOOOOL! Explode a torcida do ${name}!`,
    `É GOL! Todo mundo pulando!`,
    `Foguetório no setor do ${name}!`,
    `Grita, ${abbr}! Gol do nosso time!`,
    `Abraça quem tá do lado! É gol!`,
  ],
  conceded: [
    `Calma, ${name}! Ainda dá pra virar!`,
    `Levanta a cabeça, ${abbr}!`,
    `Silêncio na arquibancada…`,
    `Não desiste, ${name}! Bora!`,
  ],
  chance: [`Uuuuh! Quase, ${abbr}!`, `Chuta! Chuta!`, `Foi por pouco!`, `Quase! A torcida levantou!`],
  kept: [`Ufa! Segura, goleiro!`, `Defendeu! Aplausos!`, `Isso! Fecha o gol, ${abbr}!`, `Que susto!`],
  relief: [`Ufa! Passou perto!`, `Respira, ${name}!`],
  half: [`Aplausos pro ${name}! Vamos pro segundo tempo!`, `Intervalo! A torcida do ${abbr} não para!`],
  back: [`Time voltando! Canta, ${name}!`, `Segundo tempo é nosso, ${abbr}!`],
});


// ---- Torcida cantando o nome dos jogadores escalados (os que o jogador escolheu no draft) ----
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const GK_POS = ['GK'];
const DEF_POS = ['LB', 'RB'];
const ATT_POS = ['LF', 'RF', 'CF'];

// Um canto de fundo para um jogador, de acordo com a posição dele
function playerChant(player: Player, isStar: boolean): string {
  const n = firstName(player.name);
  const pos = slotOf(player);
  if (isStar && Math.random() < 0.5) return pick([`O craque é nosso! ${n}! ${n}!`, `Olha o camisa de ouro: ${n}!`, `Tem ${n}, tem jogo!`]);
  if (GK_POS.includes(pos)) return pick([`Fecha o gol, ${n}!`, `${n}, ninguém passa!`, `Muralha ${n}! Muralha!`]);
  if (DEF_POS.includes(pos)) return pick([`Ninguém passa, ${n}!`, `Segura a defesa, ${n}!`, `Marca firme, ${n}!`]);
  if (ATT_POS.includes(pos)) return pick([`Bota pra dentro, ${n}!`, `${n}, ${n}, é hora de gol!`, `Vai, ${n}! A bola é tua!`]);
  return pick([`Manda no meio, ${n}!`, `${n}, comanda o jogo!`, `Joga muito, ${n}!`]);
}

const findPlayer = (list: Player[], name?: string): Player | undefined => (name ? list.find((p) => p.name === name) : undefined);

export function useCrowd({
  club,
  opponent,
  events,
  shownGoalIds,
  score,
  minute,
  pause,
  active,
  squads,
}: {
  club: Team;
  opponent: Team;
  events: MatchEvent[];
  shownGoalIds: number[];
  score: { user: number; bot: number };
  minute: number;
  pause: 'halftime' | 'break' | 'subs' | 'return' | null;
  active: boolean;
  // Escalação de cada time em campo: a torcida chama os jogadores pelo nome
  squads?: { user: Player[]; bot: Player[] };
}) {
  const chants = useMemo(
    () => ({ user: chantsFor(club.name, club.abbreviation), bot: chantsFor(opponent.name, opponent.abbreviation) }),
    [club.name, club.abbreviation, opponent.name, opponent.abbreviation],
  );
  const [bubbles, setBubbles] = useState<{ user: Bubble | null; bot: Bubble | null }>({ user: null, bot: null });
  const [mood, setMood] = useState<{ user: Mood; bot: Mood }>({ user: 'idle', bot: 'idle' });
  const [noise, setNoise] = useState(55);
  const seq = useRef(0);
  const processed = useRef<Set<number>>(new Set());
  const moodTimers = useRef<{ user?: number; bot?: number }>({});
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const squadsRef = useRef(squads);
  squadsRef.current = squads;
  const minuteRef = useRef(minute);
  minuteRef.current = minute;

  const say = (side: Side, text: string, m: Mood, hold = 3200) => {
    seq.current += 1;
    const key = seq.current;
    setBubbles((current) => ({ ...current, [side]: { text, mood: m, key } }));
    setMood((current) => ({ ...current, [side]: m }));
    window.clearTimeout(moodTimers.current[side]);
    moodTimers.current[side] = window.setTimeout(() => setMood((current) => ({ ...current, [side]: 'idle' })), hold);
  };

  // Reage ao lance mais importante ainda não comentado (gol > defesa > finalização)
  useEffect(() => {
    if (!active) return;
    const visible = events.filter((event) => event.type !== 'gol' || shownGoalIds.includes(event.id));
    const fresh = visible.filter((event) => !processed.current.has(event.id));
    visible.forEach((event) => processed.current.add(event.id));
    const important = fresh.filter((event) => event.type !== 'posse');
    if (!important.length) return;
    const rank = { gol: 3, defesa: 2, finalização: 1, posse: 0 } as const;
    const event = important.reduce((best, item) => (rank[item.type] > rank[best.type] ? item : best));
    const attack: Side = event.team;
    const defend: Side = attack === 'user' ? 'bot' : 'user';
    const squad = squadsRef.current;
    const scorer = squad ? findPlayer(squad[attack], event.actor) : undefined;
    const passer = squad ? findPlayer(squad[attack], event.assist) : undefined;
    const keeper = squad?.[defend].find((p) => GK_POS.includes(slotOf(p)));
    if (event.type === 'gol') {
      const goalLine: string = scorer
        ? passer && passer.id !== scorer.id && Math.random() < 0.6
          ? `GOOOL do ${firstName(scorer.name)}! Que passe do ${firstName(passer.name)}!`
          : pick([`GOOOL! É ${firstName(scorer.name)}! ${firstName(scorer.name)}!`, `${firstName(scorer.name)} balançou a rede! Explode, torcida!`, `Gol do ${firstName(scorer.name)}! Ninguém segura!`])
        : pick(chants[attack].goal);
      say(attack, goalLine, 'hype', 4200);
      say(defend, keeper && Math.random() < 0.5 ? `Levanta a cabeça, ${firstName(keeper.name)}! Bora!` : pick(chants[defend].conceded), 'sad', 4200);
      setNoise(100);
    } else if (event.type === 'defesa') {
      say(attack, scorer && Math.random() < 0.6 ? `Quase, ${firstName(scorer.name)}! Era gol!` : pick(chants[attack].chance), 'tense');
      say(defend, keeper && Math.random() < 0.7 ? pick([`Que defesa, ${firstName(keeper.name)}!`, `Pega tudo, ${firstName(keeper.name)}!`, `${firstName(keeper.name)}! ${firstName(keeper.name)}!`]) : pick(chants[defend].kept), 'hype', 2400);
      setNoise((value) => Math.min(100, value + 22));
    } else {
      say(attack, scorer && Math.random() < 0.6 ? pick([`Chuta, ${firstName(scorer.name)}!`, `Foi por pouco, ${firstName(scorer.name)}!`]) : pick(chants[attack].chance), 'tense');
      say(defend, pick(chants[defend].relief), 'tense');
      setNoise((value) => Math.min(100, value + 14));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, shownGoalIds, active]);

  // Cantos de fundo: cada torcida puxa o seu, alternando
  useEffect(() => {
    if (!active || pause) return undefined;
    let turn = 0;
    const timer = window.setInterval(() => {
      const side: Side = turn % 2 === 0 ? 'user' : 'bot';
      turn += 1;
      const current = scoreRef.current;
      const behind = side === 'user' ? current.user < current.bot : current.bot < current.user;
      const late = minuteRef.current >= 78;
      const pool = late && Math.random() < 0.6 ? chants[side].late : behind && Math.random() < 0.4 ? chants[side].conceded : chants[side].ambient;
      // Metade dos cantos de fundo é para um jogador do time (o craque do elenco aparece mais)
      const list = squadsRef.current?.[side] ?? [];
      if (list.length && Math.random() < 0.5) {
        const star = list.reduce((best, p) => (p.overall > best.overall ? p : best), list[0]);
        const target = Math.random() < 0.3 ? star : pick(list);
        say(side, playerChant(target, target.id === star.id), 'idle', 2600);
      } else say(side, pick(pool), 'idle', 2600);
      setNoise((value) => Math.max(38, value - 9));
    }, 3600);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pause, chants]);

  // Intervalo
  useEffect(() => {
    if (pause === 'halftime') {
      say('user', pick(chants.user.half), 'hype', 5000);
      say('bot', pick(chants.bot.half), 'hype', 5000);
    } else if (pause === 'return') {
      say('user', pick(chants.user.back), 'hype', 4000);
      say('bot', pick(chants.bot.back), 'hype', 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause]);

  useEffect(
    () => () => {
      window.clearTimeout(moodTimers.current.user);
      window.clearTimeout(moodTimers.current.bot);
    },
    [],
  );
  return { mood, bubbles: bubbles, noise } as CrowdState;
}
