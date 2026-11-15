import { Bell, BellOff, Download, Smartphone, X } from 'lucide-react';
import { setPerfMode, useBattery, useLite, usePerfMode, type PerfMode } from '@/lib/settings';
import { setSound, useSound } from '@/lib/sfx';
import { useInviteNotifications } from '@/lib/push';
import type { InstallApi } from '@/lib/pwa';

// Configurações do aparelho: modo otimizado para celular, notificação de convite e instalação do app.

const css = `
.st-back { position: fixed; inset: 0; z-index: 450; background: rgba(3,6,12,.78); display: grid; place-items: center; padding: 14px; overflow: auto; }
.st-box { width: min(480px, 100%); background: #0f1622; border: 1px solid rgba(245,184,0,.45); border-radius: 18px; padding: 20px; color: #fff; box-shadow: 0 24px 70px rgba(0,0,0,.65); display: grid; gap: 16px; }
.st-head { display: flex; align-items: center; justify-content: space-between; }
.st-head h2 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #F5B800; }
.st-x { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.05); color: #fff; cursor: pointer; }
.st-sec { display: grid; gap: 8px; padding: 14px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
.st-sec h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 900; letter-spacing: .8px; }
.st-sec p { margin: 0; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.72); }
.st-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.st-seg button { padding: 10px 6px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.05); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; }
.st-seg button.on { background: #F5B800; border-color: #F5B800; color: #1a1200; }
.st-btn { padding: 12px; border-radius: 999px; border: 0; background: #F5B800; color: #1a1200; font-weight: 900; cursor: pointer; }
.st-btn.ghost { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.2); }
.st-btn:disabled { opacity: .6; cursor: wait; }
.st-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.st-it { position: relative; display: grid; justify-items: center; gap: 4px; padding: 10px 4px 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.05); color: #fff; font-weight: 800; font-size: 12px; cursor: pointer; }
.st-it.on { border-color: #F5B800; box-shadow: 0 0 0 1px #F5B800 inset; background: rgba(245,184,0,.12); }
.st-it.lock { opacity: .55; cursor: not-allowed; }
.st-it small { font-size: 10px; font-weight: 700; opacity: .8; text-align: center; line-height: 1.2; }
.st-ico { font-size: 22px; line-height: 1; }
.st-note { font-size: 12px !important; color: #F5B800 !important; }
.st-err { font-size: 12px !important; color: #f87171 !important; }
`;

const OPTIONS: { key: PerfMode; label: string }[] = [
  { key: 'auto', label: 'Automático' },
  { key: 'on', label: 'Otimizado' },
  { key: 'off', label: 'Completo' },
];

export function SettingsPanel({ onClose, userId, install, onLogin }: { onClose: () => void; userId: string | null; install: InstallApi; onLogin: () => void }) {
  const mode = usePerfMode();
  const push = useInviteNotifications(userId);
  const lite = useLite();
  const battery = useBattery();
  const sound = useSound();

  return (
    <div className="st-back" role="dialog" aria-label="Configurações" onClick={onClose}>
      <style>{css}</style>
      <div className="st-box" onClick={(e) => e.stopPropagation()}>
        <div className="st-head">
          <h2>CONFIGURAÇÕES</h2>
          <button className="st-x" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <section className="st-sec">
          <h3>
            <Smartphone size={16} /> DESEMPENHO
          </h3>
          <div className="st-seg">
            {OPTIONS.map((option) => (
              <button key={option.key} className={mode === option.key ? 'on' : ''} onClick={() => setPerfMode(option.key)}>
                {option.label}
              </button>
            ))}
          </div>
          <p>
            O modo otimizado deixa o jogo mais leve no celular: menos torcida animada, sem desgaste e marcas no gramado, sem poeira e sem desfoque de fundo. O jogo e as regras continuam iguais.
          </p>
          <p className="st-note">Agora: {lite ? 'otimizado' : 'completo'}{mode === 'auto' ? (battery.low ? ' (automático: bateria baixa)' : ' (escolhido automaticamente para este aparelho)') : ''}.</p>
          <p className="st-note">
            {battery.supported
              ? `🔋 Bateria ${battery.level !== null ? Math.round(battery.level * 100) : '?'}%${battery.charging ? ' (carregando)' : ''}. No modo automático, com 20% ou menos e sem carregar, os efeitos são reduzidos sozinhos.`
              : '🔋 Este aparelho não informa a bateria ao navegador (como no iPhone), então a economia automática por bateria não funciona. Use "Ligado" se quiser.'}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 2px', fontWeight: 800, fontSize: 13 }}>
            <span>🔊 Sons dos lances (trave etc.)</span>
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} style={{ width: 20, height: 20 }} />
          </label>
        </section>

        <section className="st-sec">
          <h3>
            {push.enabled ? <Bell size={16} /> : <BellOff size={16} />} NOTIFICAÇÃO DE CONVITE
          </h3>
          <p>Receba um aviso quando um amigo te chamar para jogar, mesmo com o site fechado.</p>
          {!userId ? (
            <button className="st-btn" onClick={() => { onClose(); onLogin(); }}>
              Entrar na conta
            </button>
          ) : !push.supported ? (
            <p className="st-note">Este navegador ou esta versão do site ainda não oferece notificações.</p>
          ) : push.needsInstall ? (
            <p className="st-note">No iPhone, primeiro instale o app: Compartilhar → Adicionar à Tela de Início. Depois abra por lá e ative aqui.</p>
          ) : push.permission === 'denied' ? (
            <p className="st-err">As notificações estão bloqueadas neste navegador. Libere nas configurações do site e volte aqui.</p>
          ) : push.enabled ? (
            <button className="st-btn ghost" disabled={push.busy} onClick={() => void push.disable()}>
              Desativar notificações
            </button>
          ) : (
            <button className="st-btn" disabled={push.busy} onClick={() => void push.enable()}>
              Ativar notificações
            </button>
          )}
          {push.error && <p className="st-err">{push.error}</p>}
        </section>

        {(install.canInstall || install.installed) && (
          <section className="st-sec">
            <h3>
              <Download size={16} /> APLICATIVO
            </h3>
            {install.installed ? <p>O 7v7 já está instalado neste aparelho.</p> : <p>Instale para abrir em tela cheia e jogar contra o bot sem internet.</p>}
            {install.canInstall && (
              <button className="st-btn" onClick={() => void install.install()}>
                Instalar app
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
