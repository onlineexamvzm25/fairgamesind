// =========================
// SUPABASE INIT
// =========================


const SUPABASE_URL ='https://dbfycihbcosuxxkrmbhl.supabase.co';

const SUPABASE_KEY ='sb_publishable_aOyXtAbzrrX0Z9jPAU1qEA_0ZnK35BX';


const supabaseClient =
supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);


// =========================
// SINGLE GLOBAL STATE (FIXED)
// =========================
let state = {
  sessionId: null,
  tableId: null,
  userId: null,
  nickname: null,
  seatNo: null,
  fixedSeatNo: null,
  joined: false,
  hand: [],
  groups : [
    [],
    [],
    [],
    [],
    []
   ],
   openPile: [],
  selectedCard: null,
  selectedCards: [],
  jokerCard:null,
  lobbyTimerHandle: null,
  turnStartedAt:null,
  turnEndAt:null,
  lastProcessedTurnEndAt: null,
  lastHandledTimeoutEvent : null,
  turnTimeoutProcessing: false,
  turnServerNowMs: null,
  turnServerSyncPerfMs: null,
  lastTurnSeat: null,
  dragCard: null,
  currentTurnSeat: null,
  ignoreResultWindow : false,
  dealerSeat: null,
  declarationMode : false,
  declarationTimerStarted: false,
  observationTimerInterval : null,
  lastEventTime: null,
  declarationTimerInterval : null,
  resultWindowOpened : false,
  isDropped : false,
  isEliminated : false,
  isInvalidDeclaration : false,
  eliminationScreenShown : false,
  eliminatedRefreshStarted : false,
  playerStatus : false,
  tableCompleted : false,
  deal_no : null,
  wildRank : null,
  dropType : null,
  myScore: null,
  settlementEligible: false,
  settlementId: null,
  settlementOpened: false,
  pickedCard: null,
  participatedInDeal : false
};



const pickupSound = new Audio("pickup.mp3");
const discardSound = new Audio("discard.mp3");

let savedUserId =
  localStorage.getItem("crdg_user_id");

if(!savedUserId){

  savedUserId = crypto.randomUUID();

  localStorage.setItem(
    "crdg_user_id",
    savedUserId
  );
}

let gameEntered = false;

let turnTimerHandle = null;

let observationTimeRemaining = 30;


const GAME_TYPE = "FRIENDS";

// ==========================================
// PREVENT ACCIDENTAL BACK DURING FRIENDS GAME
// ==========================================

let backNavigationArmed = false;

function enableBackProtection() {

    if (backNavigationArmed) {
        return;
    }

    backNavigationArmed = true;

    history.pushState(
        { friendsGame: true },
        "",
        window.location.href
    );

    window.addEventListener(
        "popstate",
        function () {

            const leaveGame =
                confirm(
                    "You are currently playing this table.\n\n" +
                    "Press OK to leave the table.\n" +
                    "Press Cancel to continue playing."
                );

            if (leaveGame) {

                // Allow Back navigation.
                history.back();

            } else {

                // Stay on the game page.
                history.pushState(
                    { friendsGame: true },
                    "",
                    window.location.href
                );
            }
        }
    );
}

enableBackProtection();


document.getElementById( "openVisual").onclick = () => {
  draw("open");
};

document.getElementById( "stockCard").onclick = () => {
 draw("stock");
};


document
    .getElementById("btnHistory")
    .addEventListener(
        "click",
        openHistoryPopup
    );


document
    .getElementById("btnCloseHistory")
    .addEventListener(
        "click",
        closeHistoryPopup
    );

document
    .getElementById("historyPopup")
    .addEventListener(
        "click",
        function(event) {

            if (
                event.target === this
            ) {
                closeHistoryPopup();
            }
        }
    );


// ==========================================
// OPEN / STOCK -> G1-G6 DRAG
// ==========================================

const openVisual =
    document.getElementById("openVisual");

const stockCard =
    document.getElementById("stockCard");


// ------------------------------------------
// OPEN CARD DRAG SOURCE
// ------------------------------------------

if (openVisual) {

    openVisual.addEventListener("dragstart", (e) => {

        e.dataTransfer.setData(
            "text/plain",
            "OPEN_CARD"
        );

        e.dataTransfer.effectAllowed = "move";
    });
}


// ------------------------------------------
// STOCK CARD DRAG SOURCE
// ------------------------------------------

if (stockCard) {

    stockCard.draggable = true;

    stockCard.addEventListener("dragstart", (e) => {

        e.dataTransfer.setData(
            "text/plain",
            "STOCK_CARD"
        );

        e.dataTransfer.effectAllowed = "move";
    });
}


// ------------------------------------------
// ALL G1-G6 ARE DROP TARGETS
// ------------------------------------------

for (let targetGroup = 0; targetGroup < 6; targetGroup++) {

    const groupEl =
        document.getElementById(
            "group" + targetGroup
        );

    if (!groupEl) {
        continue;
    }

    groupEl.addEventListener("dragover", (e) => {
        e.preventDefault();
    });

    groupEl.addEventListener("drop", async (e) => {

        e.preventDefault();

        const source =
            e.dataTransfer.getData("text/plain");

        if (
            source !== "OPEN_CARD" &&
            source !== "STOCK_CARD"
        ) {
            return;
        }

        if (source === "OPEN_CARD") {

            await draw(
                "open",
                targetGroup
            );

        }
        else if (source === "STOCK_CARD") {

            await draw(
                "stock",
                targetGroup
            );
        }
    });
}


openVisual.addEventListener("dragover", (e) => {
    e.preventDefault();
});

openVisual.addEventListener("drop", async (e) => {

    e.preventDefault();

    if(!state.dragCard){
        return;
    }

    state.selectedCards = [{
        card: state.dragCard.card,
        group: state.dragCard.group,
        index: state.dragCard.index
    }];

    state.dragCard = null;

    await discard();
});


enableMobileCardDrag();

function enableMobileCardDrag() {

    if (window.innerWidth > 900) {
        return;
    }

    let dragType = null;
    let dragCardData = null;
    let dragGhost = null;

    const openVisual =
    document.getElementById("openVisual");

    const groupTargets = [];

        for (let g = 0; g < 6; g++) {

            const groupEl =
                document.getElementById("group" + g);

            if (groupEl) {
                groupTargets.push({
                    group: g,
                    element: groupEl
                });
            }
        }

    const hand =
        document.getElementById("my-hand");

    if (!openVisual || !hand) {
      return;
    }

    function createGhost(text, x, y) {

        dragGhost = document.createElement("div");

        dragGhost.textContent = text;

        dragGhost.style.position = "fixed";
        dragGhost.style.left = x + "px";
        dragGhost.style.top = y + "px";

        dragGhost.style.width = "60px";
        dragGhost.style.height = "118px";

        dragGhost.style.background = "white";
        dragGhost.style.color = "black";

        dragGhost.style.border = "2px solid gold";
        dragGhost.style.borderRadius = "8px";

        dragGhost.style.display = "flex";
        dragGhost.style.alignItems = "center";
        dragGhost.style.justifyContent = "center";

        dragGhost.style.fontWeight = "bold";
        dragGhost.style.fontSize = "20px";

        dragGhost.style.pointerEvents = "none";

        dragGhost.style.transform =
            "translate(-50%, -50%) scale(.9)";

        dragGhost.style.opacity = ".9";

        dragGhost.style.zIndex = "99999";

        document.body.appendChild(dragGhost);
    }

    function moveGhost(x, y) {

        if (!dragGhost) {
            return;
        }

        dragGhost.style.left = x + "px";
        dragGhost.style.top = y + "px";
    }

    function removeGhost() {

        if (dragGhost) {
            dragGhost.remove();
            dragGhost = null;
        }
    }

    function cancelMobileDrag() {

        dragType = null;
        dragCardData = null;

        removeGhost();
    }

    function isInside(element, x, y) {

        const rect =
            element.getBoundingClientRect();

        return (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
        );
    }

    function getTargetGroup(x, y) {

    for (const target of groupTargets) {

        if (
            isInside(
                target.element,
                x,
                y
            )
        ) {
            return target.group;
        }
    }

    return -1;
    }


    /* =====================================
       OPEN CARD -> GROUP 5
    ===================================== */

    openVisual.addEventListener(
        "pointerdown",
        function (e) {

            if (e.pointerType === "mouse") {
                return;
            }

            dragType = "OPEN_CARD";

            createGhost(
                openVisual.innerText,
                e.clientX,
                e.clientY
            );

            openVisual.setPointerCapture(
                e.pointerId
            );
        }
    );

    openVisual.addEventListener(
        "pointermove",
        function (e) {

            if (dragType !== "OPEN_CARD") {
                return;
            }

            moveGhost(
                e.clientX,
                e.clientY
            );
        }
    );

    openVisual.addEventListener(
        "pointerup",
        async function (e) {

            if (dragType !== "OPEN_CARD") {
                return;
            }

            const targetGroup =
                getTargetGroup(
                    e.clientX,
                    e.clientY
                );

            if (targetGroup !== -1) {

                await draw(
                    "open",
                    targetGroup
                );
            }

            dragType = null;

            removeGhost();
        }
    );

        openVisual.addEventListener(
        "pointercancel",
        cancelMobileDrag
    );

    hand.addEventListener(
        "pointercancel",
        cancelMobileDrag
    );

    openVisual.addEventListener(
        "lostpointercapture",
        cancelMobileDrag
    );

    hand.addEventListener(
        "lostpointercapture",
        cancelMobileDrag
    );


    /* =====================================
       HAND CARD -> OPEN PILE
    ===================================== */

    hand.addEventListener(
        "pointerdown",
        function (e) {

            if (e.pointerType === "mouse") {
                return;
            }

            const cardElement =
                e.target.closest(".card");

            if (!cardElement) {
                return;
            }

            if (state.isDropped) {
                return;
            }

            let found = false;

            for (
                let g = 0;
                g < state.groups.length;
                g++
            ) {

                const cards =
                    document.querySelectorAll(
                        "#group" + g + " .card"
                    );

                cards.forEach(
                    (cardEl, index) => {

                        if (
                            cardEl === cardElement
                        ) {

                            dragCardData = {
                                card:
                                    state.groups[g][index],
                                group: g,
                                index: index
                            };

                            found = true;
                        }
                    }
                );

                if (found) {
                    break;
                }
            }

            if (!dragCardData) {
                return;
            }

            dragType = "HAND_CARD";

            createGhost(
                dragCardData.card,
                e.clientX,
                e.clientY
            );

            cardElement.setPointerCapture(
                e.pointerId
            );
        }
    );

    hand.addEventListener(
        "pointermove",
        function (e) {

            if (dragType !== "HAND_CARD") {
                return;
            }

            moveGhost(
                e.clientX,
                e.clientY
            );
        }
    );

    hand.addEventListener(
    "pointerup",
    async function (e) {

        if (
            dragType !== "HAND_CARD" ||
            !dragCardData
        ) {
            return;
        }

        let handled = false;

        /*
        =====================================
        1. HAND CARD -> OPEN PILE
        =====================================
        */

        if (
            isInside(
                openVisual,
                e.clientX,
                e.clientY
            )
        ) {

            state.selectedCards = [{
        card: dragCardData.card,
        group: dragCardData.group,
        index: dragCardData.index
    }];

            await discard();

            handled = true;
        }

        /*
        =====================================
        2. HAND CARD -> ANOTHER GROUP
        =====================================
        */

        if (!handled) {

            for (let targetGroup = 0; targetGroup < 6; targetGroup++) {

                const groupEl =
                    document.getElementById(
                        "group" + targetGroup
                    );

                if (!groupEl) {
                    continue;
                }

                if (
                    isInside(
                        groupEl,
                        e.clientX,
                        e.clientY
                    )
                ) {

                    const sourceGroup =
                        dragCardData.group;

                    const sourceIndex =
                        dragCardData.index;

                    const cardToMove =
                        dragCardData.card;

                    /*
                     Same group dropped into empty area:
                     do nothing for now.
                    */
                    if (sourceGroup === targetGroup) {

    const targetCards =
        groupEl.querySelectorAll(".card");

    let targetIndex = -1;

    targetCards.forEach((cardEl, index) => {

        const rect =
            cardEl.getBoundingClientRect();

        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            targetIndex = index;
        }
    });

    if (
        targetIndex !== -1 &&
        targetIndex !== sourceIndex
    ) {

        const movedCard =
            state.groups[sourceGroup]
                .splice(
                    sourceIndex,
                    1
                )[0];

        if (sourceIndex < targetIndex) {
            targetIndex--;
        }

        state.groups[targetGroup]
            .splice(
                targetIndex,
                0,
                movedCard
            );

        clearCardSelection();

        renderHand();
        calculateDealScore();
    }

    handled = true;
    break;
}

                    /*
                     Remove from source group
                    */

                    state.groups[sourceGroup]
                        .splice(
                            sourceIndex,
                            1
                        );

                    /*
                     Add to target group
                    */

                    state.groups[targetGroup]
                        .push(
                            cardToMove
                        );

                    clearCardSelection();

                    renderHand();
                    calculateDealScore();

                    handled = true;
                    break;
                }
            }
        }

        dragType = null;
        dragCardData = null;

        removeGhost();
    }
);

// =====================================
// STOCK CARD -> G1-G6
// =====================================

const stockCard =
    document.getElementById("stockCard");

