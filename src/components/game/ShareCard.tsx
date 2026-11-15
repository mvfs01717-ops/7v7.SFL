import { useEffect, useState } from 'react';
import type { ClipData } from '@/components/game/ReplayPlayer';
import type { GoalRecord, Player, Team } from '@/lib/game/types';

// Card de resultado para postar: imagem 4:5 com placar, escudos, autores dos gols e o melhor lance (trajetória da bola).
// Desenhado direto num <canvas>, sem biblioteca, e exportado em PNG (compartilhar pelo celular ou baixar).

const CW = 1080;
const CH = 1350;
const FX0 = 20;
const FX1 = 720;
const FY0 = 10;
const FY1 = 430;

export type BestPlay = { clip: ClipData; tag: string; minute: number; actor?: string };

function hexToRgb(hex: string) {
  const v = (hex || '#888888').replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, '$1$1') : v.padEnd(6, '8').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function textOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111' : '#fff';
}
const FONT = '"Arial Black", "Segoe UI", Arial, sans-serif';

function shield(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.06);
  ctx.quadraticCurveTo(x, y, x + w * 0.1, y);
  ctx.lineTo(x + w * 0.9, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + h * 0.06);
  ctx.lineTo(x + w, y + h * 0.55);
  ctx.quadraticCurveTo(x + w, y + h * 0.82, cx, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.82, x, y + h * 0.55);
  ctx.closePath();
}

