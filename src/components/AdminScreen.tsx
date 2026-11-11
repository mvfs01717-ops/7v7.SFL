import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft, Check, Download, Edit3, Plus, Search, ShieldAlert, Trash2, Upload, Users, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isFreeAgent } from '@/lib/game/helpers';

type Position = 'GK' | 'LB' | 'RB' | 'CM' | 'LF' | 'RF' | 'CF';
type Team = {
  id: string;
  name: string;
  abbreviation: string;
  primary_color: string;
  secondary_color: string;
};
type Player = {
  id: string;
  name: string;
  overall: number;
  primary_position: Position;
  alternate_positions: Position[];
  team_id: string;
  image_url?: string | null;
  team?: Team;
};
type Notice = { text: string; error: boolean };
type TeamDraft = {
  id: string;
  name: string;
  abbreviation: string;
  primary_color: string;
  secondary_color: string;
};

const positions: Position[] = ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'];
const emptyTeam: TeamDraft = {
  id: '',
  name: '',
  abbreviation: '',
  primary_color: '#F5B800',
  secondary_color: '#FFFFFF',
};

const ovrBox = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  minHeight: 46,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.14)',
  background: '#070b10',
} as const;
const ovrLabel = { color: '#8b95a3', fontSize: 12, fontWeight: 700, letterSpacing: 1 } as const;
const ovrInput = {
  width: 44,
  padding: '6px 4px',
  textAlign: 'center',
  color: '#fff',
  background: 'transparent',
  border: 0,
  borderBottom: '1px solid rgba(255,255,255,.25)',
  outline: 'none',
  fontSize: 15,
} as const;

const adminCss = `
.admin-page { overflow-x: hidden; }
.admin-page input, .admin-page select { font-size: 16px; }
@media (max-width: 720px) {
  .admin-page { padding-left: 14px !important; padding-right: 14px !important; }
  .admin-page .admin-title { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 14px !important; }
  .admin-page .admin-title h2 { font-size: 44px !important; line-height: 1 !important; }
  .admin-page .admin-title > button { width: 100% !important; justify-content: center; min-height: 48px; }
  .admin-page .admin-panel { padding: 14px 12px !important; }
  .admin-page .admin-toolbar { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
  .admin-page .admin-toolbar > * { width: 100% !important; min-width: 0 !important; box-sizing: border-box; min-height: 48px; }
  .admin-page .admin-toolbar .search-box,
  .admin-page .admin-toolbar .ovr-box,
  .admin-page .admin-toolbar .btn-wide { grid-column: 1 / -1 !important; }
  .admin-page .admin-toolbar .search-box input { width: 100% !important; }
  .admin-page .admin-table-head { display: none !important; }
  .admin-page .admin-row { display: grid !important; grid-template-columns: 1fr auto !important; gap: 4px 12px !important; padding: 14px 4px !important; align-items: center !important; }
  .admin-page .admin-row > :nth-child(1) { grid-column: 1; grid-row: 1; font-size: 17px; word-break: break-word; }
  .admin-page .admin-row > :nth-child(4) { grid-column: 2; grid-row: 1; justify-self: end; font-size: 24px; }
  .admin-page .admin-row > :nth-child(2) { grid-column: 1; grid-row: 2; font-size: 13px; opacity: .8; }
  .admin-page .admin-row > :nth-child(3) { grid-column: 1; grid-row: 3; font-size: 13px; opacity: .8; }
  .admin-page .admin-row > :nth-child(5) { grid-column: 2; grid-row: 2 / span 2; justify-self: end; display: flex !important; gap: 8px; }
  .admin-page .row-actions button { width: 46px !important; height: 46px !important; display: inline-flex; align-items: center; justify-content: center; }
  .admin-page .admin-foot { display: flex !important; flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
  .admin-page .admin-foot span { display: flex; flex-wrap: wrap; gap: 6px 12px; }
  .admin-page .team-form { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
  .admin-page .team-form input[type="text"], .admin-page .team-form input:not([type]) { grid-column: 1 / -1; width: 100% !important; box-sizing: border-box; }
  .admin-page .team-form button { grid-column: 1 / -1; min-height: 48px; }
  .admin-page .modal-backdrop { align-items: flex-start !important; padding: 0 !important; }
  .admin-page .player-form { width: 100% !important; max-width: none !important; height: 100dvh !important; max-height: 100dvh !important; border-radius: 0 !important; padding: 18px 16px 0 !important; box-sizing: border-box; overflow-y: auto !important; }
  .admin-page .player-form .form-two { grid-template-columns: 1fr !important; }
  .admin-page .player-form input, .admin-page .player-form select { min-height: 48px; width: 100%; box-sizing: border-box; }
  .admin-page .player-form .alternative-grid button { min-height: 44px; min-width: 56px; }
  .admin-page .player-form .modal-actions { position: sticky; bottom: 0; display: grid !important; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 0 16px; background: #0b1016; margin-top: 16px; }
  .admin-page .player-form .modal-actions button { min-height: 50px; }
}
`;