if (stockCard) {

    stockCard.addEventListener(
        "pointerdown",
        function (e) {

            if (e.pointerType === "mouse") {
                return;
            }

            dragType = "STOCK_CARD";

            createGhost(
                "CARD",
                e.clientX,
                e.clientY
            );

            stockCard.setPointerCapture(
                e.pointerId
            );
        }
    );


    stockCard.addEventListener(
        "pointermove",
        function (e) {

            if (dragType !== "STOCK_CARD") {
                return;
            }

            moveGhost(
                e.clientX,
                e.clientY
            );
        }
    );


    stockCard.addEventListener(
        "pointerup",
        async function (e) {

            if (dragType !== "STOCK_CARD") {
                return;
            }

            const targetGroup =
                getTargetGroup(
                    e.clientX,
                    e.clientY
                );

            if (targetGroup !== -1) {

                await draw(
                    "stock",
                    targetGroup
                );
            }

            dragType = null;

            removeGhost();
        }
    );

    stockCard.addEventListener(
        "pointercancel",
        cancelMobileDrag
    );

    stockCard.addEventListener(
        "lostpointercapture",
        cancelMobileDrag
    );
}


}


// SIX-GROUP HELPERS
// ==========================================
function ensureSixGroups() {
    if (!Array.isArray(state.groups)) {
        state.groups = [];
    }

    while (state.groups.length < 6) {
        state.groups.push([]);
    }

    if (state.groups.length > 6) {
        state.groups = state.groups.slice(0, 6);
    }
}

function findAvailableGroup(startGroup = 0, endGroup = 4, excludeGroup = -1) {
    ensureSixGroups();

    for (let g = startGroup; g <= endGroup; g++) {
        if (g === excludeGroup) continue;
        if (!state.groups[g] || state.groups[g].length === 0) {
            return g;
        }
    }

    return 5;
}

// GROUP BUTTON
// ==========================================

function updateGroupButton() {

    // Remove existing button
    const oldButton =
        document.getElementById("groupActionButton");

    if (oldButton) {
        oldButton.remove();
    }


    // No selection
    if (
        !state.selectedCards ||
        state.selectedCards.length < 2
    ) {
        return;
    }


    // ==========================================
    // FIND NEXT AVAILABLE GROUP
    // G1 -> G2 -> G3 -> G4
    // ==========================================

    let targetGroup = -1;

    // G5 is the user-created grouping slot.
    // G6 is reserved for printed Jokers and overflow.
    ensureSixGroups();
    if (state.groups[4].length === 0) {
        targetGroup = 4;
    } else {
        targetGroup = 5;
    }


    // ==========================================
    // ALREADY 4 GROUPS
    // ==========================================

    if (targetGroup === -1) {

        return;
    }


    // ==========================================
    // GET SELECTED CARD ELEMENTS
    // ==========================================

    const selectedElements = [];

    state.selectedCards.forEach(selected => {

        const groupEl =
            document.getElementById(
                "group" + selected.group
            );

        if (!groupEl) {
            return;
        }

        const cards =
            groupEl.querySelectorAll(".card");

        const cardEl =
            cards[selected.index];

        if (cardEl) {
            selectedElements.push(cardEl);
        }

    });


    if (selectedElements.length === 0) {
        return;
    }


    // ==========================================
    // FIND POSITION ABOVE SELECTED CARDS
    // ==========================================

    let minTop = Infinity;
    let minLeft = Infinity;

    selectedElements.forEach(cardEl => {

        const rect =
            cardEl.getBoundingClientRect();

        minTop =
            Math.min(minTop, rect.top);

        minLeft =
            Math.min(minLeft, rect.left);

    });


    // ==========================================
    // CREATE BUTTON
    // ==========================================

    const button =
        document.createElement("button");

    button.id =
        "groupActionButton";

    button.textContent =
        "GROUP";


    button.style.position = "fixed";

    button.style.left =
        `${minLeft}px`;

    button.style.top =
        `${Math.max(10, minTop - 48)}px`;

    button.style.zIndex =
        "9999";

    button.style.padding =
        "8px 18px";

    button.style.fontSize =
        "14px";

    button.style.fontWeight =
        "bold";

    button.style.borderRadius =
        "8px";

    button.style.cursor =
        "pointer";


    // ==========================================
    // GROUP CLICK
    // ==========================================

    button.onclick = () => {

        groupSelectedCards();
    };


    document.body.appendChild(button);
}


// ==========================================
// GROUP SELECTED CARDS
// ==========================================

function groupSelectedCards() {

    if (
        !state.selectedCards ||
        state.selectedCards.length < 2
    ) {
        return;
    }

    ensureSixGroups();

    // ==========================================================
    // GROUPING RULES
    // ==========================================================
    // G1-G5 = real user groups.
    // G6     = overflow / unassigned group.
    //
    // A) Selected cards from ONE normal group (G1-G5):
    //    selected cards stay in their parent group.
    //
    // B) Selected cards from MULTIPLE groups:
    //    there is no parent. Selected cards are assigned to the
    //    first available group in G1 -> G5.
    //
    // C) Selected cards from G6:
    //    G6 is not a parent. Selected cards are assigned to the
    //    first available group in G1 -> G5.
    //
    // D) Every remaining/unassigned card is redistributed by
    //    checking availability in strict order G1 -> G6.
    // ==========================================================

    const selected = [];
    const seen = new Set();

    state.selectedCards.forEach(item => {
        const group = Number(item.group);
        const index = Number(item.index);

        if (
            !Number.isInteger(group) ||
            group < 0 ||
            group > 5 ||
            !Number.isInteger(index) ||
            index < 0 ||
            !state.groups[group] ||
            index >= state.groups[group].length
        ) {
            return;
        }

        const key = `${group}:${index}`;
        if (seen.has(key)) return;

        seen.add(key);
        selected.push({
            card: state.groups[group][index],
            group,
            index
        });
    });

    if (selected.length < 2) {
        return;
    }

    const sourceGroups = new Map();

    selected.forEach(item => {
        if (!sourceGroups.has(item.group)) {
            sourceGroups.set(item.group, {
                cards: [...state.groups[item.group]],
                selectedIndexes: new Set()
            });
        }

        sourceGroups.get(item.group)
            .selectedIndexes.add(item.index);
    });

    const sourceNumbers = [...sourceGroups.keys()];
    const hasSingleNormalParent =
        sourceNumbers.length === 1 &&
        sourceNumbers[0] >= 0 &&
        sourceNumbers[0] <= 4;

    // ==========================================================
    // CASE A: SINGLE NORMAL PARENT G1-G5
    // ==========================================================
    if (hasSingleNormalParent) {

        const parentGroup = sourceNumbers[0];
        const source = sourceGroups.get(parentGroup);

        const selectedCards = source.cards.filter(
            (_, index) => source.selectedIndexes.has(index)
        );

        const remainingCards = source.cards.filter(
            (_, index) => !source.selectedIndexes.has(index)
        );

        // Selected cards stay with their parent.
        state.groups[parentGroup] = selectedCards;

        // Remaining cards are now invalid/unassigned.
        // If only ONE card remains, keep it in G6 so the
        // user does not see a one-card group.
        // Otherwise find ONE available group in G1 -> G5,
        // then put ALL remaining cards into that SAME group.
        let remainingTarget = -1;

        if (remainingCards.length === 1) {
            remainingTarget = 5; // G6
        } else {
            for (let g = 0; g < 5; g++) {
                if (state.groups[g].length === 0) {
                    remainingTarget = g;
                    break;
                }
            }

            // If no G1-G5 group is available, use G6.
            if (remainingTarget === -1) {
                remainingTarget = 5;
            }
        }

        state.groups[remainingTarget].push(...remainingCards);
    }

    // ==========================================================
    // CASE B/C: MULTIPLE GROUPS OR SELECTION FROM G6
    // ==========================================================
    else {

        const selectedCards = selected.map(item => item.card);
        const remainingCards = [];

        // Collect all unselected cards from the source groups.
        sourceGroups.forEach((source, groupNo) => {
            source.cards.forEach((card, index) => {
                if (!source.selectedIndexes.has(index)) {
                    remainingCards.push(card);
                }
            });
        });

        // Clear the source groups completely. This is important:
        // otherwise a source group's remaining cards would prevent
        // the G1 -> G5 availability search from finding a free group.
        sourceGroups.forEach((source, groupNo) => {
            state.groups[groupNo] = [];
        });

        // --------------------------------------------------------
        // FIRST assign the SELECTED cards.
        // No parent exists here, so ALWAYS check G1 -> G5.
        // --------------------------------------------------------
        let selectedTarget = -1;

        for (let g = 0; g < 5; g++) {
            if (state.groups[g].length === 0) {
                selectedTarget = g;
                break;
            }
        }

        // If all G1-G5 are occupied, G6 is the only safe place.
        if (selectedTarget === -1) {
            selectedTarget = 5;
        }

        state.groups[selectedTarget].push(...selectedCards);

        // --------------------------------------------------------
        // THEN redistribute the remaining cards.
        // IMPORTANT: check availability ONCE, then keep ALL
        // remaining cards together in that SAME group.
        // --------------------------------------------------------
        let remainingTarget = -1;

        for (let g = 0; g < 6; g++) {
            if (state.groups[g].length === 0) {
                remainingTarget = g;
                break;
            }
        }

        if (remainingTarget === -1) {
            remainingTarget = 5;
        }

        state.groups[remainingTarget].push(...remainingCards);
    }



            // ==========================================
        // CLEAN SINGLE-CARD GROUPS
        // ==========================================
        // Any G1-G5 containing exactly ONE card
        // is moved to G6.
        // G6 is the overflow / unassigned group.

        for (let g = 0; g < 5; g++) {

            if (
                state.groups[g] &&
                state.groups[g].length === 1
            ) {

                const singleCard =
                    state.groups[g].shift();

                state.groups[5].push(singleCard);
            }
        }

    clearCardSelection();

    const button =
        document.getElementById("groupActionButton");

    if (button) {
        button.remove();
    }

    renderHand();
    calculateDealScore();
}


async function loadTopGameType() {

    const { data, error } =
        await supabaseClient
            .from("crdg_game_tables")
            .select("max_elimination_score")
            .eq("table_id", state.tableId)
            .single();

    if (error) {
        console.error("Failed to load game type:", error);
        return;
    }

    const gameType =
        Number(data.max_elimination_score) === 101
            ? "101 POOL"
            : "201 POOL";

    const el =
        document.getElementById("topGameType");

    if (el) {
        el.innerText = gameType;
    }
}

// =========================
// RENDER HAND
// =========================
function renderHand() {


        const dropStatus =
            document.getElementById("dropStatus");

        if(state.isDropped)
        {
            dropStatus.style.display = "block";

            if(state.dropType === "INVALID_DECLARE")
            {
                dropStatus.innerHTML =
                    "🚫 INVALID DECLARE";
            }
            else if(state.dropType === "MID_DROP")
            {
                dropStatus.innerHTML =
                    "⛔ YOU MID DROPPED";
            }
            else
            {
                dropStatus.innerHTML =
                    "❌ YOU DROPPED";
            }
            return;
        }
        else
        {
            dropStatus.style.display = "none";
        }

    document.getElementById("dropBtn").disabled    = state.isDropped;
    
    showBaseTableHand();

    

    for(let g = 0; g < 6; g++) {

    const groupEl =
        document.getElementById("group" + g);

    if(!state.groups[g]) {
        state.groups[g] = [];
    }


        // ==========================================
    // G1-G6
    // All groups use the exact same visual/card layout.
    // Empty groups remain hidden.
    // ==========================================

    if(state.groups[g].length === 0) {
        groupEl.style.display = "none";
    }
    else {
        groupEl.style.display = "flex";
        groupEl.innerHTML =
            `<div class="group-title">G${g + 1}</div>`;
    }


        // DROP ON EMPTY GROUP / GROUP AREA

        groupEl.ondragover = (e) => {
            e.preventDefault();
        };

        groupEl.ondrop = (e) => {

            e.preventDefault();

            if(!state.dragCard){
                return;
            }

            const sourceGroup =
                state.dragCard.group;

            const sourceIndex =
                state.dragCard.index;

            const cardToMove =
                state.dragCard.card;

            if(sourceGroup === g){
                return;
            }

            state.groups[sourceGroup]
                .splice(sourceIndex, 1);

            state.groups[g]
                .push(cardToMove);

            state.dragCard = null;

            renderHand();
            calculateDealScore();
        };

        state.groups[g].forEach((card, index) => {

            const div =
                document.createElement("div");

            div.className =
                "card card-enter";

            div.draggable = true;

            // DRAG START

            div.ondragstart = () => {

                state.dragCard = {
                    card: card,
                    group: g,
                    index: index
                };

            };

            // NEW: DROP ON CARD

            div.ondragover = (e) => {
                e.preventDefault();
            };

            div.ondrop = (e) => {

                e.preventDefault();

                if(!state.dragCard){
                    return;
                }

                const sourceGroup =
                    state.dragCard.group;

                const sourceIndex =
                    state.dragCard.index;

                const cardToMove =
                    state.dragCard.card;

                // same exact card
                if(
                    sourceGroup === g &&
                    sourceIndex === index
                ){
                    return;
                }

                // remove from source

                state.groups[sourceGroup]
                    .splice(sourceIndex, 1);

                let targetIndex = index;

                // same group adjustment

                if(
                    sourceGroup === g &&
                    sourceIndex < index
                ){
                    targetIndex--;
                }

                // insert BEFORE target card

                state.groups[g]
                    .splice(
                        targetIndex,
                        0,
                        cardToMove
                    );

                state.dragCard = null;

                renderHand();
                calculateDealScore();
            };

            // DISPLAY

            // DISPLAY

            if (isJokerCard(card)) {

                if (card === "JOKER") {

                    // Printed joker
                    div.innerHTML = `
                        <span class="printed-joker-text">
                            JOKER
                        </span>
                    `;

                } else {

                    // Deal joker
                    const suit = card.slice(-1);
                    const rank = card.slice(0, -1);

                    div.innerHTML = `
                        <span class="card-rank">
                            ${rank}
                        </span>

                        <span class="card-suit">
                            ${suit}
                        </span>

                        <span class="deal-joker-star">
                            ★
                        </span>
                    `;
                }

                div.classList.add("joker-highlight");

            } else {

                const suit = card.slice(-1);
                const rank = card.slice(0, -1);

                div.innerHTML = `
                    <span class="card-rank">
                        ${rank}
                    </span>

                    <span class="card-suit">
                        ${suit}
                    </span>
                `;
            }

            if (
                card.includes("♥") ||
                card.includes("♦")
            ){
                div.classList.add(
                    "red-card"
                );
            }

            // NEWLY PICKED CARD HIGHLIGHT
            if (
                state.pickedCard &&
                state.pickedCard.group === g &&
                state.pickedCard.index === index
            ) {
                div.classList.add("picked-card");
            }


            // SELECTED CARD

            // ==========================================
            // MULTI CARD SELECTION
            // ==========================================

            if (
                state.selectedCards &&
                state.selectedCards.some(
                    s =>
                        s.group === g &&
                        s.index === index
                )
            ) {
                div.classList.add("selected");
            }


            // ==========================================
            // CLICK
            // ==========================================

            div.onclick = () => {

                if (state.isDropped) {
                    return;
                }

                // Remove newly picked highlight
                state.pickedCard = null;

                if (!state.selectedCards) {
                    state.selectedCards = [];
                }

                // Check whether this card is already selected
                const selectedIndex =
                    state.selectedCards.findIndex(
                        s =>
                            s.group === g &&
                            s.index === index
                    );


                // ==========================================
                // ALREADY SELECTED → DESELECT
                // ==========================================

                if (selectedIndex !== -1) {

                    state.selectedCards.splice(
                        selectedIndex,
                        1
                    );

                }

                // ==========================================
                // NOT SELECTED → SELECT
                // ==========================================

                else {

                    state.selectedCards.push({

                        card: card,
                        group: g,
                        index: index

                    });

                }


                renderHand();
                calculateDealScore();
            };



            // All G1-G6 use identical card spacing.

groupEl.appendChild(div);

            setTimeout(() => {

                div.classList.remove(
                    "card-enter"
                );

                div.classList.add(
                    "card-show"
                );

            }, 30 * index);

        });

    }

   updateGroupButton();

}