function crest(ctx: CanvasRenderingContext2D, team: Team, cx: number, cy: number, size: number) {
  const w = size;
  const h = size * 1.12;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  shield(ctx, cx, cy, w, h);
  ctx.fillStyle = team.primary_color;
  ctx.fill();
  ctx.restore();
  ctx.save();
  shield(ctx, cx, cy, w, h);
  ctx.clip();
  ctx.fillStyle = team.secondary_color;
  ctx.fillRect(cx - w / 2, cy + h * 0.1, w, h * 0.12);
  ctx.restore();
  shield(ctx, cx, cy, w, h);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.stroke();
  ctx.fillStyle = textOn(team.primary_color);
  ctx.font = `900 ${Math.round(size * 0.3)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((team.abbreviation || team.name.slice(0, 3)).toUpperCase().slice(0, 4), cx, cy - h * 0.12);
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(-1)[0] : name;
}

export function drawShareCard(
  canvas: HTMLCanvasElement,
  d: {
    club: Team;
    opponent: Team;
    score: { user: number; bot: number };
    userWon: boolean;
    draw: boolean;
    shootout?: { user: number; bot: number } | null;
    goals: { name: string; minute: number; side: 'user' | 'bot' }[];
    best: BestPlay | null;
  },
) {
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const acc = d.userWon ? '#4ade80' : d.draw ? '#F5B800' : '#f87171';

  // fundo
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, '#1b2a44');
  bg.addColorStop(0.55, '#0a1020');
  bg.addColorStop(1, '#05070d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);
  const glow = ctx.createRadialGradient(CW / 2, 0, 10, CW / 2, 0, 800);
  glow.addColorStop(0, `${acc}55`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CW, CH);
  // cones de luz
  for (const x of [120, CW - 120]) {
    const cone = ctx.createLinearGradient(x, 0, x + (x < CW / 2 ? 260 : -260), 700);
    cone.addColorStop(0, 'rgba(255,246,200,.22)');
    cone.addColorStop(1, 'transparent');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(x - 30, 0);
    ctx.lineTo(x + 30, 0);
    ctx.lineTo(x + (x < CW / 2 ? 420 : -420), 760);
    ctx.lineTo(x + (x < CW / 2 ? 80 : -80), 760);
    ctx.fill();
  }
  // gramado embaixo
  const grass = ctx.createLinearGradient(0, CH - 360, 0, CH);
  grass.addColorStop(0, 'transparent');
  grass.addColorStop(1, 'rgba(15,77,43,.55)');
  ctx.fillStyle = grass;
  ctx.fillRect(0, CH - 360, CW, 360);

  // moldura
  ctx.strokeStyle = `${acc}88`;
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, CW - 56, CH - 56);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.font = `900 26px ${FONT}`;
  ctx.fillText('7V7 BRASIL  ·  FIM DE JOGO', CW / 2, 98);

  ctx.fillStyle = acc;
  ctx.font = `italic 900 110px ${FONT}`;
  ctx.shadowColor = `${acc}88`;
  ctx.shadowBlur = 40;
  ctx.fillText(d.userWon ? 'VITÓRIA' : d.draw ? 'EMPATE' : 'DERROTA', CW / 2, 215);
  ctx.shadowBlur = 0;

  // escudos e placar
  crest(ctx, d.club, 215, 395, 190);
  crest(ctx, d.opponent, CW - 215, 395, 190);
  ctx.fillStyle = '#fff';
  ctx.font = `italic 900 200px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(String(d.score.user), CW / 2 - 28, 465);
  ctx.textAlign = 'left';
  ctx.fillText(String(d.score.bot), CW / 2 + 28, 465);
  ctx.textAlign = 'center';
  ctx.fillStyle = acc;
  ctx.font = `900 60px ${FONT}`;
  ctx.fillText('×', CW / 2, 440);
  ctx.fillStyle = '#fff';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText(fit(ctx, d.club.name.toUpperCase(), 330), 215, 540);
  ctx.fillText(fit(ctx, d.opponent.name.toUpperCase(), 330), CW - 215, 540);
  if (d.shootout) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(`PÊNALTIS ${d.shootout.user} - ${d.shootout.bot}`, CW / 2, 505);
  }

  // autores dos gols
  const mine = d.goals.filter((g) => g.side === 'user').slice(0, 5);
  const theirs = d.goals.filter((g) => g.side === 'bot').slice(0, 5);
  ctx.font = `800 27px ${FONT}`;
  mine.forEach((g, i) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(fit(ctx, `⚽ ${lastName(g.name)} ${g.minute}'`, 380), 270, 590 + i * 38);
  });
  theirs.forEach((g, i) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(fit(ctx, `⚽ ${lastName(g.name)} ${g.minute}'`, 380), CW - 270, 590 + i * 38);
  });

  // melhor lance: mini campo com a trajetória da bola
  const bw = 760;
  const bx = (CW - bw) / 2;
  const by = 712;
  const bh = Math.round((bw * (FY1 - FY0)) / (FX1 - FX0));
  const px = (x: number) => bx + ((x - FX0) / (FX1 - FX0)) * bw;
  const py = (y: number) => by + ((y - FY0) / (FY1 - FY0)) * bh;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 22);
  ctx.clip();
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#1c6b3d' : '#1f7544';
    ctx.fillRect(bx + (bw / 10) * i, by, bw / 10 + 1, bh);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx + 12, by + 12, bw - 24, bh - 24);
  ctx.beginPath();
  ctx.moveTo(bx + bw / 2, by + 12);
  ctx.lineTo(bx + bw / 2, by + bh - 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx + bw / 2, by + bh / 2, bh * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  const boxW = bw * 0.14;
  const boxH = bh * 0.56;
  ctx.strokeRect(bx + 12, by + (bh - boxH) / 2, boxW, boxH);
  ctx.strokeRect(bx + bw - 12 - boxW, by + (bh - boxH) / 2, boxW, boxH);

  const best = d.best;
  if (best && best.clip.frames.length > 1) {
    const frames = best.clip.frames;
    // jogadores no último quadro
    const last = frames[frames.length - 1];
    best.clip.sides.forEach((side, k) => {
      const x = last[3 + k * 2];
      const y = last[4 + k * 2];
      if (x === undefined || y === undefined) return;
      const team = side === 'user' ? d.club : d.opponent;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(px(x), py(y), 15, 0, Math.PI * 2);
      ctx.fillStyle = team.primary_color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = team.secondary_color;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // trilha da bola, mais forte perto do fim
    const n = frames.length;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      ctx.beginPath();
      ctx.moveTo(px(frames[i - 1][1]), py(frames[i - 1][2]));
      ctx.lineTo(px(frames[i][1]), py(frames[i][2]));
      ctx.strokeStyle = `rgba(255,226,122,${0.15 + t * 0.85})`;
      ctx.lineWidth = 3 + t * 7;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    const end = frames[n - 1];
    ctx.beginPath();
    ctx.arc(px(end[1]), py(end[2]), 17, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#F5B800';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111';
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 22);
  ctx.lineWidth = 4;
  ctx.strokeStyle = `${acc}`;
  ctx.stroke();

  // faixa do lance
  const tagY = by + bh + 18;
  ctx.textAlign = 'left';
  ctx.fillStyle = acc;
  ctx.fillRect(bx, tagY, 10, 66);
  ctx.fillStyle = '#fff';
  ctx.font = `italic 900 36px ${FONT}`;
  ctx.fillText(best ? `MELHOR LANCE · ${best.tag}` : 'MELHOR LANCE', bx + 28, tagY + 30);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(best ? `${best.actor ?? ''}${best.actor ? ' · ' : ''}${best.minute}'` : 'Sem lance gravado nesta partida', bx + 28, tagY + 62);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText('MONTE O SEU TIME · 7V7 BRASIL', CW / 2, CH - 40);
}

export function pickBestPlay(
  highlights: { event: { id: number; minute: number; actor?: string; team: 'user' | 'bot' }; tag: string; score: number }[],
  clips: Record<number, ClipData> | undefined,
): BestPlay | null {
  if (!clips) return null;
  const ranked = highlights
    .filter((h) => clips[h.event.id])
    .map((h) => ({ h, v: h.score + (h.tag !== 'GOL' && h.score >= 100 ? 10 : 0) + (h.event.team === 'user' ? 3 : 0) + h.event.minute / 100 }))
    .sort((a, b) => b.v - a.v);
  const top = ranked[0]?.h;
  if (!top) return null;
  return { clip: clips[top.event.id], tag: top.tag, minute: top.event.minute, actor: top.event.actor };
}

export function goalsForCard(goalLog: GoalRecord[], user: Player[], bot: Player[]) {
  return goalLog.map((g) => ({
    name: [...user, ...bot].find((p) => p.id === g.scorerId)?.name ?? 'Gol',
    minute: g.minute,
    side: g.side,
  }));
}

const css = `
.sc-back { position: fixed; inset: 0; z-index: 300; background: rgba(3,6,12,.82); backdrop-filter: blur(6px); display: grid; place-items: center; padding: 14px; overflow: auto; }
.sc-box { width: min(440px, 100%); display: grid; gap: 12px; }
.sc-box img { width: 100%; border-radius: 12px; display: block; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.sc-row { display: flex; gap: 10px; }
.sc-row button { flex: 1; padding: 13px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; font-weight: 900; letter-spacing: .5px; cursor: pointer; }
.sc-row button.pri { background: #F5B800; color: #111; border-color: #F5B800; }
.sc-open { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 12px 20px; font-weight: 900; letter-spacing: .5px; cursor: pointer; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.08); color: #fff; }
.sc-open:hover { border-color: #F5B800; color: #F5B800; }
`;

export function ShareCardButton(props: Parameters<typeof drawShareCard>[1]) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    const canvas = document.createElement('canvas');
    drawShareCard(canvas, props);
    setUrl(canvas.toDataURL('image/png'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const blob = async () => (await fetch(url as string)).blob();
  const fileName = `7v7-${props.club.abbreviation}-${props.score.user}x${props.score.bot}-${props.opponent.abbreviation}.png`.toLowerCase();

  const download = async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await blob());
    a.download = fileName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const share = async () => {
    if (!url) return;
    try {
      const file = new File([await blob()], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '7v7 Brasil', text: `${props.club.name} ${props.score.user} × ${props.score.bot} ${props.opponent.name}` });
      } else {
        await download();
        setMsg('Imagem baixada. Agora é só postar!');
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setMsg('Não foi possível compartilhar. Use Baixar.');
    }
  };

  return (
    <>
      <style>{css}</style>
      <button className="sc-open" onClick={() => setOpen(true)}>
        📸 Card para postar
      </button>
      {open && (
        <div className="sc-back" onClick={() => setOpen(false)}>
          <div className="sc-box" onClick={(e) => e.stopPropagation()}>
            {url ? <img src={url} alt="Card do resultado da partida" /> : <p style={{ textAlign: 'center' }}>Gerando...</p>}
            <div className="sc-row">
              <button className="pri" onClick={() => void share()}>
                Compartilhar
              </button>
              <button onClick={() => void download()}>Baixar</button>
              <button onClick={() => setOpen(false)}>Fechar</button>
            </div>
            {msg && <p style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
