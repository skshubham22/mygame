const roomCode = JSON.parse(document.getElementById('room-code').textContent);
const gameType = JSON.parse(document.getElementById('game-type').textContent);
const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('game-board');

let socket;
let mySide = null;
let currentTurn = null;

function connect() {
    const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(
        wsScheme + '://' + window.location.host + '/ws/game/' + roomCode + '/'
    );

    socket.onopen = function (e) {
        console.log('Chat socket opened');
        document.getElementById('connection-status').innerText = 'Connected';
        document.getElementById('connection-status').style.color = '#55efc4';
        socket.send(JSON.stringify({
            'type': 'join_game'
        }));
    };

    socket.onmessage = function (e) {
        const data = JSON.parse(e.data);
        console.log('Message:', data);

        if (data.type === 'game_start') {
            mySide = data.side;
            renderBoard(data.game_state);
            checkWinnerDisplay(data.game_state);
        } else if (data.type === 'game_update') {
            renderBoard(data.game_state);
            checkWinnerDisplay(data.game_state);
        }
    };

    socket.onclose = function (e) {
        console.error('Chat socket closed unexpectedly');
        if (e.code === 4000) {
            document.getElementById('connection-status').innerText = 'Room Expired!';
            alert("This room code has expired (valid for 5 mins). Please create a new room.");
            window.location.href = '/';
        } else {
            document.getElementById('connection-status').innerText = 'Disconnected - Refresh Page';
            document.getElementById('connection-status').style.color = '#ff7675';
        }
    };
}

function renderBoard(gameState) {
    boardDiv.innerHTML = '';
    const board = gameState.board;
    currentTurn = gameState.turn;
    const winner = gameState.winner;
    const players = gameState.players;

    renderPlayers(players, currentTurn);

    if (winner) {
        if (winner === 'DRAW') {
            statusDiv.innerText = 'Game Over! It\'s a Draw!';
        } else {
            statusDiv.innerText = `Game Over! Winner: ${winner}`;
        }
    } else {
        // Find my name
        let myName = 'You';
        // Need to identify myself from players list using mySide? 
        // Logic: if players contains mySide, that's me.

        statusDiv.innerText = `Turn: ${currentTurn}`;
    }

    if (gameType === 'TIC_TAC_TOE') {
        renderTicTacToe(board, winner);
    } else if (gameType === 'LUDO') {
        renderLudo(gameState);
    }
}

function renderLudo(gameState) {
    if (boardDiv.children.length === 0) {
        // Build static board structure once
        buildLudoBoard();
    }
    // Update pieces based on gameState (Not implemented yet)
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

    // Add Center
    const center = document.createElement('div');
    center.classList.add('ludo-center');
    center.innerHTML = `<div class="dice-container" id="dice-btn" onclick="rollDice()">
        <div class="dice">🎲</div>
        <div id="dice-val">Roll</div>
    </div>`;
    boardDiv.appendChild(center);

    // Add Cells (We only add the cross paths, 15x15 minus bases)
    // Coords 0-14 (Row), 0-14 (Col)
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            // Skip Base Areas
            if ((r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c < 6) || (r > 8 && c > 8) || (r >= 6 && r <= 8 && c >= 6 && c <= 8)) {
                continue;
            }

            const cell = document.createElement('div');
            cell.classList.add('ludo-cell');
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.style.gridRow = r + 1;
            cell.style.gridColumn = c + 1;

            // Logic for coloring paths
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
    socket.send(JSON.stringify({
        'type': 'roll_dice',
        'player': mySide
    }));
}

function renderPlayers(players, currentTurn) {
    const listDiv = document.getElementById('players-list');
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

        // Score
        const scoreDiv = document.createElement('div');
        scoreDiv.classList.add('player-score');
        scoreDiv.innerText = p.score || 0;

        pDiv.appendChild(nameDiv);
        pDiv.appendChild(scoreDiv);
        listDiv.appendChild(pDiv);
    });
}

function renderTicTacToe(board, winner) {
    boardDiv.innerHTML = '';

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

function checkWinnerDisplay(gameState) {
    const modal = document.getElementById('result-modal');
    if (gameState.winner) {
        modal.style.display = 'block';
        const msg = document.getElementById('result-message');
        const title = document.getElementById('result-title');

        if (gameState.winner === 'Draw') {
            title.innerText = "It's a Draw!";
            msg.innerText = "No one won this round.";
        } else {
            title.innerText = "Game Over!";
            // Use player name if available, otherwise side
            const winnerText = gameState.winner_name || gameState.winner;
            msg.innerText = `${winnerText} Wins!`;
        }
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

function makeMove(index) {
    socket.send(JSON.stringify({
        'type': 'make_move',
        'index': index,
        'player': mySide
    }));
}

connect();
