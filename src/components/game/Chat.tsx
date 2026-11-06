import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { type ChatMessage } from '@/lib/multiplayer';

export const chatCss = `
.mp-chat { width: min(560px, 100%); margin: 14px auto; text-align: left; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; overflow: hidden; }
.mp-chat-title { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #F5B800; border-bottom: 1px solid rgba(255,255,255,.08); }
.mp-chat-list { height: 150px; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.mp-chat-empty { margin: auto; font-size: 13px; opacity: .55; text-align: center; }
.mp-msg { max-width: 85%; padding: 6px 10px; border-radius: 10px; font-size: 14px; line-height: 1.35; background: rgba(255,255,255,.08); align-self: flex-start; word-break: break-word; }
.mp-msg.mine { align-self: flex-end; background: rgba(245,184,0,.18); }
.mp-msg b { display: block; font-size: 11px; opacity: .65; margin-bottom: 2px; }
.mp-chat-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(255,255,255,.08); }
.mp-chat-form input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.25); color: inherit; font-size: 14px; }
.mp-chat-form button { display: grid; place-items: center; width: 40px; border: 0; border-radius: 10px; background: #F5B800; color: #0B1016; cursor: pointer; }
.mp-chat-form button:disabled { opacity: .45; cursor: default; }
.mp-chat-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px 0; }
.mp-chat-quick button { padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.mp-chat-quick button:hover:not(:disabled) { border-color: #F5B800; color: #F5B800; }
.mp-chat-quick button:disabled { opacity: .4; cursor: default; }
.mp-chat-quick.emoji button { font-size: 20px; padding: 4px 9px; line-height: 1.2; }
@keyframes chat-toast { 0% { opacity: 0; transform: translate(-50%, -10px) scale(.9) } 10% { opacity: 1; transform: translate(-50%, 0) scale(1) } 85% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -6px) } }
@media (prefers-reduced-motion: reduce) { .mp-toast { animation-name: none !important; opacity: 1 !important } }
`;

// Mensagens rápidas e reações: um toque envia, sem digitar
export const QUICK_TEXTS = ['Boa!', 'Sorte sua', 'Que lance!', 'Foi quase!', 'Bora!', 'Vacilou!', 'GG', 'Revanche?'];

export const QUICK_EMOJIS = ['👏', '😂', '🔥', '😡', '😱', '😭', '😎', '🤝'];

// Aviso flutuante com a última mensagem do rival, para ler sem rolar a tela até o chat
export function ChatToast({ messages, myId }: { messages: ChatMessage[]; myId: string | null }) {
  const [shown, setShown] = useState<ChatMessage | null>(null);
  const seen = useRef<string | null>(messages.length ? messages[messages.length - 1].id : null);
  const last = messages.length ? messages[messages.length - 1] : null;
  useEffect(() => {
    if (!last || last.id === seen.current) return;
    seen.current = last.id;
    if (last.senderId === myId) return;
    setShown(last);
    const timer = window.setTimeout(() => setShown((current) => (current?.id === last.id ? null : current)), 3600);
    return () => window.clearTimeout(timer);
  }, [last?.id]);
  if (!shown) return null;
  const onlyEmoji = !/[A-Za-zÀ-ÿ0-9]/.test(shown.text) && shown.text.length <= 4;
  return (
    <div
      key={shown.id}
      className="mp-toast"
      role="status"
      style={{
        position: 'fixed',
        top: 78,
        left: '50%',
        zIndex: 70,
        maxWidth: 'min(86vw, 360px)',
        padding: onlyEmoji ? '6px 16px' : '8px 14px',
        borderRadius: 14,
        background: 'rgba(5,8,12,.92)',
        border: '1px solid #F5B800',
        color: '#f4f4f0',
        textAlign: 'center',
        pointerEvents: 'none',
        animation: 'chat-toast 3600ms ease-in-out forwards',
      }}
    >
      <small style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#F5B800' }}>
        {shown.nick.toUpperCase()}
      </small>
      <span style={{ fontSize: onlyEmoji ? 34 : 15, fontWeight: 700, wordBreak: 'break-word' }}>{shown.text}</span>
    </div>
  );
}

// Chat do multiplayer: aparece na sala (draft) e durante a partida
export function ChatBox({
  messages,
  myId,
  onSend,
}: {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => boolean;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function submit() {
    const clean = text.trim();
    if (!clean) return;
    if (onSend(clean)) setText('');
  }
  // Mensagem rápida: envia na hora. Um pequeno intervalo evita spam de toques.
  const [cooling, setCooling] = useState(false);
  function quick(value: string) {
    if (cooling) return;
    if (onSend(value)) {
      setCooling(true);
      window.setTimeout(() => setCooling(false), 1200);
    }
  }

  return (
    <section className="mp-chat">
      <style>{chatCss}</style>
      <div className="mp-chat-title">
        <MessageCircle size={14} /> CHAT DA SALA
      </div>
      <div className="mp-chat-list" ref={listRef}>
        {messages.length ? (
          messages.map((message) => (
            <div key={message.id} className={`mp-msg ${message.senderId === myId ? 'mine' : ''}`}>
              <b>{message.senderId === myId ? 'Você' : message.nick}</b>
              {message.text}
            </div>
          ))
        ) : (
          <div className="mp-chat-empty">Nenhuma mensagem ainda. Mande um oi pro rival!</div>
        )}
      </div>
      <div className="mp-chat-quick emoji" aria-label="Reações">
        {QUICK_EMOJIS.map((emoji) => (
          <button key={emoji} type="button" disabled={cooling} onClick={() => quick(emoji)} aria-label={`Enviar ${emoji}`}>
            {emoji}
          </button>
        ))}
      </div>
      <div className="mp-chat-quick" aria-label="Mensagens rápidas">
        {QUICK_TEXTS.map((message) => (
          <button key={message} type="button" disabled={cooling} onClick={() => quick(message)}>
            {message}
          </button>
        ))}
      </div>
      <div className="mp-chat-form">
        <input
          value={text}
          maxLength={200}
          placeholder="Digite uma mensagem..."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <button type="button" aria-label="Enviar mensagem" onClick={submit} disabled={!text.trim()}>
          <Send size={16} />
        </button>
      </div>
    </section>
  );
}
