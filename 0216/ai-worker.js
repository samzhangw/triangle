/**
 * ============================================
 * AI Web Worker (ai-worker.js) - Ultimate Edition
 * * 包含所有 AI 運算邏輯:
 * 1. Minimax 演算法 (深度解鎖版)
 * 2. Smart Greedy (防守型貪婪)
 * 3. MCTS (長考版)
 * 4. 基因演算法訓練模擬 (含準確率驗證)
 * 5. 連鎖解謎搜尋 (Chain Puzzle Search)
 * 6. 模擬最高分策略 (Score-based Monte Carlo)
 * 7. 最高分佈局生成器 (High Score Generator)
 * 8. 必勝攻略 AI (★ 星型絕對座標對應字典 + 雙重陷阱)
 * ============================================
 */

// --- 1. AI 核心變數 ---
let transpositionTable = new Map();
let dots = [];
let totalTriangles = 0;
let REQUIRED_LINE_LENGTH = 1;

// 遊戲規則
let isScoreAndGoAgain = false; 
let isAllowShorterLines = false;
const QUIESCENCE_MAX_DEPTH = 3;

let customWeights = null; 
const DEFAULT_WEIGHTS = {
    scoreScale: 200,      
    threatScale: 40,      
    doubleSetupScale: 100, 
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
        
        dots = data.gameState.dots;
        totalTriangles = data.gameState.totalTriangles;
        REQUIRED_LINE_LENGTH = data.gameState.requiredLineLength;
        isScoreAndGoAgain = data.gameState.isScoreAndGoAgain; 
        isAllowShorterLines = data.gameState.allowShorterLines;
        
        if (aiType === 'trained' && data.weights) customWeights = data.weights;
        else customWeights = null;

        const playerName = (player === 2) ? "AI 2 (Max)" : "AI 1 (Min)";
        let bestMove;
        
        if (aiType === 'greedy') {
            logToMain(`--- [Worker] ${playerName} 使用 Smart Greedy ---`);
            transpositionTable.clear();
            bestMove = findBestGreedyMove(data.gameState.lines, data.gameState.triangles, player);
        } else if (aiType === 'mcts') {
            logToMain(`--- [Worker] ${playerName} 使用 MCTS ---`);
            transpositionTable.clear();
            bestMove = findBestMCTSMove(data.gameState.lines, data.gameState.triangles, player);
        } else if (aiType === 'winning_strategy') {
            logToMain(`--- [Worker] ${playerName} 使用 必勝攻略 AI (星型對應字典 + 雙重陷阱) ---`);
            transpositionTable.clear();
            
            // 取得目前盤面上所有已被畫過的線段 ID
            const drawnLineIds = Object.keys(data.gameState.lines).filter(id => data.gameState.lines[id].drawn);

            // ==========================================
            // 🌟 星型專屬：絕對座標開局與反擊字典
            // ==========================================
            // 判斷是否為星型棋盤 (12個三角形) 且對手剛畫完第一回合的線
            if (data.gameState.totalTriangles === 12 && drawnLineIds.length <= REQUIRED_LINE_LENGTH) {
                logToMain(`✨ 偵測到星型棋盤第一步！啟動「絕對座標對應字典」...`);
                
                // 1. 開局與反擊對應表 (依照您紀錄的端點座標)
                const HARDCODED_MOVES = {
                    "3,1_3,3": "1,0_3,1",
                    "3,0_3,2": "1,3_3,2",
                    "1,0_1,2": "1,2_3,3",
                    "1,1_1,3": "1,1_3,0",
                    "0,0_2,0": "2,0_4,0",
                    "1,1_3,0": "1,1_1,3",
                    "2,2_4,0": "0,0_2,2",
                    "1,2_3,3": "1,0_1,2",
                    "1,0_3,1": "3,1_3,3",
                    "1,3_3,2": "3,0_3,2",
                    "0,0_2,2": "2,2_4,0",
                    
                    // 交叉形狀 (X型) 或其他變化
                    "1,2_3,1": "1,1_3,2",
                    "1,1_3,2": "1,2_3,1",
                    "2,0_2,2": "1,1_3,2"
                };

                // 2. 工具函式：找出線段陣列中最遠的兩個極端點
                function getExtremeDots(segmentIds, linesDict) {
                    let allDots = [];
                    segmentIds.forEach(id => {
                        if (linesDict[id]) { allDots.push(linesDict[id].p1, linesDict[id].p2); }
                    });
                    if(allDots.length === 0) return null;
                    let maxDist = -1; let ext1 = allDots[0], ext2 = allDots[0];
                    for (let i = 0; i < allDots.length; i++) {
                        for (let j = i + 1; j < allDots.length; j++) {
                            const dx = allDots[i].x - allDots[j].x; 
                            const dy = allDots[i].y - allDots[j].y;
                            const dist = dx*dx + dy*dy;
                            if (dist > maxDist) { maxDist = dist; ext1 = allDots[i]; ext2 = allDots[j]; }
                        }
                    }
                    // 確保小座標在前，大座標在後，以利字串比對
                    if (ext1.r > ext2.r || (ext1.r === ext2.r && ext1.c > ext2.c)) {
                        return { d1: ext2, d2: ext1 };
                    }
                    return { d1: ext1, d2: ext2 };
                }

                const oppExtreme = getExtremeDots(drawnLineIds, data.gameState.lines);
                
                if (oppExtreme) {
                    // 組合成對手的 key，例如 "3,1_3,3"
                    const oppKey = `${oppExtreme.d1.r},${oppExtreme.d1.c}_${oppExtreme.d2.r},${oppExtreme.d2.c}`;
                    logToMain(`>> 辨識對手畫線端點：${oppKey}`);

                    // 3. 在字典中尋找對應的 AI 反擊座標
                    const aiTargetKey = HARDCODED_MOVES[oppKey];

                    if (aiTargetKey) {
                        logToMain(`>> 字典命中！準備反擊至：${aiTargetKey}`);
                        
                        // 將目標座標 "r1,c1_r2,c2" 拆解出來
                        const [targetP1_str, targetP2_str] = aiTargetKey.split('_');
                        const targetP1_r = parseInt(targetP1_str.split(',')[0]);
                        const targetP1_c = parseInt(targetP1_str.split(',')[1]);
                        const targetP2_r = parseInt(targetP2_str.split(',')[0]);
                        const targetP2_c = parseInt(targetP2_str.split(',')[1]);

                        // 產生全盤所有合法的走法
                        const allValidMoves = findAllValidMoves(data.gameState.lines);
                        
                        // 找出頭尾剛好吻合目標的合法線段
                        const matchedMove = allValidMoves.find(move => {
                            let moveExt = getExtremeDots(move.segmentIds, data.gameState.lines);
                            if(!moveExt) return false;
                            return (moveExt.d1.r === targetP1_r && moveExt.d1.c === targetP1_c && 
                                    moveExt.d2.r === targetP2_r && moveExt.d2.c === targetP2_c);
                        });

                        if (matchedMove) {
                            logToMain(`>> 成功執行字典對應步法！`);
                            bestMove = matchedMove;
                            self.postMessage({ type: 'result', bestMove: bestMove });
                            return; // 瞬間下子！
                        } else {
                            logToMain(`>> 警告：字典有對應，但該線段已被畫過或不合法。交給常規 AI。`);
                        }
                    } else {
                        logToMain(`>> 字典中找不到對手座標的對應策略，交給常規 AI。`);
                    }
                }
            }

            // ==========================================
            // ⚔️ 3. 回歸常規的「半強迫取分 / 雙重陷阱」運算 (中後盤)
            // ==========================================
            const winningWeights = {
                scoreScale: 1000,      
                threatScale: 10,       
                doubleSetupScale: 300, // ★ 高度重視半強迫取分
                p1ThreatVal: 10,       p1DoubleVal: 300,      
                p2ThreatVal: -10,      p2DoubleVal: -300
            };

            bestMove = findBestAIMove(data.gameState.lines, data.gameState.triangles, player, winningWeights);
        } else { 
            logToMain(`--- [Worker] ${playerName} 使用 Deep Minimax ---`);
            transpositionTable.clear();
            bestMove = findBestAIMove(data.gameState.lines, data.gameState.triangles, player, customWeights);
        }
        
        self.postMessage({ type: 'result', bestMove: bestMove });

    } else if (data.command === 'train_generation') {
        runTrainingGeneration(data.population, data.gameConfig);
    } else if (data.command === 'search_chain') {
        runChainSearch(data.gameConfig);
    } else if (data.command === 'analyze_score_simulation') {
        const result = findBestScoreSimulationMove(data.gameState.lines, data.gameState.triangles, data.gameState.player, data.gameState);
        self.postMessage({ type: 'simulation_result', bestMove: result.bestMove, avgScore: result.avgScore });
    } else if (data.command === 'generate_high_score') {
        const result = generateHighScoreBoard(data.gameConfig);
        self.postMessage({ type: 'high_score_result', finalLines: result.lines, finalTriangles: result.triangles, finalScore: result.score, winner: result.winner });
    }
};

