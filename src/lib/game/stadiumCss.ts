// Fundo de estádio compartilhado (refletores + gramado). Use: <main className="stadium-bg ..."> e <style>{stadiumCss}</style>
export const stadiumCss = `
.stadium-bg { position: relative; isolation: isolate; }
.stadium-bg::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none; background:
  conic-gradient(from 198deg at 14% -8%, transparent 0 7%, color-mix(in srgb, var(--ac, #F5B800) 22%, transparent) 9% 13%, transparent 15%),
  conic-gradient(from 162deg at 86% -8%, transparent 0 7%, color-mix(in srgb, var(--ac, #F5B800) 22%, transparent) 9% 13%, transparent 15%),
  radial-gradient(60% 40% at 50% 0, color-mix(in srgb, var(--ac, #F5B800) 12%, transparent), transparent 70%),
  linear-gradient(0deg, color-mix(in srgb, var(--ac, #F5B800) 24%, transparent), transparent 28%),
  radial-gradient(120% 70% at 50% 0, #17306a 0, #0a1431 55%, #050a1c 100%); }
.glass-card { position: relative; border-radius: 6px 22px 6px 22px; border: 1px solid color-mix(in srgb, var(--ac, #F5B800) 28%, transparent);
  background: linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,.45); }
.glass-card::before { content: ''; position: absolute; left: 0; right: 22px; top: 0; height: 2px; background: linear-gradient(90deg, var(--ac, #F5B800), transparent); pointer-events: none; }
.cta-slant { clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); border: 0 !important; text-transform: uppercase; letter-spacing: 3px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ac, #F5B800) 60%, #fff), var(--ac, #F5B800) 60%, color-mix(in srgb, var(--ac, #F5B800) 80%, #000)) !important; color: #08101f !important; box-shadow: 0 0 30px color-mix(in srgb, var(--ac, #F5B800) 38%, transparent); }
.cta-slant:disabled { filter: grayscale(.7); opacity: .55; }
`;
