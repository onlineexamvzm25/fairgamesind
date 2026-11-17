'use strict';

const SETS_SUPABASE_URL = 'https://dbfycihbcosuxxkrmbhl.supabase.co';
const SETS_SUPABASE_KEY = 'sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX';
const SETS_SESSION_KEY = 'crdgn_session_token';
const setsGameClient = window.supabase.createClient(SETS_SUPABASE_URL, SETS_SUPABASE_KEY);
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const tableCode = String(params.get('table') || '').trim().toUpperCase();
const sessionToken = localStorage.getItem(SETS_SESSION_KEY);
let profile = null;
let gameState = null;
let selectedCardId = null;
let groupAssignments = {};
let groupRoundKey = null;
let busy = false;
let refreshHandle = null;
let clockHandle = null;
let serverOffsetMs = 0;
let soundEnabled = true;
let lastMessage = '';

function toast(message, error = false) {
  const el = $('toast'); if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(el._hide);
  el._hide = setTimeout(() => el.classList.remove('show'), 2600);
}
function firstRow(data) { return Array.isArray(data) ? (data[0] || null) : data; }
async function rpc(name, args) {
  const { data, error } = await setsGameClient.rpc(name, args);
  if (error) throw new Error(error.message || `Unable to call ${name}`);
  return data;
}
function resultOrThrow(data, fallback) {
  const result = firstRow(data);
  if (!result || result.success !== true) throw new Error(result?.message || fallback);
  return result;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function suitSymbol(suit) { return ({S:'♠',H:'♥',D:'♦',C:'♣'})[String(suit || '').toUpperCase()] || ''; }
function cardParts(card) {
  const code = String(card.card_code || '');
  if (code.startsWith('PJ')) return { rank:'★', suit:'', joker:true, red:false };
  const suit = String(card.suit || code.slice(-1)).toUpperCase();
  const rank = String(card.rank_code || code.slice(0, -1));
  return { rank, suit:suitSymbol(suit), joker:false, red:suit === 'H' || suit === 'D' };
}
function cardMarkup(card, selected = false, extraClass = '') {
  const p = cardParts(card);
  const cls = p.joker ? 'joker' : (p.red ? 'red' : 'black');
  const select = selected ? ' selected' : '';
  if (p.joker) return `<button type="button" class="playing-card ${cls}${select} ${extraClass}" data-card-id="${card.card_id}" aria-label="Printed joker ${escapeHtml(card.card_code)}"><span class="joker-label">PRINTED</span><span class="joker-face">★</span><b>JOKER</b><span class="joker-label">${escapeHtml(card.card_code)}</span></button>`;
  return `<button type="button" class="playing-card ${cls}${select} ${extraClass}" data-card-id="${card.card_id}" aria-label="${escapeHtml(p.rank)} ${escapeHtml(p.suit)}"><span class="corner"><b>${escapeHtml(p.rank)}</b><small>${p.suit}</small></span><span class="card-center">${p.suit}</span><span class="corner corner-bottom"><b>${escapeHtml(p.rank)}</b><small>${p.suit}</small></span></button>`;
}
function avatarClass(seat) { return ['avatar-green','avatar-blue','avatar-violet','avatar-amber','avatar-cyan','avatar-rose'][(Number(seat)-1)%6]; }
function renderPlayers(state) {
  const opponents = $('opponents');
  const others = (state.players || []).filter(p => p.user_id !== state.my_user_id);
  opponents.innerHTML = '';
  for (let seat = 1; seat <= 6; seat++) {
    const p = others.find(x => Number(x.seat_no) === seat);
    if (!p) continue;
    const el = document.createElement('article');
    el.className = `player-seat seat-${seat} ${p.user_id === state.current_turn_user_id ? 'active-turn-seat' : ''}`;
    el.innerHTML = `<div class="avatar ${avatarClass(seat)}">${escapeHtml((p.player_name || 'P').slice(0,1).toUpperCase())}</div><div class="player-details"><strong>${escapeHtml(p.player_name || 'PLAYER')}</strong><span>SEAT ${seat} · ${Number(p.card_count || 0)} CARDS</span></div><span class="seat-state">${p.player_status === 'PLAYING' ? (p.user_id === state.current_turn_user_id ? 'TURN' : 'PLAYING') : escapeHtml(p.player_status)}</span>`;
    opponents.appendChild(el);
  }
}
function ensureGroupAssignments(hand, state) {
  const key = `${state.round_id || state.round_no || 'round'}:${state.my_user_id || 'player'}`;
  if (groupRoundKey !== key) { groupAssignments = {}; groupRoundKey = key; }
  const liveIds = new Set(hand.map(c => String(c.card_id)));
  Object.keys(groupAssignments).forEach(id => { if (!liveIds.has(id)) delete groupAssignments[id]; });
  const counts = [0, 0, 0];
  hand.forEach(c => {
    const group = Number(groupAssignments[String(c.card_id)] || 0);
    if (group >= 1 && group <= 3) counts[group - 1]++;
  });
  hand.forEach(c => {
    const id = String(c.card_id);
    if (groupAssignments[id]) return;
    const min = Math.min(...counts);
    const index = counts.findIndex(n => n === min);
    groupAssignments[id] = index + 1;
    counts[index]++;
  });
}
function moveSelectedToGroup(groupNo) {
  if (!selectedCardId) return toast('Select a card first, then choose G1, G2 or G3.', true);
  groupAssignments[String(selectedCardId)] = Number(groupNo);
  renderHand(gameState);
  updateControls();
  toast(`Card moved to G${groupNo}.`);
}
function renderHand(state) {
  const hand = Array.isArray(state.my_hand) ? state.my_hand : [];
  ensureGroupAssignments(hand, state);
  $('handCount').textContent = hand.length;
  const groups = [1, 2, 3];
  groups.forEach(groupNo => {
    const section = $('handCards').querySelector(`[data-group="${groupNo}"]`);
    if (!section) return;
    const cardsBox = section.querySelector('.group-cards');
    const cards = hand.filter(c => Number(groupAssignments[String(c.card_id)]) === groupNo);
    section.querySelector('.group-count').textContent = `${cards.length}/3`;
    section.querySelector('.group-title').classList.toggle('group-full', cards.length === 3);
    cardsBox.innerHTML = cards.map(c => cardMarkup(c, String(c.card_id) === String(selectedCardId))).join('');
    cardsBox.querySelectorAll('[data-card-id]').forEach(btn => btn.addEventListener('click', () => {
      selectedCardId = btn.dataset.cardId;
      renderHand(gameState);
      updateControls();
    }));
  });
  $('handCards').querySelectorAll('[data-group-target]').forEach(btn => {
    btn.onclick = () => moveSelectedToGroup(btn.dataset.groupTarget);
  });
  $('myCardCount').textContent = `${hand.length} CARDS`;
  const hint = $('selectedHint');
  if (hint) hint.textContent = selectedCardId ? 'Selected card ready for DISCARD / DECLARE' : 'Select a card to discard';
}
function renderOpen(state) {
  const wrap = $('openPileWrap');
  if (!state.open_card) {
    wrap.innerHTML = '<span class="pile-label">OPEN CARD</span><div class="open-card-empty">EMPTY</div><span class="pile-hint">NO OPEN CARD</span>';
    return;
  }
  wrap.innerHTML = `<span class="pile-label">OPEN CARD</span>${cardMarkup(state.open_card, false, 'open-card') .replace('<button', '<button id="openPile"').replace('data-card-id=', 'data-card-id=')}<span class="pile-hint">PICK OPEN</span>`;
  const open = $('openPile');
  if (open) open.addEventListener('click', () => pickCard('OPEN'));
}
function renderState(state) {
  gameState = state;
  serverOffsetMs = state.server_time ? (new Date(state.server_time).getTime() - Date.now()) : 0;
  $('tableCode').textContent = state.table_code || tableCode;
  $('dealNo').textContent = String(state.round_no || 1).padStart(2,'0');
  $('dealerName').textContent = state.dealer_name || '—';
  $('stockCount').textContent = Number(state.stock_count ?? 0);
  $('myName').textContent = state.my_name || profile?.name || 'YOU';
  $('mySeatNo').textContent = state.my_seat_no || '—';
  $('myTurnLabel').textContent = state.current_turn_user_id === state.my_user_id ? 'YOUR TURN' : `${state.current_turn_name || 'OPPONENT'} TURN`;
  $('turnBannerName').textContent = state.current_turn_user_id === state.my_user_id ? 'YOUR TURN' : `${state.current_turn_name || 'OPPONENT'} TURN`;
  $('turnBanner').classList.toggle('is-my-turn', state.current_turn_user_id === state.my_user_id);
  $('myPlayerCard').classList.toggle('active-turn-self', state.current_turn_user_id === state.my_user_id);
  $('connectionText').textContent = 'LIVE';
  $('connectionTextFooter').textContent = 'LIVE CONNECTION';
  $('connectionIndicator').classList.add('online');
  renderPlayers(state);
  renderHand(state);
  renderOpen(state);
  updateControls();
  updateClock();
  if (state.round_status === 'OBSERVATION') {
    toast('Declaration observation has started. The observation screen will be shown in the next integration step.');
  }
}
function updateClock() {
  if (!gameState) return;
  const deadline = gameState.turn_deadline_at ? new Date(gameState.turn_deadline_at).getTime() : 0;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - (Date.now() + serverOffsetMs))/1000)) : Number(gameState.remaining_seconds || 0);
  $('timerText').textContent = remaining;
  $('turnBannerSeconds').textContent = `${remaining}s`;
  $('timerText').classList.toggle('timer-low', remaining <= 10);
}
function updateControls() {
  if (!gameState) return;
  const myTurn = gameState.current_turn_user_id === gameState.my_user_id && gameState.my_player_status === 'PLAYING';
  const drew = !!gameState.has_drawn_card;
  const handCount = (gameState.my_hand || []).length;
  $('pickStockBtn').disabled = busy || !myTurn || drew || Number(gameState.stock_count) <= 0;
  $('pickOpenBtn').disabled = busy || !myTurn || drew || !gameState.open_card;
  $('discardBtn').disabled = busy || !myTurn || !drew || handCount !== 10 || !selectedCardId;
  $('declareBtn').disabled = busy || !myTurn || !drew || handCount !== 10 || !selectedCardId;
  $('handInstructions').textContent = drew ? 'Select a card to DISCARD or exclude for DECLARE' : 'Arrange cards into G1, G2 and G3';
}
async function loadState(silent = false) {
  if (!tableCode || !sessionToken || busy) return;
  try {
    const state = resultOrThrow(await rpc('jop_sets_get_game_state', {p_session_token:sessionToken,p_table_code:tableCode}), 'Unable to load SETS game state.');
    if (state.round_status === 'COMPLETED' || state.round_status === 'CANCELLED') {
      toast(`Deal ${state.round_status.toLowerCase()}.`);
      return;
    }
    const oldTurn = gameState?.current_turn_user_id;
    const oldDrawn = gameState?.has_drawn_card;
    renderState(state);
    if (oldTurn !== state.current_turn_user_id || oldDrawn !== state.has_drawn_card) selectedCardId = null;
    if (!silent && !lastMessage) lastMessage = 'Live game connected.';
  } catch (error) {
    $('connectionText').textContent = 'RECONNECTING';
    $('connectionIndicator').classList.remove('online');
    if (!silent) toast(error.message, true);
    console.error('SETS state refresh failed:', error);
  }
}
async function performAction(name, args, successText) {
  if (busy) return;
  busy = true; updateControls();
  try {
    const result = resultOrThrow(await rpc(name, args), `Unable to perform ${name}.`);
    selectedCardId = null;
    toast(result.message || successText || 'Action completed.');
    busy = false;
    await loadState(true);
  } catch (error) { toast(error.message, true); }
  finally { busy = false; updateControls(); }
}
function baseArgs() { return {p_session_token:sessionToken,p_table_code:tableCode}; }
function pickCard(source) {
  if (!gameState || gameState.current_turn_user_id !== gameState.my_user_id) return;
  performAction('jop_sets_pick_card', {...baseArgs(),p_source:source}, `Picked from ${source}.`);
}
function discardCard() {
  if (!selectedCardId) return toast('Select a card to discard.', true);
  performAction('jop_sets_discard_card', {...baseArgs(),p_card_id:Number(selectedCardId)}, 'Card discarded.');
}
function declareHand() {
  if (!selectedCardId) return toast('Select the card to exclude from your nine-card declaration.', true);
  if (!confirm('Use the selected card as the excluded OPEN card and submit your nine-card declaration?')) return;
  performAction('jop_sets_declare', {...baseArgs(),p_excluded_card_id:Number(selectedCardId)}, 'Declaration submitted.');
}
async function initialize() {
  if (!sessionToken) { location.replace('index.html'); return; }
  if (!tableCode) { location.replace('sets.html'); return; }
  try {
    const valid = firstRow(await rpc('crdgn_validate_session',{p_session_token:sessionToken}));
    if (!valid?.success) { localStorage.removeItem(SETS_SESSION_KEY); location.replace('index.html'); return; }
    profile = firstRow(await rpc('crdgn_get_profile',{p_session_token:sessionToken}));
    if (!profile?.user_id) throw new Error('Unable to load your player profile.');
    $('exitBtn').addEventListener('click', () => { if (confirm('Return to the SETS lobby? Your table membership will remain active.')) location.href = `sets.html?table=${encodeURIComponent(tableCode)}`; });
    $('pickStockBtn').addEventListener('click', () => pickCard('STOCK'));
    $('pickOpenBtn').addEventListener('click', () => pickCard('OPEN'));
    $('stockPile').addEventListener('click', () => pickCard('STOCK'));
    $('discardBtn').addEventListener('click', discardCard);
    $('declareBtn').addEventListener('click', declareHand);
    $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
    $('soundBtn').addEventListener('click', () => { soundEnabled = !soundEnabled; $('soundBtn').textContent = soundEnabled ? '♫' : '♪'; toast(soundEnabled ? 'Sound enabled' : 'Sound muted'); });
    $('helpDialog').querySelectorAll('[data-close-dialog]').forEach(b => b.addEventListener('click', () => $('helpDialog').close()));
    await loadState(false);
    refreshHandle = setInterval(() => loadState(true), 1200);
    clockHandle = setInterval(updateClock, 200);
  } catch (error) { toast(error.message, true); console.error(error); }
}
window.addEventListener('beforeunload', () => { clearInterval(refreshHandle); clearInterval(clockHandle); });
initialize();
