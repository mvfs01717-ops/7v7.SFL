import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// "O que há de novo": lista das novidades da versão. O selo NOVO some depois que a pessoa abre (guardado só neste aparelho).

export const NEWS_VERSION = '2026-11-17';
const KEY = '7v7-news-seen';
const listeners = new Set<() => void>();

function readSeen() {
  try {
    return localStorage.getItem(KEY) === NEWS_VERSION;
  } catch {
    return false;
  }
}
let seen = typeof window === 'undefined' ? true : readSeen();

// Novidades mais recentes (os primeiros itens da lista da versão), para a tela inicial
export const newsHighlights = (n = 4) => NEWS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title }))).slice(0, n);

export function markNewsSeen() {
  seen = true;
  try {
    localStorage.setItem(KEY, NEWS_VERSION);
  } catch {
    /* sem armazenamento: o selo volta na próxima visita, sem problema */
  }
  listeners.forEach((fn) => fn());
}

export function useNewsUnseen() {
  const [value, setValue] = useState(!seen);
  useEffect(() => {
    const fn = () => setValue(!seen);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}

const NEWS: { title: string; items: { icon: string; label: string; text: string }[] }[] = [
  {
    title: 'DURANTE A PARTIDA',
    items: [
      { icon: '🎥', label: 'Câmeras e replay', text: 'Troque a câmera na hora do jogo. No celular o replay do gol aparece no canto da tela, sem cobrir o campo.' },
      { icon: '🧠', label: 'Tática no meio do jogo', text: 'Mude o estilo (posse, pressão alta...) sem esperar o intervalo. Trocar custa um pouco de cansaço.' },
      { icon: '⬆️', label: 'Táticas ao vivo', text: 'Pressionar, recuar ou jogar pelas pontas durante a partida: o time muda de posição no campo por 5 min e depois há um tempo de espera.' },
      { icon: '🦵', label: 'Carrinho e desarme', text: 'Os desarmes têm animação: o marcador desliza no chão ou dá o bote, a chuteira vai na bola e quem perdeu tropeça.' },
      { icon: '🏆', label: 'MVP da partida', text: 'No fim do jogo o melhor em campo ganha uma carta dourada de MVP e uma revelação em tela cheia, com a nota subindo. Dá para rever depois.' },
      { icon: '🎯', label: 'Jogada ensaiada', text: 'Antes de escanteio ou falta o jogo para de verdade e você escolhe entre cruzamento, toque curto ou chute direto.' },
      { icon: '🥅', label: 'Bola na trave', text: 'Som, trave balançando e a câmera treme um pouquinho.' },
      { icon: '👕', label: 'Camisa reserva', text: 'Se as cores dos times forem parecidas demais, o visitante joga de reserva automaticamente.' },
    ],
  },
  {
    title: 'ESTÁDIO E CLIMA',
    items: [
      { icon: '🌧️', label: 'Chuva no 2º tempo', text: 'Começa seco e pode chover no segundo tempo, com poças, escorregões e mais cansaço.' },
      { icon: '💡', label: 'Refletores', text: 'Nos jogos noturnos os refletores acendem aos poucos antes da bola rolar.' },
      { icon: '🎆', label: 'Clima de estádio', text: 'Fogos, fumaça, bandeirões, mascote e placar eletrônico.' },
      { icon: '🌱', label: 'Gramado vivo', text: 'As listras do corte se apagam conforme o jogo passa.' },
    ],
  },
  {
    title: 'ONLINE',
    items: [
      { icon: '🤝', label: 'Amigos e convites', text: 'Adicione amigos, veja quem está online, convide para jogar ou assista ao vivo.' },
      { icon: '🔌', label: 'Reconexão', text: 'Se a internet cair por alguns segundos, você volta para a mesma partida.' },
      { icon: '🎮', label: 'Tática, grito e jogada ensaiada no multiplayer', text: 'Agora funcionam também online. O efeito entra com cerca de 9 minutos de jogo de atraso, para os dois lados verem o mesmo.' },
    ],
  },
  {
    title: 'APP E APARELHO',
    items: [
      { icon: '📲', label: 'Instalar o app', text: 'Ícone na tela inicial, tela cheia e partidas contra o bot sem internet.' },
      { icon: '🔔', label: 'Aviso de convite', text: 'Receba uma notificação quando um amigo te chamar, mesmo com o site fechado.' },
      { icon: '🔄', label: 'Aviso de atualização', text: 'Quando sai versão nova, aparece o botão "Atualizar agora".' },
      { icon: '🔋', label: 'Economia de bateria', text: 'Com a bateria baixa, os efeitos são reduzidos automaticamente.' },
    ],
  },
];

const css = `
.wn-back { position: fixed; inset: 0; z-index: 460; background: rgba(3,6,12,.8); display: grid; place-items: center; padding: 14px; overflow: auto; }
.wn-box { width: min(520px, 100%); max-height: calc(100dvh - 28px); overflow: auto; background: #0f1622; border: 1px solid rgba(245,184,0,.45); border-radius: 18px; padding: 20px; color: #fff; box-shadow: 0 24px 70px rgba(0,0,0,.65); display: grid; gap: 14px; }
.wn-head { display: flex; align-items: center; justify-content: space-between; }
.wn-head h2 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #F5B800; }
.wn-x { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.05); color: #fff; cursor: pointer; }
.wn-sec { display: grid; gap: 8px; }
.wn-sec h3 { margin: 0; font-size: 12px; font-weight: 900; letter-spacing: 1px; color: rgba(255,255,255,.6); }
.wn-it { display: grid; grid-template-columns: 34px 1fr; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
.wn-it > span { font-size: 22px; line-height: 1; padding-top: 2px; }
.wn-it b { display: block; font-size: 14px; font-weight: 900; }
.wn-it small { display: block; margin-top: 2px; font-size: 12.5px; line-height: 1.4; color: rgba(255,255,255,.72); }
.wn-ok { width: 100%; padding: 12px; border: 0; border-radius: 999px; background: #F5B800; color: #1a1200; font-weight: 900; cursor: pointer; }
`;

export function WhatsNew({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    markNewsSeen();
  }, []);
  return (
    <div className="wn-back" role="dialog" aria-label="O que há de novo" onClick={onClose}>
      <style>{css}</style>
      <div className="wn-box" onClick={(e) => e.stopPropagation()}>
        <div className="wn-head">
          <h2>O QUE HÁ DE NOVO</h2>
          <button className="wn-x" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {NEWS.map((group) => (
          <section key={group.title} className="wn-sec">
            <h3>{group.title}</h3>
            {group.items.map((item) => (
              <div key={item.label} className="wn-it">
                <span>{item.icon}</span>
                <div>
                  <b>{item.label}</b>
                  <small>{item.text}</small>
                </div>
              </div>
            ))}
          </section>
        ))}
        <button className="wn-ok" onClick={onClose}>
          Entendi
        </button>
      </div>
    </div>
  );
}