function hideBaseTableHand() {

    for (let g = 0; g < 6; g++) {

        const groupEl =
            document.getElementById(
                "group" + g
            );

        if (groupEl) {
            groupEl.style.visibility =
                "hidden";
        }
    }
}

function showBaseTableHand() {

    for (let g = 0; g < 6; g++) {

        const groupEl =
            document.getElementById(
                "group" + g
            );

        if (groupEl) {
            groupEl.style.visibility =
                "visible";
        }
    }
}



function startObservationTimer()
{
    // --------------------------------------------------
    // Stop any previous observation timer
    // --------------------------------------------------

    if (state.observationTimerInterval)
    {
        clearInterval(
            state.observationTimerInterval
        );

        state.observationTimerInterval = null;
    }


    // --------------------------------------------------
    // No observation end time
    // --------------------------------------------------

    if (!state.observationEndAt)
    {
        return;
    }


    function updateObservationTimer()
    {
        if (!state.observationEndAt)
        {
            return;
        }


        const endTime =
            new Date(
                state.observationEndAt
            ).getTime();


        const seconds =
            Math.max(
                0,
                Math.ceil(
                    (endTime - Date.now()) / 1000
                )
            );


        document.getElementById(
            "observationTimer"
        ).innerText =
            "Observation (" +
            seconds +
            "s)";


        // --------------------------------------------------
        // OBSERVATION FINISHED
        // --------------------------------------------------

        if (seconds <= 0)
        {
            if (state.observationTimerInterval)
            {
                clearInterval(
                    state.observationTimerInterval
                );

                state.observationTimerInterval =
                    null;
            }


            onObservationTimerExpired();

            return;
        }
    }


    // --------------------------------------------------
    // IMPORTANT:
    // Check whether already expired BEFORE creating
    // another interval.
    // --------------------------------------------------

    const endTime =
        new Date(
            state.observationEndAt
        ).getTime();


    if (Date.now() >= endTime)
    {
        updateObservationTimer();

        return; // CRITICAL
    }


    // --------------------------------------------------
    // First display update
    // --------------------------------------------------

    updateObservationTimer();


    // --------------------------------------------------
    // Start timer only when observation is still active
    // --------------------------------------------------

    state.observationTimerInterval =
        setInterval(
            updateObservationTimer,
            250
        );
}


async function onObservationTimerExpired()
{
    

    document.getElementById(
        "dealResultModal"
    ).style.display = "none";

    clearCurrentDealUI();


    // --------------------------------------------------
    // Reload session first.
    // Check whether this was the final deal.
    // --------------------------------------------------

    const { data, error } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select("*")
            .eq(
                "session_id",
                state.sessionId
            )
            .single();


    if (error) {

        console.error(
            "Final completion check failed:",
            error
        );

        return;
    }


    // --------------------------------------------------
    // GAME COMPLETED
    // --------------------------------------------------

    if (data.game_completed === true) {

        handleTableCompleted(data);

        return;
    }


    // --------------------------------------------------
    // NORMAL GAME → START NEXT DEAL
    // --------------------------------------------------

    await startNextDeal();
}


function resetSettlementControls() {

    const acceptBtn =
        document.getElementById(
            "btnSettlementAccept"
        );

    const cancelBtn =
        document.getElementById(
            "btnSettlementCancel"
        );

    const statusEl =
        document.getElementById(
            "settlementStatus"
        );

    const popup =
        document.getElementById(
            "settlementPopup"
        );

    if (acceptBtn) {
        acceptBtn.disabled = false;
    }

    if (cancelBtn) {
        cancelBtn.disabled = false;
    }

    if (statusEl) {
        statusEl.innerText = "";
    }

    if (popup) {
        popup.style.display = "none";
    }

    state.settlementOpened = false;
    state.settlementId = null;
}

async function startNextDeal()
{

    if (state.tableCompleted)
    {
        return;
    }

    closeSettlementPopup();


    // ==================================================
    // ELIMINATED PLAYER
    // ==================================================

    if (state.playerStatus === "ELIMINATED")
    {
        state.ignoreResultWindow = true;
        state.resultWindowOpened = false;
        state.resultWindowLoaded = false;

        clearInterval(
            state.observationTimerInterval
        );

        document.getElementById(
            "dealResultModal"
        ).style.display = "none";


        setTimeout(async () =>
        {
            try
            {
                await loadGame();
                //await loadSessionInfo();
                await loadPlayers();

                state.ignoreResultWindow = false;
            }
            catch (error)
            {
                console.error(
                    "Eliminated-player refresh failed:",
                    error
                );
            }

        }, 2500);

        return;
    }


    // ==================================================
    // RESET LOCAL RESULT WINDOW
    // ==================================================

    state.ignoreResultWindow = true;

    state.resultWindowOpened = false;
    state.resultWindowLoaded = false;

    state.isDropped = false;
    state.dropType = "";

    state.declarationTimerStarted = false;


    clearInterval(
        state.observationTimerInterval
    );


    document.getElementById(
        "dealResultsContainer"
    ).innerHTML = "";


    document.getElementById(
        "resultJokerCard"
    ).innerHTML = "";


    document.getElementById(
        "dealResultModal"
    ).style.display = "none";


    // ==================================================
    // Identify current dealer BEFORE seat rebuild
    // ==================================================

    const isCurrentDealer =
        Number(state.seatNo) ===
        Number(state.dealerSeat);


    // ==================================================
    // ONLY CURRENT DEALER STARTS NEXT DEAL
    // ==================================================

    if (isCurrentDealer)
    {
        try
        {
            // ------------------------------------------
            // 1. CHECK REJOIN QUEUE
            // ------------------------------------------

            const {
                data: queueData,
                error: queueError
            } =
            await supabaseClient
                .from(
                    "crdg_rejoin_queue"
                )
                .select(
                    "user_id"
                )
                .eq(
                    "session_id",
                    state.sessionId
                );


            if (queueError)
            {
                console.error(
                    "Failed to read rejoin queue:",
                    queueError
                );

                state.ignoreResultWindow = false;
                return;
            }


            const rejoinCount =
                Array.isArray(queueData)
                    ? queueData.length
                    : 0;


            // ------------------------------------------
            // 2. SAVE COMPLETED DEAL HISTORY
            // ------------------------------------------

            const {
                data: historyData,
                error: historyError
            } =
            await supabaseClient.rpc(
                "crdg_save_deal_history",
                {
                    p_session_id:
                        state.sessionId,

                    p_deal_no:
                        state.deal_no
                }
            );


            if (historyError)
            {
                console.error(
                    "crdg_save_deal_history ERROR:",
                    historyError
                );

                state.ignoreResultWindow = false;
                return;
            }


            // ------------------------------------------
            // 3. REBUILD SEATING IF REJOIN EXISTS
            // ------------------------------------------

            if (rejoinCount > 0)
            {
                const {
                    data: rebuildData,
                    error: rebuildError
                } =
                await supabaseClient.rpc(
                    "crdg_rebuild_turn_order",
                    {
                        p_session_id:
                            state.sessionId
                    }
                );


                if (rebuildError)
                {
                    console.error(
                        "crdg_rebuild_turn_order failed:",
                        rebuildError
                    );

                    state.ignoreResultWindow = false;
                    return;
                }
            }


            // ==========================================
            // 4. PREPARE + DEAL IN ONE DB TRANSACTION
            // ==========================================

            const {
                data: nextDealData,
                error: nextDealError
            } =
            await supabaseClient.rpc(
                "crdg_begin_next_deal",
                {
                    p_session_id:
                        state.sessionId,

                    p_skip_dealer_rotation:
                        rejoinCount > 0
                }
            );


            if (nextDealError)
            {
                console.error(
                    "crdg_begin_next_deal failed:",
                    nextDealError
                );

                state.ignoreResultWindow = false;
                return;
            }
        }
        catch (error)
        {
            console.error(
                "startNextDeal unexpected error:",
                error
            );

            state.ignoreResultWindow = false;
            return;
        }
    }


    // ==================================================
    // ALL ACTIVE PLAYERS LOAD NEW DEAL
    // ==================================================

    setTimeout(async () =>
    {
        try
        {
            // ------------------------------------------
            // IMPORTANT:
            // Fresh DB hand must be loaded first.
            // ------------------------------------------

            await loadGame();


            // ------------------------------------------
            // New joker/open/turn/dealer
            // ------------------------------------------

            await loadSessionInfo();


            // ------------------------------------------
            // Seat/player information
            // ------------------------------------------

            await loadPlayers();


            // ------------------------------------------
            // Render freshly loaded 13 cards
            // ------------------------------------------

            renderHand();


            state.ignoreResultWindow =
                false;
        }
        catch (error)
        {
            console.error(
                "New-deal refresh failed:",
                error
            );

            state.ignoreResultWindow =
                false;
        }

    }, 2500);
}


