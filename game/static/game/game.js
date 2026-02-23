const roomCode = JSON.parse(document.getElementById('room-code').textContent);
const gameType = JSON.parse(document.getElementById('game-type').textContent);
const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('game-board');

let socket;
let mySide = null;
let currentTurn = null;
let currentPhase = null; // ROLL or MOVE
let myPieces = []; // Track my pieces indices for UI

// Standard Ludo Path (Global 0-51)
const MAIN_PATH = [
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // Red Bottom
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // Red Up
    [0, 7], [0, 8], // Top Turn
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // Green Down
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // Green Right
    [7, 14], [8, 14], // Right Turn
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // Yellow Left
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // Yellow Down
    [14, 7], [14, 6], // Bottom Turn
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // Blue Up
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // Blue Left
    [7, 0], [6, 0] // Left Turn
];

const HOME_PATHS = {
    'RED': [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    'GREEN': [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    'YELLOW': [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
    'BLUE': [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
};

// Base Positions (r, c) for 4 pieces
const BASE_POSITIONS = {
    'RED': [[2, 2], [2, 3], [3, 2], [3, 3]],
    'GREEN': [[2, 11], [2, 12], [3, 11], [3, 12]],
    'YELLOW': [[11, 11], [11, 12], [12, 11], [12, 12]],
    'BLUE': [[11, 2], [11, 3], [12, 2], [12, 3]]
};

let reconnectInterval = 2000;

function connect() {
    const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const wsUrl = `${wsScheme}://${host}/ws/game/${roomCode}/`;

    console.log(`Connecting to: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = function (e) {
        console.log('Chat socket opened');
        reconnectInterval = 2000; // Reset reconnect interval on success
        const status = document.getElementById('connection-status');
        if (status) {
            status.innerText = 'Connected';
            status.style.color = '#55efc4';
        }
        socket.send(JSON.stringify({
            'type': 'join_game'
        }));
    };

    socket.onmessage = function (e) {
        const data = JSON.parse(e.data);
        console.log('DEBUG: Received message:', data);
        socket.lastState = data.game_state;

        if (data.type === 'game_start') {
            mySide = data.side;
            console.log("My Side:", mySide);
            renderBoard(data.game_state);
        } else if (data.type === 'game_update') {
            renderBoard(data.game_state);
        } else if (data.type === 'chat_message') {
            displayChatMessage(data.message, data.sender);
        } else if (data.type === 'error') {
            showToast(data.message);
        }
    };

    socket.onclose = function (e) {
        const status = document.getElementById('connection-status');
        if (e.code === 4000) {
            console.log('Room Expired');
            if (status) {
                status.innerText = 'Room Expired!';
                status.style.color = '#ff7675';
            }
            alert("This room code has expired. Please create a new room.");
            window.location.href = '/';
        } else {
            console.error('Socket closed unexpectedly', e);
            if (status) {
                status.innerText = 'Disconnected. Reconnecting...';
                status.style.color = '#ff7675';
            }
            // Reconnect logic
            setTimeout(function () {
                console.log("Attempting to reconnect...");
                connect();
            }, reconnectInterval);
            reconnectInterval = Math.min(reconnectInterval * 1.5, 30000); // Exponential backoff
        }
    };

    socket.onerror = function (err) {
        console.error('Socket encountered error: ', err.message, 'Closing socket');
        socket.close();
    };
}

function renderBoard(gameState) {
    if (!gameState || !gameState.players) {
        console.warn("DEBUG: renderBoard called with empty state");
        return;
    }
    try {
        currentTurn = gameState.turn || 'RED';
        currentPhase = gameState.phase || 'ROLL';
        const winner = gameState.winner;
        const players = gameState.players;
        const diceVal = gameState.dice_value || 0;

        renderPlayers(players, currentTurn, diceVal);

        if (winner) {
            checkWinnerDisplay(gameState);
        } else {
            let statusText = `Turn: ${currentTurn}`;
            if (currentTurn === mySide) {
                if (gameType === 'LUDO') {
                    statusText += ` (${currentPhase === 'ROLL' ? 'Roll Dice!' : 'Move a Piece!'})`;
                } else {
                    statusText += ` (Your Turn)`;
                }
            }
            if (statusDiv) statusDiv.innerText = statusText;
        }

        if (gameType === 'TIC_TAC_TOE') {
            renderTicTacToe(gameState.board, winner);
        } else if (gameType === 'LUDO') {
            renderLudo(gameState);
        } else if (gameType === 'SNAKES_AND_LADDERS') {
            renderSnakesAndLadders(gameState);
        }
    } catch (e) {
        console.error("Render Error:", e);
        if (statusDiv) {
            statusDiv.innerHTML = `<span style="color:red">Error: ${e.message}</span>`;
        }
        alert("Game Error: " + e.message + "\nCheck console for details.");
    }
}



function renderTicTacToe(board, winner) {
    boardDiv.innerHTML = '';

    // Ensure board has TTT class
    boardDiv.className = 'board tic_tac_toe';

    // 0-8 grid
    for (let i = 0; i < 9; i++) {
        const cellVal = board[i];
        const cell = document.createElement('div');
        cell.className = 'cell ' + (cellVal ? cellVal.toLowerCase() : '');
        cell.innerText = cellVal || '';

        // Clickable if empty, no winner, and my turn
        if (!cellVal && !winner && currentTurn === mySide) {
            cell.onclick = () => makeMove(i);
            cell.style.cursor = 'pointer';
        }

        boardDiv.appendChild(cell);
    }
}

function renderLudo(gameState) {
    if (!gameState || !gameState.players) return;
    console.log("DEBUG: Board dimensions:", boardDiv.clientWidth, "x", boardDiv.clientHeight);
    const extendedColors = ['ORANGE', 'PURPLE', 'CYAN', 'PINK'];
    const hasExtended = Object.values(gameState.players).some(p => extendedColors.includes(p.side));
    const is8Player = hasExtended || Object.keys(gameState.players).length > 4;

    if (boardDiv.children.length === 0 || (is8Player && !document.querySelector('.board-8'))) {
        console.log("DEBUG: Building Ludo Board...");
        boardDiv.innerHTML = ''; // Clear
        if (is8Player) buildLudoBoard8();
        else buildLudoBoard();
    }

    console.log("DEBUG: Rendering pieces for players:", Object.keys(gameState.players || {}));

    // Smart Render: Don't just remove all pieces. 
    // We want to identify which piece moved to animate it.
    // However, full diffing is complex. 
    // SIMPLIFIED ANIMATION:
    // 1. Find existing pieces in DOM.
    // 2. Compare with new state.
    // 3. If position changed, animate.

    // For now, let's just stick to re-rendering but adding a "moving" class if we can track it?
    // Actually, full re-render is fine if we use CSS transitions.
    // But CSS transitions only work if element identity is preserved.
    // Let's clear and rebuild, but maybe use a data-id to find old position?

    // Strategy:
    // We will clear and rebuild. But if we want "sliding", we need to know start and end.
    // The Backend sends the *Result* state. 
    // To animate, we need the *Previous* state or the *Event* saying "Piece X moved to Y".
    // We only have state.
    // Let's rely on CSS transitions by trying to preserve elements? 
    // Too complex for this snippet.
    // ADJUSTMENT: We will just render pieces at new positions. 
    // We will add a "spawn" animation.

    const existingPieces = {};
    document.querySelectorAll('.ludo-piece').forEach(el => {
        existingPieces[el.dataset.id] = el;
    });

    // We need unique ID for pieces: color_index

    if (gameState.players) {
        Object.values(gameState.players).forEach(p => {
            console.log("DEBUG: Player data:", p);
            const color = p.side;
            if (color === 'SPECTATOR') return;

            if (!p.pieces) {
                console.error("DEBUG: Player pieces missing!", p);
                return;
            }

            p.pieces.forEach((pos, idx) => {
                const pieceId = `${color}_${idx}`;
                let piece = existingPieces[pieceId];
                console.log(`DEBUG: Processing piece ${pieceId} at pos ${pos}`);

                // Calculate coords
                let coords;
                if (pos === -1) {
                    coords = BASE_POSITIONS[color][idx];
                } else if (pos === 57) {
                    coords = [7, 7];
                } else {
                    coords = getLudoCoords(pos, color);
                }

                if (!piece) {
                    piece = document.createElement('div');
                    piece.classList.add('ludo-piece', color.toLowerCase());
                    piece.dataset.id = pieceId;
                    boardDiv.appendChild(piece);
                } else {
                    delete existingPieces[pieceId]; // Mark as used
                }

                // Update specific classes/events
                piece.className = `ludo-piece ${color.toLowerCase()}`; // Reset

                if (p.side === mySide && currentTurn === mySide && gameState.phase === 'MOVE') {
                    if (isMovable(pos, gameState.dice_value)) {
                        piece.classList.add('movable');
                        piece.onclick = (e) => {
                            e.stopPropagation();
                            makeMove(idx);
                        };
                    }
                }

                if (coords) {
                    // Use style for absolute position (Smooth Sliding)
                    // varied by 6.66% per cell (100/15)
                    const cellSize = 100 / 15;
                    const topPos = coords[0] * cellSize;
                    const leftPos = coords[1] * cellSize;

                    // Add slight offset to center the piece in the cell
                    // Piece is 5.6%, Cell is 6.66%. Difference is ~1%. Half is 0.5%
                    const offset = (cellSize - 5.6) / 2;

                    piece.style.top = (topPos + offset) + '%';
                    piece.style.left = (leftPos + offset) + '%';
                }
            });
        });
    }

    // Remove pieces that are gone (shouldn't happen in Ludo normally unless disconnected?)
    Object.values(existingPieces).forEach(el => el.remove());

    // Update Shared Dice UI
    const diceContainer = document.getElementById('shared-dice');
    if (diceContainer) {
        const diceBox = diceContainer.querySelector('.dice-box');
        const pColor = getPlayerColor(currentTurn);

        // Update Border Color and Glow Variable for current turn
        diceContainer.style.borderColor = pColor;
        diceContainer.style.setProperty('--turn-color', pColor);

        // Render Value
        if (gameState.dice_value > 0) {
            // Stop animation if running
            if (diceBox && diceBox.intervalId) {
                clearInterval(diceBox.intervalId);
                diceBox.intervalId = null;
                diceBox.classList.remove('rolling');
            }
            renderDiceFace(gameState.dice_value, diceBox);
        } else {
            renderDiceFace(0, diceBox);
        }

        // Interaction
        // Reset
        diceContainer.onclick = null;
        diceContainer.classList.remove('active');

        if (currentTurn === mySide && gameState.phase === 'ROLL') {
            diceContainer.classList.add('active');
            diceContainer.onclick = () => rollDice();
        }
    }

    // Toast for Auto-Pass
    if (gameState.phase === 'AUTO_PASS') {
        showToast("No Moves! Passing Turn...");
    }
}


function renderDiceFace(val, container) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'dice-box'; // Reset

    if (val === 0) {
        // Roll State
        container.innerHTML = '<span style="font-size: 0.8rem; font-weight: bold; color: #555;">R</span>';
        return;
    }

    // Create dots based on val
    // We use a grid 3x3
    // 1: center
    // 2: top-left, bottom-right
    // 3: top-left, center, bottom-right
    // 4: tl, tr, bl, br
    // 5: tl, tr, c, bl, br
    // 6: tl, tr, ml, mr, bl, br

    const dots = [];
    if ([2, 3, 4, 5, 6].includes(val)) dots.push('tl');
    if ([4, 5, 6].includes(val)) dots.push('tr');
    if ([6].includes(val)) dots.push('ml');
    if ([1, 3, 5].includes(val)) dots.push('cc');
    if ([6].includes(val)) dots.push('mr');
    if ([4, 5, 6].includes(val)) dots.push('bl');
    if ([2, 3, 4, 5, 6].includes(val)) dots.push('br');

    dots.forEach(pos => {
        const d = document.createElement('div');
        d.className = `dice-dot ${pos}`;
        container.appendChild(d);
    });
}

function getPlayerColor(side) {
    if (side === 'RED') return '#ff7675';
    if (side === 'GREEN') return '#55efc4';
    if (side === 'YELLOW') return '#ffeaa7';
    if (side === 'BLUE') return '#74b9ff';
    return '#ccc';
}

function showToast(msg) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
            border-radius: 20px; font-weight: bold; z-index: 1000;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
}

function getLudoCoords(pos, color) {
    // Offsets: RED: 0, GREEN: 13, YELLOW: 26, BLUE: 39
    const offsets = { 'RED': 0, 'GREEN': 13, 'YELLOW': 26, 'BLUE': 39 };
    const offset = offsets[color];

    if (pos < 52) {
        // Main path
        const globalPos = (pos + offset) % 52;
        return MAIN_PATH[globalPos];
    } else {
        // Home stretch (52-56)
        const homeIdx = pos - 52;
        if (HOME_PATHS[color] && homeIdx < HOME_PATHS[color].length) {
            return HOME_PATHS[color][homeIdx];
        }
        return [7, 7]; // Fallback to center
    }
}

function isMovable(pos, dice) {
    if (pos === -1 && dice !== 6) return false;
    if (pos === 57) return false;
    if (pos + dice > 57) return false;
    return true;
}

function buildLudoBoard() {
    boardDiv.innerHTML = '';

    // Add Bases
    ['red', 'green', 'blue', 'yellow'].forEach(color => {
        const base = document.createElement('div');
        base.classList.add('ludo-base', color);
        base.innerHTML = `<div class="ludo-base-inner">
            <div class="base-circle"></div><div class="base-circle"></div>
            <div class="base-circle"></div><div class="base-circle"></div>
        </div>`;
        boardDiv.appendChild(base);
    });

    // Shared Dice is now in HTML (Outside Board)
    // No need to create it here dynamically


    // Add Center
    const center = document.createElement('div');
    center.classList.add('ludo-center');
    // REMOVED CENTER DICE
    // center.innerHTML = `<div class="dice-container" id="dice-btn">...</div>`;

    // Add Ludo King Logo or simple text?
    center.innerHTML = '<div class="ludo-watermark">LUDO</div>';

    boardDiv.appendChild(center);

    // Add Cells
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            // Skip Base Areas (0-5, 0-5), (0-5, 9-14), (9-14, 0-5), (9-14, 9-14)
            // Center is (6-8, 6-8)

            // Top Left Base
            if (r < 6 && c < 6) continue;
            // Top Right Base
            if (r < 6 && c > 8) continue;
            // Bottom Left Base
            if (r > 8 && c < 6) continue;
            // Bottom Right Base
            if (r > 8 && c > 8) continue;
            // Center Area
            if (r >= 6 && r <= 8 && c >= 6 && c <= 8) continue;

            const cell = document.createElement('div');
            cell.classList.add('ludo-cell');
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.style.gridRow = r + 1;
            cell.style.gridColumn = c + 1;

            // Colors for Paths
            // Green Path (Top, Col 7, Rows 1-5)
            if (c === 7 && r > 0 && r < 6) cell.classList.add('green-path');
            // Red Path (Left, Row 7, Cols 1-5)
            if (r === 7 && c > 0 && c < 6) cell.classList.add('red-path');
            // Yellow Path (Right, Row 7, Cols 9-13)
            if (r === 7 && c > 8 && c < 14) cell.classList.add('yellow-path');
            // Blue Path (Bottom, Col 7, Rows 9-13)
            if (c === 7 && r > 8 && r < 14) cell.classList.add('blue-path');

            // Start cells
            if (r === 6 && c === 1) cell.classList.add('red-path', 'safe'); // Red Start
            if (r === 1 && c === 8) cell.classList.add('green-path', 'safe'); // Green Start
            if (r === 8 && c === 13) cell.classList.add('yellow-path', 'safe'); // Yellow Start
            if (r === 13 && c === 6) cell.classList.add('blue-path', 'safe'); // Blue Start

            // Other safe spots (Star)
            if (r === 2 && c === 6) cell.classList.add('safe');
            if (r === 6 && c === 12) cell.classList.add('safe');
            if (r === 8 && c === 2) cell.classList.add('safe');
            if (r === 12 && c === 8) cell.classList.add('safe');

            boardDiv.appendChild(cell);
        }
    }
}

function rollDice() {
    console.log("Rolling dice...");

    // Animate Rolling
    const diceBox = document.querySelector(`#shared-dice .dice-box`);

    if (diceBox) {
        // Clear existing
        if (diceBox.intervalId) clearInterval(diceBox.intervalId);

        diceBox.classList.add('rolling');

        // Cycle numbers visually
        let count = 0;
        diceBox.intervalId = setInterval(() => {
            const rand = Math.floor(Math.random() * 6) + 1;
            renderDiceFace(rand, diceBox);
            count++;
            if (count > 50) { // Safety: stop after 5s if no response
                clearInterval(diceBox.intervalId);
                diceBox.intervalId = null;
                diceBox.classList.remove('rolling');
            }
        }, 100);
    }

    playSFX('dice');
    socket.send(JSON.stringify({
        'type': 'roll_dice',
        'player': mySide
    }));
}

function makeMove(index) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Making move:", index);
        socket.send(JSON.stringify({
            'type': 'make_move',
            'index': index,
            'player': mySide
        }));
    } else {
        console.warn("Cannot make move: WebSocket is not open.");
        showToast("Connection lost. Trying to reconnect...");
    }
}

function renderPlayers(players, currentTurn, diceVal) {
    const listDiv = document.getElementById('players-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    Object.values(players).forEach(p => {
        const pDiv = document.createElement('div');
        pDiv.classList.add('player-card');
        if (p.side === currentTurn) {
            pDiv.classList.add('active');
        }

        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = 'bold';
        nameDiv.innerText = p.name + (p.side === 'SPECTATOR' ? ' (Spec)' : ` (${p.side})`);

        const scoreDiv = document.createElement('div');
        if (gameType === 'LUDO') {
            if (p.finished_pieces !== undefined) {
                scoreDiv.innerText = `Home: ${p.finished_pieces}/4`;
            }
        } else {
            scoreDiv.innerText = p.score || 0;
            scoreDiv.classList.add('player-score');
        }

        pDiv.appendChild(nameDiv);
        pDiv.appendChild(scoreDiv);
        listDiv.appendChild(pDiv);
    });
}
// TicTacToe functions unchanged...
function renderTicTacToe(board, winner) {
    boardDiv.innerHTML = '';
    if (!board) return;
    board.forEach((val, idx) => {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        if (val) {
            cell.classList.add(val.toLowerCase());
            cell.innerText = val;
        }
        cell.onclick = function () {
            if (!val && !winner) {
                makeMove(idx);
            }
        };
        boardDiv.appendChild(cell);
    });
}

function buildLudoBoard8() {
    console.log("Building 8-Player Board");
    const container = document.createElement('div');
    container.className = 'board-8';

    // Center
    const center = document.createElement('div');
    center.className = 'center-8';
    center.innerText = "LUDO 8";
    container.appendChild(center);

    const colors = ['red', 'green', 'yellow', 'blue', 'orange', 'purple', 'cyan', 'pink']; // Order matches offsets

    colors.forEach((color, i) => {
        const arm = document.createElement('div');
        arm.className = `arm ${color}`;

        // Create 21 Slots (3x7 grid)
        // Mapping:
        // Row 3 (Bottom): Outbound [0..5] => Indices [0..5]
        // Row 2 (Mid): HomePath [0..4] (Cols 2-6?), Tip [Col 7] => Index 6
        // Row 1 (Top): Inbound [0..5] => Indices [12..7]

        // We iterate 1..21 (Grid cells)
        // Grid fills Row 1, then Row 2, then Row 3? 
        // CSS Grid fills row by row.

        for (let r = 1; r <= 3; r++) {
            for (let c = 1; c <= 7; c++) {
                const cell = document.createElement('div');
                cell.className = 'ludo-cell-8';

                // Logic Mapping
                let type = 'empty';
                let id = null;

                if (r === 3 && c <= 6) {
                    // Outbound 0..5
                    // Cell 0 is index 0. Cell 5 is index 5.
                    // Visual (R3, C1) -> Step 0?
                    // Usually start is away from center. 
                    // Arm Transform Origin is Center-Left.
                    // So Left is Inner (Center), Right is Outer (Tip).
                    // Wait, standard Arm: Base is usually Outer.
                    // If Transform Origin is 0% 50% (Left), Left is Center.
                    // So C1 is Center, C7 is Tip.

                    // Outbound: From Center to Tip? No, Start is usually Outer.
                    // Path: Outer -> Inner (Safe) -> Around -> Home.
                    // But here we are checking "Main Loop".
                    // Main Loop goes PERIMETER.
                    // In a Star, Perimeter is:
                    // Up one side, Turn at Tip, Down other side.
                    // So: Outbound (Away from Center) -> Tip -> Inbound (Towards Center).
                    // So C1 (Center) -> C7 (Tip).

                    // Step indices:
                    // Start (relative 0) should be near center or tip?
                    // Standard Ludo: Start Base is Outer. Enters Main Path at Outer Corner.
                    // Moves Towards Center? No, Standard Ludo moves Clockwise around center.
                    // In a Star:
                    // Enters at base of arm (Center side? No).
                    // Enters at Index 8 (Standard).
                    // Let's assume standard flow:
                    // Start (at Base) -> Enters "Heart" of arm?

                    // SIMPLIFIED PATH 8-PLAYER:
                    // Enters at "Inbound" (Top) near Center?
                    // Moves Outwards to Tip?
                    // Turns?
                    // Moves Inwards?

                    // Let's stick to my Backend Logic: 13 steps per arm.
                    // Let's map steps 0..12 to visual cells.
                    // 0..5: Move Away (Left to Right).
                    // 6: Tip (Right).
                    // 7..12: Move Back (Right to Left).

                    // So:
                    // Outbound (Steps 0..5): R3, C1->C6.
                    // Tip (Step 6): R2, C7.
                    // Inbound (Step 7..12): R1, C6->C1.

                    // Row 3 (Bottom) is usually "Right" side if strictly clockwise.
                    // Let's map:
                    // Logic Step X (local):
                    // If 0 <= X <= 5: Row 3, Col (X+1).
                    // If X == 6: Row 2, Col 7.
                    // If 7 <= X <= 12: Row 1, Col (13-X).

                    // So loop:

                    const visualC = c;
                    const visualR = r;

                    if (visualR === 3 && visualC <= 6) {
                        // Steps 0..5
                        let step = visualC - 1;
                        let globalStep = i * 13 + step;
                        cell.id = `cell-${globalStep}`;
                        cell.innerText = globalStep; // Debug
                        if (step === 0 && color === 'RED') cell.classList.add('safe'); // Mark start?
                    }
                    else if (visualR === 2 && visualC === 7) {
                        // Tip (Step 6)
                        let step = 6;
                        let globalStep = i * 13 + step;
                        cell.id = `cell-${globalStep}`;
                        cell.classList.add('safe');
                        cell.innerText = globalStep;
                    }
                    else if (visualR === 1 && visualC <= 6) {
                        // Steps 7..12 (reversed)
                        // C6->7, C1->12.
                        // 13 - step = visualC => step = 13 - visualC.
                        // e.g. C6: 13-6=7. Correct.
                        // C1: 13-1=12. Correct.
                        let step = 13 - visualC;
                        let globalStep = i * 13 + step;
                        cell.id = `cell-${globalStep}`;
                        cell.innerText = globalStep;
                    }
                    else if (visualR === 2 && visualC <= 6 && visualC >= 2) {
                        // Home Path (Cols 2-6)
                        // Usually 5 steps.
                        // 0..4.
                        // Let's map C6->0, C2->4? Or C2->0, C6->4?
                        // Path goes TO Center (Left).
                        // So Outer (C6) -> Inner (C2).
                        // So C6 is Start of Home Path.
                        // C2 is End.
                        let homeStep = 5 - (visualC - 1); // C6->0, C2->4?
                        // visualC=6: 5-(5)=0. visualC=2: 5-(1)=4. 
                        // Wait, Home path usually 5 steps, then Home Base.

                        // Let's assume C6 is Step 0 (Entrance).
                        // C2 is Step 4.
                        // C1 is Home Base? (Row 2, C1)
                        let idx = 6 - visualC; // C6->0, C5->1, C4->2, C3->3, C2->4.
                        cell.className += ' home-cell';
                        cell.id = `home-${color.toUpperCase()}-${idx}`;
                        cell.innerText = "H" + idx;
                    }
                    else if (visualR === 2 && visualC === 1) {
                        // Center/Home Base
                        cell.className += ' home-base';
                        cell.innerText = "★";
                    }

                    // Click handler
                    if (cell.id) {
                        cell.dataset.id = cell.id;
                        cell.onclick = () => handleCellClick(cell.id);
                    }
                }

                arm.appendChild(cell);
            }
        }

        container.appendChild(arm);
    });

    boardDiv.appendChild(container);
}

// --- AUDIO SYSTEM ---
let musicEnabled = true;
let sfxEnabled = true;

function toggleMusic() {
    musicEnabled = !musicEnabled;
    const bgm = document.getElementById('bgm');
    const btn = document.getElementById('music-toggle');
    if (musicEnabled) {
        bgm.play().catch(e => console.log("Auto-play blocked"));
        btn.innerText = "🎵 ON";
    } else {
        bgm.pause();
        btn.innerText = "🎵 OFF";
    }
}

function toggleSFX() {
    sfxEnabled = !sfxEnabled;
    const btn = document.getElementById('sfx-toggle');
    btn.innerText = sfxEnabled ? "🔊 ON" : "🔊 OFF";
}

function playSFX(id) {
    if (!sfxEnabled) return;
    const sfx = document.getElementById(`sfx-${id}`);
    if (sfx) {
        sfx.currentTime = 0;
        sfx.play().catch(e => console.log("SFX blocked"));
    }
}

// --- CONFETTI SYSTEM ---
function fireConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;

    for (let i = 0; i < 150; i++) {
        const c = document.createElement('div');
        c.style.cssText = `
            position: absolute; width: 10px; height: 10px;
            background: hsl(${Math.random() * 360}, 100%, 50%);
            left: ${Math.random() * 100}%; top: -20px;
            border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
            transform: rotate(${Math.random() * 360}deg);
            z-index: 9999;
        `;
        container.appendChild(c);

        const duration = 2000 + Math.random() * 3000;
        const animation = c.animate([
            { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
            { transform: `translate(${(Math.random() - 0.5) * 200}px, ${window.innerHeight}px) rotate(${Math.random() * 1000}deg)`, opacity: 0 }
        ], { duration, easing: 'cubic-bezier(0, .9, .57, 1)' });

        animation.onfinish = () => c.remove();
    }
}

function checkWinnerDisplay(gameState) {
    const modal = document.getElementById('result-modal');
    if (gameState.winner) {
        playSFX('win');
        fireConfetti();
        modal.style.display = 'block';
        const msg = document.getElementById('result-message');
        const title = document.getElementById('result-title');
        title.innerText = "🎉 CHAMPION! 🎉";

        // Find winner name
        let winnerName = gameState.winner;
        if (gameState.players) {
            const p = Object.values(gameState.players).find(p => p.side === gameState.winner);
            if (p) winnerName = p.name;
        }

        msg.innerText = `${winnerName} Wins!`;
    } else {
        modal.style.display = 'none';
    }
}

function resetGame() {
    socket.send(JSON.stringify({
        'type': 'reset_game'
    }));
    document.getElementById('result-modal').style.display = 'none';
}

console.log("Game.js loaded");

// --- CHAT SYSTEM ---
const stickerLibrary = [
    { tags: 'funny lol haha', url: '😂' },
    { tags: 'love heart', url: '❤️' },
    { tags: 'cool sunglasses', url: '😎' },
    { tags: 'cry sad', url: '😭' },
    { tags: 'angry mad', url: '😡' },
    { tags: 'wow surprise', url: '😮' },
    { tags: 'party celebrate', url: '🎉' },
    { tags: 'thumb up like', url: '👍' },
    { tags: 'cat cute', url: '🐱' },
    { tags: 'dog', url: '🐶' },
    { tags: 'ghost', url: '👻' },
    { tags: 'poop funny', url: '💩' },
    { tags: 'fire hot', url: '🔥' },
    { tags: 'brain smart', url: '🧠' },
    { tags: 'money rich', url: '💰' },
    { tags: 'robot', url: '🤖' },
    { tags: 'alien', url: '👽' },
    { tags: 'cat funny', url: '😹' },
    { tags: 'monkey', url: '🙈' },
    // Trending Memes
    { tags: 'meme doge wow cute', url: 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme sunglasses cool', url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme happy success kid', url: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme thinking smart', url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme distracted boyfriend', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme fire this is fine', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme surprised pikachu face', url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme gaming cards win', url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=150&h=150&q=80' },
    { tags: 'meme random fun', url: 'https://picsum.photos/seed/fun/150/150' },
    { tags: 'meme classic vibe', url: 'https://picsum.photos/seed/classic/150/150' }
];

function toggleStickerPicker() {
    const picker = document.getElementById('sticker-picker');
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
        document.getElementById('sticker-search').focus();
        filterStickers();
    }
}

// Close sticker picker on click outside
document.addEventListener('click', function (event) {
    const picker = document.getElementById('sticker-picker');
    const btn = document.getElementById('sticker-btn');
    if (!picker || !btn) return;

    if (!picker.classList.contains('hidden') &&
        !picker.contains(event.target) &&
        event.target !== btn) {
        picker.classList.add('hidden');
    }
});

function filterStickers() {
    const query = document.getElementById('sticker-search').value.toLowerCase();
    const grid = document.getElementById('sticker-grid');
    grid.innerHTML = '';

    stickerLibrary.forEach(s => {
        if (s.tags.includes(query) || query === '') {
            const el = document.createElement('div');
            el.className = 'sticker-item';

            // Render Image or Emoji
            if (s.url.startsWith('http')) {
                el.innerHTML = `<img src="${s.url}" style="width:100%; height:100%; object-fit:cover; border-radius:5px;" loading="lazy">`;
            } else {
                el.textContent = s.url;
            }

            el.onclick = () => sendSticker(s.url);
            grid.appendChild(el);
        }
    });
}

function sendSticker(content) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            'type': 'chat_message',
            'message': content,
            'sender': mySide || 'Player',
            'is_sticker': true
        }));
    }
    toggleStickerPicker();
}


