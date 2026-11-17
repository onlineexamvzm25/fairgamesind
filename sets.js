/* =========================================================
   CRDG SETS — lobby + start/deal connection
   Uses the existing CRDG login session and shared JOP table RPCs.
   SETS-specific start/deal RPCs only; JANA procedures are untouched.
========================================================= */
'use strict';

const SETS_CONFIG = {
  supabaseUrl: 'https://dbfycihbcosuxxkrmbhl.supabase.co',
  supabaseKey: 'sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX',
  gameType: 'SETS',
  maxPlayers: 6,
  shuffleSeconds: 5
};
const SESSION_KEY = 'crdgn_session_token';
const setsClient = window.supabase.createClient(SETS_CONFIG.supabaseUrl, SETS_CONFIG.supabaseKey);
const $ = id => document.getElementById(id);

let sessionToken = localStorage.getItem(SESSION_KEY);
let profile = null;
let selectedPointValue = 10;
let activeTableCode = null;
let activeTableRows = [];
let activeTableState = null;
let refreshTimer = null;
let presenceTimer = null;
let busy = false;
let startObservedAt = null;
let dealCompletionStarted = false;

function firstRow(data) { return Array.isArray(data) ? (data[0] || null) : data; }
function showToast(message) {
  const el = $('globalMessage');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2800);
}
function setBusy(value, message = 'Please wait…') {
  busy = value;
  $('busyText').textContent = message;
  $('busyOverlay').classList.toggle('hidden', !value);
  document.querySelectorAll('#setsLobby button').forEach(b => { b.disabled = value; });
}
function showTableMessage(message, error = false) {
  const el = $('tableMessage');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', !!error);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function rpc(name, args = {}) {
  const { data, error } = await setsClient.rpc(name, args);
  if (error) throw new Error(error.message || `Unable to call ${name}.`);
  return data;
}
function rpcResult(data, fallback) {
  const result = firstRow(data);
  if (!result || result.success !== true) throw new Error(result?.message || fallback);
  return result;
}

async function initializeSets() {
  if (!sessionToken) { location.replace('index.html'); return; }
  try {
    const validation = firstRow(await rpc('crdgn_validate_session', { p_session_token: sessionToken }));
    if (!validation || validation.success !== true) {
      localStorage.removeItem(SESSION_KEY);
      location.replace('index.html');
      return;
    }
    profile = firstRow(await rpc('crdgn_get_profile', { p_session_token: sessionToken }));
    if (!profile?.user_id) throw new Error('Unable to load your player profile.');
    $('setsUserName').textContent = profile.name || 'PLAYER';
    bindLobbyEvents();
    const params = new URLSearchParams(location.search);
    const code = params.get('table');
    if (code) await joinTable(code);
  } catch (error) {
    console.error('SETS initialization failed:', error);
    showToast(error.message || 'Unable to load SETS.');
  }
}

function bindLobbyEvents() {
  document.querySelectorAll('.sets-point-option').forEach(button => {
    button.addEventListener('click', () => {
      selectedPointValue = Number(button.dataset.points);
      document.querySelectorAll('.sets-point-option').forEach(b => b.classList.toggle('selected', b === button));
    });
  });
  $('setsCreateButton').addEventListener('click', createTable);
  $('setsJoinButton').addEventListener('click', () => joinTable($('setsJoinCode').value));
  $('setsJoinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinTable($('setsJoinCode').value); });
  $('setsRefreshButton').addEventListener('click', () => refreshTable(false));
  $('setsCopyCodeButton').addEventListener('click', copyTableCode);
  $('btnStartGame').addEventListener('click', startSetsGame);
  $('setsLeaveButton').addEventListener('click', leaveTable);
}

async function createTable() {
  if (busy) return;
  setBusy(true, 'Creating your private SETS table…');
  try {
    const result = rpcResult(await rpc('jop_create_table', {
      p_session_token: sessionToken,
      p_point_value: selectedPointValue,
      p_game_type: 'SETS'
    }), 'Could not create the SETS table.');
    showToast('SETS table created. Share the table code with your friend.');
    await enterTable(result.out_table_code);
  } catch (error) { showToast(error.message); }
  finally { setBusy(false); }
}

async function joinTable(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) { showToast('Enter the table code first.'); $('setsJoinCode').focus(); return; }
  if (busy) return;
  setBusy(true, 'Joining the SETS table…');
  try {
    rpcResult(await rpc('jop_join_table', {
      p_session_token: sessionToken,
      p_table_code: normalized,
      p_game_type: 'SETS'
    }), 'Could not join this SETS table.');
    await enterTable(normalized);
  } catch (error) { showToast(error.message); }
  finally { setBusy(false); }
}

