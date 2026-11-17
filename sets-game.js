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
let desiredPickGroup = 4;
let pointerDrag = null;
let suppressNextClick = false;
let observationRefreshHandle = null;
let observationData = null;
let observationFinishBusy = false;
let observationRoundKey = null;
let autoDealBusyRound = null;

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
function rankSortValue(card) {
  const r = String(card.rank_code || card.card_code || '').replace(/[SHDC]$/i, '').toUpperCase();
  const order = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13, JKR:14 };
  return order[r] || 99;
}
function buildInitialGroups(hand) {
  const groups = [[], [], []];
  const byRank = new Map();
  hand.slice().sort((a,b) => rankSortValue(a)-rankSortValue(b)).forEach(card => {
    const rank = cardParts(card).joker ? 'ZZ-JOKER' : String(card.rank_code || card.card_code || '').replace(/[SHDC]$/i,'').toUpperCase();
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(card);
  });
  const clusters = [...byRank.values()].sort((a,b) => b.length-a.length || rankSortValue(a[0])-rankSortValue(b[0]));
  clusters.forEach(cluster => {
    while (cluster.length) {
      const chunk = cluster.splice(0, Math.min(3, cluster.length));
      let target = groups.findIndex(g => g.length + chunk.length <= 3);
      if (target < 0) target = groups.reduce((best,g,i) => g.length < groups[best].length ? i : best, 0);
      chunk.forEach(card => groups[target].push(card));
    }
  });
  const remaining = hand.filter(c => !groups.some(g => g.some(x => String(x.card_id) === String(c.card_id))));
  remaining.forEach(card => {
    const target = groups.findIndex(g => g.length < 3);
    if (target >= 0) groups[target].push(card);
  });
  groups.forEach(g => g.sort((a,b) => rankSortValue(a)-rankSortValue(b)));
  const assignments = {};
  groups.forEach((g,i) => g.forEach(c => assignments[String(c.card_id)] = i+1));
  return assignments;
}
function ensureGroupAssignments(hand, state) {
  const key = `${state.round_id || state.round_no || 'round'}:${state.my_user_id || 'player'}`;
  if (groupRoundKey !== key) { groupAssignments = {}; groupRoundKey = key; }
  const liveIds = new Set(hand.map(c => String(c.card_id)));
  Object.keys(groupAssignments).forEach(id => { if (!liveIds.has(id)) delete groupAssignments[id]; });
  if (!Object.keys(groupAssignments).length && hand.length >= 9 && !state.has_drawn_card) {
    groupAssignments = buildInitialGroups(hand);
  }
  const pickedId = state.picked_card_id == null ? null : String(state.picked_card_id);
  if (state.has_drawn_card && pickedId && liveIds.has(pickedId) && !groupAssignments[pickedId]) {
    groupAssignments[pickedId] = Number(desiredPickGroup || 4);
  }
  hand.forEach(card => {
    const id = String(card.card_id);
    if (groupAssignments[id]) return;
    groupAssignments[id] = state.has_drawn_card && pickedId === id ? Number(desiredPickGroup || 4) : 4;
  });
}
function moveCardToGroup(cardId, groupNo) {
  const target = Number(groupNo);
  const hand = gameState?.my_hand || [];
  if (!hand.some(c => String(c.card_id) === String(cardId))) return;
  groupAssignments[String(cardId)] = target;
  selectedCardId = null;
  renderHand(gameState);
  updateControls();
}
function moveSelectedToGroup(groupNo) {
  if (!selectedCardId) return toast('Select a card first.', true);
  moveCardToGroup(selectedCardId, groupNo);
}
function renderHand(state) {
  const hand = Array.isArray(state.my_hand) ? state.my_hand : [];
  ensureGroupAssignments(hand, state);
  $('handCount').textContent = hand.length;
  const groups = [1, 2, 3, 4];
  groups.forEach(groupNo => {
    const section = $('handCards').querySelector(`[data-group="${groupNo}"]`);
    if (!section) return;
    const cardsBox = section.querySelector('.group-cards');
    const cards = hand.filter(c => Number(groupAssignments[String(c.card_id)]) === groupNo).sort((a,b) => rankSortValue(a)-rankSortValue(b));
    section.querySelector('.group-count').textContent = `${cards.length}`;
    section.querySelector('.group-title').classList.toggle('group-full', cards.length >= 3);
    cardsBox.innerHTML = cards.map(c => cardMarkup(c, String(c.card_id) === String(selectedCardId))).join('');
    section.style.setProperty('--group-card-count', String(cards.length));
    const cardWidth = 82, overlap = 16, pad = 8;
    const contentWidth = cards.length ? (cardWidth + Math.max(0, cards.length - 1) * (cardWidth - overlap) + pad) : (cardWidth + pad);
    section.style.width = `${contentWidth}px`;
    section.style.minWidth = `${contentWidth}px`;
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
  $('topTurnLabel').textContent = state.current_turn_user_id === state.my_user_id ? 'YOUR TURN' : `${state.current_turn_name || 'OPPONENT'} TURN`;
  $('topTurnLabel').classList.toggle('is-my-turn', state.current_turn_user_id === state.my_user_id);
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
    openObservation();
  } else {
    closeObservation();
    if (state.round_status === 'SHUFFLING') maybeCompleteNextDeal(state);
  }
}
function updateClock() {
  if (!gameState) return;
  const deadline = gameState.turn_deadline_at ? new Date(gameState.turn_deadline_at).getTime() : 0;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - (Date.now() + serverOffsetMs))/1000)) : Number(gameState.remaining_seconds || 0);
  $('timerText').textContent = remaining;
  $('topTurnSeconds').textContent = `${remaining}s`;
  $('timerText').classList.toggle('timer-low', remaining <= 10);
}
function updateControls() {
  if (!gameState) return;
  const myTurn = gameState.current_turn_user_id === gameState.my_user_id && gameState.my_player_status === 'PLAYING';
  const drew = !!gameState.has_drawn_card;
  const handCount = (gameState.my_hand || []).length;
  $('stockPile').disabled = busy || !myTurn || drew || Number(gameState.stock_count) <= 0;
  const openEl = $('openPile'); if (openEl) openEl.disabled = busy || !myTurn || drew || !gameState.open_card;
  $('discardBtn').disabled = busy || !myTurn || !drew || handCount !== 10 || !selectedCardId;
  $('declareBtn').disabled = busy || !myTurn || !drew || handCount !== 10 || !selectedCardId;
  $('handInstructions').textContent = drew ? 'Drawn card is in G4. Move cards as needed, then discard or declare.' : 'Arrange your nine cards into G1, G2 and G3.';
}
function obsCardMarkup(c) {
  const code=String(c.card_code||'');
  if(code.startsWith('PJ')||String(c.rank_code).toUpperCase()==='JKR') return `<span class="obs-mini-card joker">★<small>${escapeHtml(code)}</small></span>`;
  const suit=String(c.suit||'').toUpperCase(); const symbol=suitSymbol(suit); const rank=escapeHtml(c.rank_code||code.slice(0,-1));
  return `<span class="obs-mini-card ${suit==='H'||suit==='D'?'red':''}">${rank}<small>${symbol}</small></span>`;
}
function renderObservation(data) {
  observationData=data;
  const dlg=$('observationDialog');
  $('obsTableCode').textContent=data.table_code||tableCode;
  $('obsDealNo').textContent=String(data.round_no||1).padStart(2,'0');
  $('obsDealerName').textContent=data.dealer_name||'—';
  const players=data.players||[];
  $('obsPlayers').innerHTML=players.map(p=>{
    const grouping=p.grouping||{}; const groups=grouping.groups||[]; const ungrouped=grouping.ungrouped_cards||[];
    const groupHtml=[0,1,2].map(i=>{const cards=groups[i]||[];return `<div class="obs-group"><span class="obs-group-label">G${i+1}</span><div class="obs-group-cards">${cards.map(obsCardMarkup).join('')||'<span class="obs-player-seat">—</span>'}</div></div>`}).join('');
    const extra=ungrouped.length?`<div class="obs-ungrouped"><span class="obs-ungrouped-label">EXTRA</span>${ungrouped.map(obsCardMarkup).join('')}</div>`:'';
    return `<article class="obs-player-row"><div class="obs-player-ident"><div class="obs-player-name">${escapeHtml(p.player_name||'PLAYER')}</div><div class="obs-player-seat">SEAT ${escapeHtml(p.seat_no??'—')}</div></div>${groupHtml}<span class="obs-result ${p.result_status==='WINNER'?'winner':''}">${escapeHtml(p.result_status||'LOST')}</span>${extra}</article>`;
  }).join('')||'<div class="obs-loading">No player results available.</div>';
  $('obsMessage').textContent='All players see the same deal results. No wallet or transaction settlement.';
  if(!dlg.open) dlg.showModal();
  updateObservationTimer();
  const key=String(data.round_id||data.round_no||'');
  if(observationRoundKey!==key){observationRoundKey=key;observationFinishBusy=false;}
}
async function openObservation(){
  if(!tableCode||!sessionToken)return;
  try{
    const raw=await rpc('jop_sets_get_observation_state',{p_session_token:sessionToken,p_table_code:tableCode});
    const data=firstRow(raw);
    if(data?.success){renderObservation(data);}
    else if(data?.round_status && data.round_status!=='OBSERVATION'){closeObservation();}
    else if(data?.message) console.warn('SETS observation:',data.message);
  }catch(e){console.error('SETS observation load failed:',e);}
}
function updateObservationTimer(){
  if(!observationData)return;
  const serverOffset=observationData.server_time?new Date(observationData.server_time).getTime()-Date.now():serverOffsetMs;
  const end=observationData.observation_ends_at?new Date(observationData.observation_ends_at).getTime():0;
  const left=end?Math.max(0,Math.ceil((end-(Date.now()+serverOffset))/1000)):0;
  $('obsTimer').textContent=`${left}s`;
  if(left===0)finishObservation();
}
async function finishObservation(){
  if(observationFinishBusy||!observationData)return;
  observationFinishBusy=true;
  try{
    const result=firstRow(await rpc('jop_sets_complete_observation',{p_session_token:sessionToken,p_table_code:tableCode}));
    if(result?.success){
      closeObservation();
      await loadState(true);
    }else if(result?.round_status==='SHUFFLING'||result?.already_started){
      closeObservation(); await loadState(true);
    }else{
      observationFinishBusy=false;
      if(result?.message) console.warn('Observation completion:',result.message);
    }
  }catch(e){observationFinishBusy=false;console.error('Observation completion failed:',e);}
}
function closeObservation(){
  const dlg=$('observationDialog'); if(dlg?.open)dlg.close();
  observationData=null;
}
async function maybeCompleteNextDeal(state){
  const key=String(state.round_id||state.round_no||'');
  if(!key||autoDealBusyRound===key)return;
  const nextAt=state.next_action_at?new Date(state.next_action_at).getTime():0;
  const serverNow=state.server_time?new Date(state.server_time).getTime():Date.now()+serverOffsetMs;
  if(!nextAt||serverNow<nextAt)return;
  autoDealBusyRound=key;
  try{
    const result=firstRow(await rpc('jop_sets_complete_initial_deal',{p_session_token:sessionToken,p_table_code:tableCode}));
    if(result?.success){autoDealBusyRound=null;await loadState(true);}
    else if(/SHUFFLING|already completed|not in SHUFFLING/i.test(result?.message||'')){autoDealBusyRound=null;}
    else{console.warn('Next deal distribution:',result?.message);autoDealBusyRound=null;}
  }catch(e){console.error('Next deal distribution failed:',e);autoDealBusyRound=null;}
}