async function loadDealHistory() {

    const tableHead =
        document.getElementById("historyTableHead");

    const tableBody =
        document.getElementById("historyTableBody");

    tableHead.innerHTML = "";

    tableBody.innerHTML = `
        <tr>
            <td colspan="20" class="history-loading">
                Loading history...
            </td>
        </tr>
    `;

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "crdg_get_deal_history",
        {
            p_session_id: state.sessionId
        }
    );

    if (error) {

        console.error(
            "crdg_get_deal_history ERROR:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="20" class="history-error">
                    Unable to load history
                </td>
            </tr>
        `;

        return;
    }


    renderDealHistory(
        Array.isArray(data) ? data : []
    );
}
function renderDealHistory(historyRows) {

    const tableHead =
        document.getElementById("historyTableHead");

    const tableBody =
        document.getElementById("historyTableBody");

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";

    if (!historyRows.length) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="20" class="history-no-data">
                    No completed deal history available
                </td>
            </tr>
        `;

        return;
    }


    // --------------------------------------------------
    // 1. Build unique player list
    // --------------------------------------------------

    const playerMap = new Map();

    historyRows.forEach(row => {

        if (!playerMap.has(row.user_id)) {

            playerMap.set(
                row.user_id,
                {
                    userId: row.user_id,
                    displayName:
                        row.display_name || "Player",

                    displayOrder:
                        Number(row.display_order) || 999
                }
            );
        }
    });

    const players =
        Array.from(playerMap.values())
            .sort(
                (a, b) =>
                    a.displayOrder - b.displayOrder
            );


    // --------------------------------------------------
    // 2. Find all completed deal numbers
    // --------------------------------------------------

    const dealNumbers =
        [
            ...new Set(
                historyRows.map(
                    row => Number(row.deal_no)
                )
            )
        ]
        .filter(Number.isFinite)
        .sort((a, b) => a - b);


    // --------------------------------------------------
    // 3. Build fast lookup:
    // deal_no → user_id → history row
    // --------------------------------------------------

    const dealMap = new Map();

    historyRows.forEach(row => {

        const dealNo =
            Number(row.deal_no);

        if (!dealMap.has(dealNo)) {
            dealMap.set(
                dealNo,
                new Map()
            );
        }

        dealMap
            .get(dealNo)
            .set(
                row.user_id,
                row
            );
    });


    // --------------------------------------------------
    // 4. Create table header
    // --------------------------------------------------

    const headerRow =
        document.createElement("tr");

    const dealHeader =
        document.createElement("th");

    dealHeader.textContent = "Deal";

    headerRow.appendChild(
        dealHeader
    );

    players.forEach(player => {

        const th =
            document.createElement("th");

        th.textContent =
            player.displayName;

        headerRow.appendChild(th);
    });

    tableHead.appendChild(
        headerRow
    );


    // --------------------------------------------------
    // 5. Create deal rows
    // --------------------------------------------------

    dealNumbers.forEach(dealNo => {

        const tr =
            document.createElement("tr");

        const dealCell =
            document.createElement("td");

        dealCell.textContent =
            dealNo;

        tr.appendChild(
            dealCell
        );

        players.forEach(player => {

            const td =
                document.createElement("td");

            const row =
                dealMap
                    .get(dealNo)
                    ?.get(player.userId);

            if (!row) {

                td.textContent = "--";

                td.classList.add(
                    "history-empty-cell"
                );

            } else {

                const score =
                    row.deal_score;

                if (
                    score === null ||
                    score === undefined
                ) {

                    td.textContent = "--";

                    td.classList.add(
                        "history-empty-cell"
                    );

                } else {

                    if (row.is_rejoined) {

                        const symbol =
                            document.createElement("span");

                        symbol.className =
                            "history-rejoin-symbol";

                        symbol.textContent =
                            `↺${row.rejoin_count}`;

                        td.appendChild(symbol);

                        td.appendChild(
                            document.createTextNode(
                                String(score)
                            )
                        );

                        td.classList.add(
                            "history-rejoined-cell"
                        );

                    } else {

                        td.textContent =
                            String(score);
                    }
                }
            }

            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });


    // --------------------------------------------------
    // 6. Add Total row
    // --------------------------------------------------

    const totalRow =
        document.createElement("tr");

    totalRow.className =
        "history-total-row";

    const totalLabel =
        document.createElement("td");

    totalLabel.textContent =
        "Total";

    totalRow.appendChild(
        totalLabel
    );

    players.forEach(player => {

        const td =
            document.createElement("td");

        const playerRows =
            historyRows
                .filter(
                    row =>
                        row.user_id ===
                        player.userId
                )
                .sort(
                    (a, b) =>
                        Number(a.deal_no) -
                        Number(b.deal_no)
                );

        const latestRow =
            playerRows.length
                ? playerRows[playerRows.length - 1]
                : null;

        if (!latestRow) {

            td.textContent = "--";

        } else {

            td.textContent =
                String(
                    latestRow.total_score ?? 0
                );
        }

        totalRow.appendChild(td);
    });

    tableBody.appendChild(
        totalRow
    );
}


function openHistoryPopup() {

    const popup =
        document.getElementById(
            "historyPopup"
        );

    popup.classList.remove(
        "hidden"
    );

    loadDealHistory();
}


function closeHistoryPopup() {

    const popup =
        document.getElementById(
            "historyPopup"
        );

    popup.classList.add(
        "hidden"
    );
}

// =========================
// DRAW
// =========================
async function draw(source, targetGroup = 5) {

  if (!state.sessionId) return;
  if(state.declarationMode){

    return;
   }

   

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("Please wait. It is another player's turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 13) {
        alert("You have already picked a card. Please discard or declare.");
        return;
    }

    // existing draw code...


  const { data, error } = await supabaseClient.rpc("crdg_draw_card", {
    p_session_id: state.sessionId,
    p_table_id: state.tableId,
    p_user_id: state.userId,
    p_source: source
  });

  if (error) {
    console.error(error);
    return;
  }

        if(
            data &&
            data.length > 0 &&
            data[0].status === "cannot_pick_joker"
        )
        {
            alert(
                "Cannot pick discarded Joker / Wild Joker"
            );

            return;
        }

  const card = data?.[0]?.card;

  if (card) {

        pickupSound.currentTime = 0;
        pickupSound.play().catch(() => {});

            ensureSixGroups();

        // Destination:
        // G1-G6 when dragged to a group.
        // G6 when using normal click.
        const destinationGroup =
            Number.isInteger(targetGroup) &&
            targetGroup >= 0 &&
            targetGroup <= 5
                ? targetGroup
                : 5;

        state.groups[destinationGroup].push(card);

        state.pickedCard = {
            card: card,
            group: destinationGroup,
            index: state.groups[destinationGroup].length - 1
        };

    //await loadSessionInfo();
    renderHand();
    calculateDealScore();

    updateActionButtons();
}
}


async function dropCurrentDeal()
{


    

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("You can drop only during your turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 13) {
        alert("You cannot drop after picking a card. Please discard or declare.");
        return;
    }

    // existing drop code...

    
    const msg = "Are you sure you want to DROP?";
    if (!confirm(msg))
    {
        return;
    }

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_drop_player",
            {
                p_session_id: state.sessionId,
                p_user_id: state.userId
            }
        );

    if(error)
    {
        console.error(error);
        return;
    }

    await loadSessionInfo();
    await loadPlayers();

    state.isDropped = true;
    state.dropType = data[0].drop_type;

    renderHand();
}

// ==========================================================
// SINGLE-CARD ACTION SELECTION
// Multi-select remains in state.selectedCards.
// Discard / Declare use this helper and require exactly 1.
// ==========================================================
function getSingleSelectedCard() {
    if (!Array.isArray(state.selectedCards)) {
        return null;
    }

    if (state.selectedCards.length !== 1) {
        return null;
    }

    return state.selectedCards[0];
}

function clearCardSelection() {
    state.selectedCards = [];
    state.selectedCard = null;
}

// =========================
// DISCARD
// =========================
async function discard() {
     

    if (!state.sessionId) return;
    if(state.declarationMode){
     return;
    }

   

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("Please wait. It is another player's turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 14) {
        alert("Please pick a card before discarding.");
        return;
    }

    const singleSelectedCard = getSingleSelectedCard();

    if (!singleSelectedCard) {
        if (state.selectedCards && state.selectedCards.length > 1) {
            alert("Please select only one card to discard.");
        } else {
            alert("Please select a card to discard.");
        }
        return;
    }

    // existing discard code...

    const totalCards =
        state.groups.reduce(
            (a, g) => a + g.length,
            0
        );

    if (totalCards < 14) {

        alert("Pick a card first");
        return;
    }

    const cardToRemove = getSingleSelectedCard();

    if (!cardToRemove) {
        if (state.selectedCards && state.selectedCards.length > 1) {
            alert("Please select only one card to discard.");
        } else {
            alert("Please select a card to discard.");
        }
        return;
    }


    const { data, error } =
        await supabaseClient.rpc(
            "crdg_discard_card",
            {
                p_session_id: state.sessionId,
                p_table_id: state.tableId,
                p_user_id: state.userId,
                p_card: cardToRemove.card
            }
        );

    if (error) {

        console.error(error);
        return;
    }

    if (
        data &&
        data.length &&
        data[0].status === "success"
    ) 
    {

        discardSound.currentTime = 0;
        discardSound.play().catch(() => {});

        state.groups[
            cardToRemove.group
        ].splice(
            cardToRemove.index,
            1
        );


            // Stop the completed turn timer immediately
        clearInterval(state.turnTimerInterval);
        state.turnTimerInterval = null;

        document.getElementById(
            "turnTimer"
        ).innerText = "0";

        // Clear old card selection
        clearCardSelection();
        state.dragCard = null;


        // New turn is already returned by discard RPC
        state.currentTurnSeat =
            Number(data[0].next_turn_seat);

        state.turnEndAt =
            data[0].turn_end_at;

        // Start the new turn timer immediately
        clearInterval(
            state.turnTimerInterval
        );

        state.turnTimerInterval = null;

        startTurnTimer();

        updateActionButtons();

        renderHand();
        calculateDealScore();

       // await loadSessionInfo();
    }



}


let sessionRefreshPending = false;
let sessionRefreshTimer = null;

function subscribeRealtime() {

    if (!state.sessionId) {
        return;
    }

    supabaseClient
        .channel(
            "game-session-" +
            state.sessionId +
            "-" +
            state.userId
        )
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "crdg_game_sessions",
                filter:
                    "session_id=eq." +
                    state.sessionId
            },
            () => {

                // ------------------------------------------
                // Do NOT discard events.
                //
                // Every new event resets this timer.
                // We refresh only after the burst finishes.
                // ------------------------------------------

                if (sessionRefreshTimer) {
                    clearTimeout(
                        sessionRefreshTimer
                    );
                }

                sessionRefreshTimer =
                    setTimeout(
                        async () => {

                            // If another refresh is still running,
                            // try again shortly instead of losing event.
                            if (sessionRefreshPending) {

                                sessionRefreshTimer =
                                    setTimeout(
                                        () => {
                                            sessionRefreshTimer = null;

                                            // trigger fresh DB read
                                            loadSessionInfo()
                                                .then(() => {
                                                    updateActionButtons();
                                                })
                                                .catch(error => {
                                                    console.error(
                                                        "Realtime delayed refresh error:",
                                                        error
                                                    );
                                                });
                                        },
                                        200
                                    );

                                return;
                            }

                            sessionRefreshPending = true;
                            sessionRefreshTimer = null;

                            try {

                                await loadSessionInfo();

                                updateActionButtons();

                            }
                            catch (error) {

                                console.error(
                                    "Realtime session refresh error:",
                                    error
                                );

                            }
                            finally {

                                sessionRefreshPending = false;
                            }

                        },
                        350
                    );
            }
        )
        .subscribe((status, err) => {

            if (err) {
                console.error(
                    "Session realtime error:",
                    err
                );
            }
        });
}

async function handleTableCompleted(data)
{
    // Prevent duplicate execution
    if(state.tableCompleted)
    {
        return;
    }


    state.tableCompleted = true;

    // Stop timers
    clearInterval(
        state.turnTimerInterval
    );
    state.turnTimerInterval = null; //MAH

    clearInterval(
        state.observationTimerInterval
    );


    // Stop DB polling / realtime processing
   // stopGamePolling();


    // Disable buttons
    const btnDiscard =
        document.getElementById("btnDiscard");

    const btnDeclare =
        document.getElementById("btnDeclare");


    if(btnDiscard)
    {
        btnDiscard.disabled = true;
    }


    if(btnDeclare)
    {
        btnDeclare.disabled = true;
    }


    // Disable card selection / stock actions

    const openVisual =
        document.getElementById("openVisual");

    const stockCard =
        document.getElementById("stockCard");


    if(openVisual)
    {
        openVisual.style.pointerEvents = "none";
    }


    if(stockCard)
    {
        stockCard.style.pointerEvents = "none";
    }


    // Stop any active declaration/drop UI

    const dealResultModal =
        document.getElementById(
            "dealResultModal"
        );

    if(dealResultModal)
    {
        dealResultModal.style.display = "none";
    }

    await completeFriendsGamePayout();


    showTableCompletedScreen(data);


    // Future:
    // load final table result here
}


function goToHome()
{
    window.location.replace("index.html");
}

async function showTableCompletedScreen(data)
{
    const tbody =
        document.getElementById(
            "finalScoreBody"
        );

    if (!tbody) {
        return;
    }

    tbody.innerHTML = "";


    // ==================================================
    // SETTLEMENT COMPLETION
    // ==================================================

    if (
        data.completion_type ===
        "SETTLEMENT"
    )
    {
        const {
            data: settlementData,
            error: settlementError
        } =
        await supabaseClient.rpc(
            "crdg_get_settlement_final_result",
            {
                p_session_id:
                    state.sessionId
            }
        );


        if (settlementError)
        {
            console.error(
                "Settlement final result error:",
                settlementError
            );

            return;
        }


        if (
            settlementData &&
            settlementData.length > 0
        )
        {
            settlementData.forEach(
                player =>
                {
                    const tr =
                        document.createElement(
                            "tr"
                        );


                    tr.classList.add(
                        "winner-row"
                    );


                    tr.innerHTML =
                    `
                    <td>
                        🏆 ${player.display_name}
                    </td>

                    <td>
                        ${player.final_score}
                    </td>

                    <td>
                        WINNER - ${player.settlement_percentage}%
                    </td>
                    `;


                    tbody.appendChild(
                        tr
                    );
                }
            );
        }
        else
        {
            console.warn(
                "No settlement final result found"
            );
        }
    }


    // ==================================================
    // NORMAL TABLE COMPLETION
    // ==================================================

    else
    {
        const {
            data: resultData,
            error
        } =
        await supabaseClient.rpc(
            "crdg_get_table_final_result",
            {
                p_session_id:
                    state.sessionId
            }
        );


        if(error)
        {
            console.error(
                "Final result error:",
                error
            );

            return;
        }


        if (
            resultData &&
            resultData.length > 0
        )
        {
            resultData.forEach(
                player =>
                {
                    const tr =
                        document.createElement(
                            "tr"
                        );


                    if(player.is_winner)
                    {
                        tr.classList.add(
                            "winner-row"
                        );
                    }


                    tr.innerHTML =
                    `
                    <td>
                        ${
                            player.is_winner
                            ? "🏆 "
                            : ""
                        }

                        ${player.display_name}
                    </td>

                    <td>
                        ${player.final_score}
                    </td>

                    <td>
                        ${
                            player.is_winner
                            ? "WINNER"
                            : "PLAYER"
                        }
                    </td>
                    `;


                    tbody.appendChild(
                        tr
                    );
                }
            );
        }
        else
        {
            console.warn(
                "No normal final result found"
            );
        }
    }


    // ==================================================
    // CLOSE OTHER POPUPS / MODALS
    // ==================================================

    const settlementPopup =
        document.getElementById(
            "settlementPopup"
        );

    if (settlementPopup)
    {
        settlementPopup.style.display =
            "none";
    }


    const dealResultModal =
        document.getElementById(
            "dealResultModal"
        );

    if (dealResultModal)
    {
        dealResultModal.style.display =
            "none";
    }


    // ==================================================
    // SHOW TABLE COMPLETION SCREEN
    // ==================================================

    const screen =
        document.getElementById(
            "tableCompletedScreen"
        );


    if(screen)
    {
        screen.style.display =
            "flex";
    }
}

