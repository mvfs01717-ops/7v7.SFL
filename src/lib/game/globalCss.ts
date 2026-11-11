export const globalCss = `
html, body { max-width: 100%; overflow-x: hidden; overflow-x: clip; }
body { overscroll-behavior-x: none; }
.app-shell { max-width: 100vw; overflow-x: hidden; overflow-x: clip; isolation: isolate; }
/* Cor de destaque do fundo por modo: mesma base azul do 7v7, acento muda (Home dourado, jogo contra bot verde, multiplayer violeta) */
@property --ac { syntax: '<color>'; inherits: true; initial-value: #F5B800; }
.app-shell { --ac: #F5B800; transition: --ac .7s ease; }
.app-shell[data-theme='draft'] { --ac: #22c55e; }
.app-shell[data-theme='mp'] { --ac: #a78bfa; }
/* Transição suave entre telas (só opacidade, para não quebrar elementos position: fixed) */
.app-shell > main, .app-shell > section { animation: pageIn .42s ease-out both; }
@keyframes pageIn { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .app-shell > main, .app-shell > section { animation: none; } }
@media (max-width: 720px) {
  .hero-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
  .hero-actions { width: min(100%, 340px); margin-left: auto; margin-right: auto; }
  .hero-actions button { width: 100%; justify-content: center; }
  .hero p { font-size: 15px; }
  .hero { padding-bottom: 8px; }
}
`;