async function loadState(silent = false) {
  if (!tableCode || !sessionToken || busy) return;
  try {
    const state = resultOrThrow(await rpc('jop_sets_get_game_state', {p_session_token:sessionToken,p_table_code:tableCode}), 'Unable to load SETS game state.');
    if (state.round_status === 'COMPLETED' || state.round_status === 'CANCELLED') {
      closeObservation();
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
function pickCard(source, targetGroup = 4) {
  if (!gameState || gameState.current_turn_user_id !== gameState.my_user_id) return;
  desiredPickGroup = Number(targetGroup) || 4;
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
function bindDragAndDrop() {
  const stage = $('gameStage');
  const removeGhost = () => {
    if (pointerDrag?.ghost) pointerDrag.ghost.remove();
  };
  stage.addEventListener('pointerdown', e => {
    const stock = e.target.closest('#stockPile');
    const open = e.target.closest('#openPile');
    const card = e.target.closest('#handCards [data-card-id]');
    if (!stock && !open && !card) return;
    if (card && e.button !== 0) return;
    const kind = stock ? 'STOCK' : open ? 'OPEN' : 'CARD';
    const ghost = card ? card.cloneNode(true) : null;
    if (ghost) {
      ghost.classList.add('drag-ghost');
      ghost.classList.remove('selected');
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      document.body.appendChild(ghost);
      card.classList.add('drag-source');
    }
    pointerDrag = { kind, id:card ? String(card.dataset.cardId) : null,
      x:e.clientX, y:e.clientY, moved:false, ghost, source:card, pointerId:e.pointerId };
    if (card) card.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!pointerDrag) return;
    const dx = e.clientX - pointerDrag.x, dy = e.clientY - pointerDrag.y;
    if (Math.hypot(dx, dy) > 8) pointerDrag.moved = true;
    if (pointerDrag.ghost) {
      pointerDrag.ghost.style.left = `${e.clientX}px`;
      pointerDrag.ghost.style.top = `${e.clientY}px`;
      pointerDrag.ghost.style.transform = 'translate(-50%, -50%) rotate(2deg) scale(1.04)';
    }
  });
  const finishDrag = e => {
    if (!pointerDrag) return;
    const drag = pointerDrag;
    pointerDrag = null;
    if (drag.source) drag.source.classList.remove('drag-source');
    if (drag.ghost) drag.ghost.remove();
    if (!drag.moved) return;
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 300);
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetGroup = target?.closest('[data-group]');
    const targetOpen = target?.closest('.open-wrap');
    if (drag.kind === 'CARD') {
      if (targetGroup) moveCardToGroup(drag.id, Number(targetGroup.dataset.group));
      else if (targetOpen) { selectedCardId = drag.id; discardCard(); }
    } else if (drag.kind === 'STOCK' || drag.kind === 'OPEN') {
      if (targetGroup) pickCard(drag.kind, Number(targetGroup.dataset.group));
      else if (drag.kind === 'STOCK' && target?.closest('#stockPile')) pickCard('STOCK', 4);
      else if (drag.kind === 'OPEN' && targetOpen) pickCard('OPEN', 4);
    }
  };
  stage.addEventListener('pointerup', finishDrag);
  stage.addEventListener('pointercancel', () => {
    if (pointerDrag?.source) pointerDrag.source.classList.remove('drag-source');
    if (pointerDrag?.ghost) pointerDrag.ghost.remove();
    pointerDrag = null;
  });
  $('stockPile').addEventListener('click', () => { if (!suppressNextClick) pickCard('STOCK', 4); });
  $('openPileWrap').addEventListener('click', e => {
    const open = e.target.closest('#openPile');
    if (open && !suppressNextClick) pickCard('OPEN', 4);
  });
  $('handCards').addEventListener('click', e => {
    const card = e.target.closest('[data-card-id]');
    if (!card || suppressNextClick) return;
    const clickedId = String(card.dataset.cardId);
    selectedCardId = selectedCardId === clickedId ? null : clickedId;
    renderHand(gameState); updateControls();
  });
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
    $('discardBtn').addEventListener('click', discardCard);
    bindDragAndDrop();
    $('declareBtn').addEventListener('click', declareHand);
    $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
    $('soundBtn').addEventListener('click', () => { soundEnabled = !soundEnabled; $('soundBtn').textContent = soundEnabled ? '♫' : '♪'; toast(soundEnabled ? 'Sound enabled' : 'Sound muted'); });
    $('helpDialog').querySelectorAll('[data-close-dialog]').forEach(b => b.addEventListener('click', () => $('helpDialog').close()));
    await loadState(false);
    refreshHandle = setInterval(() => loadState(true), 1200);
    clockHandle = setInterval(() => { updateClock(); updateObservationTimer(); }, 200);
    $('obsExitBtn').addEventListener('click', () => { if(confirm('Exit this SETS table?')) location.href=`sets.html?table=${encodeURIComponent(tableCode)}`; });
  } catch (error) { toast(error.message, true); console.error(error); }
}
window.addEventListener('beforeunload', () => { clearInterval(refreshHandle); clearInterval(clockHandle); });
initialize();