async function completeFriendsGamePayout()
{
    try
    {
        const sessionToken =
            localStorage.getItem(
                "crdgn_session_token"
            );


        if(!sessionToken)
        {
            console.error(
                "crdgn_session_token not found"
            );

            return;
        }


        console.log(
            "Starting Friends Rummy payout...",
            state.sessionId
        );


        const {
            data,
            error
        } =
        await supabaseClient.rpc(
            "crdgn_complete_friends_game",
            {
                p_session_token:
                    sessionToken,

                p_session_id:
                    state.sessionId
            }
        );


        if(error)
        {
            console.error(
                "Friends game payout error:",
                error
            );

            return;
        }


        console.log(
            "Friends game payout result:",
            data
        );


        if(
            data &&
            data.length > 0
        )
        {
            const result =
                data[0];


            if(result.success)
            {
                console.log(
                    "Payout completed:",
                    result.message
                );

                console.log(
                    "POT:",
                    result.total_pot
                );

                console.log(
                    "Paid players:",
                    result.paid_players
                );


                if(result.already_paid)
                {
                    console.log(
                        "Payout was already processed."
                    );
                }
            }
            else
            {
                console.warn(
                    "Payout was not completed:",
                    result.message
                );
            }
        }
    }
    catch(error)
    {
        console.error(
            "Unexpected payout error:",
            error
        );
    }
}


function getTableCardHTML(card) {

    if (!card || card === "-") {
        return "-";
    }

    // Printed joker
    if (card === "JOKER") {
        return `
            <span class="printed-joker-text">JOKER</span>
        `;
    }

    const suit = card.slice(-1);
    const rank = card.slice(0, -1);

    return `
        <span class="card-rank">${rank}</span>
        <span class="card-suit">${suit}</span>
    `;
}


async function loadSessionInfo() {

    if (state.tableCompleted) {
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select("*")
            .eq("session_id", state.sessionId)
            .single();

    if (error) {
        console.error(error);
        return;
    }

            // --------------------------------------------------
        // GAME COMPLETION
        //
        // Even when the game is completed, the final deal
        // must first pass through the observation window.
        //
        // Only show the table-completion window after the
        // observation period has finished.
        // --------------------------------------------------

        // --------------------------------------------------
        // GAME COMPLETION
        //
        // Final deal must show observation window first.
        // --------------------------------------------------

        if (data.game_completed) {

            // If deal results are ready, allow the normal
            // result/observation flow to continue.
            if (data.deal_results_ready === true) {

                console.log(
                    "GAME COMPLETED - WAITING FOR OBSERVATION FLOW"
                );

            }
            else {

                // No result window pending.
                // Safe to show final completion.
                handleTableCompleted(data);
                return;

            }
        }

    state.dealerSeat = Number(data.dealer_seat);
    state.currentTurnSeat = Number(data.current_turn_seat);
    state.deal_no = data.deal_no;
    state.declarationEndAt =  data.declaration_end_at;
    state.observationEndAt =  data.observation_end_at;


    if (
            data.last_event_type === "TURN_TIMEOUT" &&
            data.last_event_user_id === state.userId &&
            data.last_event_time &&
            state.lastHandledTimeoutEvent !== data.last_event_time
        ) {
            state.lastHandledTimeoutEvent =
                data.last_event_time;

            await loadGame();

            renderHand();

            updateActionButtons();
        }

    // Refresh my dynamic seat after rejoin/rebuild
    const { data: players, error: playersError } =
        await supabaseClient.rpc(
            "crdg_get_lobby_players",
            {
                p_table_id: state.tableId
            }
        );

    if (playersError) {
        console.error(playersError);
        return;
    }

    const me = players?.find(
        player =>
            Number(player.fixed_seat_no) ===
            Number(state.fixedSeatNo)
    );

    if (me) {
        state.seatNo = Number(me.seat_no);
    }

    await loadPlayers(players);


  state.turnStartedAt =    new Date(
        data.turn_started_at
    ).getTime();

    state.turnEndAt = data.turn_end_at;

 
    // Complete current open pile
    state.openPile =
        data.open_pile || [];

        
    const topOpenCard =
        data.open_pile?.slice(-1)[0];

    const openEl =
        document.getElementById("openVisual");

    openEl.innerHTML =
        getTableCardHTML(topOpenCard || "-");

    openEl.classList.remove("red-card");

    if (
        topOpenCard?.includes("♥") ||
        topOpenCard?.includes("♦")
    ) {
        openEl.classList.add("red-card");
    }


    // JOKER CARD

    const jokerCard =
        data.joker_card || "-";

    const jokerEl =
        document.getElementById("jokerVisual");

    jokerEl.innerHTML =
        getTableCardHTML(jokerCard);

    jokerEl.classList.remove("red-card");

    if (
        jokerCard?.includes("♥") ||
        jokerCard?.includes("♦")
    ) {
        jokerEl.classList.add("red-card");
    }

    state.jokerCard = data.joker_card;
    state.wildRank  = data.wild_rank;

    state.declarationMode =
    data.declaration_started || false;


     if(
          state.declarationMode &&
          !state.declarationTimerStarted
      ){

          clearInterval(
              state.turnTimerInterval
          );
          state.turnTimerInterval = null; //MAH

              
            const { data: declarationEndAt, error: dectmrerror } =
            await supabaseClient.rpc(
                "crdg_start_declaration_timer",
                {
                    p_session_id: state.sessionId,
                    p_user_id: state.userId
                }
            );

        if (dectmrerror) {
            console.error(
                "Declaration timer start error:",
                dectmrerror
            );
            return;
        }
        
        state.declarationEndAt = declarationEndAt;
        state.declarationTimerStarted =  true;

        if (
            state.declarationEndAt &&
            !state.declarationTimerInterval
        ) {
            startDeclarationTimer();
        }

      }


    document.getElementById("stockCard").innerText =
        data.stock_pile?.length || 0;
        
        if (
            state.playerStatus !== "ELIMINATED" &&
            data.deal_results_ready !== true &&
            !state.resultWindowOpened &&
            !state.declarationMode &&
            state.turnEndAt &&
            (
                state.lastTurnSeat !== data.current_turn_seat ||
                !state.turnTimerInterval
            )
        ) {
            state.lastTurnSeat =
                data.current_turn_seat;

            await syncTurnClock();

            startTurnTimer();
        }


        if (
            data.deal_results_ready === true &&
            !state.resultWindowOpened &&
            state.participatedInDeal === true &&
            !state.ignoreResultWindow
        )
        {
            clearInterval(state.turnTimerInterval);
            state.turnTimerInterval = null;

            document.getElementById(
                "turnTimer"
            ).innerText = "-";


            state.resultWindowOpened = true;

            hideBaseTableHand();

            resetSettlementControls();

            loadDealResults();

            await checkSettlementEligibility();

            const {
                data: observationEndAt,
                error: obstmrerror
            } =
            await supabaseClient.rpc(
                "crdg_start_observation_timer",
                {
                    p_session_id: state.sessionId
                }
            );

            if(obstmrerror){
                console.error(obstmrerror);
                return;
            }

            state.observationEndAt =
                observationEndAt;

            if(
                state.observationEndAt &&
                !state.observationTimerInterval
            ){
                startObservationTimer();
            }
        }

   updateActionButtons();
   
}

async function loadAcceptedSettlement()
{
    const { data, error } =
        await supabaseClient
            .from("crdg_settlement")
            .select(`
                player1_user_id,
                player2_user_id,
                player1_percentage,
                player2_percentage,
                player1_score,
                player2_score,
                status
            `)
            .eq(
                "session_id",
                state.sessionId
            )
            .eq(
                "status",
                "ACCEPTED"
            )
            .order(
                "settlement_id",
                {
                    ascending: false
                }
            )
            .limit(1)
            .maybeSingle();

    if (error)
    {
        console.error(
            "Settlement result error:",
            error
        );

        return null;
    }

    return data;
}

function startDeclarationTimer() {

    clearInterval(
        state.declarationTimerInterval
    );

    function updateDeclarationTimer() {

        if (!state.declarationEndAt) {
            document.getElementById(
                "declarationTimer"
            ).innerText = "";
            return;
        }

        const endTime =
            new Date(
                state.declarationEndAt
            ).getTime();

        const seconds =
            Math.max(
                0,
                Math.ceil(
                    (endTime - Date.now()) / 1000
                )
            );

        document.getElementById(
            "declarationTimer"
        ).innerText =
            "Declared..Arrange Cards (" +
            seconds +
            "s)";

        if (seconds <= 0) {

            clearInterval(
                state.declarationTimerInterval
            );

            state.declarationTimerInterval =
                null;

            document.getElementById(
                "declarationTimer"
            ).innerText = "";

            onDeclarationTimerExpired();
        }
    }

    updateDeclarationTimer();

    state.declarationTimerInterval =
        setInterval(
            updateDeclarationTimer,
            250
        );
}


function showOpenPileHistory(event)
{
    if (event) {
        event.stopPropagation();
    }

    const popup =
        document.getElementById(
            "openPilePopup"
        );

    const container =
        document.getElementById(
            "openPileHistoryCards"
        );

    if (!popup || !container) {
        return;
    }

    container.innerHTML = "";

    const cards =
        (state.openPile || []).slice(0, -1);


    if (cards.length === 0)
    {
        container.innerHTML =
            "<div>No discarded cards</div>";
    }
    else
    {
        cards.forEach(card =>
        {
            const cardDiv =
                document.createElement(
                    "div"
                );

            cardDiv.className =
                "open-history-card";

            cardDiv.innerText =
                card;

            container.appendChild(
                cardDiv
            );
        });
    }


    popup.style.display =
        "flex";
}


function closeOpenPileHistory()
{
    const popup =
        document.getElementById(
            "openPilePopup"
        );

    if (popup)
    {
        popup.style.display =
            "none";
    }
}

async function openSettlement() {

    if (!state.settlementEligible) {
        return;
    }

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_create_settlement_proposal",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {

        console.error(
            "Settlement proposal error:",
            error
        );

        alert(
            "Unable to create settlement proposal."
        );

        return;
    }

    const proposal = data?.[0];

    if (!proposal) {
        return;
    }

    state.settlementId =
        proposal.settlement_id;

    state.settlementOpened = true;

    document.getElementById(
            "settlementPlayers"
        ).innerHTML = `
            <div style="
                display:flex;
                justify-content:space-between;
                padding:10px;
                font-size:18px;
                border-bottom:1px solid #ddd;
            ">
                <b>${proposal.player1_name}</b>

                <span style="
                color:#000000;
                font-weight:bold;
            ">
                ${proposal.player1_percentage}%
            </span>
            </div>

            <div style="
                display:flex;
                justify-content:space-between;
                padding:10px;
                font-size:18px;
            ">
                <b>${proposal.player2_name}</b>

                <span style="
                color:#000000;
                font-weight:bold;
            ">
                ${proposal.player2_percentage}%
            </span>
            </div>
        `;

    document.getElementById(
        "settlementStatus"
    ).innerText = "";

    document.getElementById(
        "settlementPopup"
    ).style.display = "block";
}


function closeSettlementPopup() {

    const popup =
        document.getElementById(
            "settlementPopup"
        );

    if (popup) {
        popup.style.display = "none";
    }

    const status =
        document.getElementById(
            "settlementStatus"
        );

    if (status) {
        status.innerText = "";
    }

    state.settlementOpened = false;
    state.settlementId = null;
    state.settlementEligible = false;
}

async function onDeclarationTimerExpired(){

    hideBaseTableHand();

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_submit_final_groups",
            {
                p_session_id:
                    state.sessionId,

                p_table_id:
                    state.tableId,

                p_user_id:
                    state.userId,

                p_groups:
                    state.groups,

                p_joker_card:
                    state.jokerCard
            }
        );

    if(error){

        console.error(error);

        return;
    }
}

async function respondSettlement(response) {

    if (!state.sessionId || !state.userId) {
        return;
    }

    const acceptBtn =
        document.getElementById(
            "btnSettlementAccept"
        );

    const cancelBtn =
        document.getElementById(
            "btnSettlementCancel"
        );

    // Prevent double-clicks
    acceptBtn.disabled = true;
    cancelBtn.disabled = true;

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crdg_respond_settlement",
            {
                p_session_id:
                    state.sessionId,

                p_user_id:
                    state.userId,

                p_response:
                    response
            }
        );

        if (error) {

            console.error(
                "Settlement response error:",
                error
            );

            acceptBtn.disabled = false;
            cancelBtn.disabled = false;

            return;
        }

        const result =
            data?.[0];

        if (!result) {

            acceptBtn.disabled = false;
            cancelBtn.disabled = false;
            return;
        }


        // ------------------------------------------
        // CANCEL
        // ------------------------------------------

        if (
            result.status ===
            "CANCELLED"
        ) {

            document.getElementById(
                "settlementStatus"
            ).innerText =
                "Settlement cancelled";

            setTimeout(() => {

                document.getElementById(
                    "settlementPopup"
                ).style.display =
                    "none";

            }, 700);

            return;
        }


        // ------------------------------------------
        // BOTH ACCEPTED
        // ------------------------------------------

        if (
            result.status ===
            "ACCEPTED"
        ) {

            document.getElementById(
                "settlementStatus"
            ).innerText =
                "Settlement accepted";

            return;
        }


        // ------------------------------------------
        // ONE PLAYER ACCEPTED
        // ------------------------------------------

        if (
            result.status ===
            "PENDING"
        ) {

            document.getElementById(
                "settlementStatus"
            ).innerText =
                "Accepted — waiting for other player";

            // This player has already accepted.
            // Do not allow changing response.
            acceptBtn.disabled = true;
            cancelBtn.disabled = true;
        }

    }
    catch (error) {

        console.error(
            "Settlement unexpected error:",
            error
        );

        acceptBtn.disabled = false;
        cancelBtn.disabled = false;
    }
}

