import { LogIn, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function LoginModal({
  email,
  password,
  nickname,
  message,
  setEmail,
  setPassword,
  setNickname,
  setMessage,
  loggedIn,
  onLogout,
  onClose,
}: {
  email: string;
  password: string;
  nickname: string;
  message: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setNickname: (value: string) => void;
  setMessage: (value: string) => void;
  loggedIn: boolean;
  onLogout: () => void | Promise<void>;
  onClose: () => void;
}) {
  const submit = async (signUp: boolean) => {
    setMessage('');
    const result = signUp
      ? await supabase.auth.signUp({ email, password, options: { data: { nickname } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setMessage('Confira seus dados e tente novamente.');
      return;
    }
    if (signUp && nickname.trim() && result.data.user) {
      // Garante o apelido também na tabela profiles (se a política permitir)
      await supabase
        .from('profiles')
        .update({ nickname: nickname.trim() })
        .eq('id', result.data.user.id);
    }
    setMessage(signUp ? 'Conta criada. Você já pode jogar.' : 'Login realizado.');
    onClose();
  };
  if (loggedIn) {
    return (
      <div className="modal-backdrop">
        <div className="login-modal">
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
          <div className="eyebrow">
            <LogIn size={14} /> SUA CONTA
          </div>
          <h2>
            OLÁ, <em>{nickname.toUpperCase()}</em>
          </h2>
          <p>Você está conectado.</p>
          <div className="modal-actions">
            <button className="outline-button" onClick={onClose}>
              Fechar
            </button>
            <button className="gold-button" onClick={() => void onLogout()}>
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="modal-backdrop">
      <div className="login-modal">
        <button className="close-button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="eyebrow">
          <LogIn size={14} /> ACESSO DO JOGADOR
        </div>
        <h2>
          ENTRE PARA <em>RANQUEAR</em>
        </h2>
        <p>Salve suas vitórias e acompanhe sua evolução.</p>
        <label>
          Apelido
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Seu apelido" />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@email.com"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>
        {message && <div className="form-message">{message}</div>}
        <div className="modal-actions">
          <button className="gold-button" onClick={() => void submit(false)}>
            Entrar
          </button>
          <button className="outline-button" onClick={() => void submit(true)}>
            Criar conta
          </button>
        </div>
      </div>
    </div>
  );
}
