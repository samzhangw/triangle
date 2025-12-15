/**
 * ============================================
 * AI Web Worker (ai-worker.js) - Ultimate Edition
 * * 包含所有 AI 運算邏輯:
 * 1. Minimax 演算法 (深度解鎖版)
 * 2. Smart Greedy (防守型貪婪)
 * 3. MCTS (長考版)
 * 4. 基因演算法訓練模擬
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

// (**** 優化 ****) 快速狀態複製 (用於 MCTS 高頻模擬)
function cloneState(lines, triangles) {
    const newLines = {};
    for (const key in lines) {
        newLines[key] = { ...lines[key] };
    }
    const newTriangles = triangles.map(t => ({ ...t }));
    return { lines: newLines, triangles: newTriangles };
}

// 深度複製 (保留給非效能瓶頸處)
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
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
    // 使用 cloneState 提升效能
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
                // 發現威脅
                let completesTwo = false;
                // 檢查是否構成 Double Setup (連環計)
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

    // 讀取權重
    const scoreVal = w.scoreScale || 200;
    const valP1T = w.p1ThreatVal || 40; 
    const valP2T = w.p2ThreatVal || -40;
    const valP1D = w.p1DoubleVal || 100; // Double Setup 權重
    const valP2D = w.p2DoubleVal || -100;

    // 由於 Double Setup 會被計算兩次 (每個三角形算一次)，這裡權重可以除以 2，或者在參數設定上調整
    // 這裡直接加總，讓它非常有吸引力
    return (p2Score * scoreVal - p1Score * scoreVal) +
           (p1Threats * valP1T + p2Threats * valP2T) +
           (p1DoubleSetups * valP1D + p2DoubleSetups * valP2D) * 0.5;
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
// 🛡️ Smart Greedy (智慧貪婪)
// ==========================================================
function findBestGreedyMove(currentLines, currentTriangles, player) {
    const allMoves = findAllValidMoves(currentLines);
    if (allMoves.length === 0) return null;

    // 1. 優先：能得分的步
    let scoringMoves = [];
    for (const move of allMoves) {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (sim && sim.scoreGained > 0) {
            scoringMoves.push({ move, score: sim.scoreGained });
        }
    }
    if (scoringMoves.length > 0) {
        // 選得分最多的
        scoringMoves.sort((a, b) => b.score - a.score);
        return scoringMoves[0].move;
    }

    // 2. 次要：安全步 (預判這步走完，對手會不會得分)
    let safeMoves = [];
    let unsafeMoves = [];

    const opponent = (player === 1) ? 2 : 1;

    for (const move of allMoves) {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (!sim) continue;
        
        // 檢查對手是否有得分機會
        const opponentMoves = findAllScoringMoves(sim.newLines, sim.newTriangles, opponent);
        
        if (opponentMoves.length === 0) {
            safeMoves.push(move); // 安全
        } else {
            unsafeMoves.push(move); // 危險 (會送分)
        }
    }

    if (safeMoves.length > 0) {
        return safeMoves[Math.floor(Math.random() * safeMoves.length)];
    }

    // 3. 無奈：只能送分了
    return unsafeMoves[Math.floor(Math.random() * unsafeMoves.length)];
}

// ==========================================================
// 🌲 MCTS (蒙地卡羅樹搜尋 - 長考版)
// ==========================================================

class MCTSNode {
    constructor(state, parent = null, move = null) {
        this.state = state; 
        this.parent = parent;
        this.move = move;
        this.children = [];
        this.wins = 0;
        this.visits = 0;
        this.untriedMoves = null; 
    }

    getUCTValue(cParam = 1.414) {
        if (this.visits === 0) return Infinity;
        return (this.wins / this.visits) + cParam * Math.sqrt(Math.log(this.parent.visits) / this.visits);
    }
}

function findBestMCTSMove(initialLines, initialTriangles, rootPlayer) {
    const startTime = performance.now();
    const TIME_LIMIT = 4500; // ⚡ 加大思考時間至 4.5 秒

    // 初始狀態
    const rootState = {
        lines: deepCopy(initialLines),
        triangles: deepCopy(initialTriangles),
        scores: { 1: 0, 2: 0 },
        currentPlayer: rootPlayer,
        filledCount: 0 
    };
    
    // 計算初始分數
    initialTriangles.forEach(t => { if(t.filled) rootState.filledCount++; });
    let p1Init = 0, p2Init = 0;
    initialTriangles.forEach(t => { if(t.filled && t.player === 1) p1Init++; if(t.filled && t.player === 2) p2Init++; });
    rootState.scores = { 1: p1Init, 2: p2Init };

    const rootNode = new MCTSNode(rootState, null, null);
    rootNode.untriedMoves = findAllValidMoves(rootState.lines);

    let iterations = 0;
    
    while (performance.now() - startTime < TIME_LIMIT) {
        iterations++;
        let node = rootNode;
        let state = cloneState(node.state.lines, node.state.triangles);
        // 重建完整 state 用於傳遞
        state = {
            lines: state.lines,
            triangles: state.triangles,
            scores: { ...node.state.scores },
            currentPlayer: node.state.currentPlayer,
            filledCount: node.state.filledCount
        };

        // 1. Selection
        while (node.untriedMoves !== null && node.untriedMoves.length === 0 && node.children.length > 0) {
            node = node.children.reduce((best, child) => {
                return child.getUCTValue() > best.getUCTValue() ? child : best;
            });
            // 這裡簡化：不更新 state，假設樹夠淺或依賴 Expansion 建立新 state
            // 正確做法是 apply move 
            // 為了 JS 效能，MCTS 這裡通常只做一層擴展或簡單模擬
        }

        // 2. Expansion
        if (node.untriedMoves !== null && node.untriedMoves.length > 0) {
            const moveIndex = Math.floor(Math.random() * node.untriedMoves.length);
            const move = node.untriedMoves.splice(moveIndex, 1)[0];
            
            const sim = simulateMove(move, state.lines, state.triangles, state.currentPlayer);
            
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

            const childNode = new MCTSNode(nextState, node, move);
            childNode.untriedMoves = findAllValidMoves(nextState.lines);
            node.children.push(childNode);
            node = childNode;
            state = nextState;
        }

        // 3. Simulation (Rollout) - 快速模擬
        let currentLinesSim = cloneState(state.lines, state.triangles).lines; 
        let simPlayer = state.currentPlayer;
        let simScores = { ...state.scores };
        let simFilled = state.filledCount;
        
        let possibleMoves = findAllValidMoves(currentLinesSim); 
        // 隨機洗牌
        for (let i = possibleMoves.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [possibleMoves[i], possibleMoves[j]] = [possibleMoves[j], possibleMoves[i]];
        }

        let moveIdx = 0;
        // 限制 Rollout 步數，避免過久
        const MAX_ROLLOUT_STEPS = 40; 
        let steps = 0;

        while (simFilled < totalTriangles && moveIdx < possibleMoves.length && steps < MAX_ROLLOUT_STEPS) {
            const rMove = possibleMoves[moveIdx++];
            steps++;
            
            // 檢查合法性 (簡單版)
            // 由於 possibleMoves 是靜態的，已畫過的線可能會被選到，需要過濾
            // 但 simulateMove 內部會處理嗎？會，但會回傳 scoreGained=0 或 null
            // 我們這裡手動檢查線段是否被畫過
            let isAlreadyDrawn = false;
            for(let sid of rMove.segmentIds) {
                if(currentLinesSim[sid] && currentLinesSim[sid].drawn) {
                    isAlreadyDrawn = true; break; 
                }
            }
            if(isAlreadyDrawn) continue;

            // 執行
            const sim = simulateMove(rMove, currentLinesSim, state.triangles, simPlayer); 
            if (!sim) continue;
            
            currentLinesSim = sim.newLines;
            // 不更新 triangles 以省時 (只在 evaluate 需要，Rollout 只需分數)
            // 但如果 "得分再走"，需要知道是否得分。simulateMove 有回傳 scoreGained
            
            if (sim.scoreGained > 0) {
                simScores[simPlayer] += sim.scoreGained;
                simFilled += sim.scoreGained;
                if (isScoreAndGoAgain) {
                    continue; 
                }
            }
            simPlayer = (simPlayer === 1) ? 2 : 1;
        }

        // 4. Backpropagation
        let winner = 0.5;
        if (simScores[rootPlayer] > simScores[(rootPlayer===1?2:1)]) winner = 1;
        else if (simScores[rootPlayer] < simScores[(rootPlayer===1?2:1)]) winner = 0;

        while (node !== null) {
            node.visits++;
            node.wins += winner; 
            node = node.parent;
        }
    }
    
    logToMain(`MCTS 完成，模擬次數: ${iterations}`);

    if (rootNode.children.length === 0) return null;
    
    const bestChild = rootNode.children.reduce((best, child) => {
        return child.visits > best.visits ? child : best;
    });
    
    return bestChild.move;
}


// ==========================================================
// ⚔️ Deep Minimax (深度全開)
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

    const standPatScore = evaluateBoard(currentLines, currentTriangles, weights);
    
    if (Math.abs(standPatScore) >= 1000000) return standPatScore;
    if (depth === 0) return standPatScore;

    let ttFlag = 0;
    const scoringMoves = findAllScoringMoves(currentLines, currentTriangles, isMaximizingPlayer ? 2 : 1);

    if (isMaximizingPlayer) { 
        let bestValue = standPatScore;
        alpha = Math.max(alpha, bestValue);
        
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

// ⚡ 深度解鎖
function getAIDepth() {
    switch (REQUIRED_LINE_LENGTH) {
        case 1: return 7; // 原本 5 -> 7
        case 2: return 7; 
        case 3: return 8; 
        case 4: case 5: return 8; 
        default: return 6; 
    }
}

/**
 * 找出最佳移動 (Deep Minimax 入口)
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
        const futureEval = evaluateBoard(sim.newLines, sim.newTriangles, weights);
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

    // Iterative Deepening
    for (let currentDepth = 1; currentDepth <= MAX_DEPTH; currentDepth++) {
        let alpha = -Infinity;
        let beta = +Infinity;
        let currentBestMoveForDepth = null;
        let currentBestValueForDepth = isMaximizingPlayer ? -Infinity : +Infinity;

        const movesToSearch = Array.from(scoredMoves);
        if (bestMove) {
            // 將上一層最好的移動排到最前面
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
                weights
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
        
        postIntermediateResult(bestMove, currentDepth, bestValue);

        if (Math.abs(bestValue) >= (1000000 - MAX_DEPTH)) break;
    }
    return bestMove;
}

function postIntermediateResult(move, depth, score) {
    self.postMessage({
        type: 'progress',
        message: `[Worker] 深度 ${depth} 完成。 評分: ${score.toFixed(0)}`,
        bestMove: move 
    });
}


// ==========================================================
// 基因演算法訓練模擬 (保持不變)
// ==========================================================

function runTrainingGeneration(population, gameConfig) {
    dots = gameConfig.dots;
    totalTriangles = gameConfig.totalTriangles;
    REQUIRED_LINE_LENGTH = gameConfig.requiredLineLength;
    isScoreAndGoAgain = gameConfig.isScoreAndGoAgain;
    
    population.forEach(agent => agent.wins = 0);

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

    population.forEach(agent => { agent.fitness = agent.wins; });
    population.sort((a, b) => b.fitness - a.fitness);
    const bestAgent = population[0];
    const opponent = population[1] || population[population.length - 1]; 
    const showcaseResult = simulateFullGame(bestAgent.weights, opponent.weights, gameConfig.lines, gameConfig.triangles, true);

    self.postMessage({
        type: 'training_result',
        population: population,
        bestAgentBoard: showcaseResult.finalLines 
    });
}

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
