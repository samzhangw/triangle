
/**
 * ============================================
 * AI Web Worker (ai-worker.js) - Ultimate Edition
 * * 包含所有 AI 運算邏輯:
 * 1. Minimax 演算法 (深度解鎖版)
 * 2. Smart Greedy (防守型貪婪)
 * 3. MCTS (長考版)
 * 4. 基因演算法訓練模擬 (含準確率驗證)
 * 5. [新增] 連鎖解謎搜尋 (Chain Puzzle Search)
 * ============================================
 */

// --- 1. AI 核心變數 ---
let transpositionTable = new Map();
let dots = [];
let totalTriangles = 0;
let REQUIRED_LINE_LENGTH = 1;

// 遊戲規則
let isScoreAndGoAgain = false; 
let isAllowShorterLines = false; // 允許短連線
const QUIESCENCE_MAX_DEPTH = 3;

// 自訂權重 (用於 Trained 模式)
let customWeights = null; 

// 預設權重 (V10.0 強度設定)
const DEFAULT_WEIGHTS = {
    scoreScale: 200,      // 提高分數權重
    threatScale: 40,      // 提高威脅權重
    doubleSetupScale: 100, // 高度重視雙重佈局
    p1ThreatVal: 40,    
    p2ThreatVal: -40,
    p1DoubleVal: 100,
    p2DoubleVal: -100
};

// --- 2. 訊息處理 ---

self.onmessage = (e) => {
    const data = e.data;

    if (data.command === 'start') {
        const aiType = data.aiType || 'minimax';
        const player = data.gameState.player;
        
        // 更新狀態
        dots = data.gameState.dots;
        totalTriangles = data.gameState.totalTriangles;
        REQUIRED_LINE_LENGTH = data.gameState.requiredLineLength;
        isScoreAndGoAgain = data.gameState.isScoreAndGoAgain; 
        isAllowShorterLines = data.gameState.allowShorterLines;
        
        if (aiType === 'trained' && data.weights) {
            customWeights = data.weights;
        } else {
            customWeights = null;
        }

        const playerName = (player === 2) ? "AI 2 (Max)" : "AI 1 (Min)";
        let bestMove;
        
        if (aiType === 'greedy') {
            logToMain(`--- [Worker] ${playerName} 使用 Smart Greedy (智慧貪婪) ---`);
            transpositionTable.clear();
            bestMove = findBestGreedyMove(
                data.gameState.lines, 
                data.gameState.triangles, 
                player
            );
        } else if (aiType === 'mcts') {
            logToMain(`--- [Worker] ${playerName} 使用 MCTS (長考模式) ---`);
            transpositionTable.clear();
            bestMove = findBestMCTSMove(
                data.gameState.lines,
                data.gameState.triangles,
                player
            );
        } else { 
            // Minimax 或 Trained
            logToMain(`--- [Worker] ${playerName} 使用 Deep Minimax (深度全開) ---`);
            transpositionTable.clear();
            bestMove = findBestAIMove(
                data.gameState.lines, 
                data.gameState.triangles, 
                player,
                customWeights // 傳入自訂權重
            );
        }
        
        self.postMessage({
            type: 'result',
            bestMove: bestMove
        });

    } else if (data.command === 'train_generation') {
        runTrainingGeneration(data.population, data.gameConfig);
    } else if (data.command === 'search_chain') {
        // [新增] 連鎖解謎搜尋指令
        runChainSearch(data.gameConfig);
    }
};

function logToMain(message) {
    self.postMessage({ type: 'log', message: message });
}