function getTotalCards(){

    let total = 0;

    for(let g = 0; g < 6; g++){

        if(state.groups[g]){

            total +=
                state.groups[g].length;
        }
    }

    return total;
}

function updateActionButtons() {

    const btnDiscard =
        document.getElementById("btnDiscard");

    const btnDeclare =
        document.getElementById("btnDeclare");

    const btnDrop =
        document.getElementById("dropBtn");

    const openPile =
        document.getElementById("openVisual");

    const stockPile = document.getElementById("stockCard");


    // --------------------------------------------------
    // Eliminate / dropped / declaration mode
    // --------------------------------------------------

    if (
        state.playerStatus === "ELIMINATED" ||
        state.isDropped ||
        state.declarationMode
    ) {

        if (btnDiscard) {
            btnDiscard.disabled = true;
        }

        if (btnDeclare) {
            btnDeclare.disabled = true;
        }

        if (btnDrop) {
            btnDrop.disabled = true;
        }

        if (openPile) {
            openPile.style.opacity = "0.4";
            openPile.style.pointerEvents = "none";
        }

        if (stockPile) {
            stockPile.style.opacity = "0.4";
            stockPile.style.pointerEvents = "none";
        }

        return;
    }


    // --------------------------------------------------
    // Current turn
    // --------------------------------------------------

    const myTurn =
        Number(state.seatNo) ===
        Number(state.currentTurnSeat);

    const cardCount =
        getTotalCards();

    const canDraw =
        myTurn &&
        cardCount === 13;

    const canDiscard =
        myTurn &&
        cardCount === 14;


    // --------------------------------------------------
    // Discard / Declare
    // --------------------------------------------------

    if (btnDiscard) {
        btnDiscard.disabled =
            !canDiscard;
    }

    if (btnDeclare) {
        btnDeclare.disabled =
            !canDiscard;
    }


    // --------------------------------------------------
    // Drop only before picking
    // --------------------------------------------------

    if (btnDrop) {
        btnDrop.disabled =
            !canDraw;
    }


    // --------------------------------------------------
    // Open / Stock only before picking
    // --------------------------------------------------

    if (openPile) {

        openPile.style.opacity =
            canDraw ? "1" : "0.4";

        openPile.style.pointerEvents =
            canDraw ? "auto" : "none";
    }

    if (stockPile) {

        stockPile.style.opacity =
            canDraw ? "1" : "0.4";

        stockPile.style.pointerEvents =
            canDraw ? "auto" : "none";
    }
}



  


// =========================
// LOAD STATE

async function loadGame() {

    if(state.tableCompleted)
{
    return;
}

  const { data, error } = await supabaseClient.rpc(
    "crdg_get_game_state",
    {
      p_session_id: state.sessionId,
      p_user_id: state.userId
    }
  );

  if (error) return console.error(error);

  if (!data) return;

  state.hand = data.hand || [];
  
  state.playerStatus = data.player_status;
  state.participatedInDeal =   data.participated_in_deal === true;

  if (state.playerStatus === "ELIMINATED" && !state.eliminatedRefreshStarted)
{
    state.eliminatedRefreshStarted = true;

    setInterval(async () => {

        await loadSessionInfo();
        await loadPlayers();

    }, 1000);
}

    if (
        state.playerStatus === "ELIMINATED" &&
        !state.eliminationScreenShown
    )
    {
        state.eliminationScreenShown = true;
        handleEliminatedPlayer();
    }

        // ==========================================
        // INITIAL HAND ORDER
        // G1-G4 = USER GROUPS
        // G5    = UNGROUPED CARDS
        // ==========================================

        const spades = [];
        const hearts = [];
        const diamonds = [];
        const clubs = [];
        const jokers = [];


        // ------------------------------------------
        // Separate cards by suit
        // ------------------------------------------

        state.hand.forEach(card => {

            if (card === "JOKER") {

                jokers.push(card);

            }
            else if (card.includes("♥")) {

                hearts.push(card);

            }
            else if (card.includes("♠")) {

                spades.push(card);

            }
            else if (card.includes("♦")) {

                diamonds.push(card);

            }
            else if (card.includes("♣")) {

                clubs.push(card);

            }

        });


        // ------------------------------------------
        // Sort each suit by rank
        // A,2,3,4,5,6,7,8,9,10,J,Q,K
        // ------------------------------------------

        hearts.sort(
            (a, b) => getRank(a) - getRank(b)
        );

        spades.sort(
            (a, b) => getRank(a) - getRank(b)
        );

        diamonds.sort(
            (a, b) => getRank(a) - getRank(b)
        );

        clubs.sort(
            (a, b) => getRank(a) - getRank(b)
        );


        // ------------------------------------------
        // Initial six-group layout
        // G1 = Hearts
        // G2 = Spades
        // G3 = Diamonds
        // G4 = Clubs
        // G5 = empty user-created group
        // G6 = printed Jokers / overflow
        // Deal jokers stay with their actual suit.
        // ------------------------------------------

        state.groups = [
            hearts,        // G1
            spades,        // G2
            diamonds,      // G3
            clubs,         // G4
            [],            // G5
            jokers         // G6
        ];


 //document.getElementById("openVisual").innerText = data.open_pile?.slice(-1)[0] || "-";

//document.getElementById("jokerVisual").innerText = data.joker_card || "-";

  //document.getElementById("stockCard").innerText = data.stock_pile?.length || 0;

    // Clear selection belonging to the old hand
clearCardSelection();
state.dragCard = null;

// Display the refreshed database hand
renderHand();

// Recalculate controls using the refreshed card count
updateActionButtons();

  
}

function getEstimatedTurnServerNow() {

    if (
        state.turnServerNowMs == null ||
        state.turnServerSyncPerfMs == null
    ) {
        return null;
    }

    return (
        state.turnServerNowMs +
        (
            performance.now() -
            state.turnServerSyncPerfMs
        )
    );
}

async function syncTurnClock() {

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_turn_clock",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {
        console.error(
            "crdg_get_turn_clock error:",
            error
        );
        return false;
    }

    if (!data || data.length === 0) {
        return false;
    }

    const row = data[0];

    state.currentTurnSeat =
        Number(row.current_turn_seat);

    state.turnEndAt =
        row.turn_end_at;

    state.turnServerNowMs =
        new Date(
            row.server_now
        ).getTime();

    state.turnServerSyncPerfMs =
        performance.now();

    return true;
}



function handleEliminatedPlayer()
{
    state.myTurn = false;

    clearInterval(state.turnTimerInterval);
    state.turnTimerInterval = null; //MAH

    document.getElementById("dropBtn").disabled = true;
    document.getElementById("btnDeclare").disabled = true;
    document.getElementById("btnDiscard").disabled = true;
}


function getRank(card){

    const rank =
        card.replace(/[♠♥♦♣]/g,'');

    switch(rank){
        case 'A': return 1;
        case 'J': return 11;
        case 'Q': return 12;
        case 'K': return 13;
        default: return parseInt(rank);
    }

}

// =========================
// JOIN TABLE (FIXED)
// =========================
// =========================
// JOIN TABLE
// =========================
async function joinTable() {

    // =================================================
    // Get values
    //
    // New Friends flow:
    // values come from localStorage
    //
    // Old/manual flow:
    // values come from the existing HTML inputs
    // =================================================

    let tableId =
        localStorage.getItem("crdg_table");

    let nickname =
        localStorage.getItem("crdg_nickname");


    // -----------------------------------------------
    // If not coming from tablepage.html,
    // use existing Join screen fields
    // -----------------------------------------------

    if (!tableId) {

        tableId =
            document.getElementById("tableIdInput").value;
    }

    if (!nickname) {

        nickname =
            document.getElementById("nickname").value;
    }


    tableId =
        parseInt(tableId);

    nickname =
        (nickname || "").trim();


    // -----------------------------------------------
    // Existing static password
    // -----------------------------------------------

    const password = "5E2D";


    // -----------------------------------------------
    // Existing UUID identity
    // -----------------------------------------------

    // -----------------------------------------------
// REGISTERED ACCOUNT → FRIENDS GAME USER ID
// -----------------------------------------------

        const sessionToken =
            localStorage.getItem("crdgn_session_token");

        if (!sessionToken) {

            alert(
                "Please login before joining a Friends game."
            );

            return;
        }


        // Get / create the permanent Friends game-user mapping
        const {
            data: mappingData,
            error: mappingError
        } = await supabaseClient.rpc(
            "crdgn_get_or_create_game_user_id",
            {
                p_session_token: sessionToken,
                p_game_type: "FRIENDS"
            }
        );


        const mappingResult =
            Array.isArray(mappingData)
                ? mappingData[0]
                : mappingData;


        // Mapping error
        if (mappingError) {

            console.error(
                "Friends account mapping error:",
                mappingError
            );

            alert(
                mappingError.message ||
                "Unable to prepare your Friends game account."
            );

            return;
        }


        // Mapping result validation
        if (
            !mappingResult ||
            mappingResult.success !== true ||
            !mappingResult.game_user_id
        ) {

            console.error(
                "Invalid Friends account mapping result:",
                mappingResult
            );

            alert(
                mappingResult?.message ||
                "Unable to prepare your Friends game account."
            );

            return;
        }


        // This is the EXISTING crdg game UUID.
        // Do NOT use the registered user_id here.
        const userId =
            mappingResult.game_user_id;


        console.log(
            "FRIENDS ACCOUNT MAPPING:",
            {
                registered_user_id:
                    mappingResult.user_id,

                game_user_id:
                    mappingResult.game_user_id,

                game_type:
                    mappingResult.game_type
            }
        );


    // -----------------------------------------------
    // Basic validation
    // -----------------------------------------------

    if (
        !tableId ||
        tableId < 100000 ||
        tableId > 999999
    ) {

        alert("Invalid Table ID");
        return;
    }


    if (!nickname) {

        alert("Please enter player name");
        return;
    }


    // =================================================
    // JOIN RPC
    // =================================================

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_join_table",
            {
                p_table_id: tableId,
                p_password: password,
                p_user_id: userId,
                p_display_name: nickname
            }
        );


    const joinResult =
        data?.[0];


    // -----------------------------------------------
    // RPC error
    // -----------------------------------------------

    if (error) {

        console.error(
            "Join error:",
            error
        );

        alert(
            error.message ||
            "Join failed"
        );

        return;
    }


    if (!joinResult) {

        alert("Join failed");
        return;
    }


    // -----------------------------------------------
    // Check result
    // -----------------------------------------------

    if (
        joinResult.status !== "success" &&
        joinResult.status !== "reconnected"
    ) {

        alert(
            joinResult.message ||
            "Unable to join table"
        );

        return;
    }


    // =================================================
    // SAVE STATE
    // =================================================

    state.userId =
        joinResult.user_id;

    state.tableId =
        tableId;

    state.nickname =
        nickname;

    state.seatNo =
        Number(joinResult.seat_no);

    state.fixedSeatNo =
        Number(joinResult.fixed_seat_no);


    localStorage.setItem(
        "crdg_user_id",
        state.userId
    );

    localStorage.setItem(
        "crdg_table",
        tableId
    );

    localStorage.setItem(
        "crdg_nickname",
        nickname
    );


    // =================================================
    // RECONNECT
    // =================================================

    const isReconnect =
        joinResult.status === "reconnected";


    if (
        isReconnect &&
        joinResult.session_id
    ) {

        state.sessionId =
            Number(joinResult.session_id);

        state.joined = true;


        document
            .getElementById("joinScreen")
            .style.display = "none";


        document
            .getElementById("lobbyScreen")
            .style.display = "none";


        document
            .getElementById("app")
            .style.display = "block";


        await loadGame();
        await loadSessionInfo();
        await loadPlayers();

        return;
    }


    // =================================================
    // NORMAL LOBBY
    // =================================================

    state.joined = true;


    document
        .getElementById("joinScreen")
        .classList.add("hidden");


    document
        .getElementById("lobbyScreen")
        .classList.remove("hidden");


    document
        .getElementById("lobbyTableId")
        .innerText = tableId;


    document
        .getElementById("lobbySeat")
        .innerText =
            state.seatNo;


    // -----------------------------------------------
    // Existing lobby flow
    // -----------------------------------------------

    await postJoinFlow();

    loadLobbyState();


    clearInterval(
        state.lobbyTimerHandle
    );


    state.lobbyTimerHandle =
        setInterval(
            loadLobbyState,
            1000
        );
}

function startTurnTimer() {
 
    if (
        state.tableCompleted ||
        state.resultWindowOpened ||
        state.declarationMode
    ) {
        clearInterval(state.turnTimerInterval);
        state.turnTimerInterval = null;

        document.getElementById(
            "turnTimer"
        ).innerText = "-";

        return;
    }

    clearInterval(
        state.turnTimerInterval
    );
    state.turnTimerInterval = null; //MAH

    function updateTurnTimer() {

        if (!state.turnEndAt) {
            return;
        }

        const serverNow =
            getEstimatedTurnServerNow();

        if (serverNow == null) {
            return;
        }

        const endTime =
            new Date(
                state.turnEndAt
            ).getTime();

        const remaining =
            Math.max(
                0,
                Math.ceil(
                    (
                        endTime -
                        serverNow
                    ) / 1000
                )
            );

        document.getElementById(
            "turnTimer"
        ).innerText =
            remaining;

        if (remaining <= 0) {

            clearInterval(
                state.turnTimerInterval
            );

            state.turnTimerInterval = null;

            processTurnTimeout();

            return;
        }
    }

    updateTurnTimer();

    state.turnTimerInterval =
        setInterval(
            updateTurnTimer,
            250
        );
}