async function enterTable(code) {
  activeTableCode = String(code).trim().toUpperCase();
  $('setsHomeView').classList.add('hidden');
  $('setsTableView').classList.remove('hidden');
  history.replaceState({}, '', `${location.pathname}?game_type=SETS&table=${encodeURIComponent(activeTableCode)}`);
  await refreshTable(false);
  startBackgroundUpdates();
}

function startBackgroundUpdates() {
  stopBackgroundUpdates();
  refreshTimer = window.setInterval(() => refreshTable(true), 1000);
  presenceTimer = window.setInterval(updatePresence, 15000);
}
function stopBackgroundUpdates() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (presenceTimer) clearInterval(presenceTimer);
  refreshTimer = presenceTimer = null;
}

async function refreshTable(silent = false) {
  if (!activeTableCode || busy) return;
  try {
    const data = await rpc('jop_get_table_state', {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    });
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const state = rows[0];
    if (!state || state.success === false) throw new Error(state?.message || 'Unable to load this table.');
    if (String(state.game_type || '').toUpperCase() !== 'SETS') throw new Error('This is not a SETS table.');
    activeTableRows = rows;
    activeTableState = state;
    renderTable(rows, state);
    if (Number(state.current_game_no) > 0) {
      if (!startObservedAt) startObservedAt = Date.now();
      // Host completes the deal. Guests independently wait for the secure
      // game-state endpoint to report that the round is PLAYING.
      if (!dealCompletionStarted && state.table_status === 'PLAYING') {
        showTableMessage('SETS has started. Waiting for the initial deal…', false);
        try {
          const live = await rpc('jop_sets_get_game_state', {
            p_session_token: sessionToken,
            p_table_code: activeTableCode
          });
          const liveState = firstRow(live);
          if (liveState?.success === true && liveState.round_status === 'PLAYING') {
            stopBackgroundUpdates();
            location.replace(`sets-game.html?table=${encodeURIComponent(activeTableCode)}`);
            return;
          }
        } catch (stateError) {
          // The host may still be inside the 5-second shuffle/deal sequence.
          if (!silent) console.debug('SETS game state is not ready yet:', stateError.message);
        }
      }
    }
    if (!silent && Number(state.current_game_no) === 0) showTableMessage('Waiting for players. The host can start when at least 2 players have joined.', false);
  } catch (error) {
    if (!silent) showTableMessage(error.message, true);
    console.error('SETS table refresh failed:', error);
  }
}

function renderTable(rows, state) {
  $('setsTableCode').textContent = state.out_table_code || activeTableCode;
  $('setsPointValue').textContent = state.point_value ?? '—';
  $('setsPlayerCount').textContent = `${state.player_count ?? rows.length} / 6`;
  $('setsGameNumber').textContent = Number(state.current_game_no) > 0 ? `#${state.current_game_no}` : 'Not started';
  const players = rows.filter(r => r.player_user_id && r.seat_no != null);
  const bySeat = new Map(players.map(p => [Number(p.seat_no), p]));
  const list = $('setsPlayersList');
  list.innerHTML = '';
  for (let seat = 1; seat <= 6; seat++) {
    const player = bySeat.get(seat);
    const item = document.createElement('div');
    item.className = player ? 'sets-player-seat' : 'sets-empty-seat';
    if (!player) { item.textContent = `Seat ${seat} · Waiting for a player`; }
    else {
      const isMe = player.player_user_id === profile.user_id;
      item.innerHTML = `<span class="sets-seat-number">${seat}</span><span class="sets-player-name">${escapeHtml(player.player_name || 'Player')}${isMe ? ' (You)' : ''}</span>${player.is_host ? '<span class="sets-host-tag">HOST</span>' : ''}`;
    }
    list.appendChild(item);
  }
  const me = players.find(p => p.player_user_id === profile.user_id);
  const isHost = !!me?.is_host && !me?.is_eliminated;
  const waiting = Number(state.current_game_no) === 0 && state.table_status === 'WAITING';
  $('hostStartArea').style.display = isHost && waiting ? 'flex' : 'none';
  $('guestWaitingMessage').style.display = !isHost && waiting ? 'block' : 'none';
  $('btnStartGame').disabled = !isHost || players.filter(p => !p.is_eliminated).length < 2;
  $('hostStartMessage').textContent = players.filter(p => !p.is_eliminated).length < 2
    ? 'Waiting for at least 2 players…'
    : 'At least 2 players joined. You can start SETS.';
  if (state.table_status === 'CLOSED') showTableMessage('This table is closed.', true);
}