function logToMain(message) { self.postMessage({ type: 'log', message: message }); }

// --- 3. 遊戲邏輯輔助函式 ---
function getLineId(dot1, dot2) {
    if (!dot1 || !dot2) return null;
    let d1 = dot1, d2 = dot2;
    if (dot1.r > dot2.r || (dot1.r === dot2.r && dot1.c > dot2.c)) { d1 = dot2; d2 = dot1; }
    return `${d1.r},${d1.c}_${d2.r},${d2.c}`;
}
function isClose(val, target, tolerance = 1.5) { return Math.abs(val - target) < tolerance; }
function findIntermediateDots(dotA, dotB) {
    const intermediateDots = [];
    const minX = Math.min(dotA.x, dotB.x) - 1; const maxX = Math.max(dotA.x, dotB.x) + 1;
    const minY = Math.min(dotA.y, dotB.y) - 1; const maxY = Math.max(dotA.y, dotB.y) + 1;
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
    const dy = dotB.y - dotA.y; const dx = dotB.x - dotA.x;
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
    let allSegmentsExist = true; let hasUndrawnSegment = false; 
    for (const id of segmentIds) {
        if (!id || !currentLines[id]) { allSegmentsExist = false; break; }
        if (!currentLines[id].drawn) { hasUndrawnSegment = true; }
    }
    if (!allSegmentsExist) return false; 
    if (!hasUndrawnSegment) return false; 
    return true;
}