function handleChatKey(e) {
    if (e.key === 'Enter') sendChat();
}

// function makeMove(index) { ... moved/consolidated ... }

function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            'type': 'chat_message',
            'message': msg,
            'sender': mySide || 'Player'
        }));
        input.value = ''; // Only clear if sent
    } else {
        showToast("Cannot send: Disconnected.");
    }
}

function sendReaction(emoji) {
    sendSticker(emoji);
}

function displayChatMessage(msg, sender) {
    // Try Board Chat first (TTT)
    const boardChat = document.getElementById('board-chat-display');
    const sidebarChat = document.getElementById('chat-messages');

    // Choose target
    let target = boardChat || sidebarChat;
    if (!target) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';

    // Check content type
    const isSticker = (msg.length < 5 && /\p{Emoji}/u.test(msg));
    const isUrl = /^(http|https):\/\/[^ "]+$/.test(msg);

    // RENDER LOGIC
    if (boardChat) {
        // Simple Text Format: "Sender: Message"
        // Style handled by CSS .sender

        if (isSticker) {
            div.style.fontSize = '2rem';
            div.innerHTML = `<span class="sender">${sender}:</span> ${msg}`;
        } else if (isUrl) {
            div.innerHTML = `<span class="sender">${sender}:</span> <br><img src="${msg}" style="max-width:100px; border-radius:5px;">`;
        } else {
            div.innerHTML = `<span class="sender">${sender}:</span> ${msg}`;
        }

    } else {
        // SIDEBAR BUBBLE FORMAT (Existing)
        if (isSticker) {
            div.style.fontSize = '2.5rem';
            div.style.backgroundColor = 'transparent';
            div.style.padding = '0';
            div.textContent = msg;
            if (sender === mySide) div.classList.add('self');
            else {
                const name = document.createElement('div');
                name.style.fontSize = '0.7rem';
                name.textContent = sender;
                target.appendChild(name); // Wait, name before msg? In old code it appended name to chatBox? No, let's fix.
                // Old code: chatBox.appendChild(name); <- This was weird, name outside bubble?
                // Let's keep it simple.
            }
        } else if (isUrl) {
            const img = document.createElement('img');
            img.src = msg;
            img.style.maxWidth = '150px';
            img.style.borderRadius = '8px';
            if (sender === mySide) div.classList.add('self');
            else {
                const name = document.createElement('div');
                name.style.fontWeight = 'bold';
                name.style.marginBottom = '2px';
                name.textContent = sender;
                div.appendChild(name);
            }
            div.appendChild(img);
        } else {
            if (sender === mySide) {
                div.classList.add('self');
                div.textContent = msg;
            } else {
                div.textContent = sender + ': ' + msg;
            }
        }
    }

    target.appendChild(div);
    target.scrollTop = target.scrollHeight;

    // Auto-Remove after 30 seconds
    setTimeout(() => {
        div.classList.add('fade-out');
        setTimeout(() => div.remove(), 1000); // Wait for 1s animation
    }, 29000); // Start fade at 29s
}

function showFloatingReaction(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    const x = 40 + Math.random() * 20;
    const y = 40 + Math.random() * 20;
    el.style.left = x + '%';
    el.style.top = y + '%';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

// Initialize Game Connection
document.addEventListener('DOMContentLoaded', function () {
    connect();
});

