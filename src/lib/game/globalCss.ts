export const globalCss = `
html, body { max-width: 100%; overflow-x: hidden; overflow-x: clip; }
body { overscroll-behavior-x: none; }
.app-shell { max-width: 100vw; overflow-x: hidden; overflow-x: clip; }
@media (max-width: 720px) {
  .hero-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
  .hero-actions { width: min(100%, 340px); margin-left: auto; margin-right: auto; }
  .hero-actions button { width: 100%; justify-content: center; }
  .hero p { font-size: 15px; }
  .hero { padding-bottom: 8px; }
}
`;
