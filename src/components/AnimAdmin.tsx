import { useEffect, useRef, useState } from 'react';
import { CATEGORY_LABEL, LIBRARY, clearUses, loadAnimSettings, loadUses, saveAnimSettings, type AnimCategory, type AnimDef, type AnimSettings } from '@/lib/game/animLibrary';
import { gaitFx, type Gait } from '@/lib/game/locomotion';
import { dribbleBody, dribbleGeometry, type DribbleMove } from '@/lib/game/dribbles';

// Ritmo de cada marcha na prévia (fração da velocidade máxima)
const PREVIEW_RATIO: Record<Gait, number> = { parado: 0, caminhada: 0.2, leve: 0.45, corrida: 0.7, sprint: 1, arrancada: 0.6, freada: 0.3, direcao: 0.6, lateral: 0.45, costas: 0.4 };

// Prévia: executa a MESMA função de movimento usada na partida (gaitFx / dribbleBody / dribbleGeometry)
function Preview({ def, speed }: { def: AnimDef; speed: number }) {
  const body = useRef<SVGGElement>(null);
  const feet = useRef<SVGGElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const foe = useRef<SVGCircleElement>(null);
  const label = useRef<SVGTextElement>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const id = def.id.split('.')[1];
    const loop = (now: number) => {
      const t = ((now - t0) / 1000) * speed;
      if (def.category === 'locomocao') {
        const g = id as Gait;
        const ratio = PREVIEW_RATIO[g];
        const fx = gaitFx(g, ratio);
        const px = ((t * ratio * 120) % 240) - 120;
        const phase = ((px + 120) * fx.rate * 1.6);
        const sw = Math.sin(phase);
        const face = g === 'costas' ? Math.PI : g === 'lateral' ? Math.PI / 2 : 0;
        const dir = g === 'costas' ? -1 : 1;
        const x = g === 'lateral' ? 0 : dir * px;
        const y = g === 'lateral' ? px * 0.6 : g === 'direcao' ? Math.sin(t * 4) * 14 : 0;
        const bob = 1 + fx.bob * Math.abs(sw);
        body.current?.setAttribute('transform', `translate(${(110 + x).toFixed(1)} ${(70 + y).toFixed(1)}) scale(${(fx.sx * bob).toFixed(3)} ${(fx.sy * bob).toFixed(3)})`);
        if (feet.current) {
          feet.current.setAttribute('opacity', g === 'parado' ? '0' : '1');
          feet.current.setAttribute('transform', `rotate(${((face * 180) / Math.PI).toFixed(0)})`);
          const [a, b] = [feet.current.children[0], feet.current.children[1]];
          a?.setAttribute('cx', (fx.amp * sw).toFixed(1)); a?.setAttribute('cy', String(-(7.5 + fx.lift)));
          b?.setAttribute('cx', (-fx.amp * sw).toFixed(1)); b?.setAttribute('cy', String(7.5 + fx.lift));
        }
        ball.current?.setAttribute('opacity', '0');
        foe.current?.setAttribute('opacity', '0');
      } else {
        const move = id as DribbleMove;
        const foeP = { x: 130, y: 70 };
        const plan = dribbleGeometry(move, { x: 50, y: 70 }, foeP, -1, 1);
        const total = plan.reduce((s, p) => s + p.dur, 0) + 700;
        const el = (t * 1000) % total;
        let acc = 0, from = { x: 50, y: 70 }, pos = { ...from }, phase: 'fake' | 'burst' = 'fake', pr = 0, done = true;
        for (const p of plan) {
          if (el < acc + p.dur) { pr = (el - acc) / p.dur; pos = { x: from.x + (p.to.x - from.x) * pr, y: from.y + (p.to.y - from.y) * pr }; phase = p.phase; done = false; break; }
          acc += p.dur; from = p.to; pos = { ...p.to };
        }
        const fx = dribbleBody(move, phase, done ? 0 : pr, -1);
        body.current?.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${(pos.y + fx.shift).toFixed(1)}) rotate(${fx.rot.toFixed(1)}) scale(${fx.sx.toFixed(3)} ${fx.sy.toFixed(3)})`);
        feet.current?.setAttribute('opacity', '0');
        ball.current?.setAttribute('opacity', '1');
        ball.current?.setAttribute('cx', (pos.x + 11 + fx.ballFwd).toFixed(1));
        ball.current?.setAttribute('cy', (pos.y + 2 + fx.ballLat).toFixed(1));
        const sway = done ? 0 : fx.oppSway * Math.sin(Math.min(1, el / 600) * Math.PI) * 8;
        foe.current?.setAttribute('opacity', '1');
        foe.current?.setAttribute('cx', (foeP.x + sway * 0.4).toFixed(1));
        foe.current?.setAttribute('cy', (foeP.y + sway).toFixed(1));
      }
      if (label.current) label.current.textContent = def.label;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [def, speed]);
  return (
    <svg viewBox="0 0 240 140" className="aa-prev" role="img" aria-label={`Prévia: ${def.label}`}>
      <rect width="240" height="140" rx="10" fill="#14532d" />
      <path d="M0 70H240M120 0V140" stroke="rgba(255,255,255,.18)" />
      <circle ref={foe} r="13" fill="#334155" stroke="rgba(255,255,255,.5)" opacity="0" />
      <g ref={body}>
        <circle r="13" fill="#a50044" stroke="rgba(0,0,0,.5)" />
        <text textAnchor="middle" dy="4" fontSize="12" fontWeight="800" fill="#fff">J</text>
        <g ref={feet} opacity="0">
          {[0, 1].map((i) => <ellipse key={i} rx="3.6" ry="2.3" fill="#14181f" stroke="rgba(255,255,255,.75)" strokeWidth=".7" />)}
        </g>
      </g>
      <circle ref={ball} r="3.6" fill="#fff" stroke="#111" strokeWidth=".8" opacity="0" />
      <text ref={label} x="8" y="132" fontSize="9" fill="rgba(255,255,255,.8)" />
    </svg>
  );
}

const CSS = `
.aa { display: grid; gap: 18px; }
.aa h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: 1.2px; text-transform: uppercase; color: #F5B800; }
.aa-note { font-size: 12.5px; opacity: .75; line-height: 1.5; margin: 0; }
.aa-row { display: grid; grid-template-columns: 1fr auto; gap: 8px 14px; align-items: center; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); }
.aa-row.off { opacity: .55; }
.aa-name { font-weight: 800; font-size: 14px; }
.aa-id { font-size: 11px; opacity: .55; font-family: ui-monospace, monospace; }
.aa-ctl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.aa-ctl input[type=range] { width: 90px; }
.aa-btn { border: 1px solid rgba(255,255,255,.2); background: transparent; color: #fff; border-radius: 8px; padding: 6px 10px; font-weight: 700; font-size: 12px; cursor: pointer; }
.aa-btn:hover { background: rgba(255,255,255,.08); }
.aa-btn.on { background: #F5B800; color: #111; border-color: #F5B800; }
.aa-use { font-size: 12px; min-width: 64px; text-align: right; opacity: .85; font-variant-numeric: tabular-nums; }
.aa-det { grid-column: 1 / -1; display: grid; grid-template-columns: 240px 1fr; gap: 14px; padding-top: 6px; }
.aa-prev { width: 240px; max-width: 100%; border-radius: 10px; }
.aa-det dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: 12.5px; }
.aa-det dt { opacity: .6; } .aa-det dd { margin: 0; }
@media (max-width: 640px) { .aa-det { grid-template-columns: 1fr; } .aa-row { grid-template-columns: 1fr; } .aa-ctl { justify-content: flex-start; } }
`;

export default function AnimAdmin() {
  const [settings, setSettings] = useState<AnimSettings>(() => ({ ...loadAnimSettings() }));
  const [uses, setUses] = useState<Record<string, number>>(() => loadUses());
  const [open, setOpen] = useState<string | null>(null);
  const patch = (id: string, change: { on?: boolean; speed?: number }) => {
    const next = { ...settings, [id]: { ...settings[id], ...change } };
    setSettings(next);
    saveAnimSettings(next);
  };
  const cats = Object.keys(CATEGORY_LABEL) as AnimCategory[];
  return (
    <div className="aa">
      <style>{CSS}</style>
      <p className="aa-note">
        Aqui estão as animações que já estão ligadas à partida. Desligar uma animação a tira da escolha do jogo (a marcha ou o drible cai para o mais próximo).
        A velocidade muda a duração. As configurações valem neste aparelho. A contagem mostra quantas vezes cada uma foi executada nas partidas jogadas aqui.
      </p>
      {cats.map((cat) => (
        <section key={cat}>
          <h3>{CATEGORY_LABEL[cat]}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {LIBRARY.filter((a) => a.category === cat).map((a) => {
              const on = settings[a.id]?.on !== false;
              const sp = settings[a.id]?.speed ?? 1;
              return (
                <div key={a.id} className={on ? 'aa-row' : 'aa-row off'}>
                  <div>
                    <div className="aa-name">{a.label}</div>
                    <div className="aa-id">{a.id} · {a.type}{a.dur ? ` · ${a.dur} ms` : ' · contínua'}</div>
                  </div>
                  <div className="aa-ctl">
                    <span className="aa-use" title="Execuções">{uses[a.id] ?? 0}×</span>
                    <label style={{ fontSize: 12 }}>Vel. {sp.toFixed(1)}×{' '}
                      <input type="range" min={0.5} max={1.8} step={0.1} value={sp} onChange={(e) => patch(a.id, { speed: Number(e.target.value) })} aria-label={`Velocidade de ${a.label}`} />
                    </label>
                    <button className={on ? 'aa-btn on' : 'aa-btn'} onClick={() => patch(a.id, { on: !on })} aria-pressed={on}>{on ? 'Ativa' : 'Desligada'}</button>
                    <button className="aa-btn" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Fechar' : 'Testar'}</button>
                  </div>
                  {open === a.id && (
                    <div className="aa-det">
                      <Preview def={a} speed={sp} />
                      <dl>
                        <dt>Quando</dt><dd>{a.when}</dd>
                        <dt>Corpo</dt><dd>{a.body}</dd>
                        <dt>Bola</dt><dd>{a.ball}</dd>
                        <dt>Depois</dt><dd>{a.next.join(', ')}</dd>
                        <dt>Interrupção</dt><dd>{a.interrupt}</dd>
                        <dt>Atributos</dt><dd>{a.needs}</dd>
                        <dt>Funções</dt><dd>{a.roles}</dd>
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <div>
        <button className="aa-btn" onClick={() => setUses(loadUses())}>Atualizar contagem</button>{' '}
        <button className="aa-btn" onClick={() => { clearUses(); setUses({}); }}>Zerar contagem</button>{' '}
        <button className="aa-btn" onClick={() => { setSettings({}); saveAnimSettings({}); }}>Restaurar padrão</button>
      </div>
    </div>
  );
}