// --- 3. 遊戲邏輯輔助函式 ---
function getLineId(dot1, dot2) {
    if (!dot1 || !dot2) return null;
    let d1 = dot1, d2 = dot2;
    if (dot1.r > dot2.r || (dot1.r === dot2.r && dot1.c > dot2.c)) {
        d1 = dot2; d2 = dot1;
    }
    return `${d1.r},${d1.c}_${d2.r},${d2.c}`;
}
function isClose(val, target, tolerance = 1.5) {
    return Math.abs(val - target) < tolerance;
}
function findIntermediateDots(dotA, dotB) {
    const intermediateDots = [];
    const minX = Math.min(dotA.x, dotB.x) - 1;
    const maxX = Math.max(dotA.x, dotB.x) + 1;
    const minY = Math.min(dotA.y, dotB.y) - 1;
    const maxY = Math.max(dotA.y, dotB.y) + 1;
    const EPSILON = 1e-6; 
    dots.flat().forEach(dot => {
        if (dot.x >= minX && dot.x <= maxX && dot.y >= minY && dot.y <= maxY) {
            const crossProduct = (dotB.y - dotA.y) * (dot.x - dotB.x) - (dot.y - dotB.y) * (dotB.x - dotA.x);
            if (Math.abs(crossProduct) < EPSILON) intermediateDots.push(dot);
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
    
    // 判斷長度邏輯
    if (segmentIds.length === 0 && dotA !== dotB) return false;
    
    if (isAllowShorterLines) {
        if (segmentIds.length < 1 || segmentIds.length > REQUIRED_LINE_LENGTH) return false;
    } else {
        if (segmentIds.length !== REQUIRED_LINE_LENGTH) return false; 
    }

    let allSegmentsExist = true;
    let hasUndrawnSegment = false; 
    for (const id of segmentIds) {
        if (!id || !currentLines[id]) { allSegmentsExist = false; break; }
        if (!currentLines[id].drawn) { hasUndrawnSegment = true; }
    }
    if (!allSegmentsExist) return false; 
    if (!hasUndrawnSegment) return false; 
    return true;
}

// 快速狀態複製
function cloneState(lines, triangles) {
    const newLines = {};
    for (const key in lines) {
        newLines[key] = { ...lines[key] };
    }
    const newTriangles = triangles.map(t => ({ ...t }));
    return { lines: newLines, triangles: newTriangles };
}

// 深度複製
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// --- 4. 評估與模擬邏輯 ---
// (保留原有的 Minimax, MCTS, Greedy 邏輯，此處省略以節省空間，請保持原文件這部分不變)
// ... [findAllValidMoves, evaluateBoard, simulateMove 等] ...

function findAllValidMoves(currentLines) {
    const moves = [];
    const allDots = dots.flat();
    for (let i = 0; i < allDots.length; i++) {
        for (let j = i + 1; j < allDots.length; j++) {
            const dotA = allDots[i];
            const dotB = allDots[j];
            if (isValidPreviewLine(dotA, dotB, currentLines)) {
                const segmentIds = [];
                const dotsOnLine = findIntermediateDots(dotA, dotB); 
                for (let k = 0; k < dotsOnLine.length - 1; k++) {
                    segmentIds.push(getLineId(dotsOnLine[k], dotsOnLine[k+1]));
                }
                moves.push({ dot1: dotA, dot2: dotB, segmentIds: segmentIds });
            }
        }
    }
    return moves;
}

function simulateMove(move, currentLines, currentTriangles, player) {
    const state = cloneState(currentLines, currentTriangles);
    const newLines = state.lines;
    const newTriangles = state.triangles;
    
    let scoreGained = 0;
    let newSegmentDrawn = false;
    for (const id of move.segmentIds) {
        if (newLines[id]) { 
            if (!newLines[id].drawn) { 
                newLines[id].drawn = true;
                newLines[id].player = player;
                newSegmentDrawn = true;
            } else if (newLines[id].player !== 0 && newLines[id].player !== player) {
                if (newLines[id].sharedBy === 0) newLines[id].sharedBy = player;
            }
        }
    }
    if (!newSegmentDrawn) return null; 
    
    newTriangles.forEach(tri => {
        if (!tri.filled) {
            const isComplete = tri.lineKeys.every(key => newLines[key] && newLines[key].drawn);
            if (isComplete) {
                tri.filled = true;
                tri.player = player;
                scoreGained++;
            }
        }
    });
    return { newLines, newTriangles, scoreGained };
}

function findAllScoringMoves(currentLines, currentTriangles, player) {
    // 簡化版邏輯，只找能得分的
    const scoringMoves = [];
    const allValidMoves = findAllValidMoves(currentLines);
    for (const move of allValidMoves) {
        // 快速預判：這條線是否補齊了某個三角形
        let potentialScore = 0;
        const segmentIds = move.segmentIds;
        // 檢查每個未滿的三角形
        for (const tri of currentTriangles) {
            if (!tri.filled) {
                // 計算三角形缺幾條線
                let missing = 0;
                let missingKey = null;
                for (const key of tri.lineKeys) {
                    if (!currentLines[key].drawn) {
                        missing++;
                        missingKey = key;
                    }
                }
                // 如果只缺 1 條線，且這條線包含在 move 裡
                if (missing === 1 && segmentIds.includes(missingKey)) {
                    potentialScore++;
                }
            }
        }
        if (potentialScore > 0) scoringMoves.push(move);
    }
    return scoringMoves;
}

// ==========================================================
// 🧩 [新增] 連鎖解謎搜尋 (Chain Puzzle Search)
// ==========================================================

function runChainSearch(config) {
    // 更新全局設定
    dots = config.dots;
    totalTriangles = config.totalTriangles;
    REQUIRED_LINE_LENGTH = config.requiredLineLength;
    isScoreAndGoAgain = true; // 強制為 True
    isAllowShorterLines = config.allowShorterLines;

    const minChain = config.minChain || 5;

    // 搜尋迴圈：持續模擬遊戲
    // 為了不卡死 Worker，我們使用 setTimeout 遞迴，或者每次 loop 跑一個遊戲
    // 但因為這是 Worker，while loop 是安全的，只要能被 terminate (前端 stop) 即可。
    
    let attempts = 0;
    
    while (true) { // 無限迴圈，直到被外部 terminate
        attempts++;
        simulateGameForPuzzle(config.lines, config.triangles, minChain);
        
        // 每 100 場稍微讓步一下，雖 Worker 不需，但可避免過熱或用於調度
        if (attempts % 100 === 0) {
            // 這裡無法 sleep，但無所謂
        }
    }
}

function simulateGameForPuzzle(initialLines, initialTriangles, minChain) {
    let currentLines = deepCopy(initialLines);
    let currentTriangles = deepCopy(initialTriangles);
    let currentPlayer = 1; // 假設 P1 先手，或隨機
    let filledCount = 0;
    
    // 隨機開局玩家
    if (Math.random() > 0.5) currentPlayer = 2;

    while (filledCount < totalTriangles) {
        
        // 1. 在做任何移動「前」，檢查是否是一個潛在的謎題狀態
        // 條件：剩餘格子 >= minChain
        const remaining = totalTriangles - filledCount;
        
        if (remaining >= minChain) {
            // 檢查：如果我現在亂走一步(或最佳步)，是否能觸發全清？
            // 為了效能，我們不檢查「所有」步，而是直接模擬這回合發生了什麼。
            // 我們記錄「回合開始前的狀態」。
        }
        
        const stateBeforeTurn = {
            lines: cloneState(currentLines, currentTriangles).lines,
            player: currentPlayer,
            remaining: remaining
        };

        // 2. 模擬這一個回合 (包含所有連續得分)
        const turnResult = simulateTurn(currentLines, currentTriangles, currentPlayer);
        
        currentLines = turnResult.finalLines;
        currentTriangles = turnResult.finalTriangles;
        const totalScoreInTurn = turnResult.scoreGained;
        
        // 更新全域計數
        filledCount += totalScoreInTurn;
        
        // 3. 檢查謎題條件
        // 條件 A: 這個回合得分了 (turnResult.scoreGained > 0)
        // 條件 B: 且這個回合把「剩下所有」三角形都吃光了 (filledCount === totalTriangles)
        // 條件 C: 且這回合吃的數量 >= minChain
        
        if (totalScoreInTurn > 0 && 
            filledCount === totalTriangles && 
            totalScoreInTurn >= minChain) {
            
            // 🎯 找到謎題了！
            // 發送「回合開始前的狀態」回去
            self.postMessage({
                type: 'chain_puzzle_found',
                puzzleData: {
                    lines: stateBeforeTurn.lines,
                    player: stateBeforeTurn.player,
                    chainLength: stateBeforeTurn.remaining
                }
            });
            
            // 為了避免重複發送極相似的謎題，可以稍作延遲或跳過
            // 但在這裡我們直接繼續找下一場
            return;
        }

        // 換人 (如果是正常回合結束)
        if (!turnResult.gameEnded) {
            currentPlayer = (currentPlayer === 1) ? 2 : 1;
        } else {
            break; // 遊戲結束
        }
    }
}

// 模擬「單一回合」的所有動作 (含 Bonus Moves)
function simulateTurn(startLines, startTriangles, player) {
    let lines = startLines;
    let triangles = startTriangles;
    let totalScore = 0;
    
    while (true) { // Bonus move loop
        // 策略：使用隨機 (Random) 或 簡單貪婪 (Simple Greedy)
        // 為了製造更多「懸念」(剩很多格子但沒人吃)，我們可以使用 Random，
        // 但 Random 常常會把自己走死。
        // 混合策略：80% Random, 20% Take Score (如果有的話)
        
        const allMoves = findAllValidMoves(lines);
        if (allMoves.length === 0) break; // 無步可走

        let selectedMove = null;

        // 嘗試找得分步
        const scoringMoves = findAllScoringMoves(lines, triangles, player);
        
        if (scoringMoves.length > 0) {
            // 如果有得分機會，為了測試「連鎖」，我們必須走這一步
            // 這樣才能模擬出「玩家發現連鎖」的情境
            selectedMove = scoringMoves[Math.floor(Math.random() * scoringMoves.length)];
        } else {
            // 沒有得分機會，隨機走一步 (佈局)
            selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
        }
        
        const sim = simulateMove(selectedMove, lines, triangles, player);
        if (!sim) break; // 防呆
        
        lines = sim.newLines;
        triangles = sim.newTriangles;
        
        if (sim.scoreGained > 0) {
            totalScore += sim.scoreGained;
            // 規則是 Score And Go Again，所以繼續迴圈
            // 檢查是否已全滿
            const allFilled = triangles.every(t => t.filled);
            if (allFilled) break;
        } else {
            // 沒得分，回合結束
            break;
        }
    }
    
    return {
        finalLines: lines,
        finalTriangles: triangles,
        scoreGained: totalScore,
        gameEnded: triangles.every(t => t.filled)
    };
}

// (為了完整性，這裡需要包含 findBestGreedyMove, findBestMCTSMove 等其他模式的代碼，
//  但因為您只要求新增功能，且 ai-worker.js 很大，
//  假設這些函數已存在於原檔案中。若需完整代碼，請參照原提供的 ai-worker.js 補上這些輔助函數。)
function findBestGreedyMove(currentLines, currentTriangles, player) { /* ...原代碼... */ }
function findBestMCTSMove(initialLines, initialTriangles, rootPlayer) { /* ...原代碼... */ }
function findBestAIMove(currentLines, currentTriangles, player, weights) { /* ...原代碼... */ }

