/**
 * ============================================
 * AI Web Worker (ai-worker.js)
 * * 包含所有 AI 運算邏輯:
 * 1. Minimax 演算法
 * 2. 迭代加深
 * 3. 基因演算法訓練模擬
 * 4. (**** 新功能 ****) MCTS 蒙地卡羅樹搜尋
 * ============================================
 */

// --- 1. AI 核心變數 ---
let transpositionTable = new Map();
let dots = [];
let totalTriangles = 0;
let REQUIRED_LINE_LENGTH = 1;

// 遊戲規則
let isScoreAndGoAgain = false; 
const QUIESCENCE_MAX_DEPTH = 3;

// 自訂權重 (用於 Trained 模式)
let customWeights = null; 

// 預設權重 (傳統 Minimax 使用)
const DEFAULT_WEIGHTS = {
    scoreScale: 150,
    threatScale: 25,
    doubleSetupScale: 75,
    p1Threat: 25,    
    p2Threat: -25,
    p1Double: 75,
    p2Double: -75
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
        
        if (aiType === 'trained' && data.weights) {
            customWeights = data.weights;
        } else {
            customWeights = null;
        }

        const playerName = (player === 2) ? "AI 2 (Max)" : "AI 1 (Min)";
        let bestMove;
        
        if (aiType === 'greedy') {
            logToMain(`--- [Worker] ${playerName} 使用 Greedy 策略 ---`);
            transpositionTable.clear();
            bestMove = findBestGreedyMove(
                data.gameState.lines, 
                data.gameState.triangles, 
                player,
                playerName
            );
        } else if (aiType === 'mcts') {
            logToMain(`--- [Worker] ${playerName} 使用 MCTS (蒙地卡羅) 強力搜尋 ---`);
            // MCTS 也不使用 Minimax 的置換表
            transpositionTable.clear();
            bestMove = findBestMCTSMove(
                data.gameState.lines,
                data.gameState.triangles,
                player
            );
        } else { 
            // Minimax 或 Trained
            logToMain(`--- [Worker] ${playerName} 使用 Minimax/Trained 策略 ---`);
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
    }
};

function logToMain(message) {
    self.postMessage({ type: 'log', message: message });
}