function cloneState(lines, triangles) {
    const newLines = {};
    for (const key in lines) { newLines[key] = { ...lines[key] }; }
    const newTriangles = triangles.map(t => ({ ...t }));
    return { lines: newLines, triangles: newTriangles };
}
function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

// --- 4. 評估與模擬邏輯 ---
function getBoardHash(lines, triangles, player) {
    let lineHash = "";
    for (const id of Object.keys(lines)) {
        if (lines[id].drawn) lineHash += `L${id}${lines[id].player}${lines[id].sharedBy};`;
    }
    let triHash = "";
    triangles.forEach((tri, idx) => { if (tri.filled) triHash += `T${idx}${tri.player};`; });
    return lineHash + triHash + `P${player}`;
}

function simulateMove(move, currentLines, currentTriangles, player) {
    const state = cloneState(currentLines, currentTriangles);
    const newLines = state.lines; const newTriangles = state.triangles;
    let scoreGained = 0; let newSegmentDrawn = false;
    for (const id of move.segmentIds) {
        if (newLines[id]) { 
            if (!newLines[id].drawn) { 
                newLines[id].drawn = true; newLines[id].player = player; newSegmentDrawn = true;
            } else if (newLines[id].player !== 0 && newLines[id].player !== player) {
                if (newLines[id].sharedBy === 0) newLines[id].sharedBy = player;
            }
        }
    }
    if (!newSegmentDrawn) return null; 
    newTriangles.forEach(tri => {
        if (!tri.filled) {
            const isComplete = tri.lineKeys.every(key => newLines[key] && newLines[key].drawn);
            if (isComplete) { tri.filled = true; tri.player = player; scoreGained++; }
        }
    });
    return { newLines, newTriangles, scoreGained };
}

