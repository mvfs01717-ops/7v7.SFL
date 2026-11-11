// Fundo único do estádio, fixo atrás dos menus. A "câmera" muda de lugar quando o jogador troca de tela:
// Home olha o campo, Multiplayer sobe para a arquibancada, Escolha de clube vai para o lado esquerdo etc.
// Só o fundo se move (nada é clicável). O resto do app continua igual.

export type BackdropCamera = 'wide' | 'stands' | 'left' | 'right' | null;

// z = zoom; tx/ty = deslocamento em % do tamanho da tela (já limitado para nunca mostrar a borda da imagem)
const CAMERAS: Record<Exclude<BackdropCamera, null>, { z: number; tx: number; ty: number; dim: number }> = {
  wide: { z: 1, tx: 0, ty: 0, dim: 0 }, // campo e estádio inteiro (Home)
  stands: { z: 1.9, tx: 0, ty: 38, dim: 0.3 }, // arquibancada cheia (Multiplayer)
  left: { z: 1.7, tx: 35, ty: 8, dim: 0.4 }, // arquibancada lateral esquerda (escolha de clube)
  right: { z: 1.5, tx: -25, ty: 14, dim: 0.42 }, // arquibancada lateral direita (ranking, perfil, elenco)
};

const css = `
.bd { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: #050a1c; transition: opacity .5s ease; }
.bd-cam { position: absolute; inset: 0; background: #050a1c url('/stadium-night.jpg') center 62% / cover no-repeat;
  transform: translate(var(--tx), var(--ty)) scale(var(--z)); transition: transform 1.15s cubic-bezier(.65, 0, .25, 1); will-change: transform; }
.bd-shade { position: absolute; inset: 0; transition: background .9s ease; background:
  rgba(3, 7, 20, var(--dim)),
  linear-gradient(180deg, rgba(4, 10, 30, .34) 0%, rgba(4, 10, 30, .16) 40%, rgba(3, 6, 16, .6) 100%),
  rgba(8, 20, 60, .16); }
.bd-vig { position: absolute; inset: 0; background: radial-gradient(90% 90% at 50% 45%, transparent 40%, rgba(0, 0, 0, .62)); }
@media (prefers-reduced-motion: reduce) { .bd-cam, .bd-shade { transition: none; } }
`;

export default function StadiumBackdrop({ camera }: { camera: BackdropCamera }) {
  // Na tela anterior à última câmera o fundo some (draft, partida e admin têm o próprio fundo)
  const cam = CAMERAS[camera ?? 'wide'];
  return (
    <div className="bd" aria-hidden="true" style={{ opacity: camera ? 1 : 0 }}>
      <style>{css}</style>
      <div className="bd-cam" style={{ ['--z' as string]: cam.z, ['--tx' as string]: `${cam.tx}%`, ['--ty' as string]: `${cam.ty}%` }} />
      <div className="bd-shade" style={{ ['--dim' as string]: cam.dim }} />
      <div className="bd-vig" />
    </div>
  );
}