function toneFor(overall: number) {
  return overall >= 90 ? 'special' : overall >= 75 ? 'gold' : overall >= 65 ? 'silver' : 'bronze';
}

// Leitor simples de CSV (aceita aspas e vírgula ou ponto e vírgula)
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function AdminScreen({
  players,
  teams,
  onBack,
  onReload,
}: {
  players: Player[];
  teams: Team[];
  onBack: () => void;
  onReload: () => Promise<void>;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('ALL');
  const [team, setTeam] = useState('ALL');
  const [minOvr, setMinOvr] = useState('');
  const [maxOvr, setMaxOvr] = useState('');
  const [sort, setSort] = useState('overall');
  const [editing, setEditing] = useState<Player | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showTeams, setShowTeams] = useState(false);
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(emptyTeam);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;

  function say(text: string, error = false) {
    setNotice({ text, error });
  }

  // Só entra quem está logado e tem role = 'admin' em profiles
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAllowed(false);
        backRef.current();
        return;
      }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (data?.role !== 'admin') {
        setAllowed(false);
        backRef.current();
        return;
      }
      setAllowed(true);
    })();
  }, []);

  const filtered = useMemo(() => {
    const loRaw = parseInt(minOvr, 10);
    const hiRaw = parseInt(maxOvr, 10);
    const lo = Number.isFinite(loRaw) ? loRaw : 0;
    const hi = Number.isFinite(hiRaw) ? hiRaw : 99;
    return players
      .filter(
        (player) =>
          player.name.toLowerCase().includes(query.toLowerCase()) &&
          (position === 'ALL' ||
            player.primary_position === position ||
            (player.alternate_positions ?? []).includes(position as Position)) &&
          (team === 'ALL' || player.team_id === team) &&
          (Number(player.overall) || 0) >= lo &&
          (Number(player.overall) || 0) <= hi,
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'team'
            ? a.team_id.localeCompare(b.team_id)
            : b.overall - a.overall,
      );
  }, [players, query, position, team, minOvr, maxOvr, sort]);

  if (allowed !== true) {
    return (
      <div className="loading-screen">
        <ShieldAlert size={38} color="#f5b800" />
        <p>Verificando acesso de administrador...</p>
      </div>
    );
  }

  const teamName = (id: string) => teams.find((item) => item.id === id)?.abbreviation ?? '—';

  async function removePlayer(player: Player) {
    if (!window.confirm(`Excluir ${player.name}?`)) return;
    const { error } = await supabase.from('players').delete().eq('id', player.id);
    if (error) {
      say(`Erro ao excluir: ${error.message}`, true);
      return;
    }
    say('Jogador excluído.');
    await onReload();
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: teamDraft.name.trim(),
      abbreviation: teamDraft.abbreviation.trim().toUpperCase(),
      primary_color: teamDraft.primary_color,
      secondary_color: teamDraft.secondary_color,
    };
    if (!payload.name || !payload.abbreviation) {
      say('Preencha nome e sigla do time.', true);
      return;
    }
    const result = teamDraft.id
      ? await supabase.from('teams').update(payload).eq('id', teamDraft.id)
      : await supabase.from('teams').insert(payload);
    if (result.error) {
      say(`Erro ao salvar time: ${result.error.message}`, true);
      return;
    }
    say(teamDraft.id ? 'Time atualizado.' : 'Time criado.');
    setTeamDraft(emptyTeam);
    await onReload();
  }

  async function removeTeam(item: Team) {
    if (isFreeAgent(item)) {
      say('O time Free Agent é fixo (jogadores sem time) e não pode ser excluído.', true);
      return;
    }
    const count = players.filter((player) => player.team_id === item.id).length;
    const warn = count ? ` Ele tem ${count} jogadores cadastrados.` : '';
    if (!window.confirm(`Excluir o time ${item.name}?${warn}`)) return;
    const { error } = await supabase.from('teams').delete().eq('id', item.id);
    if (error) {
      say(`Erro ao excluir time: ${error.message}`, true);
      return;
    }
    say('Time excluído.');
    await onReload();
  }

  function exportCsv() {
    const lines = ['name,overall,primary_position,alternate_positions,team'];
    players.forEach((player) => {
      lines.push(
        [
          csvCell(player.name),
          player.overall,
          player.primary_position,
          csvCell(player.alternate_positions.join('|')),
          csvCell(teamName(player.team_id)),
        ].join(','),
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jogadores-7v7.csv';
    link.click();
    URL.revokeObjectURL(url);
    say(`${players.length} jogadores exportados.`);
  }

  async function importCsv(file: File) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      say('O CSV está vazio ou sem linhas de jogadores.', true);
      return;
    }
    const header = rows[0].map((value) => value.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const iName = col('name');
    const iOvr = col('overall');
    const iPos = col('primary_position');
    const iAlt = col('alternate_positions');
    const iTeam = col('team');
    if (iName < 0 || iOvr < 0 || iPos < 0 || iTeam < 0) {
      say('Cabeçalho esperado: name,overall,primary_position,alternate_positions,team', true);
      return;
    }
    const known = new Set(players.map((player) => player.name.toLowerCase()));
    const valid: Record<string, unknown>[] = [];
    const problems: string[] = [];
    rows.slice(1).forEach((cells, index) => {
      const line = index + 2;
      const name = (cells[iName] ?? '').trim();
      const overall = Number(cells[iOvr]);
      const primary = (cells[iPos] ?? '').trim().toUpperCase() as Position;
      const alts = iAlt >= 0 ? (cells[iAlt] ?? '').split(/[|;/ ]+/).map((v) => v.trim().toUpperCase()).filter(Boolean) : [];
      const teamKey = (cells[iTeam] ?? '').trim().toLowerCase();
      const found = teams.find(
        (item) =>
          item.abbreviation.toLowerCase() === teamKey ||
          item.name.toLowerCase() === teamKey ||
          (isFreeAgent(item) && ['free agent', 'free agents', 'fa', 'sem time', 'sem clube', 'agente livre'].includes(teamKey)),
      );
      let why = '';
      if (!name) why = 'sem nome';
      else if (known.has(name.toLowerCase())) why = 'nome repetido';
      else if (!(overall >= 40 && overall <= 99)) why = 'overall fora de 40 a 99';
      else if (!positions.includes(primary)) why = 'posição inválida';
      else if (alts.some((alt) => !positions.includes(alt as Position) || alt === primary)) why = 'posição alternativa inválida';
      else if (primary === 'GK' && alts.length) why = 'goleiro sem alternativas';
      else if (!found) why = 'time não encontrado';
      if (why) {
        problems.push(`linha ${line} (${name || '?'}): ${why}`);
        return;
      }
      known.add(name.toLowerCase());
      valid.push({
        name,
        overall: Math.round(overall),
        primary_position: primary,
        alternate_positions: alts,
        team_id: found?.id,
      });
    });
    if (valid.length) {
      const { error } = await supabase.from('players').insert(valid);
      if (error) {
        say(`Erro ao importar: ${error.message}`, true);
        return;
      }
      await onReload();
    }
    const skipped = problems.length ? ` ${problems.length} ignoradas: ${problems.slice(0, 3).join('; ')}` : '';
    say(`${valid.length} jogadores importados.${skipped}`, valid.length === 0);
  }

  const countFor = (item: Position) =>
    players.filter(
      (player) => player.primary_position === item || player.alternate_positions.includes(item),
    ).length;

  return (
    <main className="admin-page simple-page">
      <style>{adminCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar ao jogo
      </button>
      <div className="admin-title">
        <div>
          <div className="eyebrow">
            <ShieldAlert size={14} /> PAINEL RESTRITO
          </div>
          <h2>
            GESTÃO DO <em>7V7</em>
          </h2>
          <p>As mudanças aparecem nos próximos drafts sem alterar partidas anteriores.</p>
        </div>
        <button className="outline-button" onClick={() => setShowTeams(!showTeams)}>
          <Plus size={15} /> Gerenciar times
        </button>
      </div>

      {notice && (
        <div className="admin-notice" style={notice.error ? { color: '#ff7a7a', borderColor: '#ff7a7a' } : undefined}>
          <Check size={15} /> {notice.text}
        </div>
      )}

      {showTeams && (
        <section className="admin-panel" style={{ marginBottom: 16, padding: 16 }}>
          <div className="eyebrow">TIMES CADASTRADOS</div>
          {teams.map((item) => (
            <div
              key={item.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}
            >
              <span
                style={{
                  background: item.primary_color,
                  border: `2px solid ${item.secondary_color}`,
                  borderRadius: 8,
                  padding: '2px 8px',
                  fontWeight: 700,
                }}
              >
                {item.abbreviation}
              </span>
              <b style={{ flex: 1 }}>{item.name}</b>
              <span>{players.filter((player) => player.team_id === item.id).length} jogadores</span>
              <span className="row-actions">
                <button onClick={() => setTeamDraft({ ...item })}>
                  <Edit3 size={14} />
                </button>
                <button onClick={() => void removeTeam(item)} disabled={isFreeAgent(item)} title={isFreeAgent(item) ? 'Time fixo' : 'Excluir'}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
          <form className="team-form" onSubmit={(event) => void saveTeam(event)}>
            <input
              required
              placeholder="Nome do time"
              value={teamDraft.name}
              onChange={(event) => setTeamDraft({ ...teamDraft, name: event.target.value })}
            />
            <input
              required
              maxLength={4}
              placeholder="Sigla"
              value={teamDraft.abbreviation}
              onChange={(event) =>
                setTeamDraft({ ...teamDraft, abbreviation: event.target.value.toUpperCase() })
              }
            />
            <label>
              Principal
              <input
                type="color"
                value={teamDraft.primary_color}
                onChange={(event) => setTeamDraft({ ...teamDraft, primary_color: event.target.value })}
              />
            </label>
            <label>
              Secundária
              <input
                type="color"
                value={teamDraft.secondary_color}
                onChange={(event) => setTeamDraft({ ...teamDraft, secondary_color: event.target.value })}
              />
            </label>
            <button className="gold-button" type="submit">
              {teamDraft.id ? 'Atualizar time' : 'Salvar time'}
            </button>
            {teamDraft.id && (
              <button className="outline-button" type="button" onClick={() => setTeamDraft(emptyTeam)}>
                Cancelar edição
              </button>
            )}
          </form>
        </section>
      )}

      <section className="admin-panel">
        <div className="admin-toolbar">
          <div className="search-box">
            <Search size={15} />
            <input
              placeholder="Buscar jogador..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="ALL">Todas as posições</option>
            {positions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="ALL">Todos os times</option>
            {teams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="ovr-box" style={ovrBox}>
            <span style={ovrLabel}>OVR</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              placeholder="mín"
              aria-label="Overall mínimo"
              value={minOvr}
              onChange={(event) => setMinOvr(event.target.value.replace(/\D/g, ''))}
              style={ovrInput}
            />
            <span style={ovrLabel}>a</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              placeholder="máx"
              aria-label="Overall máximo"
              value={maxOvr}
              onChange={(event) => setMaxOvr(event.target.value.replace(/\D/g, ''))}
              style={ovrInput}
            />
            {(minOvr || maxOvr) && (
              <button
                type="button"
                aria-label="Limpar filtro de overall"
                onClick={() => {
                  setMinOvr('');
                  setMaxOvr('');
                }}
                style={{ ...ovrLabel, background: 'none', border: 0, cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="overall">Maior overall</option>
            <option value="name">Nome</option>
            <option value="team">Time</option>
          </select>
          <button
            className="gold-button btn-wide"
            onClick={() =>
              setEditing({
                id: '',
                name: '',
                overall: 80,
                primary_position: 'CF',
                alternate_positions: [],
                team_id: teams[0]?.id ?? '',
              })
            }
          >
            <Plus size={15} /> Adicionar jogador
          </button>
          <button className="outline-button" onClick={exportCsv}>
            <Download size={15} /> Exportar CSV
          </button>
          <button className="outline-button" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Importar CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importCsv(file);
            }}
          />
        </div>

        <div className="admin-table">
          <div className="admin-table-head">
            <span>JOGADOR</span>
            <span>POSIÇÃO</span>
            <span>TIME</span>
            <span>OVR</span>
            <span>AÇÕES</span>
          </div>
          {filtered.map((player) => (
            <div className="admin-row" key={player.id}>
              <b>{player.name}</b>
              <span>
                {player.primary_position}
                {player.alternate_positions.length ? ` · ${player.alternate_positions.join(', ')}` : ''}
              </span>
              <span>{teamName(player.team_id)}</span>
              <strong>{player.overall}</strong>
              <span className="row-actions">
                <button onClick={() => setEditing(player)}>
                  <Edit3 size={14} />
                </button>
                <button onClick={() => void removePlayer(player)}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="admin-foot">
          <span>
            <Users size={14} /> {filtered.length} jogadores exibidos de {players.length}
          </span>
          <span>
            {positions.map((item) => (
              <b key={item} className={countFor(item) < 5 ? 'warning' : ''}>
                {item}: {countFor(item)}
              </b>
            ))}
          </span>
        </div>
      </section>

      {editing && (
        <PlayerForm
          player={editing}
          teams={teams}
          players={players}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            say('Jogador salvo.');
            await onReload();
          }}
        />
      )}
    </main>
  );
}

// Reduz a imagem (máx. 640 px de largura) para o site carregar rápido, mantendo a transparência
function resizeImage(file: File, maxWidth = 640): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível processar a imagem.'))),
        'image/webp',
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Arquivo de imagem inválido.'));
    };
    img.src = url;
  });
}

function PlayerForm({
  player,
  teams,
  players,
  onClose,
  onSaved,
}: {
  player: Player;
  teams: Team[];
  players: Player[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Player>(player);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isNew = !player.id;

  async function uploadImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setMessage('Escolha um arquivo de imagem (PNG, JPG ou WEBP).');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setMessage('A imagem precisa ter até 12 MB.');
      return;
    }
    setUploading(true);
    setMessage('');
    let body: Blob = file;
    let type = file.type;
    let ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    try {
      body = await resizeImage(file);
      type = 'image/webp';
      ext = 'webp';
    } catch {
      if (file.size > 3 * 1024 * 1024) {
        setUploading(false);
        setMessage('Não consegui reduzir a imagem. Use um arquivo de até 3 MB.');
        return;
      }
    }
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('player-images')
      .upload(path, body, { contentType: type, upsert: false });
    setUploading(false);
    if (error) {
      setMessage(`Erro ao enviar a imagem: ${error.message}`);
      return;
    }
    const { data } = supabase.storage.from('player-images').getPublicUrl(path);
    setForm((current) => ({ ...current, image_url: data.publicUrl }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    const overall = Number(form.overall);
    if (!name) {
      setMessage('Digite o nome do jogador.');
      return;
    }
    if (players.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== form.id)) {
      setMessage('Já existe um jogador com esse nome.');
      return;
    }
    if (!(overall >= 40 && overall <= 99)) {
      setMessage('O overall precisa estar entre 40 e 99.');
      return;
    }
    if (form.alternate_positions.includes(form.primary_position)) {
      setMessage('A posição alternativa não pode ser igual à principal.');
      return;
    }
    if (form.primary_position === 'GK' && form.alternate_positions.length) {
      setMessage('Goleiro não pode ter posições alternativas.');
      return;
    }
    if (!form.team_id) {
      setMessage('Escolha um time.');
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      overall: Math.round(overall),
      primary_position: form.primary_position,
      alternate_positions: form.alternate_positions,
      team_id: form.team_id,
    };
    // A imagem só vai para o banco se tiver valor (ou se estiver sendo removida)
    if (form.image_url) payload.image_url = form.image_url;
    else if (player.image_url) payload.image_url = null;

    setSaving(true);
    const result = isNew
      ? await supabase.from('players').insert(payload)
      : await supabase.from('players').update(payload).eq('id', form.id);
    setSaving(false);
    if (result.error) {
      setMessage(`Erro ao salvar: ${result.error.message}`);
      return;
    }
    await onSaved();
  }

  function toggleAlternative(item: Position) {
    setForm({
      ...form,
      alternate_positions: form.alternate_positions.includes(item)
        ? form.alternate_positions.filter((value) => value !== item)
        : [...form.alternate_positions, item],
    });
  }

  function changePrimary(value: Position) {
    setForm({
      ...form,
      primary_position: value,
      alternate_positions: value === 'GK' ? [] : form.alternate_positions.filter((item) => item !== value),
    });
  }

  return (
    <div className="modal-backdrop">
      <form
        className="player-form"
        onSubmit={(event) => void save(event)}
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <button type="button" className="close-button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="eyebrow">{isNew ? 'NOVA CARTA' : 'EDITAR CARTA'}</div>
        <h2>
          {isNew ? 'ADICIONAR' : 'EDITAR'} <em>JOGADOR</em>
        </h2>

        <fieldset>
          <legend>Imagem da carta</legend>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px' }}>
            {form.image_url ? (
              <img
                src={form.image_url}
                alt="Prévia da carta"
                style={{ width: 190, height: 'auto', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: 190,
                  height: 140,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 13,
                  opacity: 0.7,
                  border: '1px dashed rgba(255,255,255,.3)',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                Sem imagem. O site usa a carta padrão.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <label className="outline-button" style={{ cursor: 'pointer', display: 'inline-flex', gap: 6 }}>
              {uploading ? 'Enviando...' : form.image_url ? 'Trocar imagem' : 'Enviar imagem da carta'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadImage(file);
                }}
              />
            </label>
            {form.image_url && (
              <button
                type="button"
                className="outline-button"
                onClick={() => setForm({ ...form, image_url: null })}
              >
                Remover imagem
              </button>
            )}
          </div>
          <input
            placeholder="ou cole o link da imagem (https://...)"
            value={form.image_url ?? ''}
            onChange={(event) => setForm({ ...form, image_url: event.target.value || null })}
            style={{ marginTop: 8 }}
          />
          <small style={{ opacity: 0.7 }}>
            Envie a carta inteira, como no seu exemplo. Dica: recorte só a carta, de preferência em PNG com
            fundo transparente.
          </small>
        </fieldset>

        <label>
          Nome ou apelido
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <div className="form-two">
          <label>
            Overall
            <input
              type="number"
              min="40"
              max="99"
              value={form.overall}
              onChange={(event) => setForm({ ...form, overall: Number(event.target.value) })}
            />
          </label>
          <label>
            Time
            <select
              value={form.team_id}
              onChange={(event) => setForm({ ...form, team_id: event.target.value })}
            >
              {teams.map((item) => (
                <option key={item.id} value={item.id}>
                  {isFreeAgent(item) ? 'Free Agent (sem time)' : item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Posição principal
          <select
            value={form.primary_position}
            onChange={(event) => changePrimary(event.target.value as Position)}
          >
            {positions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <fieldset disabled={form.primary_position === 'GK'}>
          <legend>Posições alternativas</legend>
          <div className="alternative-grid">
            {positions
              .filter((item) => item !== form.primary_position)
              .map((item) => (
                <button
                  type="button"
                  key={item}
                  className={form.alternate_positions.includes(item) ? 'chosen' : ''}
                  onClick={() => toggleAlternative(item)}
                >
                  {item}
                </button>
              ))}
          </div>
        </fieldset>

        {message && <div className="form-message">{message}</div>}
        <div className="modal-actions">
          <button className="gold-button" type="submit" disabled={saving || uploading}>
            {saving ? 'Salvando...' : 'Salvar carta'}
          </button>
          <button className="outline-button" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