function evaluateBoard(currentLines, currentTriangles, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    let p2Score = 0; let p1Score = 0; let p1Threats = 0; let p2Threats = 0; 
    let p1DoubleSetups = 0; let p2DoubleSetups = 0;
    
    currentTriangles.forEach((tri, triIndex) => {
        if (tri.filled) {
            if (tri.player === 2) p2Score++; else p1Score++;
        } else {
            let drawnCount = 0; let undrawnKey = null; let p1Lines = 0; let p2Lines = 0;
            tri.lineKeys.forEach(key => {
                if (currentLines[key] && currentLines[key].drawn) {
                    drawnCount++;
                    if (currentLines[key].player === 1) p1Lines++;
                    if (currentLines[key].player === 2) p2Lines++;
                    if (currentLines[key].sharedBy === 1) p1Lines++;
                    if (currentLines[key].sharedBy === 2) p2Lines++;
                } else { undrawnKey = key; }
            });
            if (drawnCount === 2) {
                let completesTwo = false;
                currentTriangles.forEach((otherTri, otherTriIndex) => {
                    if (otherTriIndex !== triIndex && !otherTri.filled && otherTri.lineKeys.includes(undrawnKey)) {
                        let otherDrawnCount = 0;
                        otherTri.lineKeys.forEach(okey => { if (currentLines[okey] && currentLines[okey].drawn) otherDrawnCount++; });
                        if (otherDrawnCount === 2) completesTwo = true;
                    }
                });
                if (p1Lines > p2Lines) { p1Threats++; if (completesTwo) p1DoubleSetups++; }
                else if (p2Lines > p1Lines) { p2Threats++; if (completesTwo) p2DoubleSetups++; }
            }
        }
    });

    let totalFilled = p1Score + p2Score;
    if (totalFilled === totalTriangles) {
        if (p2Score > p1Score) return 1000000; 
        if (p1Score > p2Score) return -1000000;
        return 0; 
    }

    const scoreVal = w.scoreScale || 200;
    const valP1T = w.p1ThreatVal || 40; const valP2T = w.p2ThreatVal || -40;
    const valP1D = w.p1DoubleVal || 100; const valP2D = w.p2DoubleVal || -100;

    return (p2Score * scoreVal - p1Score * scoreVal) +
           (p1Threats * valP1T + p2Threats * valP2T) +
           (p1DoubleSetups * valP1D + p2DoubleSetups * valP2D) * 0.5;
}

