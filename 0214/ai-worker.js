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
 * 7. [優化] 最高分佈局生成器 (High Score Generator - No Ambiguity)
 * 8. [新增] 必勝攻略 AI (Winning Strategy - Double Setup Priority)
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
        } else if (aiType === 'winning_strategy') {
            // 🔥🔥🔥 [新增] 必勝攻略 AI 邏輯 🔥🔥🔥
            logToMain(`--- [Worker] ${playerName} 使用 必勝攻略 AI (雙重陷阱優先) ---`);
            transpositionTable.clear();
            
            // 定義必勝策略的特化權重
            const winningWeights = {
                scoreScale: 1000,      // 得分永遠最重要 (確保能吃就吃)
                threatScale: 10,       // 單一威脅權重降低 (避免過早聽牌被反制)
                doubleSetupScale: 300, // ★ 關鍵：將雙重佈局權重設為極高 (一般威脅的30倍)
                
                // P1 的視角 (Minimax 的 Min 方)
                p1ThreatVal: 10,       
                p1DoubleVal: 300,      
                
                // P2 的視角 (Minimax 的 Max 方)
                p2ThreatVal: -10,      
                p2DoubleVal: -300
            };

            // 使用深度 Minimax 搜尋，並帶入特化權重
            bestMove = findBestAIMove(
                data.gameState.lines, 
                data.gameState.triangles, 
                player,
                winningWeights // 傳入我們定義的必勝權重
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
        runChainSearch(data.gameConfig);

    } else if (data.command === 'analyze_score_simulation') {
        // 分數導向的蒙地卡羅模擬
        const result = findBestScoreSimulationMove(
            data.gameState.lines,
            data.gameState.triangles,
            data.gameState.player,
            data.gameState
        );
        self.postMessage({
            type: 'simulation_result',
            bestMove: result.bestMove,
            avgScore: result.avgScore
        });

    } else if (data.command === 'generate_high_score') {
        // [優化] 產生最高分佈局，回傳完整的三角形歸屬
        const result = generateHighScoreBoard(data.gameConfig);
        self.postMessage({
            type: 'high_score_result',
            finalLines: result.lines,
            finalTriangles: result.triangles, // 新增：回傳三角形狀態
            finalScore: result.score,
            winner: result.winner
        });
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
    
    // [規則關鍵] 判斷連線長度
    if (isAllowShorterLines) {
        if (segmentIds.length < 1 || segmentIds.length > REQUIRED_LINE_LENGTH) return false;
    } else {
        if (segmentIds.length !== REQUIRED_LINE_LENGTH) return false; 
    }

    let allSegmentsExist = true;
    let hasUndrawnSegment = false; 
    for (const id of segmentIds) {
        if (!id || !currentLines[id]) { allSegmentsExist = false; break; }
        // [規則關鍵] 只要這條線上有任何一段是「未畫過」的，就視為合法
        if (!currentLines[id].drawn) { hasUndrawnSegment = true; }
    }
    if (!allSegmentsExist) return false; 
    // [規則關鍵] 如果全部都畫過了(false)，則此步無效
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
                tri.player = player; // 這裡確切記錄是誰完成了三角形
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
        // 快速預判：這條線是否補齊了某個三角形
        currentTriangles.forEach(tri => {
            if (!tri.filled) {
                // 計算三角形缺幾條線
                let missing = 0;
                let missingKey = null;
                for (const key of tri.lineKeys) {
                    if (!currentLines[key] || !currentLines[key].drawn) {
                        missing++;
                        missingKey = key;
                    }
                }
                // 如果只缺 1 條線，且這條線包含在 move 裡
                if (missing === 1 && segmentIds.includes(missingKey)) {
                    // 確認其他線是否已畫 (防呆)
                    let otherKeysDrawn = tri.lineKeys
                        .filter(key => key !== missingKey)
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
// 🧩 連鎖解謎搜尋 (Chain Puzzle Search)
// ==========================================================

function runChainSearch(config) {
    // 更新全局設定
    dots = config.dots;
    totalTriangles = config.totalTriangles;
    REQUIRED_LINE_LENGTH = config.requiredLineLength;
    isScoreAndGoAgain = true; // 強制為 True
    isAllowShorterLines = config.allowShorterLines;

    const minChain = config.minChain || 5;

    let attempts = 0;
    
    // 搜尋迴圈：持續模擬遊戲
    while (true) { 
        attempts++;
        
        // 每 500 次模擬回報一次進度
        if (attempts % 500 === 0) {
            self.postMessage({
                type: 'search_progress',
                count: attempts
            });
        }

        simulateGameForPuzzle(config.lines, config.triangles, minChain);
        // 無限迴圈，直到被外部 terminate
    }
}

function simulateGameForPuzzle(initialLines, initialTriangles, minChain) {
    let currentLines = deepCopy(initialLines);
    let currentTriangles = deepCopy(initialTriangles);
    let currentPlayer = 1; 
    let filledCount = 0;
    
    // 隨機開局玩家
    if (Math.random() > 0.5) currentPlayer = 2;

    while (filledCount < totalTriangles) {
        
        // 1. 在做任何移動「前」，檢查是否是一個潛在的謎題狀態
        // 條件：剩餘格子 >= minChain
        const remaining = totalTriangles - filledCount;
        
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
        
        filledCount += totalScoreInTurn;
        
        // 3. 檢查謎題條件
        // 條件 A: 這個回合得分了
        // 條件 B: 且這個回合把「剩下所有」三角形都吃光了
        // 條件 C: 且這回合吃的數量 >= minChain
        
        if (totalScoreInTurn > 0 && 
            filledCount === totalTriangles && 
            totalScoreInTurn >= minChain) {
            
            // 🎯 找到謎題了！
            self.postMessage({
                type: 'chain_puzzle_found',
                puzzleData: {
                    lines: stateBeforeTurn.lines,
                    player: stateBeforeTurn.player,
                    chainLength: stateBeforeTurn.remaining
                }
            });
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
        const allMoves = findAllValidMoves(lines);
        if (allMoves.length === 0) break; 

        let selectedMove = null;

        // 嘗試找得分步
        const scoringMoves = findAllScoringMoves(lines, triangles, player);
        
        if (scoringMoves.length > 0) {
            // 如果有得分機會，為了測試「連鎖」，我們必須走這一步
            selectedMove = scoringMoves[Math.floor(Math.random() * scoringMoves.length)];
        } else {
            // 沒有得分機會，隨機走一步 (佈局)
            // 混合策略：80% Random, 20% Take Score (如果有的話) - 這裡單純 Random 增加隨機性
            selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
        }
        
        const sim = simulateMove(selectedMove, lines, triangles, player);
        if (!sim) break; 
        
        lines = sim.newLines;
        triangles = sim.newTriangles;
        
        if (sim.scoreGained > 0) {
            totalScore += sim.scoreGained;
            // 規則是 Score And Go Again，所以繼續迴圈
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
// 基因演算法訓練模擬 (含準確率驗證)
// ==========================================================

function runTrainingGeneration(population, gameConfig) {
    // 1. 更新全域變數
    dots = gameConfig.dots;
    totalTriangles = gameConfig.totalTriangles;
    REQUIRED_LINE_LENGTH = gameConfig.requiredLineLength;
    isScoreAndGoAgain = gameConfig.isScoreAndGoAgain;
    isAllowShorterLines = gameConfig.allowShorterLines; // [重要] 支援短連線
    
    // 2. 內部訓練 (Agent vs Agent)
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
    
    // [新增] 3. 準確率驗證 (Validation): 最強 AI vs Smart Greedy
    // 進行 10 場對戰 (各先手 5 場)，計算勝率
    let validationWins = 0;
    const VALIDATION_MATCHES = 10;
    
    for (let v = 0; v < VALIDATION_MATCHES; v++) {
        const aiIsP1 = (v < VALIDATION_MATCHES / 2); // 前 5 場 P1, 後 5 場 P2
        const winner = simulateGameVsGreedy(bestAgent.weights, gameConfig.lines, gameConfig.triangles, aiIsP1);
        
        if (aiIsP1 && winner === 1) validationWins++;
        else if (!aiIsP1 && winner === 2) validationWins++;
    }
    
    const winRate = (validationWins / VALIDATION_MATCHES) * 100;

    // 4. 產生預覽棋盤 (展示用)
    const opponent = population[1] || population[population.length - 1]; 
    const showcaseResult = simulateFullGame(bestAgent.weights, opponent.weights, gameConfig.lines, gameConfig.triangles, true);

    self.postMessage({
        type: 'training_result',
        population: population,
        bestAgentBoard: showcaseResult.finalLines,
        // 回傳驗證數據
        validationStats: {
            winRate: winRate
        }
    });
}

// [新增] 模擬：加權 AI vs Smart Greedy
function simulateGameVsGreedy(aiWeights, initialLines, initialTriangles, aiIsP1) {
    let currentLines = deepCopy(initialLines);
    let currentTriangles = deepCopy(initialTriangles);
    let currentPlayer = 1;
    let scores = { 1: 0, 2: 0 };
    let filledCount = 0;
    let movesLimit = 200; 

    while (filledCount < totalTriangles && movesLimit > 0) {
        movesLimit--;
        
        let bestMove = null;
        
        // 判斷當前是 訓練AI 還是 Greedy
        const isTrainingAI = (aiIsP1 && currentPlayer === 1) || (!aiIsP1 && currentPlayer === 2);
        
        if (isTrainingAI) {
            // 使用權重評估 (模擬 Depth=1 的 Minimax)
            const isMaximizing = (currentPlayer === 2);
            let allMoves = findAllValidMoves(currentLines);
            if (allMoves.length === 0) break;
            
            // 隨機打亂，避免僵化
            allMoves.sort(() => Math.random() - 0.5); 
            
            let bestVal = isMaximizing ? -Infinity : Infinity;
            
            for (const move of allMoves) {
                const sim = simulateMove(move, currentLines, currentTriangles, currentPlayer);
                if (!sim) continue;
                const immediateScore = sim.scoreGained * 1000;
                const boardVal = evaluateBoard(sim.newLines, sim.newTriangles, aiWeights);
                let totalVal;
                // 注意：evaluateBoard 回傳的是 (P2 - P1)，所以 Max 喜歡正，Min 喜歡負
                if (isMaximizing) totalVal = immediateScore + boardVal;
                else totalVal = -immediateScore + boardVal;
                
                if (isMaximizing) {
                    if (totalVal > bestVal) { bestVal = totalVal; bestMove = move; }
                } else {
                    if (totalVal < bestVal) { bestVal = totalVal; bestMove = move; }
                }
            }
        } else {
            // 使用 Smart Greedy 策略
            bestMove = findBestGreedyMove(currentLines, currentTriangles, currentPlayer);
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
    
    return (scores[1] > scores[2]) ? 1 : ((scores[2] > scores[1]) ? 2 : 0);
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

// ==========================================================
// 🎰 分數導向的蒙地卡羅模擬 (Score-based Monte Carlo)
// ==========================================================
function findBestScoreSimulationMove(initialLines, initialTriangles, player, gameConfig) {
    // 更新全域設定
    dots = gameConfig.dots;
    totalTriangles = gameConfig.totalTriangles;
    REQUIRED_LINE_LENGTH = gameConfig.requiredLineLength;
    isScoreAndGoAgain = gameConfig.isScoreAndGoAgain;
    isAllowShorterLines = gameConfig.allowShorterLines;

    const allMoves = findAllValidMoves(initialLines);
    if (allMoves.length === 0) return { bestMove: null, avgScore: 0 };

    let bestMove = null;
    let maxAvgScore = -Infinity;

    // 總模擬次數預算 (依據步數動態調整，步數越少模擬越多)
    const TOTAL_SIMULATIONS = 600; 
    let simsPerMove = Math.floor(TOTAL_SIMULATIONS / allMoves.length);
    if (simsPerMove < 10) simsPerMove = 10; // 至少模擬 10 次
    if (simsPerMove > 100) simsPerMove = 100; // 最多模擬 100 次 (避免太久)

    logToMain(`[模擬] 開始分析 ${allMoves.length} 個走法，每步模擬 ${simsPerMove} 場...`);

    for (let i = 0; i < allMoves.length; i++) {
        const move = allMoves[i];
        let totalScoreAccumulated = 0;

        for (let s = 0; s < simsPerMove; s++) {
            // 複製狀態
            // 優化：只在模擬的第一步做深拷貝
            const simLines = cloneState(initialLines, initialTriangles).lines;
            const simTriangles = cloneState(initialLines, initialTriangles).triangles;
            
            // 執行當前這一步
            const firstStepSim = simulateMove(move, simLines, simTriangles, player);
            if (!firstStepSim) continue;

            let currentSimLines = firstStepSim.newLines;
            let currentSimTriangles = firstStepSim.newTriangles;
            let currentScore = (player === 1) ? 0 : 0; // 只需要計算「我方」的分數
            
            // 加上這一步的得分
            if (firstStepSim.scoreGained > 0) {
                currentScore += firstStepSim.scoreGained;
            }

            // 如果得分且規則允許再走，繼續由我方行動；否則換人
            let nextPlayer = player;
            if (firstStepSim.scoreGained > 0 && isScoreAndGoAgain) {
                nextPlayer = player;
            } else {
                nextPlayer = (player === 1) ? 2 : 1;
            }

            // 隨機跑完剩餘遊戲
            // 這裡使用 Greedy 策略稍微提升模擬品質 (比純隨機準)
            const result = simulateRandomGame(currentSimLines, currentSimTriangles, nextPlayer, player);
            totalScoreAccumulated += (currentScore + result.myFinalScore);
        }

        const avgScore = totalScoreAccumulated / simsPerMove;
        
        // 紀錄
        if (avgScore > maxAvgScore) {
            maxAvgScore = avgScore;
            bestMove = move;
        }
    }

    return { bestMove: bestMove, avgScore: maxAvgScore };
}

// 快速模擬剩餘局勢 (回傳我方在這之後獲得的分數)
function simulateRandomGame(lines, triangles, startPlayer, myPlayer) {
    let currentLines = lines;
    let currentTriangles = triangles;
    let currentPlayer = startPlayer;
    let myScore = 0;
    
    // 為了效能，設定步數上限
    let steps = 0;
    const MAX_STEPS = 100; 

    // 檢查是否還有空位
    let filledCount = triangles.filter(t => t.filled).length;

    while (filledCount < totalTriangles && steps < MAX_STEPS) {
        steps++;
        
        // 簡單策略：如果有得分步，隨機選一個得分；否則隨機選任意步
        const allMoves = findAllValidMoves(currentLines);
        if (allMoves.length === 0) break;

        // 輕量級 Greedy: 找出能得分的步
        // 為了效能，我們只檢查前幾個隨機步，或者簡單地隨機選
        // 這裡採用: 80% 隨機, 20% 嘗試得分 (模擬人類直覺)
        let selectedMove = null;
        
        if (Math.random() < 0.2) {
             const scoringMoves = findAllScoringMoves(currentLines, currentTriangles, currentPlayer);
             if (scoringMoves.length > 0) {
                 selectedMove = scoringMoves[Math.floor(Math.random() * scoringMoves.length)];
             }
        }
        
        if (!selectedMove) {
            selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
        }

        const sim = simulateMove(selectedMove, currentLines, currentTriangles, currentPlayer);
        if (!sim) break;

        currentLines = sim.newLines;
        currentTriangles = sim.newTriangles;

        if (sim.scoreGained > 0) {
            filledCount += sim.scoreGained;
            if (currentPlayer === myPlayer) {
                myScore += sim.scoreGained;
            }
            if (isScoreAndGoAgain) continue; // 繼續走
        }
        
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
    }
    
    return { myFinalScore: myScore };
}

// ==========================================================
// 🏆 最高分佈局生成器 (High Score Generator)
// ==========================================================
function generateHighScoreBoard(gameConfig) {
    // 更新全域設定
    dots = gameConfig.dots;
    totalTriangles = gameConfig.totalTriangles;
    REQUIRED_LINE_LENGTH = gameConfig.requiredLineLength;
    isScoreAndGoAgain = gameConfig.isScoreAndGoAgain;
    isAllowShorterLines = gameConfig.allowShorterLines;

    let bestScore = -1;
    let bestLines = null;
    let bestTriangles = null; // [新增] 儲存最佳局的三角形歸屬
    let bestWinner = 0;

    // [優化] 減少模擬次數，但增加 AI 深度 (Quality over Quantity)
    // 之前 1000 次純 Greedy，現在 50 次 Smart Evaluation
    const SIMULATIONS = 50;
    
    // logToMain(`[生成器] 正在模擬 ${SIMULATIONS} 場強弱對決 (Smart Mode)...`);

    for (let i = 0; i < SIMULATIONS; i++) {
        // 每次都從空盤開始 (或是傳入的初始盤面)
        const initialLines = deepCopy(gameConfig.lines);
        const initialTriangles = deepCopy(gameConfig.triangles);
        
        // 為了製造懸殊比分，我們讓 P1 為強者
        // [修改] 這裡會回傳 { lines, triangles, scores }
        const result = simulateOneSidedGame(initialLines, initialTriangles, 1);
        
        // 我們追求的是「單邊最高分」，不管是 P1 還是 P2 (雖然設定上 P1 較強)
        const maxScoreInGame = Math.max(result.scores[1], result.scores[2]);
        
        if (maxScoreInGame > bestScore) {
            bestScore = maxScoreInGame;
            bestLines = result.lines;
            bestTriangles = result.triangles; // [新增] 保存這個最佳盤面的三角形狀態
            bestWinner = (result.scores[1] > result.scores[2]) ? 1 : 2;
        }
    }

    return {
        lines: bestLines,
        triangles: bestTriangles, // [新增] 回傳
        score: bestScore,
        winner: bestWinner
    };
}

// 模擬一場「強者 vs 弱者」的遊戲 (優化版)
function simulateOneSidedGame(lines, triangles, strongPlayer) {
    let currentLines = lines;
    let currentTriangles = triangles;
    let currentPlayer = 1;
    let scores = { 1: 0, 2: 0 };
    let filledCount = 0;
    
    // 如果是從中途開始，先計算已填滿的
    triangles.forEach(t => { if(t.filled) filledCount++; });
    
    let movesLimit = 500;

    while (filledCount < totalTriangles && movesLimit > 0) {
        movesLimit--;
        
        let selectedMove = null;
        const allMoves = findAllValidMoves(currentLines);
        if (allMoves.length === 0) break;

        if (currentPlayer === strongPlayer) {
            // [優化] 強者策略：Smart Evaluation (Depth 1 Minimax)
            // 不只看當前得分，還評估走完後的盤面優劣 (能有效利用重疊機會)
            
            // 1. 先找得分步
            const scoringMoves = [];
            for (const move of allMoves) {
                const sim = simulateMove(move, currentLines, currentTriangles, currentPlayer);
                if (sim && sim.scoreGained > 0) {
                    scoringMoves.push({ move, sim });
                }
            }
            
            if (scoringMoves.length > 0) {
                // 如果有得分步，選評估分數最高的 (例如：得分後還能保留好的後續)
                let bestScoringMove = null;
                let maxEval = -Infinity;
                
                for (const item of scoringMoves) {
                    // 簡單評估：得分權重極大 + 盤面評估
                    // evaluateBoard 回傳 P2-P1，所以 strongPlayer=1 時要取負
                    let boardVal = evaluateBoard(item.sim.newLines, item.sim.newTriangles, DEFAULT_WEIGHTS);
                    if (strongPlayer === 1) boardVal = -boardVal;
                    
                    const totalVal = (item.sim.scoreGained * 1000) + boardVal;
                    
                    if (totalVal > maxEval) {
                        maxEval = totalVal;
                        bestScoringMove = item.move;
                    }
                }
                selectedMove = bestScoringMove;
                
            } else {
                // 沒有得分步，選最佳佈局 (Depth 0)
                let bestNonScoringMove = null;
                let maxEval = -Infinity;
                
                // 為了效能，隨機抽樣 20 個走法來評估，而不是全部
                // 這樣在大量模擬時才不會太慢
                const sampleMoves = [];
                const sampleSize = Math.min(allMoves.length, 20);
                const indices = new Set();
                while(indices.size < sampleSize){
                    indices.add(Math.floor(Math.random() * allMoves.length));
                }
                indices.forEach(idx => sampleMoves.push(allMoves[idx]));
                
                for (const move of sampleMoves) {
                    const sim = simulateMove(move, currentLines, currentTriangles, currentPlayer);
                    if (!sim) continue;
                    
                    let boardVal = evaluateBoard(sim.newLines, sim.newTriangles, DEFAULT_WEIGHTS);
                    if (strongPlayer === 1) boardVal = -boardVal;
                    
                    if (boardVal > maxEval) {
                        maxEval = boardVal;
                        bestNonScoringMove = move;
                    }
                }
                selectedMove = bestNonScoringMove || allMoves[0];
            }
            
        } else {
            // 弱者策略：Random (完全隨機，容易送分)
            selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
        }

        const sim = simulateMove(selectedMove, currentLines, currentTriangles, currentPlayer);
        if (!sim) break;

        currentLines = sim.newLines;
        currentTriangles = sim.newTriangles;

        if (sim.scoreGained > 0) {
            scores[currentPlayer] += sim.scoreGained;
            filledCount += sim.scoreGained;
            if (isScoreAndGoAgain) continue; 
        }
        
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
    }

    // [新增] 回傳 triangles
    return { lines: currentLines, triangles: currentTriangles, scores: scores };
}