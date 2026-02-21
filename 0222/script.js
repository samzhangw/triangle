document.addEventListener('DOMContentLoaded', () => {

    // ============================================
    // ⚠️ 設定：請在此處貼上您的 GAS 網址 (api寫死)
    // ============================================
    const GAS_API_URL = "https://script.google.com/macros/s/AKfycbweL9Cq16M0ujhVaLLG8GXcu2bi5tfc_Ee5qYJcGCvHDDX2H33o6_617oI82yDSRy2h/exec"; 

    // 取得 HTML 元素
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const score1El = document.getElementById('score1');
    const score2El = document.getElementById('score2');
    const player1ScoreBox = document.getElementById('player1-score');
    const player2ScoreBox = document.getElementById('player2-score');
    const gameOverMessage = document.getElementById('game-over-message'); 
    const winnerText = document.getElementById('winner-text'); 
    const confirmLineButton = document.getElementById('confirm-line-button');
    const cancelLineButton = document.getElementById('cancel-line-button');
    const actionBar = document.getElementById('action-bar');
    const setupModeButton = document.getElementById('setup-mode-button');
    const setupActionBar = document.getElementById('setup-action-bar');
    const setupP1Button = document.getElementById('setup-p1-button');
    const setupP2Button = document.getElementById('setup-p2-button');
    const setupClearButton = document.getElementById('setup-clear-button');
    const resetButton = document.getElementById('reset-button');
    const undoButton = document.getElementById('undo-button'); 
    const modalOverlay = document.getElementById('modal-overlay');
    const resetButtonModal = document.getElementById('reset-button-modal');
    const aiThinkingMessage = document.getElementById('ai-thinking-message'); 
    const gameModeSelect = document.getElementById('game-mode-select');
    const boardSizeSelect = document.getElementById('board-size-select');
    const customBoardInputGroup = document.getElementById('custom-board-input-group');
    const customBoardPatternInput = document.getElementById('custom-board-pattern');
    const customNumberPatternInput = document.getElementById('custom-number-pattern');
    const lineLengthSelect = document.getElementById('line-length-select');
    const aiLogContainer = document.getElementById('ai-log-container');
    const aiLogOutput = document.getElementById('ai-log-output');
    const exportLogButton = document.getElementById('export-log-button');
    const finalScoreText = document.getElementById('final-score-text');
    const exportLogButtonModal = document.getElementById('export-log-button-modal');
    const exportPNGButton = document.getElementById('export-png-button');
    const exportPNGButtonModal = document.getElementById('export-png-button-modal');
    const batchCountInput = document.getElementById('batch-count-input');
    const startBatchButton = document.getElementById('start-batch-button');
    const stopBatchButton = document.getElementById('stop-batch-button');
    const batchStatusMessage = document.getElementById('batch-status-message');
    const scoreAndGoCheckbox = document.getElementById('score-and-go-checkbox');
    const allowShorterLinesCheckbox = document.getElementById('allow-shorter-lines-checkbox');
    const inputModeSelect = document.getElementById('input-mode-select');
    const aiP1TypeGroup = document.getElementById('ai-p1-type-group');
    const aiP2TypeGroup = document.getElementById('ai-p2-type-group');
    const aiP1TypeSelect = document.getElementById('ai-p1-type-select');
    const aiP2TypeSelect = document.getElementById('ai-p2-type-select');
    const startPlayerSelect = document.getElementById('start-player-select');
    
    // 訓練相關
    const trainingPanel = document.getElementById('training-panel');
    const openTrainingBtn = document.getElementById('open-training-btn');
    const closeTrainingBtn = document.getElementById('close-training-button');
    const startTrainingBtn = document.getElementById('start-training-btn');
    const stopTrainingBtn = document.getElementById('stop-training-btn');
    const applyWeightsBtn = document.getElementById('apply-weights-btn');
    const trainGenEl = document.getElementById('train-gen');
    const trainFitnessEl = document.getElementById('train-best-fitness');
    const trainProgressBar = document.getElementById('train-progress-bar');
    const trainStatusEl = document.getElementById('train-status');
    const trainPopSizeEl = document.getElementById('train-pop-size');
    const trainGenerationsEl = document.getElementById('train-generations');
    const wScoreEl = document.getElementById('w-score');
    const wThreatEl = document.getElementById('w-threat');
    const wSetupEl = document.getElementById('w-setup');
    const strategyAnalysisContainer = document.getElementById('strategy-analysis-container');
    const strategyKeysList = document.getElementById('strategy-keys-list');
    const strategyBoardCanvasWrapper = document.getElementById('strategy-board-canvas-wrapper');
    
    // 雲端/伺服器相關
    const colabUrlInput = document.getElementById('colab-url-input');
    const useCloudCheckbox = document.getElementById('use-cloud-checkbox');
    const serverStatusHint = document.getElementById('server-status-hint');

    // 連鎖解謎相關
    const puzzlePanel = document.getElementById('puzzle-panel');
    const openPuzzleBtn = document.getElementById('open-puzzle-btn');
    const closePuzzleBtn = document.getElementById('close-puzzle-button');
    const startPuzzleSearchBtn = document.getElementById('start-puzzle-search-btn');
    const stopPuzzleSearchBtn = document.getElementById('stop-puzzle-search-btn');
    const puzzleStatusEl = document.getElementById('puzzle-status');
    const puzzleListEl = document.getElementById('puzzle-list');
    const puzzleMinChainInput = document.getElementById('puzzle-min-chain');
    const clearPuzzleListBtn = document.getElementById('clear-puzzle-list-btn');

    // 數字總和與紀錄相關元素
    const p1SumValEl = document.getElementById('p1-sum-val');
    const p2SumValEl = document.getElementById('p2-sum-val');
    const moveHistoryList = document.getElementById('move-history-list');

    // 回合數顯示元素
    const roundValEl = document.getElementById('round-val');

    let playControls = [
        gameModeSelect, boardSizeSelect, lineLengthSelect, 
        startBatchButton, batchCountInput,
        scoreAndGoCheckbox, allowShorterLinesCheckbox,
        inputModeSelect,
        aiP1TypeSelect, aiP2TypeSelect,
        startPlayerSelect,
        colabUrlInput, useCloudCheckbox,
        customBoardPatternInput,
        customNumberPatternInput
    ];
    
    let uiControls = [
        ...playControls,
        resetButton, undoButton, exportLogButton, exportPNGButton,
        setupModeButton, openTrainingBtn, openPuzzleBtn
    ];

    if (useCloudCheckbox && colabUrlInput) {
        useCloudCheckbox.addEventListener('change', () => {
            colabUrlInput.disabled = !useCloudCheckbox.checked;
            if (useCloudCheckbox.checked) {
                colabUrlInput.focus();
                if (serverStatusHint) serverStatusHint.textContent = "請輸入 Colab 網址 (https://...)";
            } else {
                if (serverStatusHint) serverStatusHint.textContent = "已切換至本機運算 (Web Worker)";
            }
        });
    }

    const isMobile = window.innerWidth < 768;
    let ROW_LENGTHS = []; 
    const DOT_SPACING_X = isMobile ? 60 : 100; 
    const DOT_SPACING_Y = DOT_SPACING_X * Math.sqrt(3) / 2;
    const PADDING = isMobile ? 30 : 50; 
    const DOT_RADIUS = isMobile ? 5 : 6; 
    const LINE_WIDTH = isMobile ? 5 : 6; 
    const CLICK_TOLERANCE_DOT = isMobile ? 20 : 15; 
    const ANGLE_TOLERANCE = 1.5; 

    // --- 3D 相關變數 ---
    let is3DMode = false;
    let angleX = 0.5;
    let angleY = 0.5;
    let isRotating = false;
    let lastRotX = 0;
    let lastRotY = 0;
    const PHI = (1 + Math.sqrt(5)) / 2; 

    function getPolyhedronData(type) {
        let vertices = [], faces = [];
        switch (type) {
            case '3d_tetrahedron':
                vertices = [[1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]];
                faces = [[0,1,2], [0,1,3], [0,2,3], [1,2,3]];
                break;
            case '3d_cube':
                vertices = [[1,1,1], [1,1,-1], [1,-1,1], [1,-1,-1], [-1,1,1], [-1,1,-1], [-1,-1,1], [-1,-1,-1]];
                faces = [[0,1,3,2], [4,5,7,6], [0,1,5,4], [2,3,7,6], [0,2,6,4], [1,3,7,5]];
                break;
            case '3d_octahedron':
                vertices = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
                faces = [[0,2,4], [0,2,5], [0,3,4], [0,3,5], [1,2,4], [1,2,5], [1,3,4], [1,3,5]];
                break;
            case '3d_dodecahedron':
                const phi = (1 + Math.sqrt(5)) / 2;
                const invPhi = 1 / phi;
                vertices = [
                    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
                    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
                    [0, phi, invPhi], [0, phi, -invPhi], [0, -phi, invPhi], [0, -phi, -invPhi],
                    [invPhi, 0, phi], [-invPhi, 0, phi], [invPhi, 0, -phi], [-invPhi, 0, -phi],
                    [phi, invPhi, 0], [phi, -invPhi, 0], [-phi, invPhi, 0], [-phi, -invPhi, 0]
                ];
                faces = [
                    [0, 16, 1, 9, 8], [0, 8, 4, 13, 12], [0, 12, 2, 17, 16],
                    [1, 16, 17, 3, 14], [1, 14, 15, 5, 9], [2, 12, 13, 6, 10],
                    [2, 10, 11, 3, 17], [3, 11, 7, 15, 14], [4, 8, 9, 5, 18],
                    [4, 18, 19, 6, 13], [5, 15, 7, 19, 18], [6, 19, 7, 11, 10]
                ];
                break;
            case '3d_icosahedron':
                const t = (1.0 + Math.sqrt(5.0)) / 2.0;
                vertices = [
                    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
                    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
                ];
                faces = [
                    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
                ];
                break;
        }
        return { vertices, faces };
    }

    function computeRowLengths(size) {
        switch (size) {
            case 'tiny': return [2, 3, 2];
            case 'small_343': return [3, 4, 3];
            case 'medium_454': return [4, 5, 4];
            case 'large_565': return [5, 6, 5];
            case 'small': return [3, 4, 5, 4, 3];
            case 'large': return [5, 6, 7, 8, 9, 8, 7, 6, 5];
            case 'star': return [1, 4, 3, 4, 1];
            case 'medium': default: return [4, 5, 6, 7, 6, 5, 4];
        }
    }

    const PLAYER_COLORS = {
        1: { line: '#3498db', fill: 'rgba(52, 152, 219, 0.4)' },
        2: { line: '#e74c3c', fill: 'rgba(231, 76, 60, 0.4)' },
        0: { line: '#95a5a6', fill: 'rgba(149, 165, 166, 0.2)' } 
    };
    const DEFAULT_LINE_COLOR = '#e0e0e0';

    let currentPlayer = 1;
    let scores = { 1: 0, 2: 0 };
    let p1PointSum = 0;
    let p2PointSum = 0;
    let currentRound = 1;

    let dots = []; 
    let lines = {}; 
    let triangles = [];
    let totalTriangles = 0;
    let selectedDot1 = null;
    let selectedDot2 = null;
    let gameMode = 0; 
    let REQUIRED_LINE_LENGTH = 1; 
    let isScoreAndGoAgain = false;
    let isAllowShorterLines = false;
    let inputMode = 'drag'; 
    let isSetupMode = false;
    let isDrawing = false; 
    let gameHistoryLog = {};
    let turnCounter = 1; 
    let pngStepLog = []; 
    let isBatchRunning = false;
    let batchLog = []; 
    let batchTotalGames = 0;
    let batchGamesCompleted = 0;
    let savedBatchLayout = null; 
    let sortedLineIds = []; 
    let isTraining = false;
    let trainingPopulation = [];
    let currentGeneration = 0;
    let maxGenerations = 50;
    let bestWeightsSoFar = null; 
    let undoStack = [];
    const MAX_UNDO_DEPTH = 50;

    let isPuzzleSearching = false;
    let foundPuzzles = [];

    let aiWorker = null;
    let isAIThinking = false; 
    
    function initializeAIWorker() {
        if (aiWorker) {
            aiWorker.terminate();
        }
        aiWorker = new Worker('ai-worker.js');
        aiWorker.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'log') {
                logAI(data.message);
            } else if (data.type === 'progress') {
                logAI(data.message);
            } else if (data.type === 'search_progress') {
                if (puzzleStatusEl) {
                    puzzleStatusEl.textContent = `🔍 搜尋中... (已模擬 ${data.count} 場局)`;
                    puzzleStatusEl.style.color = (data.count % 1000 === 0) ? "#27ae60" : "#2ecc71";
                }
            } else if (data.type === 'result') {
                isAIThinking = false; 
                const endTime = performance.now();
                const duration = (endTime - aiStartTime) / 1000;
                if (!isBatchRunning) {
                    logAI(`--- (本機) 總耗時: ${duration.toFixed(2)} 秒 ---`);
                }
                handleAIMoveResult(data.bestMove);
            } else if (data.type === 'training_result') {
                handleTrainingGenerationComplete(data.population, data.bestAgentBoard);
            } else if (data.type === 'chain_puzzle_found') {
                handlePuzzleFound(data.puzzleData);
            }
        };
        aiWorker.onerror = (e) => {
            logAI(`--- [Worker 錯誤] ${e.message} ---`);
            console.error("AI Worker Error:", e);
            isAIThinking = false;
            if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');
            if (isBatchRunning) {
                isBatchRunning = false;
                toggleUIControls(true);
                startBatchButton.classList.remove('hidden');
                stopBatchButton.classList.add('hidden');
                batchStatusMessage.textContent = "批次對戰因錯誤已中止。";
            }
        };
    }
    
    function logAI(message) {
        if (isBatchRunning || isPuzzleSearching) return;
        if (aiLogOutput) {
            aiLogOutput.textContent += message + '\n';
            aiLogOutput.scrollTop = aiLogOutput.scrollHeight;
        }
    }
    function clearAILog() {
        if (aiLogOutput) aiLogOutput.textContent = '';
    }

    function getLineId(dot1, dot2) {
        if (!dot1 || !dot2) return null;
        let d1 = dot1, d2 = dot2;
        if (dot1.r > dot2.r || (dot1.r === dot2.r && dot1.c > dot2.c)) {
            d1 = dot2;
            d2 = dot1;
        }
        return `${d1.r},${d1.c}_${d2.r},${d2.c}`;
    }

    function updateAITypeVisibility() {
        const mode = parseInt(gameModeSelect.value, 10);
        aiP1TypeGroup.classList.add('hidden');
        aiP2TypeGroup.classList.add('hidden');
        if (mode === 1) aiP2TypeGroup.classList.remove('hidden');
        else if (mode === 2) {
            aiP1TypeGroup.classList.remove('hidden');
            aiP2TypeGroup.classList.remove('hidden');
        }
    }

    function updateRoundUI() {
        if (roundValEl) roundValEl.textContent = currentRound;
    }

    function initGame() {
        if (isSetupMode) {
            isSetupMode = false;
            setupModeButton.textContent = '進入佈局模式';
            setupModeButton.classList.remove('success');
            setupModeButton.classList.add('primary');
            togglePlayControls(true); 
            setupActionBar.classList.add('hidden');
        }

        undoStack = [];
        updateUndoButtonState();
        
        try {
            initializeAIWorker();
        } catch (e) {
            console.error("無法初始化 AI Worker:", e);
            alert("錯誤：無法載入 AI Worker。請確保您是透過 http:// (本地伺服器) 執行，而不是 file:/// (直接開啟檔案)。");
            return;
        }
        isAIThinking = false;
        
        if (!isBatchRunning) {
            batchLog = [];
            pngStepLog = [];
        }
        
        isScoreAndGoAgain = scoreAndGoCheckbox.checked;
        isAllowShorterLines = allowShorterLinesCheckbox ? allowShorterLinesCheckbox.checked : false;
        inputMode = inputModeSelect.value;
        updateAITypeVisibility();
        
        turnCounter = 1;
        currentRound = 1;
        updateRoundUI();

        gameMode = isBatchRunning ? 2 : parseInt(gameModeSelect.value, 10);
        
        const sizeValue = (boardSizeSelect && boardSizeSelect.value) ? boardSizeSelect.value : 'medium';
        is3DMode = sizeValue.startsWith('3d_');

        gameHistoryLog = {
            settings: {
                boardSize: sizeValue,
                lineLength: lineLengthSelect.value,
                gameMode: isBatchRunning ? "電腦 V.S. 電腦" : gameModeSelect.options[gameModeSelect.selectedIndex].text,
                startPlayer: startPlayerSelect.options[startPlayerSelect.selectedIndex].text, 
                aiTypeP1: gameMode === 2 ? aiP1TypeSelect.value : null,
                aiTypeP2: gameMode === 1 || gameMode === 2 ? aiP2TypeSelect.value : null,
                isScoreAndGoAgain: isScoreAndGoAgain, 
                allowShorterLines: isAllowShorterLines,
                inputMode: inputMode, 
                dateTime: new Date().toISOString()
            },
            turns: [],
            summary: {}
        };

        if (sizeValue === 'custom') {
            const patternStr = customBoardPatternInput.value || "3,4,3";
            try {
                ROW_LENGTHS = patternStr.split(/[,，\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
                if (ROW_LENGTHS.length === 0) ROW_LENGTHS = [3, 4, 3];
            } catch (e) {
                console.error("解析自訂棋盤失敗", e);
                ROW_LENGTHS = [3, 4, 3];
            }
        } else if (is3DMode) {
            ROW_LENGTHS = [1]; 
            angleX = 0.5;
            angleY = 0.5;
        } else {
            ROW_LENGTHS = computeRowLengths(sizeValue);
        }
        
        const lengthValue = (lineLengthSelect && lineLengthSelect.value) ? lineLengthSelect.value : '1';
        REQUIRED_LINE_LENGTH = parseInt(lengthValue, 10);

        if (is3DMode) {
            canvas.width = 600;
            canvas.height = 600;
        } else {
            const gridWidth = (Math.max(...ROW_LENGTHS) - 1) * DOT_SPACING_X;
            const gridHeight = (ROW_LENGTHS.length - 1) * DOT_SPACING_Y;
            canvas.width = gridWidth + PADDING * 2;
            canvas.height = gridHeight + PADDING * 2;
        }

        const startPlayerValue = startPlayerSelect.value;
        currentPlayer = (startPlayerValue === '2') ? 2 : 1;
        
        scores = { 1: 0, 2: 0 };
        p1PointSum = 0;
        p2PointSum = 0;
        updatePointSumUI();
        clearMoveHistoryUI();

        dots = [];
        lines = {};
        triangles = [];
        totalTriangles = 0;
        selectedDot1 = null;
        selectedDot2 = null;
        
        if (actionBar) actionBar.classList.remove('visible'); 
        modalOverlay.classList.add('hidden'); 
        if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');
        if (aiLogContainer && !isBatchRunning) aiLogContainer.classList.add('hidden');
        clearAILog();

        let customNumbers = [];
        if (customNumberPatternInput && customNumberPatternInput.value.trim() !== "") {
            customNumbers = customNumberPatternInput.value.split(/[,，\s]+/)
                .map(s => parseInt(s.trim(), 10))
                .filter(n => !isNaN(n));
        }

        if (is3DMode) {
            const polyData = getPolyhedronData(sizeValue);
            dots = [[]]; 
            let globalDotCounter = 0;

            polyData.vertices.forEach((v, idx) => {
                let dotNumber;
                if (customNumbers.length > 0) {
                    dotNumber = customNumbers[globalDotCounter % customNumbers.length];
                } else {
                    dotNumber = (idx % 3) + 1;
                }
                globalDotCounter++;

                dots[0].push({
                    x3d: v[0], y3d: v[1], z3d: v[2],
                    x: 0, y: 0, r: 0, c: idx, id: `0,${idx}`, number: dotNumber
                });
            });

            polyData.faces.forEach(face => {
                let lineKeys = [];
                let faceDots = [];
                for (let i = 0; i < face.length; i++) {
                    let d1 = dots[0][face[i]];
                    let d2 = dots[0][face[(i + 1) % face.length]];
                    let id = getLineId(d1, d2);
                    if (!lines[id]) {
                        lines[id] = { p1: d1, p2: d2, drawn: false, player: 0, sharedBy: 0, id: id };
                    }
                    if (!lineKeys.includes(id)) {
                        lineKeys.push(id);
                    }
                }
                face.forEach(idx => faceDots.push(dots[0][idx]));
                triangles.push({ lineKeys: lineKeys, dots: faceDots, filled: false, player: 0 });
                totalTriangles++;
            });

            sortedLineIds = Object.keys(lines).sort();

        } else {
            const rowOffsets = new Array(ROW_LENGTHS.length).fill(0);
            const midRow = Math.floor(ROW_LENGTHS.length / 2);
            const midCol = Math.floor(ROW_LENGTHS[midRow] / 2);
            
            rowOffsets[midRow] = (2 - (midCol % 3) + 3) % 3;

            for (let r = midRow - 1; r >= 0; r--) {
                const lenCurr = ROW_LENGTHS[r];
                const lenNext = ROW_LENGTHS[r+1];
                if (lenNext > lenCurr) {
                    rowOffsets[r] = (rowOffsets[r+1] - 1 + 3) % 3;
                } else {
                    rowOffsets[r] = (rowOffsets[r+1] - 2 + 3) % 3;
                }
            }

            for (let r = midRow; r < ROW_LENGTHS.length - 1; r++) {
                const lenCurr = ROW_LENGTHS[r];
                const lenNext = ROW_LENGTHS[r+1];
                if (lenNext > lenCurr) {
                    rowOffsets[r+1] = (rowOffsets[r] + 1) % 3;
                } else {
                    rowOffsets[r+1] = (rowOffsets[r] + 2) % 3;
                }
            }

            let globalDotCounter = 0; 

            ROW_LENGTHS.forEach((len, r) => {
                dots[r] = [];
                const rowWidth = (len - 1) * DOT_SPACING_X;
                const offsetX = (canvas.width - rowWidth) / 2;
                for (let c = 0; c < len; c++) {
                    let dotNumber;
                    if (customNumbers.length > 0) {
                        dotNumber = customNumbers[globalDotCounter % customNumbers.length];
                    } else {
                        dotNumber = (rowOffsets[r] + c) % 3 + 1;
                    }
                    globalDotCounter++;

                    dots[r][c] = {
                        x: c * DOT_SPACING_X + offsetX,
                        y: r * DOT_SPACING_Y + PADDING,
                        r: r, c: c,
                        id: `${r},${c}`, 
                        number: dotNumber 
                    };
                }
            });

            lines = {};
            for (let r = 0; r < ROW_LENGTHS.length; r++) {
                for (let c = 0; c < ROW_LENGTHS[r]; c++) {
                    const d1 = dots[r][c];

                    if (c < ROW_LENGTHS[r] - 1) {
                        const d2 = dots[r][c + 1];
                        const id = getLineId(d1, d2);
                        lines[id] = { p1: d1, p2: d2, drawn: false, player: 0, sharedBy: 0, id: id };
                    }

                    if (r < ROW_LENGTHS.length - 1) {
                        const len1 = ROW_LENGTHS[r];
                        const len2 = ROW_LENGTHS[r+1];
                        const shift = (len2 - len1) / 2;
                        const leftIndex = Math.floor(c + shift);
                        const rightIndex = Math.ceil(c + shift);
                        
                        if (leftIndex >= 0 && leftIndex < len2) {
                            const d_dl = dots[r + 1][leftIndex];
                            const id_dl = getLineId(d1, d_dl);
                            lines[id_dl] = { p1: d1, p2: d_dl, drawn: false, player: 0, sharedBy: 0, id: id_dl };
                        }
                        
                        if (rightIndex >= 0 && rightIndex < len2 && rightIndex !== leftIndex) {
                            const d_dr = dots[r + 1][rightIndex];
                            const id_dr = getLineId(d1, d_dr);
                            lines[id_dr] = { p1: d1, p2: d_dr, drawn: false, player: 0, sharedBy: 0, id: id_dr };
                        }
                    }
                }
            }
            
            sortedLineIds = Object.keys(lines).sort();

            triangles = [];
            totalTriangles = 0;
            const allDots = dots.flat();
            for (let i = 0; i < allDots.length; i++) {
                for (let j = i + 1; j < allDots.length; j++) {
                    for (let k = j + 1; k < allDots.length; k++) {
                        const d1 = allDots[i];
                        const d2 = allDots[j];
                        const d3 = allDots[k];
                        
                        if (isValidTriangle(d1, d2, d3)) {
                             triangles.push({
                                lineKeys: [getLineId(d1, d2), getLineId(d1, d3), getLineId(d2, d3)],
                                dots: [d1, d2, d3],
                                filled: false, player: 0
                            });
                            totalTriangles++;
                        }
                    }
                }
            }
        }
        
        if (isBatchRunning && savedBatchLayout && savedBatchLayout.length > 0) {
            savedBatchLayout.forEach(item => {
                if (lines[item.id]) {
                    lines[item.id].drawn = true;
                    lines[item.id].player = item.player;
                    lines[item.id].sharedBy = item.sharedBy;
                }
            });
            recalculateBoardStatus();
            gameHistoryLog.settings.startedFromLayout = true;
            gameHistoryLog.turns.push({
                turn: 0,
                round: 0, 
                player: "System",
                playerType: "Layout (Batch)", 
                move: "從佈局開始 (批次)",
                segmentsDrawn: [], 
                scoreGained: 0,
                trianglesCompleted: [], 
                newScoreP1: scores[1],
                newScoreP2: scores[2],
                stateBefore: "", 
                stateAfter: getBoardStateString(lines),
                lineSum: 0,
                lineCalc: "",       
                p1TotalPointSum: 0, 
                p2TotalPointSum: 0  
            });
        }
        
        updateUI();
        drawCanvas();
        
        if (customNumbers.length > 0) {
            saveBoardNumbersToGAS();
        }

        removeCanvasListeners(); 
        if (inputMode === 'drag') {
            bindDragListeners();
        } else {
            bindClickListeners();
        }
        
        if (isBatchRunning && (scores[1] + scores[2] === totalTriangles)) {
             logAI(`--- 從佈局開始 (批次)，但遊戲已結束 ---`);
             endGame();
             return;
        }

        const isP1AI = (gameMode === 2);
        const isP2AI = (gameMode === 1 || gameMode === 2);
        let isStartingPlayerAI = false;
        if (currentPlayer === 1 && isP1AI) {
            isStartingPlayerAI = true;
        } else if (currentPlayer === 2 && isP2AI) {
            isStartingPlayerAI = true;
        }

        if (isStartingPlayerAI) {
            triggerAIMove();
        } else {
            const allMoves = findAllValidMoves(lines);
            if (allMoves.length === 0) {
                logAI(`--- 遊戲開始，但玩家 ${currentPlayer} 已無棋可走 ---`);
                if (aiLogContainer) aiLogContainer.classList.remove('hidden');
                endGame();
                return;
            }
        }
    }
    
    function saveBoardNumbersToGAS() {
        if (!GAS_API_URL || GAS_API_URL.includes("YOUR_GAS_WEB_APP_URL_HERE") || GAS_API_URL.length < 20) {
            return;
        }
        const numbers = dots.map(row => row.map(d => d.number));
        const payload = {
            boardSize: boardSizeSelect.value,
            customPattern: customNumberPatternInput ? customNumberPatternInput.value : "",
            numbers: numbers
        };
        fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error("❌ 無法傳送至 GAS:", err));
    }

    function loadBoardFromCloud() {
        if (!GAS_API_URL || GAS_API_URL.includes("YOUR_GAS_WEB_APP_URL_HERE") || GAS_API_URL.length < 20) {
            return;
        }

        fetch(GAS_API_URL) 
        .then(response => response.json())
        .then(data => {
            if (data.status === "success" && data.pattern) {
                if (customNumberPatternInput) {
                    customNumberPatternInput.value = data.pattern;
                }
                initGame();
            }
        })
        .catch(err => {
            console.error("雲端讀取失敗:", err);
        });
    }

    function isValidTriangle(d1, d2, d3) {
        const l1 = lines[getLineId(d1, d2)];
        const l2 = lines[getLineId(d1, d3)];
        const l3 = lines[getLineId(d2, d3)];
        return l1 && l2 && l3;
    }

    function drawCanvas() {
        if (is3DMode) {
            dots[0].forEach(dot => {
                let y1 = dot.y3d * Math.cos(angleX) - dot.z3d * Math.sin(angleX);
                let z1 = dot.y3d * Math.sin(angleX) + dot.z3d * Math.cos(angleX);
                let x2 = dot.x3d * Math.cos(angleY) + z1 * Math.sin(angleY);
                let z2 = -dot.x3d * Math.sin(angleY) + z1 * Math.cos(angleY);

                let zOffset = 5; 
                let scaleFactor = isMobile ? 80 : 120; 
                let scale = scaleFactor / (zOffset + z2);

                dot.x = canvas.width / 2 + x2 * scale * 2.5;
                dot.y = canvas.height / 2 + y1 * scale * 2.5;
            });
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        triangles.forEach(tri => {
            if (tri.filled) {
                ctx.beginPath();
                ctx.moveTo(tri.dots[0].x, tri.dots[0].y);
                for (let i = 1; i < tri.dots.length; i++) {
                    ctx.lineTo(tri.dots[i].x, tri.dots[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = PLAYER_COLORS[tri.player].fill;
                ctx.fill();
            } 
            else {
                let cx = 0, cy = 0;
                tri.dots.forEach(d => { cx += d.x; cy += d.y; });
                cx /= tri.dots.length;
                cy /= tri.dots.length;

                ctx.beginPath();
                ctx.arc(cx, cy, 4, 0, 2 * Math.PI); 
                ctx.fillStyle = '#95a5a6'; 
                ctx.fill();

                tri.lineKeys.forEach(key => {
                    const line = lines[key];
                    if (line && !line.drawn) {
                        const mx = (line.p1.x + line.p2.x) / 2;
                        const my = (line.p1.y + line.p2.y) / 2;

                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(mx, my);
                        ctx.strokeStyle = '#bdc3c7'; 
                        ctx.lineWidth = 2;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                    }
                });
            }
        });
        
        for (const id in lines) {
            const line = lines[id];
            
            if (line.drawn) {
                if (line.sharedBy !== 0 && line.sharedBy !== line.player) {
                    const dx = line.p2.x - line.p1.x;
                    const dy = line.p2.y - line.p1.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    const offsetX = -dy / len;
                    const offsetY = dx / len;
                    const offset = LINE_WIDTH / 3; 
                    const halfWidth = LINE_WIDTH / 2; 
                    
                    ctx.beginPath();
                    ctx.moveTo(line.p1.x + offsetX * offset, line.p1.y + offsetY * offset);
                    ctx.lineTo(line.p2.x + offsetX * offset, line.p2.y + offsetY * offset);
                    ctx.strokeStyle = PLAYER_COLORS[line.player].line;
                    ctx.lineWidth = halfWidth;
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(line.p1.x - offsetX * offset, line.p1.y - offsetY * offset);
                    ctx.lineTo(line.p2.x - offsetX * offset, line.p2.y - offsetY * offset);
                    ctx.strokeStyle = PLAYER_COLORS[line.sharedBy].line;
                    ctx.lineWidth = halfWidth;
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(line.p1.x, line.p1.y);
                    ctx.lineTo(line.p2.x, line.p2.y);
                    ctx.strokeStyle = PLAYER_COLORS[line.player].line;
                    ctx.lineWidth = LINE_WIDTH;
                    ctx.stroke();
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(line.p1.x, line.p1.y);
                ctx.lineTo(line.p2.x, line.p2.y);
                ctx.strokeStyle = DEFAULT_LINE_COLOR;
                ctx.lineWidth = 2; 
                ctx.setLineDash([2, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        dots.forEach(row => {
            row.forEach(dot => {
                if (dot.number > 0) {
                    ctx.fillStyle = '#2c3e50'; 
                    ctx.font = `bold ${isMobile ? 12 : 14}px "Nunito", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom'; 
                    ctx.fillText(dot.number, dot.x, dot.y - DOT_RADIUS - (isMobile ? 1 : 2)); 
                }
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, 2 * Math.PI); 
                ctx.fillStyle = '#34495e';
                ctx.fill();
            });
        });

        if (selectedDot1) {
            ctx.beginPath();
            ctx.arc(selectedDot1.x, selectedDot1.y, DOT_RADIUS + 3, 0, 2 * Math.PI);
            ctx.strokeStyle = isSetupMode ? PLAYER_COLORS[0].line : PLAYER_COLORS[currentPlayer].line;
            ctx.lineWidth = 4; 
            ctx.stroke();
        }
        if (selectedDot2) {
            ctx.beginPath();
            ctx.arc(selectedDot2.x, selectedDot2.y, DOT_RADIUS + 3, 0, 2 * Math.PI);
            ctx.strokeStyle = isSetupMode ? PLAYER_COLORS[0].line : PLAYER_COLORS[currentPlayer].line;
            ctx.lineWidth = 4; 
            ctx.stroke();
        }
        
        const isValidPreview = isSetupMode ? 
            isValidSetupLine(selectedDot1, selectedDot2) : 
            isValidPreviewLine(selectedDot1, selectedDot2, lines);

        if (selectedDot1 && selectedDot2 && isValidPreview) {
            ctx.beginPath();
            ctx.moveTo(selectedDot1.x, selectedDot1.y);
            ctx.lineTo(selectedDot2.x, selectedDot2.y);
            ctx.strokeStyle = isSetupMode ? PLAYER_COLORS[0].line : PLAYER_COLORS[currentPlayer].line;
            ctx.lineWidth = 4; 
            ctx.setLineDash([8, 4]); 
            ctx.stroke();
            ctx.setLineDash([]); 
        }
    }
    
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const mouseX = (clientX - rect.left) * scaleX;
        const mouseY = (clientY - rect.top) * scaleY;
        return { x: mouseX, y: mouseY };
    }

    function handlePointerDown(e) {
        if (isSetupMode) return; 
        if (isBatchRunning || isAIThinking) return;
        const isP1AI = (gameMode === 2);
        const isP2AI = (gameMode === 1 || gameMode === 2);
        if ((currentPlayer === 1 && isP1AI) || (currentPlayer === 2 && isP2AI)) {
            return;
        }
        
        const pos = getMousePos(e);
        const clickedDot = findNearestDot(pos.x, pos.y);
        
        if (clickedDot) {
            if (inputMode === 'drag') {
                e.preventDefault();
                isDrawing = true;
                selectedDot1 = clickedDot;
                selectedDot2 = null;
                drawCanvas(); 
            }
        } else if (is3DMode) {
            e.preventDefault();
            isRotating = true;
            lastRotX = pos.x;
            lastRotY = pos.y;
        }
    }
    
    function handlePointerMove(e) {
        if (!isDrawing && !isRotating) return;
        e.preventDefault();
        const pos = getMousePos(e);
        
        if (isDrawing && inputMode === 'drag') {
            const hoverDot = findNearestDot(pos.x, pos.y);
            if (hoverDot && hoverDot !== selectedDot1) {
                selectedDot2 = hoverDot;
            } else {
                selectedDot2 = null;
            }
            drawCanvas();
        } else if (isRotating && is3DMode) {
            const dx = pos.x - lastRotX;
            const dy = pos.y - lastRotY;
            angleY += dx * 0.01; 
            angleX -= dy * 0.01; 
            lastRotX = pos.x;
            lastRotY = pos.y;
            drawCanvas(); 
        }
    }

    function handlePointerEnd(e) {
        if (isRotating) {
            isRotating = false;
            return;
        }
        if (isDrawing && inputMode === 'drag') {
            isDrawing = false;
            if (selectedDot1 && selectedDot2 && isValidPreviewLine(selectedDot1, selectedDot2, lines)) {
                confirmLine();
            } else {
                cancelLine();
            }
        }
    }
    
    function handlePointerLeave(e) {
        if (isRotating) {
            isRotating = false;
        }
        if (isDrawing && inputMode === 'drag') {
            isDrawing = false;
            cancelLine();
        }
    }

    function handleCanvasClick(e) {
        if (isSetupMode) {
            handleSetupDotClick(e);
            return;
        }
        if (isBatchRunning || isAIThinking) return;
        const isP1AI = (gameMode === 2);
        const isP2AI = (gameMode === 1 || gameMode === 2);
        if ((currentPlayer === 1 && isP1AI) || (currentPlayer === 2 && isP2AI)) {
            return;
        }
        if (actionBar && actionBar.classList.contains('visible')) {
            return;
        }
        const pos = getMousePos(e);
        const clickedDot = findNearestDot(pos.x, pos.y);
        
        if (!clickedDot) {
            if (selectedDot1) cancelLine(); 
            return;
        }
        if (selectedDot1 === null) {
            selectedDot1 = clickedDot;
        } 
        else if (selectedDot2 === null) {
            if (clickedDot === selectedDot1) {
                cancelLine(); 
            } else {
                if (isValidPreviewLine(selectedDot1, clickedDot, lines)) {
                    selectedDot2 = clickedDot;
                    if (actionBar) actionBar.classList.add('visible'); 
                } else {
                    cancelLine();
                }
            }
        }
        drawCanvas();
    }

    function removeCanvasListeners() {
        canvas.removeEventListener('mousedown', handlePointerDown);
        canvas.removeEventListener('mousemove', handlePointerMove);
        canvas.removeEventListener('mouseup', handlePointerEnd);
        canvas.removeEventListener('mouseleave', handlePointerLeave);
        canvas.removeEventListener('touchstart', handlePointerDown);
        canvas.removeEventListener('touchmove', handlePointerMove);
        canvas.removeEventListener('touchend', handlePointerEnd);
        canvas.removeEventListener('click', handleCanvasClick); 
    }

    function bindDragListeners() {
        canvas.addEventListener('mousedown', handlePointerDown);
        canvas.addEventListener('mousemove', handlePointerMove);
        canvas.addEventListener('mouseup', handlePointerEnd);
        canvas.addEventListener('mouseleave', handlePointerLeave);
        canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
        canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
        canvas.addEventListener('touchend', handlePointerEnd);
    }

    function bindClickListeners() {
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousedown', handlePointerDown);
        canvas.addEventListener('mousemove', handlePointerMove);
        canvas.addEventListener('mouseup', handlePointerEnd);
        canvas.addEventListener('mouseleave', handlePointerLeave);
        canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
        canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
        canvas.addEventListener('touchend', handlePointerEnd);
    }

    function togglePlayControls(isEnabled) {
        playControls.forEach(control => {
            if (control) control.disabled = !isEnabled;
        });
    }

    function toggleSetupMode() {
        isSetupMode = !isSetupMode;
        if (isSetupMode) {
            initGame(); 
            isSetupMode = true; 
            setupModeButton.textContent = '完成佈局並開始';
            setupModeButton.classList.remove('primary');
            setupModeButton.classList.add('success');
            togglePlayControls(false); 
            setupActionBar.classList.remove('hidden');
            actionBar.classList.remove('visible'); 
            cancelLine();
            removeCanvasListeners();
            bindClickListeners(); 
        } else {
            setupModeButton.textContent = '進入佈局模式';
            setupModeButton.classList.remove('success');
            setupModeButton.classList.add('primary');
            togglePlayControls(true); 
            setupActionBar.classList.add('hidden');
            cancelSetupLine();
            startGameFromLayout(); 
        }
    }

    function handleSetupDotClick(e) {
        const pos = getMousePos(e);
        const clickedDot = findNearestDot(pos.x, pos.y);
        if (!clickedDot) {
            cancelSetupLine();
            return;
        }
        if (selectedDot1 === null) {
            selectedDot1 = clickedDot;
        } 
        else if (selectedDot2 === null) {
            if (clickedDot === selectedDot1) {
                cancelSetupLine(); 
            } else {
                if (isValidSetupLine(selectedDot1, clickedDot)) { 
                    selectedDot2 = clickedDot;
                } else {
                    cancelSetupLine();
                }
            }
        }
        drawCanvas();
    }
    
    function isValidSetupLine(dotA, dotB) {
        if (!dotA || !dotB) return false;
        const allDotsOnLine = findIntermediateDots(dotA, dotB);
        const segmentIds = [];
        for (let i = 0; i < allDotsOnLine.length - 1; i++) {
            segmentIds.push(getLineId(allDotsOnLine[i], allDotsOnLine[i+1]));
        }
        if (segmentIds.length === 0) return false; 
        return segmentIds.every(id => !!lines[id]);
    }
    
    function applySetupLine(player) {
        if (!selectedDot1 || !selectedDot2) return;
        if (!isValidSetupLine(selectedDot1, selectedDot2)) {
             cancelSetupLine();
             return;
        }
        const allDotsOnLine = findIntermediateDots(selectedDot1, selectedDot2);
        const segmentIds = [];
        for (let i = 0; i < allDotsOnLine.length - 1; i++) {
            segmentIds.push(getLineId(allDotsOnLine[i], allDotsOnLine[i+1]));
        }

        for (const id of segmentIds) {
            if (player === 1) {
                lines[id].drawn = true;
                lines[id].player = 1;
                lines[id].sharedBy = 0; 
            } else if (player === 2) {
                lines[id].drawn = true;
                lines[id].player = 2;
                lines[id].sharedBy = 0; 
            } else { // player === 0
                lines[id].drawn = false;
                lines[id].player = 0;
                lines[id].sharedBy = 0;
            }
        }
        cancelSetupLine(); 
        drawCanvas(); 
    }
    
    function cancelSetupLine() {
        selectedDot1 = null;
        selectedDot2 = null;
        drawCanvas();
    }
    
    function recalculateBoardStatus() {
        scores = { 1: 0, 2: 0 };
        let totalFilledThisGame = 0;
        
        triangles.forEach(tri => {
            const isComplete = tri.lineKeys.every(key => lines[key] && lines[key].drawn);
            if (isComplete) {
                let p1Lines = 0;
                let p2Lines = 0;
                tri.lineKeys.forEach(key => {
                    if (lines[key].player === 1) p1Lines++;
                    if (lines[key].player === 2) p2Lines++;
                    if (lines[key].sharedBy === 1) p1Lines++;
                    if (lines[key].sharedBy === 2) p2Lines++;
                });

                let owner = 0;
                if (p1Lines > p2Lines) owner = 1;
                else if (p2Lines > p1Lines) owner = 2;
                
                tri.filled = true;
                tri.player = owner;
                if (owner !== 0) {
                    scores[owner]++;
                }
                totalFilledThisGame++;
                
            } else {
                tri.filled = false;
                tri.player = 0;
            }
        });
        return totalFilledThisGame;
    }

    function startGameFromLayout() {
        removeCanvasListeners();
        if (inputModeSelect.value === 'drag') bindDragListeners();
        else bindClickListeners();

        const totalFilledThisGame = recalculateBoardStatus();
        
        gameMode = parseInt(gameModeSelect.value, 10);
        isScoreAndGoAgain = scoreAndGoCheckbox.checked;
        isAllowShorterLines = allowShorterLinesCheckbox.checked;
        inputMode = inputModeSelect.value;
        currentPlayer = parseInt(startPlayerSelect.value, 10);
        
        turnCounter = 1;
        currentRound = 1;
        updateRoundUI();

        pngStepLog = [];
        undoStack = [];
        updateUndoButtonState();

        gameHistoryLog = {
            settings: {
                boardSize: boardSizeSelect.value,
                lineLength: lineLengthSelect.value,
                gameMode: gameModeSelect.options[gameModeSelect.selectedIndex].text,
                startPlayer: startPlayerSelect.options[startPlayerSelect.selectedIndex].text, 
                aiTypeP1: gameMode === 2 ? aiP1TypeSelect.value : null,
                aiTypeP2: gameMode === 1 || gameMode === 2 ? aiP2TypeSelect.value : null,
                isScoreAndGoAgain: isScoreAndGoAgain, 
                allowShorterLines: isAllowShorterLines,
                inputMode: inputMode, 
                dateTime: new Date().toISOString(),
                startedFromLayout: true
            },
            turns: [
                {
                    turn: 0,
                    round: 0, 
                    player: "System",
                    playerType: "Layout", 
                    move: "從佈局開始",
                    segmentsDrawn: [], 
                    scoreGained: 0,
                    trianglesCompleted: [], 
                    newScoreP1: scores[1],
                    newScoreP2: scores[2],
                    stateBefore: "", 
                    stateAfter: getBoardStateString(lines),
                    lineSum: 0,
                    lineCalc: "",       
                    p1TotalPointSum: 0, 
                    p2TotalPointSum: 0  
                }
            ],
            summary: {}
        };
        
        updateAITypeVisibility();
        updateUI();
        drawCanvas();
        
        if (totalFilledThisGame === totalTriangles) {
            logAI(`--- 從佈局開始，但遊戲已結束 ---`);
            endGame();
            return;
        }

        const isP1AI = (gameMode === 2);
        const isP2AI = (gameMode === 1 || gameMode === 2);
        let isStartingPlayerAI = false;
        if (currentPlayer === 1 && isP1AI) {
            isStartingPlayerAI = true;
        } else if (currentPlayer === 2 && isP2AI) {
            isStartingPlayerAI = true;
        }

        if (isStartingPlayerAI) {
            triggerAIMove();
        } else {
            const allMoves = findAllValidMoves(lines);
            if (allMoves.length === 0) {
                logAI(`--- 從佈局開始，但玩家 ${currentPlayer} 已無棋可走 ---`);
                if (aiLogContainer) aiLogContainer.classList.remove('hidden');
                endGame();
                return;
            }
        }
    }

    function confirmLine() {
        if (!selectedDot1 || !selectedDot2) return;
        if (!isValidPreviewLine(selectedDot1, selectedDot2, lines)) {
            cancelLine(); 
            return;
        }
        
        saveGameState();
        
        const moveResult = applyMoveToBoard(selectedDot1, selectedDot2, currentPlayer);

        if (!moveResult.newSegmentDrawn) {
            cancelLine();
            undoStack.pop(); 
            updateUndoButtonState();
            return;
        }

        selectedDot1 = null;
        selectedDot2 = null;
        
        if (inputMode === 'click' && actionBar) {
            actionBar.classList.remove('visible');
        }
        
        drawCanvas();

        if (!isBatchRunning) {
            const turnID = turnCounter - 1; 
            exportCanvasAsPNG(null, turnID); 
        }
        
        updateUI(); 

        if (moveResult.gameEnded) {
            endGame();
            return;
        }
        
        if (moveResult.scoreGained > 0 && isScoreAndGoAgain) {
            logAI(`--- 玩家 ${currentPlayer} 得分，再走一次 ---`);
            const isP1AI = (gameMode === 2);
            const isP2AI = (gameMode === 1 || gameMode === 2);
            if ((currentPlayer === 1 && isP1AI) || (currentPlayer === 2 && isP2AI)) {
                if (isBatchRunning) {
                    setTimeout(triggerAIMove, 10);
                } else {
                    triggerAIMove();
                }
            }
        } else {
            switchPlayer();
        }
    }

    function cancelLine() {
        selectedDot1 = null;
        selectedDot2 = null;
        if (inputMode === 'click' && actionBar) {
            actionBar.classList.remove('visible');
        }
        drawCanvas();
    }

    function isClose(val, target) {
        return Math.abs(val - target) < ANGLE_TOLERANCE;
    }

    function findNearestDot(mouseX, mouseY) {
        let nearestDot = null;
        let minDisSq = CLICK_TOLERANCE_DOT ** 2; 
        dots.forEach(row => {
            row.forEach(dot => {
                const distSq = (mouseX - dot.x) ** 2 + (mouseY - dot.y) ** 2;
                if (distSq < minDisSq) {
                    minDisSq = distSq;
                    nearestDot = dot;
                }
            });
        });
        return nearestDot;
    }

    function findIntermediateDots(dotA, dotB) {
        if (is3DMode) {
            return [dotA, dotB];
        }
        const intermediateDots = [];
        const minX = Math.min(dotA.x, dotB.x) - 1;
        const maxX = Math.max(dotA.x, dotB.x) + 1;
        const minY = Math.min(dotA.y, dotB.y) - 1;
        const maxY = Math.max(dotA.y, dotB.y) + 1;
        const EPSILON = 1e-6; 

        dots.flat().forEach(dot => {
            if (dot.x >= minX && dot.x <= maxX && dot.y >= minY && dot.y <= maxY) {
                const crossProduct = (dotB.y - dotA.y) * (dot.x - dotB.x) - (dot.y - dotB.y) * (dotB.x - dotA.x);
                if (Math.abs(crossProduct) < EPSILON) {
                    intermediateDots.push(dot);
                }
            }
        });
        intermediateDots.sort((a, b) => {
            if (Math.abs(a.x - b.x) > EPSILON) return a.x - b.x;
            return a.y - b.y;
        });
        return intermediateDots;
    }
    
    function isValidPreviewLine(dotA, dotB, currentLines) {
        if (!dotA || !dotB) return false;
        
        if (is3DMode) {
            const id = getLineId(dotA, dotB);
            if (currentLines[id] && !currentLines[id].drawn) return true;
            return false;
        }

        const dy = dotB.y - dotA.y;
        const dx = dotB.x - dotA.x;
        if (dx !== 0 || dy !== 0) {
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const absAngle = Math.abs(angle);
            const isValidAngle = isClose(absAngle, 0) || isClose(absAngle, 60) || isClose(absAngle, 120) || isClose(absAngle, 180);
            if (!isValidAngle) return false; 
        }
        const allDotsOnLine = findIntermediateDots(dotA, dotB);
        const segmentIds = [];
        for (let i = 0; i < allDotsOnLine.length - 1; i++) {
            segmentIds.push(getLineId(allDotsOnLine[i], allDotsOnLine[i+1]));
        }
        
        if (segmentIds.length === 0 && dotA !== dotB) return false;
        if (isAllowShorterLines) {
            if (segmentIds.length < 1 || segmentIds.length > REQUIRED_LINE_LENGTH) return false;
        } else {
            if (segmentIds.length !== REQUIRED_LINE_LENGTH) return false; 
        }

        let allSegmentsExist = true;
        let hasUndrawnSegment = false; 
        for (const id of segmentIds) {
            if (!id || !currentLines[id]) { 
                allSegmentsExist = false;
                break;
            }
            if (!currentLines[id].drawn) {
                hasUndrawnSegment = true;
            }
        }
        if (!allSegmentsExist) return false; 
        if (!hasUndrawnSegment) return false; 
        return true;
    }
    
    function findAllValidMoves(currentLines) {
        const moves = [];
        const allDots = dots.flat();
        for (let i = 0; i < allDots.length; i++) {
            for (let j = i + 1; j < allDots.length; j++) {
                const dotA = allDots[i];
                const dotB = allDots[j];
                if (isValidPreviewLine(dotA, dotB, currentLines)) {
                    moves.push(true);
                }
            }
        }
        return moves;
    }

    function switchPlayer() {
        const isP1AI_current = (gameMode === 2);
        const isP2AI_current = (gameMode === 1 || gameMode === 2);
        if (aiLogContainer && !isBatchRunning) { 
            if ((currentPlayer === 1 && isP1AI_current) || (currentPlayer === 2 && isP2AI_current)) {
            } else {
                 aiLogContainer.classList.add('hidden');
            }
        }

        currentPlayer = (currentPlayer === 1) ? 2 : 1;
        currentRound++;
        updateUI();

        const isP1AI_new = (gameMode === 2);
        const isP2AI_new = (gameMode === 1 || gameMode === 2);
        const isNewPlayerAI = (currentPlayer === 1 && isP1AI_new) || (currentPlayer === 2 && isP2AI_new);

        if (isNewPlayerAI) {
            triggerAIMove();
        } else {
            if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');
            const allMoves = findAllValidMoves(lines);
            if (allMoves.length === 0) {
                const playerName = (currentPlayer === 1) ? "玩家 1" : "玩家 2";
                logAI(`--- 輪到 ${playerName}，但已無棋可走 ---`);
                if (aiLogContainer && !isBatchRunning) aiLogContainer.classList.remove('hidden'); 
                endGame();
                return;
            }
        }
    }

    function updateUI() {
        score1El.textContent = scores[1];
        score2El.textContent = scores[2];
        let player1Name = (gameMode === 2) ? "電腦 1" : "玩家 1";
        let player2Name = (gameMode === 0) ? "玩家 2" : (gameMode === 1 ? "電腦" : "電腦 2");
        if (gameMode === 1) { 
            player2Name = `電腦 (${aiP2TypeSelect.options[aiP2TypeSelect.selectedIndex].text})`;
        } else if (gameMode === 2) { 
            player1Name = `電腦 1 (${aiP1TypeSelect.options[aiP1TypeSelect.selectedIndex].text})`;
            player2Name = `電腦 2 (${aiP2TypeSelect.options[aiP2TypeSelect.selectedIndex].text})`;
        }
        player1ScoreBox.childNodes[0].nodeValue = `${player1Name}: `;
        player2ScoreBox.childNodes[0].nodeValue = `${player2Name}: `;
        if (currentPlayer === 1) {
            player1ScoreBox.classList.add('active');
            player2ScoreBox.classList.remove('active', 'player2');
        } else {
            player1ScoreBox.classList.remove('active');
            player2ScoreBox.classList.add('active', 'player2');
        }
        updateRoundUI();
    }

    function closeModal() {
        if (modalOverlay) {
            modalOverlay.classList.add('hidden');
        }
    }

    function endGame() {
        if (isAIThinking) {
            if (aiWorker) aiWorker.terminate();
            isAIThinking = false;
        }
        let player1Name = player1ScoreBox.childNodes[0].nodeValue.replace(': ', '');
        let player2Name = player2ScoreBox.childNodes[0].nodeValue.replace(': ', '');
        let winnerMessage = "";
        if (scores[1] > scores[2]) {
            winnerMessage = `${player1Name} 獲勝！`;
        } else if (scores[2] > scores[1]) {
            winnerMessage = `${player2Name} 獲勝！`;
        } else {
            winnerMessage = "平手！";
        }
        
        gameHistoryLog.summary = {
            finalScoreP1: scores[1],
            finalScoreP2: scores[2],
            finalPointSumP1: p1PointSum,
            finalPointSumP2: p2PointSum,
            winnerMessage: winnerMessage
        };
        
        if (isBatchRunning) {
            exportCanvasAsPNG(batchGamesCompleted + 1, null); 
            batchLog.push(gameHistoryLog); 
            batchGamesCompleted++;
            if (batchStatusMessage) {
                batchStatusMessage.textContent = `執行中... (已完成 ${batchGamesCompleted} / ${batchTotalGames} 場)`;
            }
            if (batchGamesCompleted < batchTotalGames) {
                setTimeout(initGame, 10); 
            } else {
                isBatchRunning = false;
                toggleUIControls(true); 
                startBatchButton.classList.remove('hidden'); 
                stopBatchButton.classList.add('hidden'); 
                if (batchStatusMessage) {
                    batchStatusMessage.textContent = `批次完成！已匯出 ${batchTotalGames} 場紀錄 (CSV+ZIP)。`;
                }
                exportBatchLog(); 
            }
        } else {
            if (pngStepLog.length > 0) {
                let zipFilename = null;
                if (gameHistoryLog.settings.startedFromLayout) {
                    const date = new Date(gameHistoryLog.settings.dateTime);
                    const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
                    zipFilename = `triangle_layout_steps_${timestamp}.zip`;
                }
                createAndDownloadZip(zipFilename);
            }
            if (winnerText) {
                winnerText.textContent = winnerMessage;
            } else {
                console.error("找不到 'winner-text' 元素！");
            }
            if (finalScoreText) {
                finalScoreText.textContent = `比分: ${scores[1]} V.S. ${scores[2]}`;
            }
            modalOverlay.classList.remove('hidden'); 
            if (actionBar) actionBar.classList.remove('visible'); 
            if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');
            if (aiLogContainer) aiLogContainer.classList.add('hidden');
        }
    }

    function saveGameState() {
        const stateSnapshot = {
            lines: JSON.parse(JSON.stringify(lines)),
            triangles: JSON.parse(JSON.stringify(triangles)),
            scores: { ...scores },
            pointSums: { 1: p1PointSum, 2: p2PointSum },
            historyHTML: moveHistoryList ? moveHistoryList.innerHTML : '',
            
            currentPlayer: currentPlayer,
            turnCounter: turnCounter,
            currentRound: currentRound,
            
            gameHistoryLog: JSON.parse(JSON.stringify(gameHistoryLog)),
            pngStepLogLength: pngStepLog.length 
        };
    
        undoStack.push(stateSnapshot);
        
        if (undoStack.length > MAX_UNDO_DEPTH) {
            undoStack.shift(); 
        }
        
        updateUndoButtonState();
    }

    function undoLastMove() {
        if (isBatchRunning || undoStack.length === 0) return;

        if (isAIThinking) {
             initializeAIWorker(); 
             isAIThinking = false;
             if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');
             logAI("--- AI 思考已被使用者中斷 (Undo) ---");
        }
    
        const prevState = undoStack.pop();
    
        lines = prevState.lines;
        triangles = prevState.triangles;
        scores = prevState.scores;
        
        if (prevState.pointSums) {
            p1PointSum = prevState.pointSums[1];
            p2PointSum = prevState.pointSums[2];
            updatePointSumUI();
        }
        if (prevState.historyHTML && moveHistoryList) {
            moveHistoryList.innerHTML = prevState.historyHTML;
            const container = document.getElementById('move-history-container');
            if(container) container.scrollTop = container.scrollHeight;
        }

        currentPlayer = prevState.currentPlayer;
        turnCounter = prevState.turnCounter;
        currentRound = prevState.currentRound;

        gameHistoryLog = prevState.gameHistoryLog;
        
        if (pngStepLog.length > prevState.pngStepLogLength) {
            pngStepLog.length = prevState.pngStepLogLength; 
        }
    
        selectedDot1 = null;
        selectedDot2 = null;
        if (actionBar) actionBar.classList.remove('visible');
        
        if (modalOverlay) modalOverlay.classList.add('hidden');
        if (aiLogContainer) {
             logAI(`--- ⏪ 玩家執行了回復上一步 ---`);
             logAI(`--- 當前輪到: ${currentPlayer === 1 ? '玩家 1' : '玩家 2'} ---`);
        }
    
        updateUI();
        drawCanvas();
        updateUndoButtonState();
    }
    
    function updateUndoButtonState() {
        if (undoButton) {
            undoButton.disabled = (undoStack.length === 0 || isBatchRunning);
            undoButton.style.opacity = undoButton.disabled ? "0.5" : "1";
        }
    }

    let aiStartTime = 0; 
    
    function triggerAIMove() {
        if (isAIThinking) return; 
        
        const allMoves = findAllValidMoves(lines);
        if (allMoves.length === 0) {
            const playerName = (currentPlayer === 2) ? "AI 2 (Max)" : "AI 1 (Min)";
            logAI(`--- ${playerName} 已無棋可走，遊戲結束 ---`);
            if (aiLogContainer && !isBatchRunning) aiLogContainer.classList.remove('hidden');
            endGame(); 
            return;
        }

        isAIThinking = true;
        updateUndoButtonState();

        if (aiThinkingMessage && !isBatchRunning) aiThinkingMessage.classList.remove('hidden');
        if (aiLogContainer && !isBatchRunning) aiLogContainer.classList.remove('hidden');
        
        aiStartTime = performance.now();
        
        let aiType = 'minimax'; 
        if (currentPlayer === 1 && gameMode === 2) {
            aiType = aiP1TypeSelect.value;
        } else if (currentPlayer === 2 && (gameMode === 1 || gameMode === 2)) {
            aiType = aiP2TypeSelect.value;
        }
        
        let weightsToSend = null;
        if (aiType === 'trained' && bestWeightsSoFar) {
            weightsToSend = bestWeightsSoFar;
        }
        
        // 🚨 關鍵修改：加上 is3DMode 傳送給 AI
        const payload = {
            command: 'start',
            aiType: aiType, 
            weights: weightsToSend, 
            gameState: {
                dots: dots,
                lines: lines,
                triangles: triangles,
                player: currentPlayer,
                totalTriangles: totalTriangles,
                requiredLineLength: REQUIRED_LINE_LENGTH,
                isScoreAndGoAgain: isScoreAndGoAgain,
                allowShorterLines: isAllowShorterLines,
                is3DMode: is3DMode // 👈👈👈
            }
        };

        const isCloudEnabled = useCloudCheckbox && useCloudCheckbox.checked;
        const colabUrl = colabUrlInput ? colabUrlInput.value.trim() : "";

        if (isCloudEnabled) {
            if (!colabUrl || !colabUrl.startsWith("http")) {
                alert("❌ 錯誤：您已啟用雲端運算，但尚未輸入有效的 Ngrok 網址。\n請輸入網址或取消勾選以使用本機運算。");
                logAI("--- [中斷] 未輸入有效的雲端網址 ---");
                resetAIState();
                return;
            }

            logAI(`--- [雲端] 連線至 Colab 運算中... ---`);
            
            const apiUrl = colabUrl.replace(/\/$/, "") + "/get_move";

            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                const endTime = performance.now();
                const duration = (endTime - aiStartTime) / 1000;
                if (!isBatchRunning) {
                    logAI(`--- (雲端) 運算耗時: ${duration.toFixed(2)} 秒 ---`);
                }
                isAIThinking = false;
                handleAIMoveResult(data.bestMove);
            })
            .catch(error => {
                console.error('Colab Fetch Error:', error);
                logAI(`--- [錯誤] 連線失敗 (${error.message}) ---`);
                alert(`❌ 雲端連線失敗！\n錯誤訊息: ${error.message}\n\n請檢查 Colab 是否正在執行，或網址是否正確。\n若要使用本機運算，請取消勾選「啟用雲端加速」。`);
                resetAIState();
            });

        } else {
            logAI(`--- [本機] 使用瀏覽器 Worker 運算 ---`);
            useLocalWorker(payload);
        }
    }
    
    function resetAIState() {
        isAIThinking = false;
        updateUndoButtonState();
        if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');
        if (isBatchRunning) {
            stopBatchRun();
            if (batchStatusMessage) batchStatusMessage.textContent = "批次對戰因雲端連線錯誤已終止。";
        }
    }

    function useLocalWorker(payload) {
        if (!aiWorker) {
            console.error("AI Worker 尚未初始化");
            isAIThinking = false;
            return;
        }
        aiWorker.postMessage(payload);
    }

    function handleAIMoveResult(bestMove) {
        if (aiThinkingMessage) aiThinkingMessage.classList.add('hidden');

        if (bestMove && bestMove.dot1 && bestMove.dot2) {
            
            saveGameState();
            
            const dotA = dots[bestMove.dot1.r][bestMove.dot1.c];
            const dotB = dots[bestMove.dot2.r][bestMove.dot2.c];
            const moveResult = applyMoveToBoard(dotA, dotB, currentPlayer);

            if (!moveResult.newSegmentDrawn) {
                logAI(`--- [錯誤] AI 傳回無效移動 (已重複或違規) ---`);
                undoStack.pop();
                updateUndoButtonState();
                switchPlayer();
                return;
            }
            
            drawCanvas();
            const gameID = isBatchRunning ? (batchGamesCompleted + 1) : null;
            const turnID = turnCounter - 1; 
            exportCanvasAsPNG(gameID, turnID);
            updateUI(); 

            if (moveResult.gameEnded) {
                endGame();
                return;
            }

            if (moveResult.scoreGained > 0 && isScoreAndGoAgain) {
                logAI(`--- 電腦 ${currentPlayer} 得分，再走一次 ---`);
                if (isBatchRunning) {
                    setTimeout(triggerAIMove, 10);
                } else {
                    triggerAIMove();
                }
            } else {
                switchPlayer();
            }

        } else {
            logAI(`--- [主線程] AI 未傳回走法，遊戲結束 ---`);
            endGame(); 
        }
    }
    
    function getBoardStateString(currentLines) {
        if (!sortedLineIds || sortedLineIds.length === 0) {
            console.error("sortedLineIds 尚未初始化！");
            return "";
        }
        const stateChars = sortedLineIds.map(id => {
            const line = currentLines[id];
            if (!line || !line.drawn) {
                return '0'; 
            }
            if (line.player === 1) {
                return (line.sharedBy === 2) ? '3' : '1';
            }
            if (line.player === 2) {
                return (line.sharedBy === 1) ? '4' : '2';
            }
            return '0'; 
        });
        return stateChars.join('');
    }

    function applyMoveToBoard(dotA, dotB, player) {
        
        const stateBefore = getBoardStateString(lines);

        const allDotsOnLine = findIntermediateDots(dotA, dotB);
        const segmentIds = [];
        for (let i = 0; i < allDotsOnLine.length - 1; i++) {
            segmentIds.push(getLineId(allDotsOnLine[i], allDotsOnLine[i+1]));
        }
        
        let hasNewSegment = false;
        for (const id of segmentIds) {
            if (lines[id] && !lines[id].drawn) {
                hasNewSegment = true;
                break;
            }
        }
        
        if (!hasNewSegment) {
            return { newSegmentDrawn: false, gameEnded: false, scoreGained: 0 };
        }

        let newSegmentDrawn = false; 
        for (const id of segmentIds) {
            if (lines[id]) { 
                if (!lines[id].drawn) { 
                    lines[id].drawn = true;
                    lines[id].player = player;
                    newSegmentDrawn = true;
                } else if (lines[id].player !== 0 && lines[id].player !== player) {
                    if (lines[id].sharedBy === 0) {
                        lines[id].sharedBy = player;
                    }
                }
            }
        }

        if (!newSegmentDrawn) {
            return { newSegmentDrawn: false, gameEnded: false, scoreGained: 0 };
        }

        let lineSum = 0;
        let calcParts = [];
        
        allDotsOnLine.forEach(d => {
            const val = d.number || 0;
            lineSum += val;
            calcParts.push(val);
        });
        
        const lineCalcStr = calcParts.join(' + ');

        if (player === 1) p1PointSum += lineSum;
        else if (player === 2) p2PointSum += lineSum;
        
        updatePointSumUI();
        addMoveToHistoryUI(player, lineCalcStr, lineSum); 

        const scoreBefore = scores[player];
        let totalFilledThisGame = 0;
        let completedTrianglesInfo = []; 

        triangles.forEach(tri => {
            if (!tri.filled) {
                const isComplete = tri.lineKeys.every(key => lines[key] && lines[key].drawn);
                if (isComplete) {
                    tri.filled = true;
                    tri.player = player;
                    scores[player]++;
                    
                    const triDots = tri.dots.map(d => `(${d.r},${d.c})`).join(' | ');
                    completedTrianglesInfo.push({
                        dots: triDots,
                        lines: tri.lineKeys
                    });
                    
                    const scoreBox = (player === 1) ? player1ScoreBox : player2ScoreBox;
                    scoreBox.classList.add('score-pulse');
                    setTimeout(() => {
                        scoreBox.classList.remove('score-pulse');
                    }, 400); 
                }
            }
            if (tri.filled) totalFilledThisGame++;
        });

        const stateAfter = getBoardStateString(lines);

        const scoreAfter = scores[player];
        const scoreGained = scoreAfter - scoreBefore;
        
        let playerType = "Human";
        if (gameMode === 2) { 
            playerType = `AI (${player === 1 ? aiP1TypeSelect.value : aiP2TypeSelect.value})`; 
        } else if (gameMode === 1 && player === 2) { 
            playerType = `AI (${aiP2TypeSelect.value})`; 
        }
        
        const logEntry = {
            turn: turnCounter,
            round: currentRound, 
            player: player,
            playerType: playerType, 
            move: `(${dotA.r},${dotA.c}) to (${dotB.r},${dotB.c})`,
            segmentsDrawn: segmentIds, 
            scoreGained: scoreGained,
            trianglesCompleted: completedTrianglesInfo, 
            newScoreP1: scores[1],
            newScoreP2: scores[2],
            stateBefore: stateBefore, 
            stateAfter: stateAfter,
            lineSum: lineSum, 
            lineCalc: lineCalcStr, 
            p1TotalPointSum: p1PointSum, 
            p2TotalPointSum: p2PointSum 
        };
        gameHistoryLog.turns.push(logEntry); 
        turnCounter++; 
        
        return {
            newSegmentDrawn: true,
            gameEnded: (totalFilledThisGame === totalTriangles),
            scoreGained: scoreGained 
        };
    }
    
    function escapeCSV(str) {
        if (str === null || str === undefined) return '';
        let result = String(str);
        result = result.replace(/"/g, '""');
        if (result.includes(',') || result.includes('\n') || result.includes('"')) {
            return `"${result}"`;
        }
        return result;
    }

    function toggleUIControls(isEnabled) {
        uiControls.forEach(control => {
            if (control) {
                control.disabled = !isEnabled;
            }
        });
        updateUndoButtonState();
    }

    function startBatchRun() {
        const gameCount = parseInt(batchCountInput.value, 10);
        if (isNaN(gameCount) || gameCount <= 0) {
            alert("請輸入有效的對戰次數 (大於 0)。");
            return;
        }

        savedBatchLayout = null;
        let useLayout = false;
        
        const hasDrawnLines = Object.values(lines).some(l => l.drawn);

        if (isSetupMode) {
             useLayout = true;
             isSetupMode = false;
             setupModeButton.textContent = '進入佈局模式';
             setupModeButton.classList.remove('success');
             setupModeButton.classList.add('primary');
             togglePlayControls(true); 
             setupActionBar.classList.add('hidden');
             cancelSetupLine(); 
        } else if (hasDrawnLines) {
             if (confirm("偵測到盤面上有已繪製的線段。是否將此佈局應用於所有批次對戰場次？\n(按「取消」將使用空棋盤開始)")) {
                 useLayout = true;
             }
        }

        if (useLayout) {
             savedBatchLayout = [];
             for (const id in lines) {
                 if (lines[id].drawn) {
                     savedBatchLayout.push({
                         id: id,
                         player: lines[id].player,
                         sharedBy: lines[id].sharedBy
                     });
                 }
             }
        }

        isBatchRunning = true;
        pngStepLog = [];
        batchLog = [];
        batchTotalGames = gameCount;
        batchGamesCompleted = 0;
        toggleUIControls(false);
        startBatchButton.classList.add('hidden');
        stopBatchButton.classList.remove('hidden');
        batchStatusMessage.textContent = `執行中... (已完成 0 / ${batchTotalGames} 場)`;
        gameModeSelect.value = "2";
        updateAITypeVisibility(); 
        initGame();
    }
    
    function stopBatchRun() {
        if (!isBatchRunning) return; 
        if (confirm("您確定要終止批次對戰嗎？目前已完成的紀錄將會匯出。")) {
            isBatchRunning = false;
            savedBatchLayout = null; 
            if (isAIThinking) {
                aiWorker.terminate();
                isAIThinking = false;
            }
            toggleUIControls(true);
            startBatchButton.classList.remove('hidden');
            stopBatchButton.classList.add('hidden');
            if (batchStatusMessage) {
                batchStatusMessage.textContent = `批次已手動終止 (完成 ${batchGamesCompleted} 場)。`;
            }
            exportBatchLog();
        }
    }

    function exportBatchLog() {
        const date = new Date();
        const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;

        if (!batchLog || batchLog.length === 0) {
            console.warn("沒有可匯出的批次 CSV 紀錄。");
        } else {
            const headers = [
                "Game_ID", "Round", "Turn", "Player", "PlayerType", "Move (r,c)", 
                "SegmentsDrawn (ID)", "Calculation", "LineSum", "P1_TotalPointSum", "P2_TotalPointSum", 
                "ScoreThisTurn", "TrianglesCompleted (Dots)",
                "P1_TotalScore", "P2_TotalScore",
                "BoardState_Before", "BoardState_After" 
            ];
            
            let csvContent = "\uFEFF"; 

            batchLog.forEach((gameLog, gameIndex) => {
                const gameID = gameIndex + 1;
                
                csvContent += `# 遊戲 ID: ${gameID}\n`;
                csvContent += `# 棋盤大小: ${gameLog.settings.boardSize}\n`;
                csvContent += `# 連線格數: ${gameLog.settings.lineLength}\n`;
                csvContent += `# 遊戲模式: ${escapeCSV(gameLog.settings.gameMode)}\n`;
                csvContent += `# 先手玩家: ${escapeCSV(gameLog.settings.startPlayer)}\n`; 
                if (gameLog.settings.aiTypeP1) {
                    csvContent += `# AI (P1) 類型: ${gameLog.settings.aiTypeP1}\n`;
                }
                if (gameLog.settings.aiTypeP2) {
                    csvContent += `# AI (P2) 類型: ${gameLog.settings.aiTypeP2}\n`;
                }
                csvContent += `# 得分後再走一步: ${gameLog.settings.isScoreAndGoAgain}\n`;
                if (gameLog.settings.startedFromLayout) {
                     csvContent += `# 狀態: 從佈局開始\n`;
                }
                csvContent += `# 紀錄時間: ${gameLog.settings.dateTime}\n\n`;

                csvContent += headers.join(",") + "\n";

                gameLog.turns.forEach(entry => {
                    const segmentsStr = entry.segmentsDrawn.join('; ');
                    const trianglesStr = entry.trianglesCompleted.map(t => t.dots).join('; ');

                    const row = [
                        gameID,
                        entry.round, 
                        entry.turn,
                        entry.player,
                        escapeCSV(entry.playerType),
                        escapeCSV(entry.move),
                        escapeCSV(segmentsStr),
                        escapeCSV(entry.lineCalc), 
                        entry.lineSum,           
                        entry.p1TotalPointSum,   
                        entry.p2TotalPointSum,   
                        entry.scoreGained,
                        escapeCSV(trianglesStr), 
                        entry.newScoreP1,
                        entry.newScoreP2,
                        escapeCSV(entry.stateBefore), 
                        escapeCSV(entry.stateAfter)
                    ];
                    csvContent += row.join(",") + "\n";
                });

                if (gameLog.summary.winnerMessage) {
                    csvContent += "\n# 遊戲總結 (Game " + gameID + ")\n";
                    csvContent += `# 勝利訊息: ${escapeCSV(gameLog.summary.winnerMessage)}\n`;
                    csvContent += `# P1 最終分數: ${gameLog.summary.finalScoreP1}\n`;
                    csvContent += `# P2 最終分數: ${gameLog.summary.finalScoreP2}\n`;
                    csvContent += `# P1 數字總和: ${gameLog.summary.finalPointSumP1}\n`;
                    csvContent += `# P2 數字總和: ${gameLog.summary.finalPointSumP2}\n`;
                }
                csvContent += "\n"; 
            });

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const filename = `triangle_batch_log_${batchLog.length}_games_${timestamp}.csv`;
            triggerDownload(blob, filename);
        }
        if (pngStepLog.length === 0) {
            console.warn("沒有可匯出的批次 PNG 紀錄。");
        } else {
            const zipFilename = `triangle_batch_steps_${batchLog.length}_games_${timestamp}.zip`;
            createAndDownloadZip(zipFilename); 
        }
    }


    function exportGameLog() {
        if (!gameHistoryLog.turns || gameHistoryLog.turns.length === 0) {
            alert("尚未有任何遊戲紀錄 (目前這場)。");
            return;
        }
        const headers = [
            "Round", "Turn", "Player", "PlayerType", "Move (r,c)", 
            "SegmentsDrawn (ID)", "Calculation", "LineSum", 
            "ScoreThisTurn", "TrianglesCompleted (Dots)",
            "P1_TotalScore", "P2_TotalScore",
            "BoardState_Before", "BoardState_After" 
        ];
        
        let csvContent = "\uFEFF"; 

        csvContent += "# 遊戲設定\n";
        csvContent += `# 棋盤大小: ${gameHistoryLog.settings.boardSize}\n`;
        csvContent += `# 連線格數: ${gameHistoryLog.settings.lineLength}\n`;
        csvContent += `# 遊戲模式: ${escapeCSV(gameHistoryLog.settings.gameMode)}\n`;
        csvContent += `# 先手玩家: ${escapeCSV(gameHistoryLog.settings.startPlayer)}\n`; 
        if (gameHistoryLog.settings.aiTypeP1) {
            csvContent += `# AI (P1) 類型: ${gameHistoryLog.settings.aiTypeP1}\n`;
        }
        if (gameHistoryLog.settings.aiTypeP2) {
            csvContent += `# AI (P2) 類型: ${gameHistoryLog.settings.aiTypeP2}\n`;
        }
        csvContent += `# 得分後再走一步: ${gameHistoryLog.settings.isScoreAndGoAgain}\n`;
        if (gameHistoryLog.settings.startedFromLayout) {
             csvContent += `# 狀態: 從佈局開始\n`;
        }
        csvContent += `# 紀錄時間: ${gameHistoryLog.settings.dateTime}\n\n`;

        csvContent += headers.join(",") + "\n";

        gameHistoryLog.turns.forEach(entry => {
            const segmentsStr = entry.segmentsDrawn.join('; ');
            const trianglesStr = entry.trianglesCompleted.map(t => t.dots).join('; ');

            const row = [
                entry.round, 
                entry.turn,
                entry.player,
                escapeCSV(entry.playerType),
                escapeCSV(entry.move),
                escapeCSV(segmentsStr), 
                escapeCSV(entry.lineCalc),
                entry.lineSum,
                entry.scoreGained,
                escapeCSV(trianglesStr), 
                entry.newScoreP1,
                entry.newScoreP2,
                escapeCSV(entry.stateBefore),
                escapeCSV(entry.stateAfter)
            ];
            csvContent += row.join(",") + "\n";
        });

        if (gameHistoryLog.summary.winnerMessage) {
            csvContent += "\n# 遊戲總結\n";
            csvContent += `# 勝利訊息: ${escapeCSV(gameHistoryLog.summary.winnerMessage)}\n`;
            csvContent += `# P1 最終分數: ${gameHistoryLog.summary.finalScoreP1}\n`;
            csvContent += `# P2 最終分數: ${gameHistoryLog.summary.finalScoreP2}\n`;
            csvContent += `# P1 數字總和: ${gameHistoryLog.summary.finalPointSumP1}\n`;
            csvContent += `# P2 數字總和: ${gameHistoryLog.summary.finalPointSumP2}\n`;
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const date = new Date(gameHistoryLog.settings.dateTime);
        const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
        
        const filenamePrefix = gameHistoryLog.settings.startedFromLayout ? "triangle_layout_log_" : "triangle_game_log_";
        const filename = `${filenamePrefix}${timestamp}.csv`;
        
        triggerDownload(blob, filename);
    }
    
    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function createAndDownloadZip(customFilename = null) {
        if (typeof JSZip === 'undefined') {
            console.error("JSZip 函式庫未載入！");
            alert("錯誤：無法建立 ZIP 檔案，JSZip 函式庫遺失。");
            return;
        }
        if (pngStepLog.length === 0) {
            console.log("沒有 PNG 步驟可供壓縮。");
            return;
        }

        const zip = new JSZip();
        pngStepLog.forEach(entry => {
            const base64Data = entry.data.split(',')[1];
            zip.file(entry.filename, base64Data, { base64: true });
        });

        zip.generateAsync({ type: "blob" })
            .then(function(blob) {
                let filename = "";
                if (customFilename) {
                    filename = customFilename;
                } else {
                    const date = new Date();
                    const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
                    filename = `triangle_steps_${timestamp}.zip`;
                }
                triggerDownload(blob, filename);
            });
    }

    
    function exportCanvasAsPNG(gameID = null, turnID = null) {
        if (!canvas) {
            alert("找不到畫布！");
            return;
        }

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCtx.fillStyle = '#ffffff'; 
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);

        const date = new Date();
        const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
        let filename = "";


        if (turnID === null && gameID === null) {
            const prefix = isSetupMode ? "triangle_layout_" : "triangle_board_";
            filename = `${prefix}${timestamp}.png`;
            tempCanvas.toBlob(function(blob) {
                triggerDownload(blob, filename);
            });

        } else if (turnID !== null) {
            const turnIdStr = String(turnID).padStart(3, '0');
            if (isBatchRunning) {
                const gameIdStr = String(gameID).padStart(3, '0');
                filename = `Game_${gameIdStr}_Turn_${turnIdStr}.png`;
            } else {
                const prefix = gameHistoryLog.settings.startedFromLayout ? "Layout_Turn_" : "Turn_";
                filename = `triangle_board_${prefix}${turnIdStr}.png`;
            }
            const dataURL = tempCanvas.toDataURL('image/png');
            pngStepLog.push({ filename: filename, data: dataURL });

        } else if (isBatchRunning && turnID === null) {
            const gameIdStr = String(gameID).padStart(3, '0');
            filename = `Game_${gameIdStr}_FINAL_Board.png`;
            const dataURL = tempCanvas.toDataURL('image/png');
            pngStepLog.push({ filename: filename, data: dataURL });
        }
    }

    resetButton.addEventListener('click', initGame);
    resetButtonModal.addEventListener('click', initGame);
    if (undoButton) undoButton.addEventListener('click', undoLastMove);
    if (confirmLineButton) confirmLineButton.addEventListener('click', confirmLine);
    if (cancelLineButton) cancelLineButton.addEventListener('click', cancelLine);
    if (setupModeButton) setupModeButton.addEventListener('click', toggleSetupMode);
    if (setupP1Button) setupP1Button.addEventListener('click', () => applySetupLine(1));
    if (setupP2Button) setupP2Button.addEventListener('click', () => applySetupLine(2));
    if (setupClearButton) setupClearButton.addEventListener('click', () => applySetupLine(0));
    
    if (gameModeSelect) {
        gameModeSelect.addEventListener('change', () => {
            gameMode = parseInt(gameModeSelect.value, 10);
            updateAITypeVisibility();
            updateUI();
            
            const isP1AI = (gameMode === 2);
            const isP2AI = (gameMode === 1 || gameMode === 2);
            if ((currentPlayer === 1 && isP1AI) || (currentPlayer === 2 && isP2AI)) {
                if (!isAIThinking && !isBatchRunning) {
                    triggerAIMove();
                }
            }
        });
    }

    if (boardSizeSelect) {
        boardSizeSelect.addEventListener('change', () => {
            if (boardSizeSelect.value === 'custom') {
                customBoardInputGroup.classList.remove('hidden');
            } else {
                customBoardInputGroup.classList.add('hidden');
            }
            initGame();
        });
    }
    if (customBoardPatternInput) customBoardPatternInput.addEventListener('change', initGame);
    if (scoreAndGoCheckbox) scoreAndGoCheckbox.addEventListener('change', () => { isScoreAndGoAgain = scoreAndGoCheckbox.checked; });
    if (allowShorterLinesCheckbox) allowShorterLinesCheckbox.addEventListener('change', () => { isAllowShorterLines = allowShorterLinesCheckbox.checked; });
    if (lineLengthSelect) lineLengthSelect.addEventListener('change', initGame);
    if (startPlayerSelect) {
        startPlayerSelect.addEventListener('change', () => {
             if (turnCounter === 1 && !isBatchRunning && !isAIThinking) {
                 currentPlayer = parseInt(startPlayerSelect.value, 10);
                 updateUI();
             }
        });
    }

    if (inputModeSelect) {
        inputModeSelect.addEventListener('change', () => {
            inputMode = inputModeSelect.value;
            removeCanvasListeners(); 
            if (inputMode === 'drag') bindDragListeners();
            else bindClickListeners();
        });
    }

    if (aiP1TypeSelect) aiP1TypeSelect.addEventListener('change', updateUI);
    if (aiP2TypeSelect) aiP2TypeSelect.addEventListener('change', updateUI);
    
    if (customNumberPatternInput) {
        customNumberPatternInput.addEventListener('change', initGame);
    }

    if (exportLogButton) exportLogButton.addEventListener('click', exportGameLog);
    if (exportLogButtonModal) exportLogButtonModal.addEventListener('click', exportGameLog);
    if (exportPNGButton) exportPNGButton.addEventListener('click', () => exportCanvasAsPNG(null, null)); 
    if (exportPNGButtonModal) exportPNGButtonModal.addEventListener('click', () => exportCanvasAsPNG(null, null)); 
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    if (startBatchButton) startBatchButton.addEventListener('click', startBatchRun);
    if (stopBatchButton) stopBatchButton.addEventListener('click', stopBatchRun);

    openTrainingBtn.addEventListener('click', () => {
        trainingPanel.classList.remove('hidden');
        if (strategyAnalysisContainer) strategyAnalysisContainer.classList.remove('hidden'); 
        if (boardSizeSelect.value !== 'tiny') {
            if(confirm("建議切換到「最小」棋盤以大幅提升訓練速度。是否切換？")) {
                boardSizeSelect.value = 'tiny';
                initGame(); 
            }
        }
    });
    
    closeTrainingBtn.addEventListener('click', () => {
        if (isTraining) {
            if(!confirm("訓練正在進行中，確定要離開嗎？(訓練將會停止)")) return;
            stopTraining();
        }
        trainingPanel.classList.add('hidden');
    });

    startTrainingBtn.addEventListener('click', startTraining);
    stopTrainingBtn.addEventListener('click', stopTraining);
    
    applyWeightsBtn.addEventListener('click', () => {
        if (bestWeightsSoFar) {
            if (aiP2TypeSelect) {
                aiP2TypeSelect.value = 'trained';
                updateAITypeVisibility();
            }
            alert("已應用最佳權重！現在請選擇「Trained (訓練模型)」作為 AI 類型開始遊戲。");
            trainingPanel.classList.add('hidden');
            initGame(); 
        }
    });

    function startTraining() {
        isTraining = true;
        currentGeneration = 1;
        maxGenerations = parseInt(trainGenerationsEl.value, 10);
        const popSize = parseInt(trainPopSizeEl.value, 10);
        
        trainingPopulation = [];
        for (let i = 0; i < popSize; i++) {
            trainingPopulation.push({
                id: i,
                weights: {
                    scoreScale: 150, 
                    threatScale: 25, 
                    doubleSetupScale: 75, 
                    p1ThreatVal: Math.floor(Math.random() * 100) - 50, 
                    p2ThreatVal: Math.floor(Math.random() * 100) - 50,
                    p1DoubleVal: Math.floor(Math.random() * 200) - 100, 
                    p2DoubleVal: Math.floor(Math.random() * 200) - 100
                },
                fitness: 0
            });
        }
        
        startTrainingBtn.classList.add('hidden');
        stopTrainingBtn.classList.remove('hidden');
        trainProgressBar.classList.add('animated');
        trainStatusEl.textContent = `正在模擬第 ${currentGeneration} / ${maxGenerations} 世代...`;
        
        sendGenerationToWorker();
    }

    function stopTraining() {
        isTraining = false;
        startTrainingBtn.classList.remove('hidden');
        stopTrainingBtn.classList.add('hidden');
        trainProgressBar.classList.remove('animated');
        trainStatusEl.textContent = "訓練已手動停止";
    }

    function finishTraining() {
        stopTraining();
        if (trainStatusEl) trainStatusEl.textContent = "訓練已完成！";
        alert(`訓練完成！共模擬 ${currentGeneration} 個世代。`);
    }

    function sendGenerationToWorker() {
        if (!isTraining) return;
        const gameConfig = {
            dots: dots,
            lines: lines,
            triangles: triangles,
            totalTriangles: totalTriangles,
            requiredLineLength: REQUIRED_LINE_LENGTH,
            isScoreAndGoAgain: scoreAndGoCheckbox.checked,
            allowShorterLines: allowShorterLinesCheckbox.checked,
            is3DMode: is3DMode // 👈 確保傳送
        };
        aiWorker.postMessage({
            command: 'train_generation',
            population: trainingPopulation,
            gameConfig: gameConfig
        });
    }

    function handleTrainingGenerationComplete(populationWithFitness, bestAgentBoard) {
        if (!isTraining) return;

        populationWithFitness.sort((a, b) => b.fitness - a.fitness);
        const bestAgent = populationWithFitness[0];
        
        bestWeightsSoFar = bestAgent.weights;
        if (applyWeightsBtn) applyWeightsBtn.disabled = false;

        trainGenEl.textContent = currentGeneration;
        trainFitnessEl.textContent = bestAgent.fitness; 
        wScoreEl.textContent = "150 (固定)";
        wThreatEl.textContent = `P1:${bestAgent.weights.p1ThreatVal}, P2:${bestAgent.weights.p2ThreatVal}`;
        wSetupEl.textContent = `P1:${bestAgent.weights.p1DoubleVal}, P2:${bestAgent.weights.p2DoubleVal}`;
        
        if (strategyKeysList) {
            updateStrategyAnalysis(bestAgent.weights);
        }
        if (bestAgentBoard) {
            renderMiniBoard(bestAgentBoard);
        }
        
        const progressPercent = (currentGeneration / maxGenerations) * 100;
        trainProgressBar.style.width = `${progressPercent}%`;

        if (currentGeneration >= maxGenerations) {
            finishTraining();
            return;
        }

        trainingPopulation = evolvePopulation(populationWithFitness);
        
        currentGeneration++;
        trainStatusEl.textContent = `正在模擬第 ${currentGeneration} / ${maxGenerations} 世代...`;
        sendGenerationToWorker(); 
    }
    
    function updateStrategyAnalysis(w) {
        strategyKeysList.innerHTML = '';
        const p2T = w.p2ThreatVal;
        const p2D = w.p2DoubleVal;
        const addKey = (text) => {
            const li = document.createElement('li');
            li.textContent = text;
            strategyKeysList.appendChild(li);
        };
        
        if (Math.abs(p2D) > Math.abs(p2T) * 1.5) {
            addKey("✨ 必勝關鍵：高度重視雙重陷阱佈局 (Double Setup)，優先於單純製造威脅。");
        } else if (p2T > 30) {
            addKey("⚔ 必勝關鍵：採取極具侵略性的策略，不斷製造單一威脅迫使對手防守。");
        } else {
            addKey("⚖ 必勝關鍵：在佈局與進攻之間取得平衡，不偏廢任一方。");
        }
        if (p2T > 0 && p2D > 0) {
            addKey("📈 獲勝徵兆：AI 積極尋找能同時增加威脅與佈局的機會。");
        } else if (p2T < 0) {
            addKey("🛡 獲勝徵兆：AI 傾向於防守反擊，刻意避免過早暴露單一威脅。");
        }
        const aggression = Math.abs(p2T) + Math.abs(p2D);
        if (aggression > 100) {
            addKey("🔥 風格：高風險高回報，對關鍵點位的爭奪非常激烈。");
        } else {
            addKey("🧊 風格：穩健保守，傾向於一步步蠶食版圖。");
        }
    }
    
    function renderMiniBoard(linesData) {
        if (!strategyBoardCanvasWrapper) return;
        strategyBoardCanvasWrapper.innerHTML = ''; 
        const miniCanvas = document.createElement('canvas');
        const scale = 0.6; 
        miniCanvas.width = canvas.width * scale;
        miniCanvas.height = canvas.height * scale;
        const mCtx = miniCanvas.getContext('2d');
        
        mCtx.fillStyle = '#f8f9fa';
        mCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
        mCtx.scale(scale, scale);
        
        for (const id in linesData) {
            const line = linesData[id];
            if (line.drawn) {
                mCtx.beginPath();
                mCtx.moveTo(line.p1.x, line.p1.y);
                mCtx.lineTo(line.p2.x, line.p2.y);
                const color = (line.player === 1) ? '#3498db' : '#e74c3c';
                mCtx.strokeStyle = color;
                mCtx.lineWidth = 4; 
                mCtx.stroke();
                
                if (line.sharedBy !== 0 && line.sharedBy !== line.player) {
                    const sharedColor = (line.sharedBy === 1) ? '#3498db' : '#e74c3c';
                    mCtx.strokeStyle = sharedColor;
                    mCtx.lineWidth = 2;
                    mCtx.stroke();
                }
            } else {
                mCtx.beginPath();
                mCtx.moveTo(line.p1.x, line.p1.y);
                mCtx.lineTo(line.p2.x, line.p2.y);
                mCtx.strokeStyle = '#e0e0e0';
                mCtx.lineWidth = 1;
                mCtx.stroke();
            }
        }
        dots.forEach(row => {
            row.forEach(dot => {
                mCtx.beginPath();
                mCtx.arc(dot.x, dot.y, 4, 0, 2 * Math.PI); 
                mCtx.fillStyle = '#34495e';
                mCtx.fill();
            });
        });
        const img = document.createElement('img');
        img.src = miniCanvas.toDataURL();
        img.className = 'preview-board-img';
        strategyBoardCanvasWrapper.appendChild(img);
    }

    function evolvePopulation(oldPop) {
        const newPop = [];
        const popSize = oldPop.length;
        const eliteCount = Math.floor(popSize * 0.2);
        for (let i = 0; i < eliteCount; i++) {
            newPop.push({ ...oldPop[i], fitness: 0 }); 
        }
        while (newPop.length < popSize) {
            const parent1 = tournamentSelect(oldPop);
            const parent2 = tournamentSelect(oldPop);
            const childWeights = crossover(parent1.weights, parent2.weights);
            mutate(childWeights);
            newPop.push({
                id: newPop.length,
                weights: childWeights,
                fitness: 0
            });
        }
        return newPop;
    }

    function tournamentSelect(pop) {
        const k = 3;
        let best = null;
        for (let i = 0; i < k; i++) {
            const ind = pop[Math.floor(Math.random() * pop.length)];
            if (!best || ind.fitness > best.fitness) best = ind;
        }
        return best;
    }

    function crossover(w1, w2) {
        return {
            scoreScale: 150,
            threatScale: 25,
            doubleSetupScale: 75,
            p1ThreatVal: Math.random() > 0.5 ? w1.p1ThreatVal : w2.p1ThreatVal,
            p2ThreatVal: Math.random() > 0.5 ? w1.p2ThreatVal : w2.p2ThreatVal,
            p1DoubleVal: Math.random() > 0.5 ? w1.p1DoubleVal : w2.p1DoubleVal,
            p2DoubleVal: Math.random() > 0.5 ? w1.p2DoubleVal : w2.p2DoubleVal,
        };
    }

    function mutate(w) {
        const mutationRate = 0.1;
        const mutationStrength = 10;
        if (Math.random() < mutationRate) w.p1ThreatVal += (Math.random() - 0.5) * mutationStrength;
        if (Math.random() < mutationRate) w.p2ThreatVal += (Math.random() - 0.5) * mutationStrength;
        if (Math.random() < mutationRate) w.p1DoubleVal += (Math.random() - 0.5) * mutationStrength;
        if (Math.random() < mutationRate) w.p2DoubleVal += (Math.random() - 0.5) * mutationStrength;
        w.p1ThreatVal = Math.round(w.p1ThreatVal);
        w.p2ThreatVal = Math.round(w.p2ThreatVal);
        w.p1DoubleVal = Math.round(w.p1DoubleVal);
        w.p2DoubleVal = Math.round(w.p2DoubleVal);
    }
    
    function updatePointSumUI() {
        if(p1SumValEl) p1SumValEl.textContent = p1PointSum;
        if(p2SumValEl) p2SumValEl.textContent = p2PointSum;
    }

    function clearMoveHistoryUI() {
        if(moveHistoryList) {
            moveHistoryList.innerHTML = '<li class="history-placeholder">尚無連線紀錄...</li>';
        }
    }

    function addMoveToHistoryUI(player, calcStr, sum) {
        if (!moveHistoryList) return;
        
        const placeholder = moveHistoryList.querySelector('.history-placeholder');
        if (placeholder) placeholder.remove();

        const li = document.createElement('li');
        li.className = `history-item ${player === 1 ? 'p1' : 'p2'}`;
        
        const playerName = (player === 1) ? "P1" : "P2"; 
        
        li.innerHTML = `
            <span>${playerName}</span>
            <span>
                ${calcStr} = <span class="sum-badge">${sum}</span>
            </span>
        `;
        
        moveHistoryList.appendChild(li);
        
        const container = document.getElementById('move-history-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    if (openPuzzleBtn) {
        openPuzzleBtn.addEventListener('click', () => {
            puzzlePanel.classList.remove('hidden');
            if (!scoreAndGoCheckbox.checked) {
                scoreAndGoCheckbox.checked = true;
                isScoreAndGoAgain = true;
            }
            scoreAndGoCheckbox.disabled = true; 
        });
    }

    if (closePuzzleBtn) {
        closePuzzleBtn.addEventListener('click', () => {
            if (isPuzzleSearching) {
                if(!confirm("搜尋正在進行中，確定要離開嗎？(搜尋將會停止)")) return;
                stopPuzzleSearch();
            }
            puzzlePanel.classList.add('hidden');
            scoreAndGoCheckbox.disabled = false; 
        });
    }

    if (startPuzzleSearchBtn) startPuzzleSearchBtn.addEventListener('click', startPuzzleSearch);
    if (stopPuzzleSearchBtn) stopPuzzleSearchBtn.addEventListener('click', stopPuzzleSearch);

    function startPuzzleSearch() {
        isPuzzleSearching = true;
        startPuzzleSearchBtn.classList.add('hidden');
        stopPuzzleSearchBtn.classList.remove('hidden');
        puzzleStatusEl.textContent = "🔍 搜尋中... (請稍候，這可能需要幾秒鐘)";
        puzzleStatusEl.style.color = "#27ae60";

        const minChain = parseInt(puzzleMinChainInput.value, 10) || 5;

        aiWorker.postMessage({
            command: 'search_chain',
            gameConfig: {
                dots: dots,
                lines: lines,
                triangles: triangles,
                totalTriangles: totalTriangles,
                requiredLineLength: REQUIRED_LINE_LENGTH,
                isScoreAndGoAgain: true, 
                allowShorterLines: allowShorterLinesCheckbox.checked,
                minChain: minChain,
                is3DMode: is3DMode // 👈 確保傳送
            }
        });
    }

    function stopPuzzleSearch() {
        isPuzzleSearching = false;
        initializeAIWorker(); 
        
        startPuzzleSearchBtn.classList.remove('hidden');
        stopPuzzleSearchBtn.classList.add('hidden');
        puzzleStatusEl.textContent = "搜尋已停止";
        puzzleStatusEl.style.color = "#e74c3c";
    }

    function handlePuzzleFound(puzzleData) {
        if (!isPuzzleSearching) return;
        
        console.log("找到謎題!", puzzleData);
        
        const puzzleId = foundPuzzles.length + 1;
        foundPuzzles.push(puzzleData);

        const emptyMsg = puzzleListEl.querySelector('.puzzle-empty');
        if (emptyMsg) emptyMsg.remove();

        const li = document.createElement('li');
        li.className = 'puzzle-item';
        li.innerHTML = `
            <div class="puzzle-info">
                <span class="puzzle-title">謎題 #${puzzleId} (連鎖 ${puzzleData.chainLength} 步)</span>
                <span class="puzzle-meta">剩餘面數: ${puzzleData.chainLength} | 玩家: ${puzzleData.player}</span>
            </div>
            <button class="btn primary small" style="width: auto; padding: 5px 10px;">載入</button>
        `;
        
        li.addEventListener('click', () => loadPuzzle(puzzleData));
        
        puzzleListEl.prepend(li); 
    }

    if (clearPuzzleListBtn) {
        clearPuzzleListBtn.addEventListener('click', () => {
            if (foundPuzzles.length === 0) return;
            if (confirm("確定要清空所有已發現的謎題紀錄嗎？")) {
                clearPuzzleHistory();
            }
        });
    }

    function clearPuzzleHistory() {
        foundPuzzles = [];
        if (puzzleListEl) {
            puzzleListEl.innerHTML = '<li class="puzzle-empty">尚未發現謎題，請點擊「開始搜尋」...</li>';
        }
        console.log("謎題紀錄已清空");
    }

    function loadPuzzle(puzzleData) {
        if (isPuzzleSearching) {
            stopPuzzleSearch();
        }
        puzzlePanel.classList.add('hidden');
        scoreAndGoCheckbox.disabled = false;
        
        initGame(); 

        for (const id in puzzleData.lines) {
            if (lines[id]) {
                lines[id].drawn = puzzleData.lines[id].drawn;
                lines[id].player = puzzleData.lines[id].player;
                lines[id].sharedBy = puzzleData.lines[id].sharedBy;
            }
        }
        
        recalculateBoardStatus();
        
        currentPlayer = puzzleData.player;
        
        gameModeSelect.value = "0"; 
        gameMode = 0;
        
        scoreAndGoCheckbox.checked = true;
        isScoreAndGoAgain = true;

        updateUI();
        drawCanvas();
        
        alert(`謎題已載入！\n\n目標：請畫出一條線，觸發連鎖反應，吃掉剩下的 ${puzzleData.chainLength} 個面！`);
    }

    initGame();
    loadBoardFromCloud();
});