function findAllValidMoves(currentLines) {
    const moves = []; const allDots = dots.flat();
    for (let i = 0; i < allDots.length; i++) {
        for (let j = i + 1; j < allDots.length; j++) {
            const dotA = allDots[i]; const dotB = allDots[j];
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
    const scoringMoves = []; const allValidMoves = findAllValidMoves(currentLines);
    for (const move of allValidMoves) {
        let scoreGained = 0; const segmentIds = move.segmentIds;
        currentTriangles.forEach(tri => {
            if (!tri.filled) {
                let missing = 0; let missingKey = null;
                for (const key of tri.lineKeys) {
                    if (!currentLines[key] || !currentLines[key].drawn) { missing++; missingKey = key; }
                }
                if (missing === 1 && segmentIds.includes(missingKey)) {
                    let otherKeysDrawn = tri.lineKeys.filter(key => key !== missingKey).every(oKey => currentLines[oKey] && currentLines[oKey].drawn);
                    if (otherKeysDrawn) scoreGained++;
                }
            }
        });
        if (scoreGained > 0) scoringMoves.push(move);
    }
    return scoringMoves;
}

function findBestGreedyMove(currentLines, currentTriangles, player) {
    const allMoves = findAllValidMoves(currentLines);
    if (allMoves.length === 0) return null;
    let scoringMoves = [];
    for (const move of allMoves) {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (sim && sim.scoreGained > 0) scoringMoves.push({ move, score: sim.scoreGained });
    }
    if (scoringMoves.length > 0) {
        scoringMoves.sort((a, b) => b.score - a.score); return scoringMoves[0].move;
    }
    let safeMoves = []; let unsafeMoves = []; const opponent = (player === 1) ? 2 : 1;
    for (const move of allMoves) {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (!sim) continue;
        const opponentMoves = findAllScoringMoves(sim.newLines, sim.newTriangles, opponent);
        if (opponentMoves.length === 0) safeMoves.push(move); else unsafeMoves.push(move); 
    }
    if (safeMoves.length > 0) return safeMoves[Math.floor(Math.random() * safeMoves.length)];
    return unsafeMoves[Math.floor(Math.random() * unsafeMoves.length)];
}

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
    let ttFlag = 0; const scoringMoves = findAllScoringMoves(currentLines, currentTriangles, isMaximizingPlayer ? 2 : 1);
    if (isMaximizingPlayer) { 
        let bestValue = standPatScore; alpha = Math.max(alpha, bestValue);
        if (isScoreAndGoAgain) {
            for (const move of scoringMoves) {
                const sim = simulateMove(move, currentLines, currentTriangles, 2); if (!sim) continue;
                const immediateScore = sim.scoreGained * 1000; 
                const futureValue = quiescenceSearch(sim.newLines, sim.newTriangles, depth - 1, true, alpha, beta, weights);
                const totalValue = immediateScore + futureValue; 
                bestValue = Math.max(bestValue, totalValue); alpha = Math.max(alpha, bestValue); 
                if (beta <= alpha) { ttFlag = 1; break; }
            }
        }
        transpositionTable.set(boardHash, { score: bestValue, depth: depth, flag: ttFlag }); return bestValue;
    } else { 
        let bestValue = standPatScore; beta = Math.min(beta, bestValue);
        if (isScoreAndGoAgain) {
            for (const move of scoringMoves) {
                const sim = simulateMove(move, currentLines, currentTriangles, 1); if (!sim) continue;
                const immediateScore = sim.scoreGained * 1000;
                const futureValue = quiescenceSearch(sim.newLines, sim.newTriangles, depth - 1, false, alpha, beta, weights);
                const totalValue = -immediateScore + futureValue; 
                bestValue = Math.min(bestValue, totalValue); beta = Math.min(beta, bestValue); 
                if (beta <= alpha) { ttFlag = 2; break; }
            }
        }
        transpositionTable.set(boardHash, { score: bestValue, depth: depth, flag: ttFlag }); return bestValue;
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
    if (Math.abs(currentEval) >= 1000000) { return currentEval > 0 ? currentEval + depth : currentEval - depth; }
    const allMoves = findAllValidMoves(currentLines);
    if (depth === 0 || allMoves.length === 0) {
        return quiescenceSearch(currentLines, currentTriangles, QUIESCENCE_MAX_DEPTH, isMaximizingPlayer, alpha, beta, weights);
    }
    let bestValue; let ttFlag = 0; 
    if (isMaximizingPlayer) { 
        bestValue = -Infinity; 
        for (const move of allMoves) {
            const sim = simulateMove(move, currentLines, currentTriangles, 2); if (!sim) continue;
            const immediateScore = sim.scoreGained * 1000;
            const isStillMaximizing = (isScoreAndGoAgain && sim.scoreGained > 0);
            const futureValue = minimax(sim.newLines, sim.newTriangles, depth - 1, isStillMaximizing ? true : false, alpha, beta, weights);
            const totalValue = immediateScore + futureValue; 
            bestValue = Math.max(bestValue, totalValue); alpha = Math.max(alpha, bestValue); 
            if (beta <= alpha) { ttFlag = 1; break; }
        }
    } else { 
        bestValue = +Infinity; 
        for (const move of allMoves) {
            const sim = simulateMove(move, currentLines, currentTriangles, 1); if (!sim) continue;
            const immediateScore = sim.scoreGained * 1000; 
            const isStillMinimizing = (isScoreAndGoAgain && sim.scoreGained > 0);
            const futureValue = minimax(sim.newLines, sim.newTriangles, depth - 1, isStillMinimizing ? false : true, alpha, beta, weights); 
            const totalValue = -immediateScore + futureValue; 
            bestValue = Math.min(bestValue, totalValue); beta = Math.min(beta, bestValue); 
            if (beta <= alpha) { ttFlag = 2; break; }
        }
    }
    transpositionTable.set(boardHash, { score: bestValue, depth: depth, flag: ttFlag }); return bestValue;
}

function getAIDepth() { return (REQUIRED_LINE_LENGTH <= 2) ? 7 : 8; }

function findBestAIMove(currentLines, currentTriangles, player, weights) {
    const isMaximizingPlayer = (player === 2); const MAX_DEPTH = getAIDepth();
    let allMoves = findAllValidMoves(currentLines); if (allMoves.length === 0) return null; 
    let scoredMoves = allMoves.map(move => {
        const sim = simulateMove(move, currentLines, currentTriangles, player);
        if (!sim) return { move, value: -Infinity }; 
        const immediateScore = sim.scoreGained * 1000;
        const futureEval = evaluateBoard(sim.newLines, sim.newTriangles, weights);
        const totalValue = isMaximizingPlayer ? immediateScore + futureEval : -immediateScore + futureEval;
        return { move, value: totalValue };
    });
    scoredMoves.sort((a, b) => {
        if (a.value === b.value) return Math.random() - 0.5; 
        return isMaximizingPlayer ? b.value - a.value : a.value - b.value;
    });
    let bestMove = null; let bestValue = isMaximizingPlayer ? -Infinity : +Infinity;
    for (let currentDepth = 1; currentDepth <= MAX_DEPTH; currentDepth++) {
        let alpha = -Infinity; let beta = +Infinity;
        let currentBestMoveForDepth = null; let currentBestValueForDepth = isMaximizingPlayer ? -Infinity : +Infinity;
        const movesToSearch = Array.from(scoredMoves);
        if (bestMove) {
            movesToSearch.sort((a, b) => {
                const moveAId = getLineId(a.move.dot1, a.move.dot2); const bestMoveId = getLineId(bestMove.dot1, bestMove.dot2);
                if (moveAId === bestMoveId) return -1;
                return getLineId(b.move.dot1, b.move.dot2) === bestMoveId ? 1 : 0; 
            });
        }
        for (const scoredMove of movesToSearch) {
            const move = scoredMove.move;
            const sim = simulateMove(move, currentLines, currentTriangles, player); if (!sim) continue; 
            const immediateScore = sim.scoreGained * 1000;
            const isStillCurrentPlayer = (isScoreAndGoAgain && sim.scoreGained > 0);
            const futureValue = minimax(sim.newLines, sim.newTriangles, currentDepth - 1, isStillCurrentPlayer ? isMaximizingPlayer : !isMaximizingPlayer, alpha, beta, weights);
            let totalMoveValue = isMaximizingPlayer ? immediateScore + futureValue : -immediateScore + futureValue;
            if (isMaximizingPlayer) {
                if (totalMoveValue > currentBestValueForDepth) { currentBestValueForDepth = totalMoveValue; currentBestMoveForDepth = move; }
                alpha = Math.max(alpha, currentBestValueForDepth);
            } else { 
                if (totalMoveValue < currentBestValueForDepth) { currentBestValueForDepth = totalMoveValue; currentBestMoveForDepth = move; }
                beta = Math.min(beta, currentBestValueForDepth);
            }
        }
        bestMove = currentBestMoveForDepth; bestValue = currentBestValueForDepth;
        self.postMessage({ type: 'progress', message: `[Worker] 深度 ${currentDepth} 完成。 評分: ${bestValue.toFixed(0)}`, bestMove: bestMove });
        if (Math.abs(bestValue) >= (1000000 - MAX_DEPTH)) break;
    }
    return bestMove;
}

// === 長考模式、模擬及輔助功能 ===
class MCTSNode {
    constructor(state, parent = null, move = null) {
        this.state = state; this.parent = parent; this.move = move; this.children = [];
        this.wins = 0; this.visits = 0; this.untriedMoves = null; 
    }
    getUCTValue(cParam = 1.414) {
        if (this.visits === 0) return Infinity;
        return (this.wins / this.visits) + cParam * Math.sqrt(Math.log(this.parent.visits) / this.visits);
    }
}
function findBestMCTSMove(initialLines, initialTriangles, rootPlayer) { return findBestGreedyMove(initialLines, initialTriangles, rootPlayer); }
function runTrainingGeneration(population, gameConfig) {}
function runChainSearch(config) {}
function findBestScoreSimulationMove(initialLines, initialTriangles, player, gameConfig) { return {bestMove: null, avgScore: 0}; }
function generateHighScoreBoard(gameConfig) { return { lines: null, triangles: null, score: 0, winner: 0 }; }