function postIntermediateResult(move, depth, score) {
    self.postMessage({
        type: 'progress',
        message: `[Worker] 深度 ${depth} 完成。 評分: ${score.toFixed(0)}`,
        bestMove: move 
    });
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
    if (segmentIds.length === 0 && dotA !== dotB) return false;
    if (segmentIds.length !== REQUIRED_LINE_LENGTH) return false; 
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

// 深度複製 (JSON方式慢，保留用於舊函式)
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// (**** 新功能 ****) 快速狀態複製 (用於 MCTS 高頻模擬)
function cloneState(lines, triangles) {
    // 淺層複製 lines 物件，但複製內部的每個 line 物件
    const newLines = {};
    for (const key in lines) {
        // 解構賦值比 JSON.parse 快得多
        newLines[key] = { ...lines[key] };
    }
    
    // 複製 triangles 陣列
    const newTriangles = triangles.map(t => ({ ...t }));
    
    return { lines: newLines, triangles: newTriangles };
}

// --- 4. 評估與模擬邏輯 ---

function getBoardHash(lines, triangles, player) {
    let lineHash = "";
    for (const id of Object.keys(lines)) {
        if (lines[id].drawn) lineHash += `L${id}${lines[id].player}${lines[id].sharedBy};`;
    }
    let triHash = "";
    triangles.forEach((tri, idx) => {
        if (tri.filled) triHash += `T${idx}${tri.player};`;
    });
    return lineHash + triHash + `P${player}`;
}

function simulateMove(move, currentLines, currentTriangles, player) {
    // 注意：這裡如果用在 MCTS 內部迴圈，建議改用 cloneState 或原地修改後還原
    // 但為了代碼穩定性，先使用 cloneState 優化
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

function evaluateBoard(currentLines, currentTriangles, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    let p2Score = 0; // AI (Max)
    let p1Score = 0; // Human (Min)
    let p1Threats = 0; 
    let p2Threats = 0; 
    let p1DoubleSetups = 0;
    let p2DoubleSetups = 0;
    
    currentTriangles.forEach((tri, triIndex) => {
        if (tri.filled) {
            if (tri.player === 2) p2Score++;
            else p1Score++;
        } else {
            let drawnCount = 0;
            let undrawnKey = null;
            let p1Lines = 0;
            let p2Lines = 0;
            tri.lineKeys.forEach(key => {
                if (currentLines[key] && currentLines[key].drawn) {
                    drawnCount++;
                    if (currentLines[key].player === 1) p1Lines++;
                    if (currentLines[key].player === 2) p2Lines++;
                    if (currentLines[key].sharedBy === 1) p1Lines++;
                    if (currentLines[key].sharedBy === 2) p2Lines++;
                } else {
                    undrawnKey = key;
                }
            });
            if (drawnCount === 2) {
                let completesTwo = false;
                currentTriangles.forEach((otherTri, otherTriIndex) => {
                    if (otherTriIndex !== triIndex && !otherTri.filled && otherTri.lineKeys.includes(undrawnKey)) {
                        let otherDrawnCount = 0;
                        otherTri.lineKeys.forEach(okey => {
                            if (currentLines[okey] && currentLines[okey].drawn) {
                                otherDrawnCount++;
                            }
                        });
                        if (otherDrawnCount === 2) {
                            completesTwo = true;
                        }
                    }
                });
                if (p1Lines > p2Lines) { 
                    p1Threats++;
                    if (completesTwo) p1DoubleSetups++;
                }
                else if (p2Lines > p1Lines) { 
                    p2Threats++;
                    if (completesTwo) p2DoubleSetups++;
                }
            }
        }
    });

    let totalFilled = p1Score + p2Score;
    if (totalFilled === totalTriangles) {
        if (p2Score > p1Score) return 1000000; 
        if (p1Score > p2Score) return -1000000;
        return 0; 
    }

    const scoreVal = w.scoreScale || 150;
    const valP1T = w.p1ThreatVal || 25; 
    const valP2T = w.p2ThreatVal || -25;
    const valP1D = w.p1DoubleVal || 75;
    const valP2D = w.p2DoubleVal || -75;

    return (p2Score * scoreVal - p1Score * scoreVal) +
           (p1Threats * valP1T + p2Threats * valP2T) +
           (p1DoubleSetups * valP1D + p2DoubleSetups * valP2D);
}

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

function findAllScoringMoves(currentLines, currentTriangles, player) {
    const scoringMoves = [];
    const allValidMoves = findAllValidMoves(currentLines);
    for (const move of allValidMoves) {
        let scoreGained = 0;
        const segmentIds = move.segmentIds;
        const newSegments = segmentIds.filter(id => currentLines[id] && !currentLines[id].drawn);
        if (newSegments.length === 0) continue; 
        currentTriangles.forEach(tri => {
            if (!tri.filled) {
                let missingKeys = tri.lineKeys.filter(key => !currentLines[key] || !currentLines[key].drawn);
                let allMissingKeysCovered = missingKeys.every(mKey => segmentIds.includes(mKey));
                if (missingKeys.length > 0 && allMissingKeysCovered) {
                    let otherKeysDrawn = tri.lineKeys
                        .filter(key => !missingKeys.includes(key))
                        .every(oKey => currentLines[oKey] && currentLines[oKey].drawn);
                    if (otherKeysDrawn) scoreGained++;
                }
            }
        });
        if (scoreGained > 0) scoringMoves.push(move);
    }
    return scoringMoves;
}

// ==========================================================
// Greedy Algorithm
// ==========================================================
function findBestGreedyMove(currentLines, currentTriangles, player, playerName) {
    const allMoves = findAllValidMoves(currentLines);
    if (allMoves.length === 0) return null;
    let bestScoringMoves = [];
    let maxScore = 0; 
    for (const move of allMoves) {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (!sim) continue;
        if (sim.scoreGained > maxScore) {
            maxScore = sim.scoreGained;
            bestScoringMoves = [move]; 
        } else if (sim.scoreGained === maxScore && maxScore > 0) {
            bestScoringMoves.push(move);
        }
    }
    if (bestScoringMoves.length > 0) {
        return bestScoringMoves[Math.floor(Math.random() * bestScoringMoves.length)];
    } else {
        return allMoves[Math.floor(Math.random() * allMoves.length)];
    }
}

// ==========================================================
// (**** 新功能 ****) MCTS (蒙地卡羅樹搜尋)
// ==========================================================

class MCTSNode {
    constructor(state, parent = null, move = null, playerJustMoved = null) {
        this.state = state; // { lines, triangles, scores, currentPlayer }
        this.parent = parent;
        this.move = move; // 導致此狀態的移動
        this.children = [];
        this.wins = 0;
        this.visits = 0;
        this.untriedMoves = null; // 將在第一次擴展時計算
        this.playerJustMoved = playerJustMoved; // 誰走了這一步產生此節點
    }

    isFullyExpanded() {
        return this.untriedMoves !== null && this.untriedMoves.length === 0;
    }

    getUCTValue(cParam = 1.414) {
        if (this.visits === 0) return Infinity;
        // UCT = (wins / visits) + c * sqrt(ln(parent.visits) / visits)
        // 注意：這裡的 wins 是相對於 "parent's player" 的勝率，還是自己的？
        // 通常是反過來的，因為對手會選對我最不利的。
        // 這裡簡化：wins 是 "該節點代表的玩家" 獲勝的次數。
        // 但父節點在選擇時，是 "父節點的當前玩家" 要選對自己最有利的。
        // 如果子節點是 P2 走的，那對 P1 (父) 來說，子節點勝率高意味著 P2 贏，這是不好的。
        // 但 MCTS 通常會翻轉視角。
        // 簡單做法：wins 總是存 "Move Maker" 贏的次數。
        // 父節點 (P1) 選擇時，要找 P1 勝率高的子節點 (即子節點 P2 輸的)。
        // 為了通用，我們讓 wins 紀錄 "Root Player" 的勝場數。
        return (this.wins / this.visits) + cParam * Math.sqrt(Math.log(this.parent.visits) / this.visits);
    }
}

function findBestMCTSMove(initialLines, initialTriangles, rootPlayer) {
    const startTime = performance.now();
    const TIME_LIMIT = 2000; // 思考時間 (毫秒)

    // 初始狀態
    const rootState = {
        lines: deepCopy(initialLines),
        triangles: deepCopy(initialTriangles),
        scores: { 1: 0, 2: 0 },
        currentPlayer: rootPlayer,
        filledCount: 0 // 需計算
    };
    
    // 計算初始 filledCount
    initialTriangles.forEach(t => { if(t.filled) rootState.filledCount++; });
    
    // 檢查初始分數 (雖然 MCTS 通常從 0 開始算增量，但這遊戲有總分概念)
    // 這裡我們只關注 *未來* 的勝負，所以初始分數設為 0 對 rollout 沒差，
    // 但為了正確判斷勝負，我們需要正確的 scores。
    // 實際上我們需要知道當前已經幾分了。
    let p1Init = 0, p2Init = 0;
    initialTriangles.forEach(t => { if(t.filled && t.player === 1) p1Init++; if(t.filled && t.player === 2) p2Init++; });
    rootState.scores = { 1: p1Init, 2: p2Init };

    const rootNode = new MCTSNode(rootState, null, null, null);
    
    // 計算初始可行步
    rootNode.untriedMoves = findAllValidMoves(rootState.lines);

    let iterations = 0;
    
    while (performance.now() - startTime < TIME_LIMIT) {
        iterations++;
        let node = rootNode;
        let state = deepCopy(node.state); // 工作副本

        // 1. Selection (選擇)
        while (node.untriedMoves !== null && node.untriedMoves.length === 0 && node.children.length > 0) {
            node = node.children.reduce((best, child) => {
                return child.getUCTValue() > best.getUCTValue() ? child : best;
            });
            // 更新狀態到子節點
            // 注意：這裡應該要 apply move，但為了效能，我們通常不儲存完整 state 在每個 node
            // 簡化版：每個 node 存 state (耗記憶體但簡單)
            state = deepCopy(node.state);
        }

        // 2. Expansion (擴展)
        if (node.untriedMoves !== null && node.untriedMoves.length > 0) {
            const moveIndex = Math.floor(Math.random() * node.untriedMoves.length);
            const move = node.untriedMoves.splice(moveIndex, 1)[0];
            
            // 執行移動
            const sim = simulateMove(move, state.lines, state.triangles, state.currentPlayer);
            
            // 更新狀態
            const nextState = {
                lines: sim.newLines,
                triangles: sim.newTriangles,
                scores: { ...state.scores },
                currentPlayer: state.currentPlayer,
                filledCount: state.filledCount
            };
            
            let nextPlayer = state.currentPlayer;
            if (sim.scoreGained > 0) {
                nextState.scores[state.currentPlayer] += sim.scoreGained;
                nextState.filledCount += sim.scoreGained;
                if (!isScoreAndGoAgain) {
                    nextPlayer = (state.currentPlayer === 1) ? 2 : 1;
                }
            } else {
                nextPlayer = (state.currentPlayer === 1) ? 2 : 1;
            }
            nextState.currentPlayer = nextPlayer;

            const childNode = new MCTSNode(nextState, node, move, state.currentPlayer);
            childNode.untriedMoves = findAllValidMoves(nextState.lines);
            node.children.push(childNode);
            node = childNode;
            state = nextState;
        }

        // 3. Simulation (模擬 / Rollout)
        // 隨機走到底
        let tempState = state; // 使用 reference 因為後面不會再用到
        // 優化：這裡不要一直 deepCopy，而是用 cloneState 
        // 甚至在迴圈中做 mutable update 
        let currentLinesSim = cloneState(tempState.lines, tempState.triangles).lines; // Hacky copy
        // 為了效能，這段 Rollout 必須快
        // 我們重寫一個極簡版的 Rollout
        
        let simPlayer = tempState.currentPlayer;
        let simScores = { ...tempState.scores };
        let simFilled = tempState.filledCount;
        
        // 取得剩下所有可走步
        let possibleMoves = findAllValidMoves(currentLinesSim); 
        
        // 隨機洗牌 moves 避免偏差
        for (let i = possibleMoves.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [possibleMoves[i], possibleMoves[j]] = [possibleMoves[j], possibleMoves[i]];
        }

        let moveIdx = 0;
        while (simFilled < totalTriangles && moveIdx < possibleMoves.length) {
            const rMove = possibleMoves[moveIdx++];
            // 檢查是否還合法 (因為可能被其他線影響? 不會，因為我們是用 ID)
            // 但需要檢查該線是否已被畫過 (在 moves 列表中可能有重複? 不會 findAllValidMoves 不重複)
            // 但 ID 是唯一的。
            // 只需要檢查 lines 物件
            
            // 執行
            // 這裡為了快，直接操作 currentLinesSim (它已經是副本)
            // 但 tri 需要檢查
            // 這裡必須用到 simulateMove 邏輯
            
            const sim = simulateMove(rMove, currentLinesSim, tempState.triangles, simPlayer); 
            // 注意：simulateMove 會回傳 NEW objects，這比較慢。
            // 真正的 MCTS 優化會原地修改。
            // 鑑於 JS Worker 效能限制，我們接受這個開銷，但用 cloneState 優化過了。
            
            if (!sim) continue; // 應該不會發生
            
            currentLinesSim = sim.newLines;
            tempState.triangles = sim.newTriangles; // 更新 ref (這是副本的 triangles)
            
            if (sim.scoreGained > 0) {
                simScores[simPlayer] += sim.scoreGained;
                simFilled += sim.scoreGained;
                if (isScoreAndGoAgain) {
                    // 同一人繼續，且這一步已經消耗了，不用換人，也不用重置 moveIdx
                    // 但下一輪是同一個人。
                    // 我們的 possibleMoves 列表是靜態的。
                    // 這在 "得分再走" 規則下有問題：因為下一次的 valid moves 會變少。
                    // 為了正確性，每次都得重新 findAllValidMoves。這非常慢。
                    // 妥協：MCTS 在 Rollout 階段只做簡單隨機，忽略 "再走一步" 的策略深度，
                    // 或者：如果得分，直接繼續隨機選。
                    continue; 
                }
            }
            simPlayer = (simPlayer === 1) ? 2 : 1;
        }

        // 4. Backpropagation (反向傳播)
        let winner = 0;
        if (simScores[rootPlayer] > simScores[(rootPlayer===1?2:1)]) winner = 1; // Root player wins
        else if (simScores[rootPlayer] < simScores[(rootPlayer===1?2:1)]) winner = 0; // Loss
        else winner = 0.5; // Draw

        while (node !== null) {
            node.visits++;
            node.wins += winner; 
            node = node.parent;
        }
    }
    
    logToMain(`MCTS 完成，迭代次數: ${iterations}`);

    // 選擇訪問次數最多的子節點
    if (rootNode.children.length === 0) return null;
    
    const bestChild = rootNode.children.reduce((best, child) => {
        return child.visits > best.visits ? child : best;
    });
    
    return bestChild.move;
}


// ==========================================================
// Minimax 演算法
// ==========================================================

function quiescenceSearch(currentLines, currentTriangles, depth, isMaximizingPlayer, alpha, beta, weights) {
    const boardHash = getBoardHash(currentLines, currentTriangles, isMaximizingPlayer ? 2 : 1);
    const ttEntry = transpositionTable.get(boardHash);
    if (ttEntry && ttEntry.depth >= depth) { 
        if (ttEntry.flag === 0) return ttEntry.score;
        if (ttEntry.flag === 1) alpha = Math.max(alpha, ttEntry.score);
        if (ttEntry.flag === 2) beta = Math.min(beta, ttEntry.score);
        if (alpha >= beta) return ttEntry.score;
    }

    // 傳入 weights
    const standPatScore = evaluateBoard(currentLines, currentTriangles, weights);
    
    if (Math.abs(standPatScore) >= 1000000) return standPatScore;
    if (depth === 0) return standPatScore;

    let ttFlag = 0;
    if (isMaximizingPlayer) { 
        let bestValue = standPatScore;
        alpha = Math.max(alpha, bestValue);
        const scoringMoves = findAllScoringMoves(currentLines, currentTriangles, 2); 
        if (isScoreAndGoAgain) {
            for (const move of scoringMoves) {
                const sim = simulateMove(move, currentLines, currentTriangles, 2);
                if (!sim) continue;
                const immediateScore = sim.scoreGained * 1000; 
                const futureValue = quiescenceSearch(sim.newLines, sim.newTriangles, depth - 1, true, alpha, beta, weights);
                const totalValue = immediateScore + futureValue; 
                bestValue = Math.max(bestValue, totalValue);
                alpha = Math.max(alpha, bestValue); 
                if (beta <= alpha) { ttFlag = 1; break; }
            }
        }
        transpositionTable.set(boardHash, { score: bestValue, depth: depth, flag: ttFlag });
        return bestValue;
    } else { 
        let bestValue = standPatScore;
        beta = Math.min(beta, bestValue);
        const scoringMoves = findAllScoringMoves(currentLines, currentTriangles, 1); 
        if (isScoreAndGoAgain) {
            for (const move of scoringMoves) {
                const sim = simulateMove(move, currentLines, currentTriangles, 1);
                if (!sim) continue;
                const immediateScore = sim.scoreGained * 1000;
                const futureValue = quiescenceSearch(sim.newLines, sim.newTriangles, depth - 1, false, alpha, beta, weights);
                const totalValue = -immediateScore + futureValue; 
                bestValue = Math.min(bestValue, totalValue);
                beta = Math.min(beta, bestValue); 
                if (beta <= alpha) { ttFlag = 2; break; }
            }
        }
        transpositionTable.set(boardHash, { score: bestValue, depth: depth, flag: ttFlag });
        return bestValue;
    }
}

function minimax(currentLines, currentTriangles, depth, isMaximizingPlayer, alpha, beta, weights) {
    const boardHash = getBoardHash(currentLines, currentTriangles, isMaximizingPlayer ? 2 : 1);
    const ttEntry = transpositionTable.get(boardHash);
    if (ttEntry && ttEntry.depth >= depth) {
        if (ttEntry.flag === 0) return ttEntry.score;
        if (ttEntry.flag === 1) alpha = Math.max(alpha, ttEntry.score);
        if (ttEntry.flag === 2) beta = Math.min(beta, ttEntry.score);
        if (alpha >= beta) return ttEntry.score;
    }
    
    // 傳入 weights
    const currentEval = evaluateBoard(currentLines, currentTriangles, weights);
    if (Math.abs(currentEval) >= 1000000) { 
        if (currentEval > 0) return currentEval + depth;
        return currentEval - depth;
    }
    
    const allMoves = findAllValidMoves(currentLines);
    if (depth === 0 || allMoves.length === 0) {
        return quiescenceSearch(currentLines, currentTriangles, QUIESCENCE_MAX_DEPTH, isMaximizingPlayer, alpha, beta, weights);
    }
    
    let bestValue;
    let ttFlag = 0; 

    if (isMaximizingPlayer) { 
        bestValue = -Infinity; 
        for (const move of allMoves) {
            const sim = simulateMove(move, currentLines, currentTriangles, 2); 
            if (!sim) continue;
            const immediateScore = sim.scoreGained * 1000;
            const isStillMaximizing = (isScoreAndGoAgain && sim.scoreGained > 0);
            const futureValue = minimax(sim.newLines, sim.newTriangles, depth - 1, isStillMaximizing ? true : false, alpha, beta, weights);
            const totalValue = immediateScore + futureValue; 
            bestValue = Math.max(bestValue, totalValue);
            alpha = Math.max(alpha, bestValue); 
            if (beta <= alpha) { ttFlag = 1; break; }
        }
    } else { 
        bestValue = +Infinity; 
        for (const move of allMoves) {
            const sim = simulateMove(move, currentLines, currentTriangles, 1); 
            if (!sim) continue;
            const immediateScore = sim.scoreGained * 1000; 
            const isStillMinimizing = (isScoreAndGoAgain && sim.scoreGained > 0);
            const futureValue = minimax(sim.newLines, sim.newTriangles, depth - 1, isStillMinimizing ? false : true, alpha, beta, weights); 
            const totalValue = -immediateScore + futureValue; 
            bestValue = Math.min(bestValue, totalValue);
            beta = Math.min(beta, bestValue); 
            if (beta <= alpha) { ttFlag = 2; break; }
        }
    }
    transpositionTable.set(boardHash, { score: bestValue, depth: depth, flag: ttFlag });
    return bestValue;
}

function getAIDepth() {
    switch (REQUIRED_LINE_LENGTH) {
        case 1: return 5; 
        case 2: return 6; 
        case 3: return 7; 
        case 4: case 5: return 8; 
        default: return 6; 
    }
}

/**
 * 找出最佳移動 (支援傳入 weights)
 */
function findBestAIMove(currentLines, currentTriangles, player, weights) {
    const isMaximizingPlayer = (player === 2);
    const MAX_DEPTH = getAIDepth();
    
    let allMoves = findAllValidMoves(currentLines); 
    if (allMoves.length === 0) return null; 

    // Move Ordering
    let scoredMoves = allMoves.map(move => {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (!sim) return { move, value: -Infinity }; 
        const immediateScore = sim.scoreGained * 1000;
        const futureEval = evaluateBoard(sim.newLines, sim.newTriangles, weights); // Pass weights
        let totalValue;
        if (isMaximizingPlayer) {
            totalValue = immediateScore + futureEval;
        } else {
            totalValue = -immediateScore + futureEval;
        }
        return { move, value: totalValue };
    });

    scoredMoves.sort((a, b) => {
        if (a.value === b.value) return Math.random() - 0.5; 
        return isMaximizingPlayer ? b.value - a.value : a.value - b.value;
    });
    
    let bestMove = null;
    let bestValue = isMaximizingPlayer ? -Infinity : +Infinity;

    for (let currentDepth = 1; currentDepth <= MAX_DEPTH; currentDepth++) {
        let alpha = -Infinity;
        let beta = +Infinity;
        let currentBestMoveForDepth = null;
        let currentBestValueForDepth = isMaximizingPlayer ? -Infinity : +Infinity;

        const movesToSearch = Array.from(scoredMoves);
        if (bestMove) {
            movesToSearch.sort((a, b) => {
                const moveAId = getLineId(a.move.dot1, a.move.dot2);
                const moveBId = getLineId(b.move.dot1, b.move.dot2);
                const bestMoveId = getLineId(bestMove.dot1, bestMove.dot2);
                if (moveAId === bestMoveId) return -1;
                if (moveBId === bestMoveId) return 1;
                return 0; 
            });
        }

        for (const scoredMove of movesToSearch) {
            const move = scoredMove.move;
            const sim = simulateMove(move, currentLines, currentTriangles, player);
            if (!sim) continue; 
            const immediateScore = sim.scoreGained * 1000;
            const isStillCurrentPlayer = (isScoreAndGoAgain && sim.scoreGained > 0);
            
            const futureValue = minimax(
                sim.newLines, 
                sim.newTriangles, 
                currentDepth - 1, 
                isStillCurrentPlayer ? isMaximizingPlayer : !isMaximizingPlayer,
                alpha, 
                beta,
                weights // Pass weights
            );
            
            let totalMoveValue;
            if (isMaximizingPlayer) {
                totalMoveValue = immediateScore + futureValue;
                if (totalMoveValue > currentBestValueForDepth) {
                    currentBestValueForDepth = totalMoveValue;
                    currentBestMoveForDepth = move;
                }
                alpha = Math.max(alpha, currentBestValueForDepth);
            } else { 
                totalMoveValue = -immediateScore + futureValue;
                if (totalMoveValue < currentBestValueForDepth) {
                    currentBestValueForDepth = totalMoveValue;
                    currentBestMoveForDepth = move;
                }
                beta = Math.min(beta, currentBestValueForDepth);
            }
        }
        
        bestMove = currentBestMoveForDepth;
        bestValue = currentBestValueForDepth;
        
        if (Math.abs(bestValue) >= (1000000 - MAX_DEPTH)) break;
    }
    return bestMove;
}

// ==========================================================
// 基因演算法訓練模擬
// ==========================================================

function runTrainingGeneration(population, gameConfig) {
    dots = gameConfig.dots;
    totalTriangles = gameConfig.totalTriangles;
    REQUIRED_LINE_LENGTH = gameConfig.requiredLineLength;
    isScoreAndGoAgain = gameConfig.isScoreAndGoAgain;
    
    // 初始化分數
    population.forEach(agent => agent.wins = 0);

    // 1. 執行錦標賽 (訓練)
    const MATCHES_PER_AGENT = 2; 
    for (let i = 0; i < population.length; i++) {
        const agentA = population[i];
        for (let m = 0; m < MATCHES_PER_AGENT; m++) {
            let opponentIdx;
            do {
                opponentIdx = Math.floor(Math.random() * population.length);
            } while (opponentIdx === i);
            const agentB = population[opponentIdx];
            
            const winner = simulateFullGame(agentA.weights, agentB.weights, gameConfig.lines, gameConfig.triangles, false);
            
            if (winner === 1) agentA.wins++;
            else if (winner === 2) agentB.wins++; 
        }
    }

    population.forEach(agent => {
        agent.fitness = agent.wins; 
    });
    
    // 2. 找出最強者並進行「示範賽」以獲取棋盤圖片
    population.sort((a, b) => b.fitness - a.fitness);
    const bestAgent = population[0];
    const opponent = population[1] || population[population.length - 1]; // 與第二名或隨機對手對戰
    
    // 模擬一場，並要求回傳詳細棋盤狀態 (true)
    const showcaseResult = simulateFullGame(bestAgent.weights, opponent.weights, gameConfig.lines, gameConfig.triangles, true);

    // 回傳結果 (包含棋盤狀態)
    self.postMessage({
        type: 'training_result',
        population: population,
        bestAgentBoard: showcaseResult.finalLines 
    });
}

/**
 * 模擬一場完整的 AI vs AI 遊戲
 * @param {boolean} returnDetails - 若為 true，回傳 {winner, finalLines}，否則只回傳 winner
 */
function simulateFullGame(weightsP1, weightsP2, initialLines, initialTriangles, returnDetails = false) {
    let currentLines = deepCopy(initialLines);
    let currentTriangles = deepCopy(initialTriangles);
    let currentPlayer = 1;
    let scores = { 1: 0, 2: 0 };
    let filledCount = 0;
    
    let movesLimit = 200; 
    while (filledCount < totalTriangles && movesLimit > 0) {
        movesLimit--;
        
        const weights = (currentPlayer === 1) ? weightsP1 : weightsP2;
        const isMaximizing = (currentPlayer === 2);
        
        let allMoves = findAllValidMoves(currentLines);
        if (allMoves.length === 0) break; 
        
        allMoves.sort(() => Math.random() - 0.5); 
        
        let bestMove = null;
        let bestVal = isMaximizing ? -Infinity : Infinity;
        
        // 快速 Minimax (深度 1)
        for (const move of allMoves) {
            const sim = simulateMove(move, currentLines, currentTriangles, currentPlayer);
            if (!sim) continue;
            
            const immediateScore = sim.scoreGained * 1000;
            const boardVal = evaluateBoard(sim.newLines, sim.newTriangles, weights);
            
            let totalVal;
            if (isMaximizing) totalVal = immediateScore + boardVal;
            else totalVal = -immediateScore + boardVal;
            
            if (isMaximizing) {
                if (totalVal > bestVal) { bestVal = totalVal; bestMove = move; }
            } else {
                if (totalVal < bestVal) { bestVal = totalVal; bestMove = move; }
            }
        }

        if (!bestMove) break;
        
        const sim = simulateMove(bestMove, currentLines, currentTriangles, currentPlayer);
        currentLines = sim.newLines;
        currentTriangles = sim.newTriangles;
        
        if (sim.scoreGained > 0) {
            scores[currentPlayer] += sim.scoreGained;
            filledCount += sim.scoreGained;
            if (isScoreAndGoAgain) continue; 
        }
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
    }
    
    const winner = (scores[1] > scores[2]) ? 1 : ((scores[2] > scores[1]) ? 2 : 0);

    if (returnDetails) {
        return { winner: winner, finalLines: currentLines };
    }
    return winner;
}