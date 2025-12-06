/**
 * ============================================
 * AI Web Worker (ai-worker.js)
 * * 包含所有 AI 運算邏輯:
 * 1. Minimax 演算法
 * 2. 迭代加深
 * 3. 基因演算法訓練模擬 (**** 新功能 ****)
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

// **** (新功能) 自訂權重 (用於 Trained 模式) ****
let customWeights = null; 

// 預設權重 (傳統 Minimax 使用)
const DEFAULT_WEIGHTS = {
    scoreScale: 150,
    threatScale: 25,
    doubleSetupScale: 75,
    // 策略切換參數 (正值=鼓勵, 負值=避免)
    p1Threat: 25,    // 預設 Minimax 模式 (保守)
    p2Threat: -25,
    p1Double: 75,
    p2Double: -75
};

// --- 2. 訊息處理 ---

self.onmessage = (e) => {
    const data = e.data;

    if (data.command === 'start') {
        // --- 標準 AI 移動 ---
        const aiType = data.aiType || 'minimax';
        const player = data.gameState.player;
        
        // 更新狀態
        dots = data.gameState.dots;
        totalTriangles = data.gameState.totalTriangles;
        REQUIRED_LINE_LENGTH = data.gameState.requiredLineLength;
        isScoreAndGoAgain = data.gameState.isScoreAndGoAgain; 
        
        // 如果是訓練模式產生的權重
        if (aiType === 'trained' && data.weights) {
            customWeights = data.weights;
        } else {
            customWeights = null; // 使用預設
        }

        const playerName = (player === 2) ? "AI 2 (Max)" : "AI 1 (Min)";
        let bestMove;
        
        if (aiType === 'greedy') {
            transpositionTable.clear();
            bestMove = findBestGreedyMove(
                data.gameState.lines, 
                data.gameState.triangles, 
                player,
                playerName
            );
        } else { 
            // Minimax 或 Trained
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
        // --- (**** 新功能 ****) 基因演算法訓練 ---
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

// --- 3. 遊戲邏輯輔助函式 (Deep Copy, Line ID...) ---
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
    const newLines = deepCopy(currentLines);
    const newTriangles = deepCopy(currentTriangles);
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

/**
 * 評估盤面
 * (**** 新功能 ****) 支援傳入 weights 參數
 */
function evaluateBoard(currentLines, currentTriangles, weights) {
    // 如果沒有傳入 weights，使用預設值
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
// (**** 新功能 ****) 基因演算法訓練模擬
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
    
    // 2. (**** 新增 ****) 找出最強者並進行「示範賽」以獲取棋盤圖片
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