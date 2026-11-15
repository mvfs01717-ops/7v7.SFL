import { useEffect, useRef, useState } from 'react';

// Seletor de cor no estilo do jogo (no lugar do seletor padrão do navegador/Windows):
// paleta de cores prontas, código hexadecimal e controles de matiz, intensidade e brilho.

const PRESETS = [
  '#d0202a', '#ef4444', '#ff7a1a', '#F5B800', '#ffe27a', '#b6ff2e',
  '#1f9d4d', '#0b6b3a', '#14b8a6', '#38bdf8', '#2563eb', '#1e3a8a',
  '#0b1f5c', '#7c3aed', '#a21caf', '#ff4fa3', '#7a1f1f', '#6b4423',
  '#ffffff', '#cbd5e1', '#8a94a6', '#4b5563', '#20242b', '#000000',
];

const HEX = /^#[0-9a-fA-F]{6}$/;

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

const css = `
.cf { display: grid; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; }
.cf > span { opacity: .85; }
.cf-btn { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 5px 12px 5px 6px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: #070b14; color: #fff; cursor: pointer; font: 800 13px Inter, sans-serif; letter-spacing: .6px; text-transform: uppercase; }
.cf-btn:hover, .cf-btn[aria-expanded='true'] { border-color: #F5B800; }
.cf-sw { flex: none; width: 34px; height: 32px; border-radius: 7px; border: 2px solid rgba(255,255,255,.7); }
.cf-pop { position: fixed; z-index: 700; width: 280px; max-width: calc(100vw - 16px); padding: 14px; border-radius: 14px; background: #0f1622; border: 1px solid rgba(245,184,0,.55); box-shadow: 0 20px 60px rgba(0,0,0,.7); display: grid; gap: 12px; color: #fff; letter-spacing: 0; text-transform: none; }
.cf-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.cf-p { aspect-ratio: 1; border-radius: 9px; border: 2px solid rgba(255,255,255,.25); cursor: pointer; padding: 0; }
.cf-p:hover { transform: scale(1.08); }
.cf-p.on { border-color: #F5B800; box-shadow: 0 0 0 2px #F5B800; }
.cf-row { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: 1px; opacity: .9; }
.cf-row input[type='range'] { width: 100%; height: 12px; border-radius: 99px; appearance: none; -webkit-appearance: none; outline: none; border: 1px solid rgba(255,255,255,.3); cursor: pointer; }
.cf-row input[type='range']::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 3px solid #0f1622; box-shadow: 0 0 0 2px #F5B800; }
.cf-row input[type='range']::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 3px solid #0f1622; box-shadow: 0 0 0 2px #F5B800; }
.cf-hex { display: flex; align-items: center; gap: 8px; }
.cf-hex input { flex: 1; min-width: 0; min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: #070b14; color: #fff; font: 800 14px ui-monospace, monospace; text-transform: uppercase; }
.cf-hex input.bad { border-color: #ff6b6b; }
.cf-ok { min-height: 40px; padding: 0 16px; border: 0; border-radius: 10px; background: #F5B800; color: #1a1200; font-weight: 900; cursor: pointer; }
`;

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 8, top: 8 });
  const btn = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const safe = HEX.test(value) ? value.toLowerCase() : '#000000';
  const [hsl, setHslState] = useState<[number, number, number]>(() => hexToHsl(safe));
  const [h, s, l] = hsl;

  useEffect(() => setText(value), [value]);
  // Mudança vinda de fora (paleta, código digitado): refaz os controles. Mudança dos próprios controles não mexe neles.
  useEffect(() => {
    if (hslToHex(hsl[0], hsl[1], hsl[2]) !== safe) setHslState(hexToHsl(safe));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe]);

  function place() {
    const rect = btn.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    const height = 330;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight ? Math.max(8, rect.top - height - 8) : below;
    setPos({ left, top });
  }

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (pop.current?.contains(target) || btn.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const setHsl = (nh: number, ns: number, nl: number) => {
    setHslState([nh, ns, nl]);
    onChange(hslToHex(nh, ns, nl));
  };
  const typed = (raw: string) => {
    const clean = raw.startsWith('#') ? raw : `#${raw}`;
    setText(clean.slice(0, 7));
    if (HEX.test(clean)) onChange(clean.toLowerCase());
  };

  return (
    <div className="cf">
      <style>{css}</style>
      <span>{label}</span>
      <button ref={btn} type="button" className="cf-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <i className="cf-sw" style={{ background: safe }} />
        {safe}
      </button>
      {open && (
        <div ref={pop} className="cf-pop" role="dialog" aria-label={label} style={{ left: pos.left, top: pos.top }}>
          <div className="cf-grid">
            {PRESETS.map((color) => (
              <button key={color} type="button" className={`cf-p ${safe === color.toLowerCase() ? 'on' : ''}`} style={{ background: color }} aria-label={color} onClick={() => onChange(color.toLowerCase())} />
            ))}
          </div>
          <label className="cf-row">
            MATIZ
            <input type="range" min={0} max={359} value={h} onChange={(e) => setHsl(Number(e.target.value), s, l)} style={{ background: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }} />
          </label>
          <label className="cf-row">
            INTENSIDADE
            <input type="range" min={0} max={100} value={s} onChange={(e) => setHsl(h, Number(e.target.value), l)} style={{ background: `linear-gradient(90deg, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})` }} />
          </label>
          <label className="cf-row">
            BRILHO
            <input type="range" min={0} max={100} value={l} onChange={(e) => setHsl(h, s, Number(e.target.value))} style={{ background: `linear-gradient(90deg, #000, ${hslToHex(h, s, 50)}, #fff)` }} />
          </label>
          <div className="cf-hex">
            <input className={HEX.test(text) ? '' : 'bad'} value={text} onChange={(e) => typed(e.target.value)} maxLength={7} spellCheck={false} aria-label="Código da cor" />
            <button type="button" className="cf-ok" onClick={() => setOpen(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
