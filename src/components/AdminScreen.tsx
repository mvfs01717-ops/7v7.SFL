import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft, Check, Database, Download, Edit3, Plus, Search, Shield, ShieldAlert, Trash2, Upload, Users, X,
} from 'lucide-react';
import { stadiumCss } from '@/lib/game/stadiumCss';
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
type AuditRow = {
  id: number;
  created_at: string;
  actor_nick: string | null;
  table_name: 'players' | 'teams';
  action: 'insert' | 'update' | 'delete';
  row_id: string;
  label: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  undone_at: string | null;
  undone_by: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  overall: 'Overall',
  primary_position: 'Posição',
  alternate_positions: 'Alternativas',
  team_id: 'Time',
  image_url: 'Foto',
  abbreviation: 'Sigla',
  primary_color: 'Cor principal',
  secondary_color: 'Cor secundária',
};
const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at']);

function whenText(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  const rel = min < 1 ? 'agora' : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : `há ${Math.floor(min / 1440)} d`;
  return `${rel} · ${date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
}
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
.ad-lead { display: flex; align-items: center; gap: 10px; }
.ad-chk { appearance: none; -webkit-appearance: none; flex: none; width: 22px; height: 22px; margin: 0; border-radius: 7px; border: 2px solid rgba(255,255,255,.35); background: rgba(255,255,255,.04); cursor: pointer; display: grid; place-items: center; transition: background .15s, border-color .15s; }
.ad-chk:hover { border-color: var(--ac, #F5B800); }
.ad-chk:checked { background: var(--ac, #F5B800); border-color: var(--ac, #F5B800); }
.ad-chk:checked::after { content: '✓'; color: #11161f; font-weight: 900; font-size: 14px; line-height: 1; }
.ad-chk:indeterminate { background: color-mix(in srgb, var(--ac, #F5B800) 45%, transparent); border-color: var(--ac, #F5B800); }
.ad-chk:indeterminate::after { content: '–'; color: #fff; font-weight: 900; font-size: 15px; line-height: 1; }
.ad-row.sel { background: color-mix(in srgb, var(--ac, #F5B800) 14%, transparent); border-color: color-mix(in srgb, var(--ac, #F5B800) 45%, transparent); }
.ad-bulk { position: fixed; z-index: 60; left: 50%; bottom: 18px; transform: translateX(-50%); width: min(980px, calc(100vw - 28px)); box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; padding: 12px 14px; border-radius: 16px; background: rgba(9,14,32,.96); border: 1px solid var(--ac, #F5B800); box-shadow: 0 18px 44px rgba(0,0,0,.6); backdrop-filter: blur(12px); animation: adToast .25s ease-out; }
.ad-bulk-n { font-weight: 900; font-size: 14px; white-space: nowrap; }
.ad-bulk-n small { display: block; font-size: 11px; font-weight: 700; opacity: .6; }
.ad-bulk-g { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-left: 14px; border-left: 1px solid rgba(255,255,255,.14); }
.ad-bulk select, .ad-bulk input[type='text'] { min-height: 42px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: #070b14; color: #fff; padding: 0 10px; }
.ad-bulk input[type='text'] { width: 74px; text-align: center; }
.ad-bulk .ad-btn { min-height: 42px; padding: 0 14px; }
.ad-bulk-x { margin-left: auto; }
@media (max-width: 720px) { .ad-bulk { bottom: 8px; } .ad-bulk-g { padding-left: 0; border-left: 0; width: 100%; } .ad-bulk-g select { flex: 1; min-width: 0; } .ad-bulk-x { margin-left: 0; } }
.ad-hist { display: grid; gap: 10px; }
.ad-hist-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.ad-hist-bar .ad-btn { min-height: 38px; padding: 0 14px; }
.ad-hist-bar .ad-btn.on { border-color: var(--ac, #F5B800); background: color-mix(in srgb, var(--ac, #F5B800) 22%, transparent); }
.ad-hist-bar span { margin-left: auto; font-size: 12px; opacity: .6; }
.ad-ev { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 14px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
.ad-ev.undone { opacity: .55; }
.ad-ev-ico { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-weight: 900; font-size: 18px; }
.ad-ev-ico.insert { background: rgba(34,197,94,.2); color: #86efac; } .ad-ev-ico.update { background: rgba(245,184,0,.2); color: #fcd34d; } .ad-ev-ico.delete { background: rgba(239,68,68,.22); color: #fca5a5; }
.ad-ev h4 { margin: 0; font-size: 15px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ad-ev h4 s { opacity: .6; }
.ad-tag { font-size: 10px; letter-spacing: 1.5px; font-weight: 900; padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,.12); }
.ad-ev-meta { margin-top: 3px; font-size: 12px; opacity: .6; }
.ad-diff { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13px; }
.ad-diff li { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ad-diff b { opacity: .6; min-width: 96px; font-weight: 700; }
.ad-diff del { color: #fca5a5; text-decoration-thickness: 1px; } .ad-diff ins { color: #86efac; text-decoration: none; font-weight: 800; }
.ad-sw { display: inline-block; width: 12px; height: 12px; border-radius: 4px; border: 1px solid rgba(255,255,255,.4); vertical-align: -1px; margin-right: 4px; }
.ad-undo { white-space: nowrap; }
@media (max-width: 720px) { .ad-ev { grid-template-columns: 40px minmax(0, 1fr); } .ad-ev .ad-undo { grid-column: 1 / -1; } .ad-diff b { min-width: 80px; } }

.admin-page.ad { max-width: 1180px; margin: 0 auto; padding: 18px 20px 60px; overflow-x: hidden; box-sizing: border-box; width: 100%; }
.admin-page input, .admin-page select { font-size: 16px; }
.ad-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 6px 0 20px; }
.ad-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 3px; color: var(--ac, #F5B800); }
.ad-top h2 { margin: 4px 0 4px; font-size: clamp(34px, 5.5vw, 54px); line-height: 1; font-style: italic; font-weight: 900; letter-spacing: 1px; }
.ad-top h2 em { color: var(--ac, #F5B800); }
.ad-top p { margin: 0; font-size: 13px; opacity: .65; max-width: 560px; }
.ad-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.ad-kpi { position: relative; overflow: hidden; padding: 16px 16px 14px; border-radius: 6px 18px 6px 18px; background: linear-gradient(160deg, rgba(18,28,58,.82), rgba(9,14,32,.82)); border: 1px solid rgba(255,255,255,.1); }
.ad-kpi::after { content: ''; position: absolute; left: 0; top: 0; height: 3px; width: 46%; background: linear-gradient(90deg, var(--ac, #F5B800), transparent); }
.ad-kpi small { display: block; font-size: 10px; font-weight: 800; letter-spacing: 2px; opacity: .6; }
.ad-kpi b { display: block; margin-top: 6px; font-size: 32px; line-height: 1; font-weight: 900; }
.ad-kpi span { display: block; margin-top: 6px; font-size: 12px; opacity: .6; }
.ad-kpi.warn b { color: #ffb347; }
.ad-tabs { display: flex; gap: 6px; padding: 5px; width: fit-content; max-width: 100%; margin-bottom: 14px; border-radius: 14px; background: rgba(8,13,30,.8); border: 1px solid rgba(255,255,255,.1); overflow-x: auto; }
.ad-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border: 0; border-radius: 10px; background: transparent; color: #fff; font-weight: 800; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; white-space: nowrap; opacity: .7; transition: background .2s, opacity .2s; }
.ad-tab:hover { opacity: 1; background: rgba(255,255,255,.06); }
.ad-tab.on { opacity: 1; color: #11161f; background: linear-gradient(180deg, color-mix(in srgb, var(--ac, #F5B800) 60%, #fff), var(--ac, #F5B800)); }
.ad-tab em { font-style: normal; font-size: 11px; padding: 2px 7px; border-radius: 99px; background: rgba(0,0,0,.25); }
.ad-tab.on em { background: rgba(0,0,0,.18); }
.ad-card { padding: 16px; border-radius: 6px 20px 6px 20px; background: linear-gradient(160deg, rgba(14,22,48,.8), rgba(8,13,30,.8)); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(8px); }
.ad-toolbar { display: grid; grid-template-columns: minmax(200px, 1.6fr) repeat(4, minmax(120px, 1fr)) auto; gap: 10px; align-items: center; margin-bottom: 14px; }
.ad-toolbar .search-box { display: flex; align-items: center; gap: 8px; padding: 0 12px; min-height: 46px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: #070b14; }
.ad-toolbar .search-box input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: #fff; }
.ad-toolbar select { min-height: 46px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: #070b14; color: #fff; padding: 0 10px; }
.ad-toolbar .ovr-box { justify-content: center; }
.ad-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 46px; padding: 0 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.05); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; white-space: nowrap; }
.ad-btn:hover { background: rgba(255,255,255,.1); }
.ad-btn.gold { border: 0; color: #11161f; background: linear-gradient(180deg, color-mix(in srgb, var(--ac, #F5B800) 60%, #fff), var(--ac, #F5B800)); }
.ad-btn.gold:hover { filter: brightness(1.06); }
.ad-btn:disabled { opacity: .4; cursor: not-allowed; }
.ad-head, .ad-row { display: grid; grid-template-columns: 88px minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1fr) 64px 92px; gap: 12px; align-items: center; }
.ad-head { padding: 0 12px 8px; font-size: 10px; font-weight: 800; letter-spacing: 2px; opacity: .5; }
.ad-row { padding: 9px 12px; border-radius: 12px; border: 1px solid transparent; transition: background .15s, border-color .15s; }
.ad-row:nth-child(odd) { background: rgba(255,255,255,.025); }
.ad-row:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.1); }
.ad-ava { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; overflow: hidden; background: linear-gradient(160deg, rgba(255,255,255,.14), rgba(255,255,255,.04)); border: 1px solid rgba(255,255,255,.14); font-weight: 900; font-size: 17px; }
.ad-ava img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.ad-name { min-width: 0; }
.ad-name b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.ad-name small { display: block; margin-top: 2px; font-size: 11px; opacity: .55; }
.ad-pos { display: flex; flex-wrap: wrap; gap: 4px; }
.ad-chip { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 800; letter-spacing: .5px; background: rgba(255,255,255,.1); }
.ad-chip.main { background: color-mix(in srgb, var(--ac, #F5B800) 28%, transparent); color: #fff3c4; }
.ad-row > * { min-width: 0; }
.ad-team span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ad-team { display: inline-flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; font-weight: 700; }
.ad-team i { font-style: normal; flex: none; min-width: 34px; padding: 3px 7px; border-radius: 7px; text-align: center; font-size: 11px; font-weight: 900; border: 2px solid; }
.ad-ovr { display: grid; place-items: center; width: 52px; height: 36px; border-radius: 9px; font-weight: 900; font-size: 19px; color: #11161f; }
.ad-ovr.special { background: linear-gradient(160deg, #fff0a6, #f2c230); } .ad-ovr.gold { background: linear-gradient(160deg, #f7dd8a, #e0a92a); }
.ad-ovr.silver { background: linear-gradient(160deg, #f4f6f9, #b6bec9); } .ad-ovr.bronze { background: linear-gradient(160deg, #f4bb8f, #d0804a); }
.ad-act { display: flex; gap: 6px; justify-content: flex-end; }
.ad-ico { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.05); color: #fff; cursor: pointer; }
.ad-ico:hover { background: rgba(255,255,255,.14); }
.ad-ico.danger:hover { background: rgba(255,90,90,.25); border-color: #ff6b6b; color: #ffb3b3; }
.ad-ico:disabled { opacity: .35; cursor: not-allowed; }
.ad-empty { padding: 40px 10px; text-align: center; opacity: .6; }
.ad-more { display: flex; justify-content: center; margin-top: 12px; }
.ad-foot { margin-top: 12px; font-size: 12px; opacity: .6; display: flex; gap: 8px; align-items: center; }
.ad-clubs { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr); gap: 16px; align-items: start; }
.ad-club-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.ad-club { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); }
.ad-club.on { border-color: var(--ac, #F5B800); box-shadow: 0 0 0 1px var(--ac, #F5B800); }
.ad-shield { flex: none; width: 46px; height: 52px; display: grid; place-items: center; font-weight: 900; font-size: 12px; clip-path: polygon(50% 0, 100% 12%, 100% 60%, 50% 100%, 0 60%, 0 12%); }
.ad-club > div:not(.ad-shield) { min-width: 0; flex: 1; }
.ad-club b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.ad-club small { opacity: .6; font-size: 12px; }
.ad-form { display: grid; gap: 10px; }
.ad-form h3 { margin: 0; font-size: 15px; letter-spacing: 1px; text-transform: uppercase; }
.ad-form input[type='text'], .ad-form input:not([type]) { min-height: 46px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: #070b14; color: #fff; width: 100%; box-sizing: border-box; }
.ad-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ad-colors label { display: grid; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; opacity: .85; }
.ad-colors input[type='color'] { width: 100%; height: 44px; padding: 3px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: #070b14; cursor: pointer; }
.ad-preview { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; background: rgba(255,255,255,.04); font-size: 13px; opacity: .9; }
.ad-data { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ad-card h3 { margin: 0 0 12px; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; opacity: .85; }
.ad-bars { display: grid; gap: 10px; }
.ad-bar { display: grid; grid-template-columns: 38px 1fr 40px; gap: 10px; align-items: center; font-size: 13px; font-weight: 800; }
.ad-bar > i { height: 10px; border-radius: 99px; background: rgba(255,255,255,.08); overflow: hidden; display: block; }
.ad-bar > i > u { display: block; height: 100%; border-radius: inherit; text-decoration: none; background: linear-gradient(90deg, #22c55e, #86efac); }
.ad-bar.low > i > u { background: linear-gradient(90deg, #f59e0b, #fcd34d); }
.ad-bar.low span { color: #ffb347; }
.ad-bar span { text-align: right; }
.ad-note { margin: 12px 0 0; font-size: 12px; opacity: .6; }
.ad-checks { display: grid; gap: 8px; margin-bottom: 14px; }
.ad-check { box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-size: 13px; text-align: left; color: #fff; width: 100%; cursor: default; }
button.ad-check { cursor: pointer; } button.ad-check:hover { background: rgba(255,255,255,.09); }
.ad-check.ok::before { content: '✓'; color: #4ade80; font-weight: 900; } .ad-check.bad::before { content: '⚠'; color: #ffb347; }
.ad-tools { display: grid; gap: 10px; }
.ad-toast { position: fixed; z-index: 70; right: 20px; bottom: 20px; display: flex; align-items: center; gap: 10px; max-width: min(460px, calc(100vw - 40px)); padding: 13px 16px; border-radius: 12px; font-size: 14px; font-weight: 700; color: #d8ffe6; background: rgba(8,40,24,.95); border: 1px solid #22c55e; box-shadow: 0 14px 34px rgba(0,0,0,.5); animation: adToast .3s ease-out; }
.ad-toast.up { bottom: 96px; }
.ad-toast.err { color: #ffd0d0; background: rgba(60,12,12,.96); border-color: #ff6b6b; }
.ad-toast button { margin-left: auto; background: none; border: 0; color: inherit; cursor: pointer; opacity: .7; }
@keyframes adToast { from { opacity: 0; transform: translateY(12px); } }
@media (max-width: 980px) {
  .ad-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ad-toolbar { grid-template-columns: 1fr 1fr; }
  .ad-toolbar .search-box, .ad-toolbar .ovr-box, .ad-toolbar .ad-btn { grid-column: 1 / -1; }
  .ad-clubs, .ad-data { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .admin-page.ad { padding: 14px 14px 50px; }
  .ad-top h2 { font-size: 40px; }
  .ad-row { grid-template-columns: 88px minmax(0, 1fr) auto; grid-template-areas: 'ava name ovr' 'ava pos act' 'ava team act'; gap: 4px 12px; padding: 12px 8px; }
  .ad-row > :nth-child(1) { grid-area: ava; align-self: start; }
  .ad-row > :nth-child(2) { grid-area: name; }
  .ad-row > :nth-child(3) { grid-area: pos; }
  .ad-row > :nth-child(4) { grid-area: team; }
  .ad-row > :nth-child(5) { grid-area: ovr; justify-self: end; }
  .ad-row > :nth-child(6) { grid-area: act; justify-self: end; align-self: end; }
  .ad-ico { width: 44px; height: 44px; }
  .ad-btn, .ad-tab { min-height: 48px; }
  .ad-tabs { width: 100%; } .ad-tab { flex: 1; justify-content: center; padding: 10px 8px; }
  .ad-toast { left: 14px; right: 14px; bottom: 14px; max-width: none; }
  .ad-toast.up { bottom: 150px; }
  .ad-head { display: grid; grid-template-columns: 1fr; padding-bottom: 4px; }
  .ad-head > :not(:first-child) { display: none; }
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
  const [tab, setTab] = useState<'players' | 'clubs' | 'data' | 'history'>('players');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditError, setAuditError] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditTick, setAuditTick] = useState(0);
  const [histFilter, setHistFilter] = useState<'ALL' | 'players' | 'teams'>('ALL');
  const [meNick, setMeNick] = useState('admin');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkTeamId, setBulkTeamId] = useState('');
  const [bulkMode, setBulkMode] = useState<'add' | 'set'>('add');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<'ALL' | 'NO'>('ALL');
  const [limit, setLimit] = useState(60);
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
      const { data } = await supabase.from('profiles').select('role, nickname').eq('id', user.id).maybeSingle();
      if (data?.role !== 'admin') {
        setAllowed(false);
        backRef.current();
        return;
      }
      setMeNick((data as { nickname?: string } | null)?.nickname ?? 'admin');
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
          (photoFilter === 'ALL' || !player.image_url) &&
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
  }, [players, query, position, team, minOvr, maxOvr, sort, photoFilter]);

  // Mostra de 60 em 60 para a lista não pesar; volta ao começo quando um filtro muda
  useEffect(() => {
    setLimit(60);
  }, [query, position, team, minOvr, maxOvr, sort, photoFilter]);
  // Avisos somem sozinhos
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  // Histórico: carrega as últimas 300 alterações quando a aba é aberta
  useEffect(() => {
    if (tab !== 'history' || allowed !== true) return undefined;
    let alive = true;
    setAuditLoading(true);
    void (async () => {
      const { data, error } = await supabase.from('admin_audit').select('*').order('created_at', { ascending: false }).limit(300);
      if (!alive) return;
      setAuditLoading(false);
      if (error) {
        setAuditError(/admin_audit|relation|schema cache/i.test(error.message) ? 'missing' : error.message);
        setAudit([]);
      } else {
        setAuditError('');
        setAudit((data ?? []) as AuditRow[]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab, auditTick, allowed]);
  const stats = useMemo(() => {
    const total = players.length;
    const avg = total ? Math.round(players.reduce((sum, player) => sum + (Number(player.overall) || 0), 0) / total) : 0;
    const noPhoto = players.filter((player) => !player.image_url).length;
    const perTeam = new Map<string, number>();
    players.forEach((player) => perTeam.set(player.team_id, (perTeam.get(player.team_id) ?? 0) + 1));
    const perPos = positions.map((item) => ({
      pos: item,
      count: players.filter((player) => player.primary_position === item || (player.alternate_positions ?? []).includes(item)).length,
    }));
    return { total, avg, noPhoto, perTeam, perPos };
  }, [players]);

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

  const teamById = (id: string) => teams.find((item) => item.id === id);

  // ---- Edição em massa ----
  const selectedSet = new Set(selected);
  const chosen = players.filter((player) => selectedSet.has(player.id));
  const filteredAllSelected = filtered.length > 0 && filtered.every((player) => selectedSet.has(player.id));
  const filteredSomeSelected = filtered.some((player) => selectedSet.has(player.id));
  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }
  function toggleAllFiltered() {
    setSelected((current) => {
      if (filteredAllSelected) return current.filter((id) => !filtered.some((player) => player.id === id));
      const next = new Set(current);
      filtered.forEach((player) => next.add(player.id));
      return [...next];
    });
  }
  async function bulkMoveTeam() {
    const club = teamById(bulkTeamId);
    if (!club) return;
    const moving = chosen.filter((player) => player.team_id !== club.id);
    if (!moving.length) {
      say('Todos os selecionados já estão nesse clube.', true);
      return;
    }
    const clubName = isFreeAgent(club) ? 'Sem clube' : club.name;
    if (!window.confirm(`Mover ${moving.length} jogador(es) para ${clubName}?`)) return;
    setBulkBusy(true);
    const { error } = await supabase.from('players').update({ team_id: club.id }).in('id', moving.map((player) => player.id));
    setBulkBusy(false);
    if (error) {
      say(`Erro ao mover: ${error.message}`, true);
      return;
    }
    say(`${moving.length} jogador(es) movidos para ${clubName}.`);
    setSelected([]);
    setBulkTeamId('');
    await onReload();
  }
  async function bulkChangeOverall() {
    const amount = parseInt(bulkValue, 10);
    if (!Number.isFinite(amount)) {
      say('Digite um número para o overall.', true);
      return;
    }
    if (bulkMode === 'set' && (amount < 40 || amount > 99)) {
      say('O overall precisa ficar entre 40 e 99.', true);
      return;
    }
    const plan = chosen
      .map((player) => {
        const raw = bulkMode === 'set' ? amount : (Number(player.overall) || 0) + amount;
        return { player, next: Math.max(40, Math.min(99, raw)), clamped: raw < 40 || raw > 99 };
      })
      .filter((item) => item.next !== item.player.overall);
    if (!plan.length) {
      say('Nenhum overall mudaria (já estão no valor ou no limite de 40 a 99).', true);
      return;
    }
    const clamped = plan.filter((item) => item.clamped).length;
    const example = plan[0];
    const label = bulkMode === 'set' ? `definir para ${amount}` : `${amount >= 0 ? '+' : ''}${amount}`;
    if (!window.confirm(`Ajustar o overall de ${plan.length} jogador(es): ${label}.\nEx.: ${example.player.name} ${example.player.overall} → ${example.next}.${clamped ? `\n${clamped} ficam presos no limite de 40 a 99.` : ''}`)) return;
    setBulkBusy(true);
    // Agrupa pelos novos valores para fazer poucas chamadas ao banco
    const groups = new Map<number, string[]>();
    plan.forEach((item) => groups.set(item.next, [...(groups.get(item.next) ?? []), item.player.id]));
    const results = await Promise.all([...groups.entries()].map(([overall, ids]) => supabase.from('players').update({ overall }).in('id', ids)));
    setBulkBusy(false);
    const failed = results.find((result) => result.error);
    await onReload();
    if (failed?.error) {
      say(`Alguns não foram alterados: ${failed.error.message}`, true);
      return;
    }
    say(`Overall ajustado em ${plan.length} jogador(es).`);
    setSelected([]);
    setBulkValue('');
  }

  function fieldValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'team_id') {
      const club = teamById(String(value));
      return club ? (isFreeAgent(club) ? 'Sem clube' : club.name) : 'time removido';
    }
    if (field === 'alternate_positions') return Array.isArray(value) && value.length ? value.join(', ') : 'nenhuma';
    return String(value);
  }
  function changedFields(entry: AuditRow) {
    const before = entry.old_data ?? {};
    const after = entry.new_data ?? {};
    return Object.keys(after).filter((key) => !HIDDEN_FIELDS.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  }

  // Desfaz uma alteração do histórico: criação -> exclui; edição -> volta ao estado de antes; exclusão -> recria
  async function undoEntry(entry: AuditRow) {
    const noun = entry.table_name === 'players' ? 'jogador' : 'time';
    const what = entry.action === 'insert' ? `excluir o ${noun}` : entry.action === 'delete' ? `recriar o ${noun}` : `voltar o ${noun} ao estado de antes`;
    const list = entry.table_name === 'players' ? players : teams;
    const current = list.find((item) => item.id === entry.row_id) as unknown as Record<string, unknown> | undefined;
    let warn = '';
    if (entry.action === 'update' && entry.new_data && current) {
      const moved = Object.keys(entry.new_data).some((key) => !HIDDEN_FIELDS.has(key) && key !== 'team' && JSON.stringify(current[key]) !== JSON.stringify(entry.new_data?.[key]));
      if (moved) warn = '\n\nAtenção: esse registro foi alterado de novo depois dessa mudança. Desfazer vai sobrescrever o estado atual.';
    }
    if (entry.action === 'insert' && !current) {
      say('Esse registro já não existe mais.', true);
      return;
    }
    if (!window.confirm(`Desfazer: ${what} "${entry.label ?? ''}"?${warn}`)) return;
    let failure = '';
    if (entry.action === 'insert') {
      const { error } = await supabase.from(entry.table_name).delete().eq('id', entry.row_id);
      if (error) failure = error.message;
    } else if (entry.action === 'update' && entry.old_data) {
      const { id: _id, created_at: _created, ...rest } = entry.old_data as Record<string, unknown>;
      void _id;
      void _created;
      const { error } = await supabase.from(entry.table_name).update(rest).eq('id', entry.row_id);
      if (error) failure = error.message;
    } else if (entry.action === 'delete' && entry.old_data) {
      const { error } = await supabase.from(entry.table_name).insert(entry.old_data);
      if (error) failure = error.message;
    }
    if (failure) {
      say(`Não deu para desfazer: ${failure}`, true);
      return;
    }
    await supabase.from('admin_audit').update({ undone_at: new Date().toISOString(), undone_by: meNick }).eq('id', entry.id);
    say('Alteração desfeita.');
    await onReload();
    setAuditTick((value) => value + 1);
  }
  const lowPositions = stats.perPos.filter((item) => item.count < 5);
  const maxPos = Math.max(1, ...stats.perPos.map((item) => item.count));
  const visible = filtered.slice(0, limit);
  const clubs = teams.filter((item) => !isFreeAgent(item));
  const newPlayer = () =>
    setEditing({ id: '', name: '', overall: 80, primary_position: 'CF', alternate_positions: [], team_id: clubs[0]?.id ?? teams[0]?.id ?? '' });

  return (
    <main className="admin-page simple-page ad stadium-bg">
      <style>{stadiumCss}</style>
      <style>{adminCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar ao jogo
      </button>

      <div className="ad-top">
        <div>
          <div className="ad-eyebrow">
            <ShieldAlert size={14} /> PAINEL RESTRITO
          </div>
          <h2>
            GESTÃO DO <em>7V7</em>
          </h2>
          <p>Cadastre jogadores e clubes. As mudanças aparecem nos próximos drafts e não alteram partidas anteriores.</p>
        </div>
        <button className="ad-btn gold" onClick={newPlayer}>
          <Plus size={16} /> Novo jogador
        </button>
      </div>

      <div className="ad-kpis">
        <div className="ad-kpi">
          <small>JOGADORES</small>
          <b>{stats.total}</b>
          <span>{filtered.length !== stats.total ? `${filtered.length} no filtro atual` : 'cartas cadastradas'}</span>
        </div>
        <div className="ad-kpi">
          <small>CLUBES</small>
          <b>{clubs.length}</b>
          <span>{stats.perTeam.get(teams.find((item) => isFreeAgent(item))?.id ?? '') ?? 0} jogadores sem clube</span>
        </div>
        <div className="ad-kpi">
          <small>OVERALL MÉDIO</small>
          <b>{stats.avg}</b>
          <span>média de todas as cartas</span>
        </div>
        <div className={stats.noPhoto || lowPositions.length ? 'ad-kpi warn' : 'ad-kpi'}>
          <small>PENDÊNCIAS</small>
          <b>{stats.noPhoto + lowPositions.length}</b>
          <span>{stats.noPhoto} sem foto · {lowPositions.length} posições curtas</span>
        </div>
      </div>

      <div className="ad-tabs" role="tablist">
        <button role="tab" className={tab === 'players' ? 'ad-tab on' : 'ad-tab'} onClick={() => setTab('players')}>
          <Users size={15} /> Jogadores <em>{stats.total}</em>
        </button>
        <button role="tab" className={tab === 'clubs' ? 'ad-tab on' : 'ad-tab'} onClick={() => setTab('clubs')}>
          <Shield size={15} /> Clubes <em>{clubs.length}</em>
        </button>
        <button role="tab" className={tab === 'data' ? 'ad-tab on' : 'ad-tab'} onClick={() => setTab('data')}>
          <Database size={15} /> Dados
        </button>
        <button role="tab" className={tab === 'history' ? 'ad-tab on' : 'ad-tab'} onClick={() => setTab('history')}>
          <Check size={15} /> Histórico
        </button>
      </div>

      {tab === 'players' && (
        <section className="ad-card">
          <div className="ad-toolbar">
            <div className="search-box">
              <Search size={15} />
              <input placeholder="Buscar jogador..." value={query} onChange={(event) => setQuery(event.target.value)} />
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
                  {isFreeAgent(item) ? 'Sem clube' : item.name}
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
            {photoFilter === 'NO' && (
              <button className="ad-btn" onClick={() => setPhotoFilter('ALL')}>
                <X size={14} /> Sem foto
              </button>
            )}
          </div>

          <div className="ad-head">
            <span className="ad-lead">
              <input
                type="checkbox"
                className="ad-chk"
                aria-label="Selecionar todos os jogadores do filtro"
                checked={filteredAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !filteredAllSelected && filteredSomeSelected;
                }}
                onChange={toggleAllFiltered}
              />
              <span>{filtered.length ? `TODOS (${filtered.length})` : ''}</span>
            </span>
            <span>JOGADOR</span>
            <span>POSIÇÃO</span>
            <span>TIME</span>
            <span>OVR</span>
            <span />
          </div>
          <div>
            {visible.map((player) => {
              const club = teamById(player.team_id);
              const free = club ? isFreeAgent(club) : false;
              return (
                <div className={selectedSet.has(player.id) ? 'ad-row sel' : 'ad-row'} key={player.id}>
                  <div className="ad-lead">
                    <input
                      type="checkbox"
                      className="ad-chk"
                      aria-label={`Selecionar ${player.name}`}
                      checked={selectedSet.has(player.id)}
                      onChange={() => toggleOne(player.id)}
                    />
                    <div className="ad-ava">
                      {player.image_url ? <img src={player.image_url} alt="" loading="lazy" /> : player.name.slice(0, 1).toUpperCase()}
                    </div>
                  </div>
                  <div className="ad-name">
                    <b>{player.name}</b>
                    {!player.image_url && <small>sem foto</small>}
                  </div>
                  <div className="ad-pos">
                    <span className="ad-chip main">{player.primary_position}</span>
                    {player.alternate_positions.map((item) => (
                      <span className="ad-chip" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="ad-team">
                    {club && !free ? (
                      <>
                        <i style={{ background: club.primary_color, borderColor: club.secondary_color, color: club.secondary_color }}>{club.abbreviation}</i>
                        <span>{club.name}</span>
                      </>
                    ) : (
                      <span style={{ opacity: 0.6 }}>{free ? 'Sem clube' : '—'}</span>
                    )}
                  </div>
                  <div className={`ad-ovr ${toneFor(player.overall)}`}>{player.overall}</div>
                  <div className="ad-act">
                    <button className="ad-ico" onClick={() => setEditing(player)} aria-label={`Editar ${player.name}`}>
                      <Edit3 size={15} />
                    </button>
                    <button className="ad-ico danger" onClick={() => void removePlayer(player)} aria-label={`Excluir ${player.name}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
            {!filtered.length && <div className="ad-empty">Nenhum jogador com esses filtros.</div>}
          </div>
          {filtered.length > limit && (
            <div className="ad-more">
              <button className="ad-btn" onClick={() => setLimit((value) => value + 60)}>
                Mostrar mais ({filtered.length - limit} restantes)
              </button>
            </div>
          )}
          <div className="ad-foot">
            <Users size={14} /> {Math.min(limit, filtered.length)} de {filtered.length} jogadores exibidos
          </div>
        </section>
      )}

      {tab === 'clubs' && (
        <div className="ad-clubs">
          <section className="ad-card">
            <h3>Clubes cadastrados</h3>
            <div className="ad-club-list">
              {teams.map((item) => {
                const free = isFreeAgent(item);
                return (
                  <div key={item.id} className={teamDraft.id === item.id ? 'ad-club on' : 'ad-club'}>
                    <div className="ad-shield" style={{ background: free ? '#3a4152' : item.primary_color, color: free ? '#fff' : item.secondary_color }}>
                      {free ? '—' : item.abbreviation}
                    </div>
                    <div>
                      <b>{free ? 'Sem clube (Free Agent)' : item.name}</b>
                      <small>{stats.perTeam.get(item.id) ?? 0} jogadores</small>
                    </div>
                    <span className="ad-act">
                      <button className="ad-ico" onClick={() => setTeamDraft({ ...item })} aria-label={`Editar ${item.name}`}>
                        <Edit3 size={14} />
                      </button>
                      <button className="ad-ico danger" onClick={() => void removeTeam(item)} disabled={free} title={free ? 'Fixo: guarda os jogadores sem clube' : 'Excluir'} aria-label={`Excluir ${item.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="ad-card">
            <form className="ad-form" onSubmit={(event) => void saveTeam(event)}>
              <h3>{teamDraft.id ? 'Editar clube' : 'Novo clube'}</h3>
              <input required placeholder="Nome do clube" value={teamDraft.name} onChange={(event) => setTeamDraft({ ...teamDraft, name: event.target.value })} />
              <input
                required
                maxLength={4}
                placeholder="Sigla (até 4 letras)"
                value={teamDraft.abbreviation}
                onChange={(event) => setTeamDraft({ ...teamDraft, abbreviation: event.target.value.toUpperCase() })}
              />
              <div className="ad-colors">
                <label>
                  COR PRINCIPAL
                  <input type="color" value={teamDraft.primary_color} onChange={(event) => setTeamDraft({ ...teamDraft, primary_color: event.target.value })} />
                </label>
                <label>
                  COR SECUNDÁRIA
                  <input type="color" value={teamDraft.secondary_color} onChange={(event) => setTeamDraft({ ...teamDraft, secondary_color: event.target.value })} />
                </label>
              </div>
              <div className="ad-preview">
                <div className="ad-shield" style={{ background: teamDraft.primary_color, color: teamDraft.secondary_color }}>
                  {teamDraft.abbreviation || '—'}
                </div>
                <span>{teamDraft.name || 'Pré-visualização do escudo'}</span>
              </div>
              <button className="ad-btn gold" type="submit">
                {teamDraft.id ? 'Atualizar clube' : 'Salvar clube'}
              </button>
              {teamDraft.id && (
                <button className="ad-btn" type="button" onClick={() => setTeamDraft(emptyTeam)}>
                  Cancelar edição
                </button>
              )}
            </form>
          </section>
        </div>
      )}

      {tab === 'data' && (
        <div className="ad-data">
          <section className="ad-card">
            <h3>Jogadores por posição</h3>
            <div className="ad-bars">
              {stats.perPos.map((item) => (
                <div key={item.pos} className={item.count < 5 ? 'ad-bar low' : 'ad-bar'}>
                  <b>{item.pos}</b>
                  <i>
                    <u style={{ width: `${Math.max(4, (item.count / maxPos) * 100)}%` }} />
                  </i>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
            <p className="ad-note">Cada posição precisa de pelo menos 5 jogadores para o draft funcionar bem (conta quem joga ali como posição alternativa também).</p>
          </section>
          <section className="ad-card">
            <h3>Verificações</h3>
            <div className="ad-checks">
              {stats.noPhoto ? (
                <button
                  className="ad-check bad"
                  onClick={() => {
                    setPhotoFilter('NO');
                    setTab('players');
                  }}
                >
                  {stats.noPhoto} jogadores sem foto. Toque para ver.
                </button>
              ) : (
                <div className="ad-check ok">Todos os jogadores têm foto.</div>
              )}
              {lowPositions.length ? (
                <div className="ad-check bad">Poucos jogadores em: {lowPositions.map((item) => `${item.pos} (${item.count})`).join(', ')}.</div>
              ) : (
                <div className="ad-check ok">Todas as posições têm 5 ou mais jogadores.</div>
              )}
            </div>
            <h3>Importar e exportar</h3>
            <div className="ad-tools">
              <button className="ad-btn" onClick={exportCsv}>
                <Download size={15} /> Exportar jogadores (CSV)
              </button>
              <button className="ad-btn" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Importar jogadores (CSV)
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
            <p className="ad-note">Cabeçalho do CSV: name, overall, primary_position, alternate_positions, team. Nomes repetidos e linhas com erro são ignorados e listados no aviso.</p>
          </section>
        </div>
      )}

      {tab === 'history' && (
        <section className="ad-card">
          <div className="ad-hist-bar">
            <button className={histFilter === 'ALL' ? 'ad-btn on' : 'ad-btn'} onClick={() => setHistFilter('ALL')}>
              Tudo
            </button>
            <button className={histFilter === 'players' ? 'ad-btn on' : 'ad-btn'} onClick={() => setHistFilter('players')}>
              Jogadores
            </button>
            <button className={histFilter === 'teams' ? 'ad-btn on' : 'ad-btn'} onClick={() => setHistFilter('teams')}>
              Clubes
            </button>
            <button className="ad-btn" onClick={() => setAuditTick((value) => value + 1)}>
              Atualizar
            </button>
            <span>últimas 300 alterações</span>
          </div>
          {auditError === 'missing' ? (
            <div className="ad-empty">
              O histórico ainda não foi ativado. Rode a migração <b>20261111120000_admin_audit.sql</b> no Supabase (SQL Editor) e volte aqui.
            </div>
          ) : auditError ? (
            <div className="ad-empty">Erro ao carregar o histórico: {auditError}</div>
          ) : auditLoading && !audit.length ? (
            <div className="ad-empty">Carregando...</div>
          ) : (
            <div className="ad-hist">
              {audit
                .filter((entry) => histFilter === 'ALL' || entry.table_name === histFilter)
                .map((entry) => {
                  const fields = entry.action === 'update' ? changedFields(entry) : [];
                  const kind = entry.action === 'insert' ? 'CRIADO' : entry.action === 'delete' ? 'EXCLUÍDO' : 'ALTERADO';
                  return (
                    <div key={entry.id} className={entry.undone_at ? 'ad-ev undone' : 'ad-ev'}>
                      <div className={`ad-ev-ico ${entry.action}`}>{entry.action === 'insert' ? '+' : entry.action === 'delete' ? '−' : '✎'}</div>
                      <div>
                        <h4>
                          <span className="ad-tag">{kind}</span>
                          <span className="ad-tag">{entry.table_name === 'players' ? 'JOGADOR' : 'CLUBE'}</span>
                          {entry.undone_at ? <s>{entry.label ?? '—'}</s> : <span>{entry.label ?? '—'}</span>}
                        </h4>
                        <div className="ad-ev-meta">
                          {entry.actor_nick ?? 'sistema'} · {whenText(entry.created_at)}
                          {entry.undone_at ? ` · desfeito por ${entry.undone_by ?? 'admin'}` : ''}
                        </div>
                        {fields.length > 0 && (
                          <ul className="ad-diff">
                            {fields.map((field) => {
                              const color = field.endsWith('_color');
                              const photo = field === 'image_url';
                              return (
                                <li key={field}>
                                  <b>{FIELD_LABELS[field] ?? field}</b>
                                  {photo ? (
                                    <ins>{!entry.old_data?.[field] ? 'foto adicionada' : !entry.new_data?.[field] ? 'foto removida' : 'foto trocada'}</ins>
                                  ) : (
                                    <>
                                      <del>
                                        {color && <i className="ad-sw" style={{ background: String(entry.old_data?.[field] ?? '') }} />}
                                        {fieldValue(field, entry.old_data?.[field])}
                                      </del>
                                      <span>→</span>
                                      <ins>
                                        {color && <i className="ad-sw" style={{ background: String(entry.new_data?.[field] ?? '') }} />}
                                        {fieldValue(field, entry.new_data?.[field])}
                                      </ins>
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {entry.action === 'insert' && entry.table_name === 'players' && entry.new_data && (
                          <ul className="ad-diff">
                            <li>
                              <b>Dados</b>
                              <span>
                                OVR {String(entry.new_data.overall)} · {String(entry.new_data.primary_position)} · {fieldValue('team_id', entry.new_data.team_id)}
                              </span>
                            </li>
                          </ul>
                        )}
                      </div>
                      {!entry.undone_at && (
                        <button className="ad-btn ad-undo" onClick={() => void undoEntry(entry)}>
                          Desfazer
                        </button>
                      )}
                    </div>
                  );
                })}
              {!audit.length && <div className="ad-empty">Nenhuma alteração registrada ainda. A partir de agora, tudo que mudar aqui aparece nesta lista.</div>}
            </div>
          )}
        </section>
      )}

      {tab === 'players' && chosen.length > 0 && <div style={{ height: 170 }} aria-hidden="true" />}
      {tab === 'players' && chosen.length > 0 && (
        <div className="ad-bulk" role="region" aria-label="Edição em massa">
          <div className="ad-bulk-n">
            {chosen.length} selecionado{chosen.length > 1 ? 's' : ''}
            {filtered.length > chosen.length && (
              <small>
                <button className="ad-link" onClick={toggleAllFiltered} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, textDecoration: 'underline', font: 'inherit' }}>
                  selecionar os {filtered.length} do filtro
                </button>
              </small>
            )}
          </div>
          <div className="ad-bulk-g">
            <select value={bulkTeamId} onChange={(event) => setBulkTeamId(event.target.value)} aria-label="Novo clube">
              <option value="">Mudar clube para...</option>
              {teams.map((item) => (
                <option key={item.id} value={item.id}>
                  {isFreeAgent(item) ? 'Sem clube' : item.name}
                </option>
              ))}
            </select>
            <button className="ad-btn gold" disabled={!bulkTeamId || bulkBusy} onClick={() => void bulkMoveTeam()}>
              Mover
            </button>
          </div>
          <div className="ad-bulk-g">
            <select value={bulkMode} onChange={(event) => setBulkMode(event.target.value as 'add' | 'set')} aria-label="Tipo de ajuste do overall">
              <option value="add">Somar overall (+/−)</option>
              <option value="set">Definir overall</option>
            </select>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder={bulkMode === 'add' ? '+3' : '85'}
              aria-label="Valor do overall"
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value.replace(bulkMode === 'add' ? /[^\d+-]/g : /\D/g, ''))}
            />
            <button className="ad-btn gold" disabled={!bulkValue || bulkBusy} onClick={() => void bulkChangeOverall()}>
              Aplicar
            </button>
          </div>
          <button className="ad-btn ad-bulk-x" onClick={() => setSelected([])} disabled={bulkBusy}>
            <X size={14} /> Limpar
          </button>
        </div>
      )}

      {notice && (
        <div className={`ad-toast${notice.error ? ' err' : ''}${tab === 'players' && chosen.length > 0 ? ' up' : ''}`} role="status">
          <Check size={16} /> {notice.text}
          <button onClick={() => setNotice(null)} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      )}

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