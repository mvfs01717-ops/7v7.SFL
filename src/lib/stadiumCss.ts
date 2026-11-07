// Fundo de estádio compartilhado (refletores + gramado). Use: <main className="stadium-bg ..."> e <style>{stadiumCss}</style>
export const stadiumCss = `
.stadium-bg { position: relative; isolation: isolate; }
.stadium-bg::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none; background:
  conic-gradient(from 198deg at 14% -8%, transparent 0 7%, rgba(255,246,200,.15) 9% 13%, transparent 15%),
  conic-gradient(from 162deg at 86% -8%, transparent 0 7%, rgba(255,246,200,.15) 9% 13%, transparent 15%),
  linear-gradient(0deg, rgba(15,77,43,.45), transparent 26%),
  radial-gradient(120% 70% at 50% 0, #1b2a44 0, #0a1020 55%, #05070d 100%); }
.glass-card { position: relative; border-radius: 6px 22px 6px 22px; border: 1px solid rgba(245,184,0,.22);
  background: linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,.45); }
.glass-card::before { content: ''; position: absolute; left: 0; right: 22px; top: 0; height: 2px; background: linear-gradient(90deg, #F5B800, transparent); pointer-events: none; }
.cta-slant { clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); border: 0 !important; text-transform: uppercase; letter-spacing: 3px;
  background: linear-gradient(180deg, #ffe27a, #F5B800 60%, #d99a00) !important; color: #1a1200 !important; box-shadow: 0 0 30px rgba(245,184,0,.35); }
.cta-slant:disabled { filter: grayscale(.7); opacity: .55; }
`;