async function refreshTurnAfterTimeout() {

    const { data, error } =
        await supabaseClient
            .from("crdg_game_sessions")
            .select(
                "current_turn_seat, turn_started_at, turn_end_at"
            )
            .eq(
                "session_id",
                state.sessionId
            )
            .single();

    if (error) {

        console.error(
            "refreshTurnAfterTimeout error:",
            error
        );

        return;
    }

    // Authoritative DB values
    state.currentTurnSeat =
        Number(data.current_turn_seat);

    state.turnStartedAt =
        data.turn_started_at
            ? new Date(
                data.turn_started_at
              ).getTime()
            : null;

    state.turnEndAt =
        data.turn_end_at;

    // Stop whatever old timer is still present
    clearInterval(
        state.turnTimerInterval
    );

    state.turnTimerInterval = null;

    // Enable/disable controls for new turn
    updateActionButtons();
}

async function processTurnTimeout() {

    if (!state.sessionId) {
        return;
    }

    if (!state.turnEndAt) {
        return;
    }

    // Already requested processing for this exact turn
    if (
        state.lastProcessedTurnEndAt ===
        state.turnEndAt
    ) {
        return;
    }

    // Mark BEFORE RPC to prevent duplicate calls
    state.lastProcessedTurnEndAt =
        state.turnEndAt;

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crdg_process_turn_timeout",
            {
                p_session_id: state.sessionId
            }
        );

        if (error) {

            console.error(
                "Turn timeout RPC error:",
                error
            );

            // Allow retry if RPC genuinely failed
            state.lastProcessedTurnEndAt = null;

            return;
        }

        /*
        IMPORTANT:

        DO NOT:
        - change currentTurnSeat here
        - call loadGame()
        - call loadSessionInfo()
        - call updateActionButtons()
        - remove cards locally

        The SP updates the DB.
        Realtime handles everything normally.
        */

       await refreshTurnAfterTimeout();

    }
    catch (error) {

        console.error(
            "Turn timeout unexpected error:",
            error
        );

        state.lastProcessedTurnEndAt = null;
    }
}

async function loadPlayers(playersData = null) {

    let dlr_name = "YOU";

    let data = playersData;

    if (!data) {

        const { data: rpcData, error } =
            await supabaseClient.rpc(
                "crdg_get_lobby_players",
                {
                    p_table_id: state.tableId
                }
            );

        if (error) {
            console.error(error);
            return;
        }

        data = rpcData;
    }

    if (!data) return;

            // =================================================
        // UPDATE TOP BAR POT
        // Friends Rummy entry fee = 80 per player
        // =================================================

        const potAmount =
            (Array.isArray(data) ? data.length : 0) * 80;

        const potEl =
            document.getElementById("topPot");

        if (potEl) {
            potEl.innerText = potAmount;
        }


        const playerCountEl =
            document.getElementById("topPlayerCount");

        if (playerCountEl) {
            playerCountEl.innerText = data.length;
        }





    for (let i = 1; i <= 5; i++) {

        document.getElementById(
            "opp" + i
        ).innerHTML = `
            <div>Empty</div>
        `;
    }

    state.myScore = 0;

    data.forEach(player => {

        if (
            Number(player.fixed_seat_no) === Number(state.fixedSeatNo)
        ) {
            state.myScore = player.points || 0;
            return;
        }

        let relative =
            Number(player.fixed_seat_no) -
            Number(state.fixedSeatNo);

        if (relative < 0) {
            relative += 6;
        }

        let target = null;

        switch (relative) {

            case 1:
                target = "opp4";
                break;

            case 2:
                target = "opp2";
                break;

            case 3:
                target = "opp1";
                break;

            case 4:
                target = "opp3";
                break;

            case 5:
                target = "opp5";
                break;
        }

        if (!target) return;

        let icons = "";
        
        

        if (
            Number(player.seat_no) ===
            Number(state.dealerSeat)
        ) {
            icons += " 🎲";
            dlr_name = player.display_name;
        }

        // Show rejoin icon
        if (Number(player.rejoin_count) > 0) {
            icons += ` ↺${player.rejoin_count}`;
        }

        let cardsDisplay = `
        <div style="font-size:24px;">
            🂠🂠🂠🂠🂠
        </div>
        `;

        if(player.is_out_of_deal)
        {
            
            let txt = "";

            switch(player.drop_type)
            {
                case "DROP":
                    txt = "❌ DROP";
                    break;

                case "MID_DROP":
                    txt = "⛔ MID DROP";
                    break;

                case "INVALID_DECLARE":
                    txt = "🚫 INVALID";
                    break;

                default:
                    txt = "wait";
            }

            cardsDisplay = `
            <div
                style="
                    color:#d32f2f;
                    font-weight:bold;
                    font-size:18px;
                    margin-top:8px;
                ">
                ${txt}
            </div>
            `;
        }

        
        let statusHtml = "";

        if(player.player_status === "ELIMINATED")
        {
            statusHtml = `
            <div style="
                color:red;
                font-weight:bold;
                margin-top:4px;
            ">
                ELIMINATED
            </div>
            `;
        }

        document.getElementById(target).innerHTML = `
        <div>
            <b>${player.display_name}${icons}</b>
        </div>

        ${cardsDisplay}

        <div>
            Score : ${player.points || 0}
        </div>
        ${statusHtml}
        `;
    });
   
    let myIcons = "";

    if (
        Number(state.seatNo) ===
        Number(state.dealerSeat)
    ) {
        myIcons += " 🎲";
    }

    document.getElementById(
        "myInfo"
    ).innerHTML =
        `You ${myIcons}`;


        let myScoreHtml =
            `Score : ${state.myScore || 0}`;

        if(state.playerStatus === "ELIMINATED")
        {
            myScoreHtml +=
                `<br><span style="color:red;font-weight:bold">
                    ELIMINATED
                </span>`;
        }

        document.getElementById("myScore").innerHTML =
            myScoreHtml;

            
    const turnPlayer =
        data.find(
            p =>
                Number(p.seat_no) ===
                Number(state.currentTurnSeat)
        );


    if(turnPlayer)
    {
        document.getElementById(
            "currentTurnPlayer"
        ).innerText =
            turnPlayer.display_name;
    }
    else
    {
        document.getElementById(
            "currentTurnPlayer"
        ).innerText =
            "-";
    }
}

async function loadLobbyState() {

    // =================================================
    // GET TABLE STATE
    // =================================================

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_table_state",
            {
                p_table_id: state.tableId
            }
        );


    if (error) {

        console.error(
            "Lobby table state error:",
            error
        );

        return;
    }


    if (!data || !data.length) {
        return;
    }


    const s = data[0];


    // =================================================
    // SHOW PLAYER COUNT
    // =================================================

    document.getElementById(
        "lobbyPlayers"
    ).innerText = s.player_count;


    // =================================================
    // GET LOBBY PLAYERS
    // =================================================

    const {
        data: players,
        error: playersError
    } =
        await supabaseClient.rpc(
            "crdg_get_lobby_players",
            {
                p_table_id: state.tableId
            }
        );


    if (playersError) {

        console.error(
            "Lobby players error:",
            playersError
        );

        return;
    }


    // =================================================
    // CLEAR SEATS
    // =================================================

    for (let i = 1; i <= 6; i++) {

        const seat =
            document.getElementById(
                "seat" + i
            );

        if (seat) {

            seat.innerText =
                `Seat ${i} : Empty`;
        }
    }


    // =================================================
    // DISPLAY PLAYERS
    // =================================================

    if (players) {

        players.forEach(p => {

            const seat =
                document.getElementById(
                    "seat" + p.seat_no
                );

            if (seat) {

                seat.innerText =
                    `Seat ${p.seat_no} : ${p.display_name}`;
            }

        });
    }


    // =================================================
    // DETERMINE HOST
    // =================================================

    const currentUser =
    String(state.userId).toLowerCase();

const currentPlayer =
    players?.find(
        p =>
            String(p.user_id).toLowerCase() === currentUser
    );

const isHost =
    currentPlayer?.is_host === true;


    // =================================================
    // HOST START AREA
    // =================================================

    const hostStartArea =
        document.getElementById(
            "hostStartArea"
        );

    const guestWaitingMessage =
        document.getElementById(
            "guestWaitingMessage"
        );

    const startButton =
        document.getElementById(
            "btnStartGame"
        );

    const hostStartMessage =
        document.getElementById(
            "hostStartMessage"
        );


    if (isHost) {

        // ---------------------------------------------
        // HOST
        // ---------------------------------------------

        hostStartArea.style.display =
            "block";

        guestWaitingMessage.style.display =
            "none";


        if (s.player_count >= 2) {

            startButton.disabled =
                false;

            hostStartMessage.innerText =
                "Players are ready. You can start the game.";

        } else {

            startButton.disabled =
                true;

            hostStartMessage.innerText =
                "Waiting for at least 2 players...";
        }

    } else {

        // ---------------------------------------------
        // OTHER PLAYERS
        // ---------------------------------------------

        hostStartArea.style.display =
            "none";

        guestWaitingMessage.style.display =
            "block";
    }


    // =================================================
    // TABLE ALREADY RUNNING
    // =================================================

    if (s.status === "running") {

        const {
            data: sessions
        } =
            await supabaseClient
                .from("crdg_game_sessions")
                .select("session_id")
                .eq(
                    "table_id",
                    state.tableId
                )
                .order(
                    "session_id",
                    {
                        ascending: false
                    }
                )
                .limit(1);


        if (
            sessions &&
            sessions.length
        ) {

            state.sessionId =
                sessions[0].session_id;

            await enterGame();
        }
    }

}

// =====================================================
// HOST START GAME
// =====================================================

// =====================================================
// HOST START FRIENDS GAME
// =====================================================

async function hostStartGame() {

    // -----------------------------------------------
    // Prevent accidental double-click
    // -----------------------------------------------

    const button =
        document.getElementById(
            "btnStartGame"
        );


    if (!button) {
        return;
    }


    if (button.disabled) {
        return;
    }


    button.disabled = true;

    button.innerText =
        "STARTING...";


    try {

        // =================================================
        // REGISTERED ACCOUNT SESSION
        // =================================================

        const sessionToken =
            localStorage.getItem(
                "crdgn_session_token"
            );


        if (!sessionToken) {

            alert(
                "Your login session is not available. Please login again."
            );

            button.disabled = false;

            button.innerText =
                "▶ START GAME";

            return;
        }


        // =================================================
        // START FRIENDS GAME
        //
        // This NEW crdgn function:
        //
        // 1. Validates logged-in account
        // 2. Checks every active player's balance
        // 3. Calls existing crdg_start_game()
        // 4. Gets the new session_id
        // 5. Deducts 80 from every player
        // 6. Creates RUMMY_ENTRY transactions
        //
        // Existing crdg_start_game() is NOT modified.
        // =================================================

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crdgn_start_friends_game",
            {
                p_session_token:
                    sessionToken,

                p_table_id:
                    state.tableId
            }
        );


        // =================================================
        // DATABASE ERROR
        // =================================================

        if (error) {

            console.error(
                "Friends start game error:",
                error
            );

            alert(
                error.message ||
                "Unable to start Friends game."
            );

            button.disabled = false;

            button.innerText =
                "▶ START GAME";

            return;
        }


        // =================================================
        // READ RESULT
        // =================================================

        const result =
            Array.isArray(data)
                ? data[0]
                : data;


        // =================================================
        // START REJECTED
        // =================================================

        if (
            !result ||
            result.success !== true ||
            !result.session_id
        ) {

            console.error(
                "Friends start game rejected:",
                result
            );

            alert(
                result?.message ||
                "Unable to start Friends game."
            );

            button.disabled = false;

            button.innerText =
                "▶ START GAME";

            return;
        }


        // =================================================
        // SUCCESS
        // =================================================

        console.log(
            "FRIENDS GAME STARTED:",
            {
                session_id:
                    result.session_id,

                charged_players:
                    result.charged_players
            }
        );


        // =================================================
        // IMPORTANT
        // Existing game flow continues exactly as before.
        // =================================================

        state.sessionId =
            result.session_id;


        await enterGame();


    } catch (error) {

        console.error(
            "Friends start game exception:",
            error
        );

        alert(
            error.message ||
            "Unable to start Friends game."
        );

        button.disabled = false;

        button.innerText =
            "▶ START GAME";
    }

}



async function enterGame(){

  if (gameEntered) return;
   gameEntered = true;

  clearInterval(state.lobbyTimerHandle);

  document
    .getElementById("lobbyScreen")
    .classList.add("hidden");

  document
    .getElementById("app")
    .classList.remove("hidden");

  document
    .getElementById("tableIdDisplay")
    .innerText = state.tableId;

    await loadTopGameType();


    await loadGame();
   
    await loadSessionInfo();

    await loadPlayers();
    renderHand();
    calculateDealScore();

    subscribeRealtime();

}


async function startGame() {

    const sessionToken =
        localStorage.getItem(
            "crdgn_session_token"
        );


    if (!sessionToken) {

        console.error(
            "Friends login session missing."
        );

        return false;
    }


    const {
        data,
        error
    } = await supabaseClient.rpc(
        "crdgn_start_friends_game",
        {
            p_session_token:
                sessionToken,

            p_table_id:
                state.tableId
        }
    );


    if (error) {

        console.error(
            "Friends automatic start error:",
            error
        );

        alert(
            error.message ||
            "Unable to start Friends game."
        );

        return false;
    }


    const result =
        Array.isArray(data)
            ? data[0]
            : data;


    if (
        !result ||
        result.success !== true ||
        !result.session_id
    ) {

        console.error(
            "Friends automatic start rejected:",
            result
        );

        alert(
            result?.message ||
            "Unable to start Friends game."
        );

        return false;
    }


    console.log(
        "FRIENDS AUTO START SUCCESS:",
        {
            session_id:
                result.session_id,

            charged_players:
                result.charged_players
        }
    );


    state.sessionId =
        result.session_id;


    await enterGame();


    return true;
}