async function updatePresence() {
  if (!activeTableCode || busy) return;
  try { await rpc('jop_update_player_presence', { p_session_token: sessionToken, p_table_code: activeTableCode }); }
  catch (error) { console.warn('SETS presence update failed:', error.message); }
}

async function startSetsGame() {
  if (!activeTableCode || busy) return;
  const eligible = activeTableRows.filter(p => p.player_user_id && !p.is_eliminated);
  const me = eligible.find(p => p.player_user_id === profile.user_id);
  if (!me?.is_host) { showTableMessage('Only the host can start SETS.', true); return; }
  if (eligible.length < 2) { showTableMessage('At least 2 players are required.', true); return; }
  if (!confirm('Start SETS with the players currently at this table? The server will select a random dealer.')) return;
  setBusy(true, 'Starting SETS…');
  try {
    const result = rpcResult(await rpc('jop_sets_start_game', {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    }), 'Unable to start SETS.');
    dealCompletionStarted = true;
    showTableMessage(result.message || 'SETS started. Shuffling cards for 5 seconds…', false);
    $('hostStartArea').style.display = 'none';
    $('guestWaitingMessage').style.display = 'block';
    $('guestWaitingMessage').textContent = '🎴 SETS started · Shuffling cards…';
    stopBackgroundUpdates();
    // The database procedure enforces the five-second SHUFFLING window.
    await new Promise(resolve => setTimeout(resolve, SETS_CONFIG.shuffleSeconds * 1000 + 300));
    setBusy(true, 'Shuffling complete. Dealing cards…');
    const dealResult = rpcResult(await rpc('jop_sets_complete_initial_deal', {
      p_session_token: sessionToken,
      p_table_code: activeTableCode
    }), 'Unable to complete the initial deal.');
    showTableMessage(dealResult.message || 'Initial deal completed successfully.', false);
    stopBackgroundUpdates();
    location.replace(`sets-game.html?table=${encodeURIComponent(activeTableCode)}`);
    return;
  } catch (error) {
    showTableMessage(error.message || 'Unable to start SETS.', true);
    startBackgroundUpdates();
  } finally { setBusy(false); }
}

async function copyTableCode() {
  const code = $('setsTableCode').textContent;
  try { await navigator.clipboard.writeText(code); showToast('Table code copied.'); }
  catch { showToast(`Table code: ${code}`); }
}

async function leaveTable() {
  if (!activeTableCode || busy) return;
  if (!confirm('Leave this table permanently? You cannot rejoin this same table.')) return;
  setBusy(true, 'Leaving SETS table…');
  try {
    rpcResult(await rpc('jop_leave_table', { p_session_token: sessionToken, p_table_code: activeTableCode }), 'Unable to leave the table.');
    stopBackgroundUpdates();
    activeTableCode = null;
    activeTableRows = [];
    activeTableState = null;
    history.replaceState({}, '', `${location.pathname}?game_type=SETS`);
    $('setsTableView').classList.add('hidden');
    $('setsHomeView').classList.remove('hidden');
  } catch (error) { showTableMessage(error.message, true); }
  finally { setBusy(false); }
}

window.addEventListener('beforeunload', stopBackgroundUpdates);
document.addEventListener('DOMContentLoaded', initializeSets);
