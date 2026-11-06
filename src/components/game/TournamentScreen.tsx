import { useEffect, useState } from 'react';
import { ArrowLeft, Crown, Trophy } from 'lucide-react';
import { type Team } from '@/lib/game/types';
import { fetchRoom, isRoomLive, type Room } from '@/lib/multiplayer';
import { SLOT_LABEL, seedGroups, slotPlayers, slotsFor, type Slot, type TPlayer, type Tournament } from '@/lib/tournament';
import { ClubPicker, lobbyCss } from '@/components/game/LobbyScreen';

// Chaveamento em árvore: rodadas da esquerda para a direita, linhas ligando cada confronto e a taça no fim
export function TournamentBracket({ tournament: t, userId }: { tournament: Tournament; userId: string }) {
  const six = t.seed?.length === 6;
  const eight = t.seed?.length === 8;
  const gold = '#F5B800';
  const BW = 124; // largura da caixa
  const BH = 28; // altura da caixa
  const COL = 170; // distância entre colunas
  const TOP = 34; // espaço para o título das colunas

  const mid = (list: number[]) => list.filter((_, i) => i % 2 === 0).map((y, i) => (y + list[i * 2 + 1]) / 2);
  // Com 8 jogadores as posições são calculadas: cada vencedor fica no meio das duas caixas de onde veio
  const eightQuartYs = Array.from({ length: 8 }, (_, i) => 20 + i * 38 + TOP);
  const eightSemiYs = mid(eightQuartYs);
  const eightFinalYs = mid(eightSemiYs);
  const semiYs = [20, 60, 130, 170].map((y) => y + TOP);
  const finalYs = eight ? eightFinalYs : [40, 150].map((y) => y + TOP);
  const quartYs = [40, 80, 150, 190].map((y) => y + TOP);
  const champY = eight ? mid(eightFinalYs)[0] : 95 + TOP;

  type Round = { label: string; slots: Slot[]; ys: number[] };
  const rounds: Round[] = eight
    ? [
        { label: 'QUARTAS', slots: ['q1', 'q2', 'q3', 'q4'], ys: eightQuartYs },
        { label: 'SEMIFINAIS', slots: ['m1', 'm2'], ys: eightSemiYs },
        { label: 'FINAL', slots: ['m3'], ys: eightFinalYs },
      ]
    : six
    ? [
        { label: 'QUARTAS', slots: ['q1', 'q2'], ys: quartYs },
        { label: 'SEMIFINAIS', slots: ['m1', 'm2'], ys: semiYs },
        { label: 'FINAL', slots: ['m3'], ys: finalYs },
      ]
    : [
        { label: 'SEMIFINAIS', slots: ['m1', 'm2'], ys: semiYs },
        { label: 'FINAL', slots: ['m3'], ys: finalYs },
      ];
  // Ligações de uma rodada para a próxima: caixas de origem (par) e índice da caixa de destino
  const edgesAfter = (index: number): { from: [number, number]; to: number; slot: Slot }[] => {
    const next = rounds[index + 1];
    if (!next) return [{ from: [0, 1], to: 0, slot: 'm3' }];
    if (eight && index === 0) {
      return [
        { from: [0, 1], to: 0, slot: 'q1' },
        { from: [2, 3], to: 1, slot: 'q2' },
        { from: [4, 5], to: 2, slot: 'q3' },
        { from: [6, 7], to: 3, slot: 'q4' },
      ];
    }
    if (six && index === 0) {
      return [
        { from: [0, 1], to: 1, slot: 'q1' },
        { from: [2, 3], to: 3, slot: 'q2' },
      ];
    }
    return [
      { from: [0, 1], to: 0, slot: rounds[index].slots[0] },
      { from: [2, 3], to: 1, slot: rounds[index].slots[1] },
    ];
  };

  const champX = rounds.length * COL;
  const width = champX + BW + 16;
  const height = eight ? eightQuartYs[7] + BH / 2 + 24 : 240;
  const champion = t.players.find((player) => player.id === t.m3.winner_id) ?? null;
  const finalists = slotPlayers(t, 'm3');
  const runnerUp = t.m3.winner_id ? (finalists.find((player) => player && player.id !== t.m3.winner_id) ?? null) : null;

  const cut = (text: string) => (text.length > 14 ? `${text.slice(0, 13)}…` : text);
  const line = 'rgba(255,255,255,.32)';

  function box(x: number, y: number, player: TPlayer | null, state: 'win' | 'lose' | null, key: string, tag?: string) {
    const mine = !!player && player.id === userId;
    return (
      <g key={key} opacity={state === 'lose' ? 0.5 : 1}>
        <rect
          x={x}
          y={y - BH / 2}
          width={BW}
          height={BH}
          rx={7}
          fill={mine ? 'rgba(245,184,0,.16)' : 'rgba(255,255,255,.07)'}
          stroke={mine || state === 'win' ? gold : 'rgba(255,255,255,.28)'}
          strokeWidth={mine || state === 'win' ? 1.6 : 1}
        />
        <text
          x={x + 9}
          y={y}
          dominantBaseline="central"
          fontSize={13}
          fontWeight={state === 'win' || mine ? 800 : 500}
          fill={state === 'win' ? gold : 'currentColor'}
          fontStyle={player ? 'normal' : 'italic'}
          opacity={player ? 1 : 0.5}
        >
          {player ? cut(player.nick) : 'A definir'}
        </text>
        {tag && (
          <text x={x + BW - 7} y={y} dominantBaseline="central" textAnchor="end" fontSize={9} opacity={0.6} fill="currentColor">
            {tag}
          </text>
        )}
      </g>
    );
  }

  const stateOf = (slot: Slot, player: TPlayer | null): 'win' | 'lose' | null => {
    const winner = t[slot].winner_id;
    if (!winner || !player) return null;
    return winner === player.id ? 'win' : 'lose';
  };

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Chaveamento do torneio"
        style={{ display: 'block', margin: '0 auto', maxWidth: 'none' }}
      >
        {/* títulos das colunas */}
        {rounds.map((round, index) => (
          <text key={round.label} x={index * COL + BW / 2} y={14} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill={gold} opacity={0.85}>
            {round.label}
          </text>
        ))}
        <text x={champX + BW / 2} y={14} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill={gold} opacity={0.85}>
          CAMPEÃO
        </text>

        {/* linhas */}
        {rounds.map((round, index) =>
          edgesAfter(index).map((edge) => {
            const xr = index * COL + BW;
            const xe = xr + 20;
            const xl = (index + 1) * COL;
            const y1 = round.ys[edge.from[0]];
            const y2 = round.ys[edge.from[1]];
            const yt = rounds[index + 1] ? rounds[index + 1].ys[edge.to] : champY;
            const match = t[edge.slot];
            return (
              <g key={`${index}-${edge.slot}`}>
                <path d={`M${xr} ${y1}H${xe}V${y2}H${xr}M${xe} ${yt}H${xl}`} fill="none" stroke={line} strokeWidth={1.3} />
                {match.score && (
                  <text x={xe + 4} y={yt - 4} fontSize={10} fontWeight={700} fill={gold}>
                    {match.score}
                  </text>
                )}
                {match.pens && (
                  <text x={xe + 4} y={yt + 11} fontSize={9} fill="currentColor" opacity={0.7}>
                    pên.
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* caixas dos jogadores */}
        {rounds.map((round, index) => {
          const pairs = round.slots.flatMap((slot) => slotPlayers(t, slot).map((player) => ({ slot, player })));
          return pairs.map((entry, i) => {
            // Com 6 jogadores, quem tem folga já aparece direto nas semifinais
            const bye = six && round.slots[0] === 'm1' && (i === 0 || i === 2);
            return box(index * COL, round.ys[i], entry.player, stateOf(entry.slot, entry.player), `${index}-${i}`, bye ? 'folga' : undefined);
          });
        })}

        {/* taça */}
        <g transform={`translate(${champX + BW / 2} 0)`}>
          <rect x={-24} y={champY - 40} width={48} height={8} rx={2} fill="#3a3f47" />
          <rect x={-6} y={champY - 56} width={12} height={17} fill="#d9a400" />
          <path
            d={`M-28 ${champY - 106}H28C28 ${champY - 76} 14 ${champY - 58} 0 ${champY - 58}C-14 ${champY - 58} -28 ${champY - 76} -28 ${champY - 106}Z`}
            fill={gold}
            stroke="#b78a00"
            strokeWidth={1.5}
          />
          <path
            d={`M-28 ${champY - 98}C-48 ${champY - 98} -48 ${champY - 74} -20 ${champY - 72}M28 ${champY - 98}C48 ${champY - 98} 48 ${champY - 74} 20 ${champY - 72}`}
            fill="none"
            stroke="#d9a400"
            strokeWidth={4.5}
            strokeLinecap="round"
          />
          <ellipse cx={-12} cy={champY - 88} rx={4} ry={11} fill="#fff" opacity={0.35} />
        </g>
        {box(champX, champY, champion, champion ? 'win' : null, 'champion')}

        {/* 2º lugar */}
        <text x={champX + BW / 2} y={champY + 36} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill="#c9ced6" opacity={0.85}>
          2º LUGAR
        </text>
        <g opacity={runnerUp ? 1 : 0.8}>
          <rect
            x={champX}
            y={champY + 44}
            width={BW}
            height={BH}
            rx={7}
            fill={runnerUp && runnerUp.id === userId ? 'rgba(201,206,214,.2)' : 'rgba(201,206,214,.1)'}
            stroke="#c9ced6"
            strokeWidth={1.2}
          />
          <text
            x={champX + 9}
            y={champY + 44 + BH / 2}
            dominantBaseline="central"
            fontSize={13}
            fontWeight={runnerUp ? 700 : 500}
            fontStyle={runnerUp ? 'normal' : 'italic'}
            fill="currentColor"
            opacity={runnerUp ? 1 : 0.5}
          >
            {runnerUp ? cut(runnerUp.nick) : 'A definir'}
          </text>
        </g>
      </svg>
    </div>
  );
}

export function TournamentScreen({
  teams,
  userId,
  tournament,
  mySlot,
  slotRoom,
  room,
  busy,
  error,
  onBack,
  onCreate,
  onJoin,
  onStart,
  onLeave,
  onCreateMatch,
  onJoinMatch,
  onCancelMatch,
  onWatch,
}: {
  teams: Team[];
  userId: string;
  tournament: Tournament | null;
  mySlot: Slot | null;
  slotRoom: Room | null;
  room: Room | null;
  busy: boolean;
  error: string;
  onBack: () => void;
  onCreate: (mode: 'classic' | 'dice', size: 4 | 6 | 8) => void;
  onJoin: (code: string) => void;
  onStart: (seed?: string[]) => void;
  onLeave: () => void;
  onCreateMatch: (teamId: string) => void;
  onJoinMatch: (teamId: string) => void;
  onCancelMatch: () => void;
  onWatch: (room: Room) => void;
}) {
  const [tMode, setTMode] = useState<'classic' | 'dice'>('classic');
  const [tSize, setTSize] = useState<4 | 6 | 8>(4);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [teamId, setTeamId] = useState('');
  // Chaveamento: sorteado pelo banco ou montado pelo anfitrião (toque em um jogador e depois em outro para trocar)
  const [seedMode, setSeedMode] = useState<'random' | 'manual'>('random');
  const [order, setOrder] = useState<string[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const playerIdsKey = (tournament?.players ?? []).map((player) => player.id).join(',');
  useEffect(() => {
    const ids = playerIdsKey ? playerIdsKey.split(',') : [];
    setOrder((prev) => [...prev.filter((id) => ids.includes(id)), ...ids.filter((id) => !prev.includes(id))]);
    setPicked(null);
  }, [playerIdsKey]);
  function swapSeed(index: number) {
    if (picked === null) setPicked(index);
    else if (picked === index) setPicked(null);
    else {
      setOrder((prev) => {
        const next = [...prev];
        [next[picked], next[index]] = [next[index], next[picked]];
        return next;
      });
      setPicked(null);
    }
  }
  function shuffleSeed() {
    setOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setPicked(null);
  }

  async function copyCode() {
    if (!tournament) return;
    try {
      await navigator.clipboard.writeText(tournament.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const gold = '#F5B800';
  const isHost = !!tournament && tournament.host_id === userId;
  const canStart = !!tournament && tournament.players.length === tournament.size;
  const nickOf = (id?: string | null) => tournament?.players.find((player) => player.id === id)?.nick ?? null;

  // Dados da minha partida atual
  const pair = tournament && mySlot ? slotPlayers(tournament, mySlot) : null;
  const iAmFirst = !!pair && pair[0]?.id === userId;
  const rival = pair ? (pair[0]?.id === userId ? pair[1] : pair[0]) : null;
  const match = tournament && mySlot ? tournament[mySlot] : null;
  const roomOpen = !!slotRoom && slotRoom.status === 'waiting' && !slotRoom.guest_id;
  const joinExclude = slotRoom?.host_team_id ?? null;
  const pickable = teams.filter((team) => team.id !== joinExclude);
  const chosenTeam = pickable.some((team) => team.id === teamId) ? teamId : pickable[0]?.id || '';

  return (
    <main className="flow-page lobby-page">
      <style>{lobbyCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Trophy size={14} /> TORNEIO
        </div>
        <h2>
          COPA <em>7V7</em>
        </h2>
        <p>Mata-mata com 4, 6 ou 8 jogadores, cada partida é um multiplayer normal. O campeão leva a taça.</p>
      </div>

      {!tournament && (
        <div className="lobby-wrap">
          <section className="lobby-card">
            <div className="lobby-step">
              <b>1</b>
              <div>
                <h3>Criar torneio</h3>
                <p>Escolha o tamanho e o modo do draft. Depois passe o código para mais {tSize - 1} amigos.</p>
              </div>
            </div>
            <span className="lobby-label">QUANTOS JOGADORES</span>
            <div className="lobby-seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <button type="button" className={tSize === 4 ? 'on' : ''} onClick={() => setTSize(4)}>
                4 jogadores
              </button>
              <button type="button" className={tSize === 6 ? 'on' : ''} onClick={() => setTSize(6)}>
                6 jogadores
              </button>
              <button type="button" className={tSize === 8 ? 'on' : ''} onClick={() => setTSize(8)}>
                8 jogadores
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.7 }}>
              {tSize === 4
                ? 'Duas semifinais e a final (3 partidas).'
                : tSize === 6
                  ? 'Duas quartas, duas semifinais e a final (5 partidas). Dois jogadores começam direto na semi.'
                  : 'Quatro quartas, duas semifinais e a final (7 partidas).'}
            </p>
            <span className="lobby-label">MODO DO DRAFT</span>
            <div className="lobby-seg">
              <button type="button" className={tMode === 'classic' ? 'on' : ''} onClick={() => setTMode('classic')}>
                Draft clássico
              </button>
              <button type="button" className={tMode === 'dice' ? 'on' : ''} onClick={() => setTMode('dice')}>
                <span aria-hidden="true">🎲</span> Modo Dado
              </button>
            </div>
            <button className="gold-button large lobby-main" disabled={busy} onClick={() => onCreate(tMode, tSize)}>
              {busy ? 'Criando...' : 'Criar torneio'}
            </button>
          </section>

          <div className="lobby-or">
            <i /> <span>OU</span> <i />
          </div>

          <section className="lobby-card">
            <div className="lobby-step">
              <b>2</b>
              <div>
                <h3>Entrar com código</h3>
                <p>Recebeu o código de um torneio? Digite aqui.</p>
              </div>
            </div>
            <div className="lobby-join">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 4))}
                placeholder="K7QX"
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
              />
              <button className="gold-button" disabled={busy || code.length < 4} onClick={() => onJoin(code)}>
                {busy ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </section>
          {error && <div className="lobby-error">{error}</div>}
        </div>
      )}

      {tournament && tournament.status === 'waiting' && (
        <div className="draft-picker" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <span className="eyebrow">CÓDIGO DO TORNEIO</span>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 12, margin: '10px 0', color: gold }}>
            {tournament.code}
          </div>
          <button className="outline-button" onClick={() => void copyCode()}>
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
          <div style={{ margin: '18px 0', display: 'grid', gap: 6 }}>
            <span className="lobby-label" style={{ margin: 0 }}>JOGADORES ({tournament.players.length}/{tournament.size})</span>
            {tournament.players.map((player) => (
              <div key={player.id} style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,.05)' }}>
                {player.nick}
                {player.id === tournament.host_id ? ' · anfitrião' : ''}
                {player.id === userId ? ' (você)' : ''}
              </div>
            ))}
          </div>
          {isHost && canStart && (
            <div style={{ margin: '0 0 16px', display: 'grid', gap: 8 }}>
              <span className="lobby-label" style={{ margin: 0 }}>CHAVEAMENTO</span>
              <div className="lobby-seg">
                <button type="button" className={seedMode === 'random' ? 'on' : ''} onClick={() => setSeedMode('random')}>
                  🎲 Aleatório
                </button>
                <button type="button" className={seedMode === 'manual' ? 'on' : ''} onClick={() => setSeedMode('manual')}>
                  ✋ Eu monto
                </button>
              </div>
              {seedMode === 'random' ? (
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Os confrontos serão sorteados quando o torneio começar.</p>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                    Toque em um jogador e depois em outro para trocar de lugar.
                  </p>
                  {seedGroups(tournament.size).map((group) => (
                    <div key={group.label} style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.12)' }}>
                      <small style={{ display: 'block', marginBottom: 6, fontWeight: 800, letterSpacing: 1, color: gold }}>
                        {group.label.toUpperCase()}
                      </small>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {group.indexes.map((index) => {
                          const player = tournament.players.find((item) => item.id === order[index]);
                          const on = picked === index;
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => swapSeed(index)}
                              aria-pressed={on}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                textAlign: 'left',
                                color: 'inherit',
                                border: `1px solid ${on ? gold : 'rgba(255,255,255,.12)'}`,
                                background: on ? 'rgba(245,184,0,.15)' : 'rgba(255,255,255,.05)',
                              }}
                            >
                              {player?.nick ?? '—'}
                              {player?.id === userId ? ' (você)' : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="outline-button" onClick={shuffleSeed}>
                    🎲 Embaralhar
                  </button>
                </>
              )}
            </div>
          )}
          {isHost ? (
            <button
              className="gold-button large lobby-main"
              disabled={busy || !canStart}
              onClick={() => onStart(seedMode === 'manual' ? order : undefined)}
            >
              {busy
                ? 'Começando...'
                : canStart
                  ? `Começar torneio (${tournament.players.length} jogadores)`
                  : `Esperando jogadores (${tournament.players.length}/${tournament.size})`}
            </button>
          ) : (
            <p style={{ opacity: 0.8 }}>Aguardando o anfitrião começar o torneio...</p>
          )}
          {error && <div className="lobby-error" style={{ marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="outline-button" onClick={onLeave}>
              {isHost ? 'Cancelar torneio' : 'Sair do torneio'}
            </button>
          </div>
        </div>
      )}

      {tournament && tournament.status !== 'waiting' && (
        <div style={{ maxWidth: 760, margin: '0 auto 14px' }}>
          <TournamentBracket tournament={tournament} userId={userId} />
        </div>
      )}

      {tournament && tournament.status !== 'waiting' && (
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 12 }}>
          {tournament.status === 'finished' && (
            <div
              style={{
                textAlign: 'center',
                padding: '18px 14px',
                borderRadius: 14,
                border: `1px solid ${gold}`,
                background: 'rgba(245,184,0,.12)',
              }}
            >
              <Crown color={gold} />
              <h3 style={{ margin: '6px 0 0' }}>
                {tournament.champion_nick ? `${tournament.champion_nick} é o campeão!` : 'Torneio encerrado'}
              </h3>
              {tournament.m3.winner_id === userId && <p style={{ margin: '6px 0 0' }}>A taça é sua. 🏆</p>}
            </div>
          )}

          {tournament.status === 'playing' && !mySlot && (
            <p style={{ textAlign: 'center', opacity: 0.85 }}>
              {nickOf(userId) && tournament.seed?.includes(userId)
                ? 'Você foi eliminado. Acompanhe o resto do torneio por aqui.'
                : 'Você não está jogando este torneio.'}
            </p>
          )}

          {tournament.status === 'playing' && mySlot && pair && (
            <section className="lobby-card" style={{ textAlign: 'center' }}>
              <span className="eyebrow">SUA PARTIDA · {SLOT_LABEL[mySlot].toUpperCase()}</span>
              {!pair[0] || !pair[1] ? (
                <p style={{ margin: '12px 0 0', opacity: 0.85 }}>Aguardando o jogo anterior do chaveamento terminar...</p>
              ) : (
                <>
                  <h3 style={{ margin: '8px 0' }}>Rival: {rival?.nick ?? 'Jogador'}</h3>

                  {room ? (
                    <>
                      <p style={{ opacity: 0.85 }}>
                        {room.status === 'waiting'
                          ? 'Sala criada. Aguardando seu rival entrar...'
                          : 'Partida em andamento...'}
                      </p>
                      {room.status === 'waiting' && (
                        <button className="outline-button" onClick={onCancelMatch}>
                          Cancelar sala
                        </button>
                      )}
                    </>
                  ) : iAmFirst ? (
                    <>
                      <p style={{ opacity: 0.85 }}>
                        {match?.room_id ? 'Sua sala anterior não está mais ativa. ' : ''}
                        Escolha seu clube e crie a partida. Seu rival entra automaticamente.
                      </p>
                      <span className="lobby-label">SEU CLUBE</span>
                      <ClubPicker teams={teams} value={chosenTeam} onChange={setTeamId} />
                      <button
                        className="gold-button large lobby-main"
                        disabled={busy || !chosenTeam}
                        onClick={() => onCreateMatch(chosenTeam)}
                      >
                        {busy ? 'Criando...' : 'Criar minha partida'}
                      </button>
                    </>
                  ) : roomOpen ? (
                    <>
                      <p style={{ opacity: 0.85 }}>{pair[0]?.nick} já criou a sala. Escolha seu clube e entre.</p>
                      <span className="lobby-label">SEU CLUBE</span>
                      <ClubPicker teams={teams} value={chosenTeam} onChange={setTeamId} exclude={joinExclude} />
                      <button
                        className="gold-button large lobby-main"
                        disabled={busy || !chosenTeam}
                        onClick={() => onJoinMatch(chosenTeam)}
                      >
                        {busy ? 'Entrando...' : 'Entrar na partida'}
                      </button>
                    </>
                  ) : (
                    <p style={{ opacity: 0.85 }}>Aguardando {pair[0]?.nick} criar a sala da partida...</p>
                  )}
                </>
              )}
              {error && <div className="lobby-error" style={{ marginTop: 10 }}>{error}</div>}
            </section>
          )}

          {tournament.status === 'playing' && !room && (
            <TournamentLive tournament={tournament} exclude={mySlot} onWatch={onWatch} />
          )}

          <div style={{ textAlign: 'center' }}>
            <button className="outline-button" onClick={onLeave}>
              Sair do torneio
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// Partidas do torneio que estão rolando agora: qualquer um do torneio pode assistir ao vivo
export function TournamentLive({
  tournament: t,
  exclude,
  onWatch,
}: {
  tournament: Tournament;
  exclude: Slot | null;
  onWatch: (room: Room) => void;
}) {
  const [live, setLive] = useState<{ slot: Slot; room: Room }[]>([]);
  const open = slotsFor(t)
    .filter((slot) => slot !== exclude && t[slot].room_id && !t[slot].winner_id)
    .map((slot) => ({ slot, roomId: t[slot].room_id as string }));
  const key = JSON.stringify(open);
  useEffect(() => {
    let alive = true;
    async function load() {
      const found = await Promise.all(
        open.map(async (item) => ({ slot: item.slot, room: await fetchRoom(item.roomId) })),
      );
      if (!alive) return;
      setLive(
        found.filter((item): item is { slot: Slot; room: Room } => !!item.room && isRoomLive(item.room)),
      );
    }
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [key]);
  return (
    <section className="lobby-card">
      <span className="lobby-label" style={{ margin: '0 0 8px' }}>ASSISTIR AO VIVO</span>
      {live.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Nenhuma partida do torneio rolando agora.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {live.map((item) => (
            <button
              key={item.slot}
              className="lobby-club"
              style={{ justifyContent: 'space-between', width: '100%' }}
              onClick={() => onWatch(item.room)}
            >
              <span>
                {SLOT_LABEL[item.slot]}: {item.room.host_nick} x {item.room.guest_nick ?? 'Jogador'}
              </span>
              <b style={{ color: '#F5B800', fontSize: 12 }}>👁 ASSISTIR</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