async function declareGame() {

  if(state.declarationMode){

    return;
   }


   

    if (
        Number(state.seatNo) !==
        Number(state.currentTurnSeat)
    ) {
        alert("Please wait. It is another player's turn.");
        return;
    }

    const cardCount = getTotalCards();

    if (cardCount !== 14) {
        alert("Please pick a card before declaring.");
        return;
    }

    const singleSelectedCard = getSingleSelectedCard();

    if (!singleSelectedCard) {
        if (state.selectedCards && state.selectedCards.length > 1) {
            alert("Please select only one card before declaration.");
        } else {
            alert("Please select one card before declaration.");
        }
        return;
    }

    // existing declaration code...




    const totalCards =
        state.groups.reduce(
            (a, g) => a + g.length,
            0
        );

    if(totalCards !== 14){

        alert(
            "You must have 14 cards to declare"
        );

        return;
    }

    const declareSelection = getSingleSelectedCard();

    if(!declareSelection){

        if (state.selectedCards && state.selectedCards.length > 1) {
            alert("Please select only one card before declaration.");
        } else {
            alert("Please select one card before declaration");
        }

        return;
    }

    if(!confirm( "Confirm Declaration?" )){
        return;
    }

    const declareCard = singleSelectedCard.card;

    // Create copy of groups

      const groupsForDeclaration =
          JSON.parse(
              JSON.stringify(state.groups)
          );

      // Remove selected card

      groupsForDeclaration[
          declareSelection.group
      ].splice(
          declareSelection.index,
          1
      );

          
        const { data, error } =
        await supabaseClient.rpc(
            "crdg_calculate_running_score",
            {
                p_groups: groupsForDeclaration,
                p_joker_card: state.jokerCard
            }
        );

    if(error){

        console.error(error);

        return;
    }

    const declarationScore = Number(data || 0);
    const declarationStatus =  data?.[0]?.status;

    //const declarationScore =  0;

    if(declarationScore === 0){

          alert(
              "VALID DECLARATION"
          );


            const declareCard = singleSelectedCard.card;

            const { data, error } =
                await supabaseClient.rpc(
                    "crdg_submit_declaration",
                    {
                        p_session_id: state.sessionId,
                        p_table_id: state.tableId,
                        p_user_id: state.userId,
                        p_declare_card: declareCard,
                        p_groups: groupsForDeclaration,
                        p_joker_card: state.jokerCard
                    }
                );

            if(data?.[0]?.status === "valid")
            {
            // NOW remove from actual UI

            state.groups[
                declareSelection.group
            ].splice(
                declareSelection.index,
                1
            );

            clearCardSelection();

            renderHand();

            calculateDealScore();
        }

            if(error){

                console.error(error);

                return;
            }


      }
      else{

         alert("OOPS...! INVALID DECLARATION");


        state.isInvalidDeclaration = true;
        state.isDropped = true;
        state.dropType = "INVALID_DECLARE";
        const declareCard = singleSelectedCard.card;

        const { data, error } =
            await supabaseClient.rpc(
                "crdg_submit_declaration",
                {
                    p_session_id: state.sessionId,
                    p_table_id: state.tableId,
                    p_user_id: state.userId,
                    p_declare_card: declareCard,
                    p_groups: groupsForDeclaration,
                    p_joker_card: state.jokerCard
                }
            );

            renderHand();

        if(error){
            console.error(error);
            return;
        }
    }


}



async function calculateDealScore() {

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_calculate_running_score",
            {
                p_groups: state.groups,
                p_joker_card: state.jokerCard
            }
        );

    if (error) {

        console.error(error);

        return;
    }

    document.getElementById("dealScore").innerText =
        "Deal Score : " + (data || 0);
}

function getCardValue(card) {

    if (!card) return 0;

    if (card === "JOKER") {
        return 0;
    }

    let rank =
        card.replace(/[♠♥♦♣]/g, "");

    if (
        rank === "A" ||
        rank === "J" ||
        rank === "Q" ||
        rank === "K"
    ) {
        return 10;
    }

    return parseInt(rank) || 0;
}

async function checkSettlementEligibility() {

    if (!state.sessionId) {
        return;
    }

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_check_settlement_eligibility",
            {
                p_session_id: state.sessionId
            }
        );

    if (error) {
        console.error(
            "Settlement eligibility error:",
            error
        );
        return;
    }

    const result = data?.[0];

    state.settlementEligible =
        result?.eligible === true;

    const btn =
        document.getElementById(
            "btnSettlement"
        );

    if (!btn) {
        return;
    }

    btn.style.display =
        state.settlementEligible
            ? "inline-block"
            : "none";
}


async function loadDealResults()
{
    if(state.resultWindowLoaded)
    {
        return;
    }

    state.resultWindowLoaded = true;

    observationTimeRemaining = 30;

    document.getElementById(
        "observationTimer"
    ).innerText = 30;

    const { data, error } =
        await supabaseClient.rpc(
            "crdg_get_deal_results",
            {
                p_session_id: state.sessionId
            }
        );

    if(error)
    {
        console.error(error);
        return;
    }


    const jokerCard = state.jokerCard || "";

    const isRedJoker =
        jokerCard.includes("♥") ||
        jokerCard.includes("♦");

    const jokerStyle =
        isRedJoker
            ? 'color:red !important; -webkit-text-fill-color:red !important;'
            : 'color:white !important; -webkit-text-fill-color:white !important;';

    document.getElementById(
        "resultJokerCard"
    ).innerHTML =
    `
    <span class="result-joker">
        Joker :
        <span style="${jokerStyle}">
            ${jokerCard}
        </span>
    </span>
    `;

    const container =
        document.getElementById(
            "dealResultsContainer"
        );

    container.innerHTML = "";

        container.innerHTML = `
        <div class="result-scroll">
        <table class="result-table">

        <thead>
        <tr>
        <th>Player</th>
        <th>Cards</th>
        <th>Score</th>
        <th>Total</th>
        <th>Status</th>
        </tr>
        </thead>

        <tbody id="resultTableBody">
        </tbody>

        </table>
        </div>
        `;

        const tbody =
        document.getElementById(
            "resultTableBody"
        );

    data.forEach(row => {

        let showCards = true;

        if(
            row.drop_type === "DROP" ||
            row.drop_type === "MID_DROP" ||
            row.drop_type === "INVALID_DECLARE" ||
            row.player_status === "ELIMINATED"
        )
        {
            showCards = false;
        }


        let html = "";

        // Winner / declared player cards
        if( showCards && 
            row.grouped_hand &&
           row.grouped_hand.length > 0)
        {
            row.grouped_hand.forEach(group => {

               html += `<div class="result-card-group">`;

                group.forEach(card => {

                    let cardClass =
                        "result-card";

                    if(
                        card.includes("♥") ||
                        card.includes("♦")
                    ){
                        cardClass +=
                            " red-card";
                    }

                    if(isJokerCard(card))
                    {
                        cardClass +=
                            " joker-highlight";
                    }

                    html += `
                        <div class="${cardClass}">
                        ${card}
                        </div>
                    `;
                });

                html += `</div>`;
            });
        }
        else
        {
          html +=`<div class="result-card-group">`;
            if(showCards && row.original_hand)
            {

            row.original_hand.forEach(card => {

                let cardClass = "result-card";

                if(
                    card.includes("♥") ||
                    card.includes("♦")
                ){
                    cardClass += " red-card";
                }

                if(isJokerCard(card)){
                    cardClass += " joker-highlight";
                }

                html += `
                   <div class="${cardClass}">
                    ${card}
                   </div>
                `;
            });
            }

            html += `</div>`;
        }


        tbody.innerHTML += `
        <tr>

        <td>
            ${row.display_name}
        </td>

       <td>
        ${
            showCards &&
            (row.grouped_hand || row.original_hand)
            ? html
            : (
                row.drop_type === "DROP"
                    ? "❌ DROP"
                : row.drop_type === "MID_DROP"
                    ? "⛔ MID DROP"
                : row.drop_type === "INVALID_DECLARE"
                    ? "🚫 INVALID DECLARE"
                : "-"
            )
        }
        </td>
        <td style="text-align:center">
            ${row.current_deal_score}
        </td>

        <td style="text-align:center">
            ${row.points}
        </td>

        <td style="text-align:center;font-weight:bold;">
            ${
                row.player_status === "PLAYING"
                    ? ""
                    : row.player_status
            }
        </td>

        </tr>
        `;

    });


    const rejoinPlayers = await loadRejoinCandidates();

        if(rejoinPlayers.length > 0)
        {
            const me = rejoinPlayers.find(
                p => p.user_id === state.userId
            );

            if(me)
            {
                showReJoinWindow(me);
            }
        }

    document.getElementById(
        "dealResultModal"
    ).style.display = "block";
}


function isJokerCard(card) {

    // Printed Joker
    if (card === "JOKER") {
        return true;
    }

    if (!state.wildRank) {
        return false;
    }

    const cardRank =
        card.replace(
            /[♠♥♦♣]/g,
            ""
        );

    return cardRank === state.wildRank;
}

function showReJoinWindow(player)
{

    const container =
        document.getElementById(
            "dealResultsContainer"
        );

    container.insertAdjacentHTML(
        "beforeend",
        `
        <div
            id="rejoinPanel"
            style="
                margin-top:20px;
                padding:15px;
                border:2px solid orange;
                border-radius:8px;
                text-align:center;
                background:#fff8e1;
            ">

            <h3>
                ReJoin Available
            </h3>

            <div>
                <b>${player.display_name}</b>
            </div>

            <br>
            
            <p
            style="
            color:#000;
            font-weight:bold;
            ">
            You can Join Again
            <br>
            Would you like to ReJoin this table?
            </p>

            <br>

            <button id="btnReJoin">
                ReJoin
            </button>

            &nbsp;&nbsp;

            <button id="btnCancelReJoin">
                Cancel
            </button>

        </div>
        `
    );

    document.getElementById('btnReJoin').onclick = async function () {

        // prevent double click
        this.disabled = true;

        // 1. restore player score/status
        const r1 = await supabaseClient.rpc(
            'crdg_rejoin_player',
            {
                p_session_id: state.sessionId,
                p_user_id: state.userId
            }
        );

        if (r1.error) {
            console.error(r1.error);
            this.disabled = false;
            return;
        }

        // 2. add player to rejoin queue
        const r2 = await supabaseClient
            .from('crdg_rejoin_queue')
            .upsert({
                session_id: state.sessionId,
                user_id: state.userId
            });

        if (r2.error) {
            console.error(r2.error);
            this.disabled = false;
            return;
        }

        // 3. UI feedback
        document.getElementById('btnReJoin').innerText = 'ReJoined';
        document.getElementById('btnReJoin').style.background = '#2e7d32';

       

    };

}


async function loadRejoinCandidates()
{

    const 
    {
        data: rejoinData,
        error: rejoinError

    } = await supabaseClient.rpc(
        "crdg_get_rejoin_candidates",
        {
            p_session_id: state.sessionId
        }
    );



    if(rejoinError)
    {
        console.error(
            "Rejoin candidates error",
            rejoinError
        );

        return [];
    }


    return rejoinData || [];

}

function clearCurrentDealUI()
{
    state.groups = [];

    renderHand();

    document.getElementById(
        "openVisual"
    ).innerText = "-";

    document.getElementById("jokerVisual").innerText = "-";
    
    document.getElementById(
        "stockCard"
    ).innerText = "";

    document.getElementById(
        "currentTurnPlayer"
    ).innerText = "-";
}

window.onload = () => {

  const savedTable = localStorage.getItem("crdg_table");
  const savedUser = localStorage.getItem("crdg_user_id");

  // only restore minimal state, DO NOT ENTER GAME
  if (savedTable && savedUser) {
    state.tableId = parseInt(savedTable);
    state.userId = savedUser;
  }

  // ALWAYS show login screen first
  document.getElementById("joinScreen").classList.remove("hidden");
  document.getElementById("lobbyScreen").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");
};




async function postJoinFlow() {

  const { data } = await supabaseClient.rpc(
    "crdg_get_table_state",
    {
      p_table_id: state.tableId
    }
  );

  const s = data?.[0];
  if (!s) return;

  // WAITING → LOBBY
  if (s.status === "waiting") {

    document.getElementById("joinScreen").classList.add("hidden");
    document.getElementById("lobbyScreen").classList.remove("hidden");

    loadLobbyState();
    state.lobbyTimerHandle = setInterval(loadLobbyState, 1000);
  }

  // STARTED → GAME
  if (s.status === "started") {
    await enterGame();
  }
}


// =====================================================
// FRIENDS PAGE AUTO JOIN
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        const tableId =
            localStorage.getItem("crdg_table");

        const nickname =
            localStorage.getItem("crdg_nickname");


        // ---------------------------------------------
        // Only auto-join when coming from tablepage
        // ---------------------------------------------

        if (
            !tableId ||
            !nickname
        ) {
            return;
        }


        // ---------------------------------------------
        // Make old join-screen fields contain values
        // ---------------------------------------------

        const tableInput =
            document.getElementById("tableIdInput");

        const nicknameInput =
            document.getElementById("nickname");


        if (tableInput) {

            tableInput.value =
                tableId;
        }


        if (nicknameInput) {

            nicknameInput.value =
                nickname;
        }


        // ---------------------------------------------
        // Automatically join
        // ---------------------------------------------

        await joinTable();

    }
);