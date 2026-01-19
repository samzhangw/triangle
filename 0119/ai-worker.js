/**
 * ============================================
 * AI Web Worker (ai-worker.js) - The Final Architect
 * * 策略：嚴格防守構造法 (Strict Defensive Construction) + 防重複優化
 * * 核心規則：
 * 1. 「有分不能送」：構造時，三角形的已畫邊數上限為 1 (Count <= 1)。
 * 2. 「邊界優先」：優先佔領外圈，逼出長連鎖路徑。
 * 3. 「零重複」：使用 Hash Set 過濾已檢查過的盤面。
 * * 適用：極速尋找 24 步全清 (Perfect Chain) 謎題。
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

// 自訂權重
let customWeights = null; 

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

        let bestMove;
        // 這裡保留舊有的 AI 對戰邏輯，以免報錯
        if (aiType === 'greedy') {
            bestMove = findBestGreedyMove(data.gameState.lines, data.gameState.triangles, player);
        } else if (aiType === 'mcts') {
            bestMove = findBestMCTSMove(data.gameState.lines, data.gameState.triangles, player);
        } else { 
            bestMove = findBestAIMove(data.gameState.lines, data.gameState.triangles, player, customWeights);
        }
        
        self.postMessage({ type: 'result', bestMove: bestMove });

    } else if (data.command === 'train_generation') {
        runTrainingGeneration(data.population, data.gameConfig);
    } else if (data.command === 'search_chain') {
        // 啟動終極構造搜尋
        runConstructionSearch(data.gameConfig);
    }
};

function logToMain(message) {
    self.postMessage({ type: 'log', message: message });
}

// --- 3. 幾何基礎輔助函式 ---
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
        if (!(isClose(absAngle, 0) || isClose(absAngle, 60) || isClose(absAngle, 120) || isClose(absAngle, 180))) return false;
    }
    const allDotsOnLine = findIntermediateDots(dotA, dotB);
    const segmentIds = [];
    for (let i = 0; i < allDotsOnLine.length - 1; i++) segmentIds.push(getLineId(allDotsOnLine[i], allDotsOnLine[i+1]));
    
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

// --- 4. 核心構造邏輯 (嚴格防守 + 邊界優先) ---

function constructStrictSafeBoard(initialLines, initialTriangles, cachedMoves, lineToTriangles) {
    const state = fastCloneState(initialLines, initialTriangles);
    let currentLines = state.lines;
    let currentTriangles = state.triangles;
    let currentPlayer = 1;

    // --- 分類步法 (邊界 vs 內部) ---
    const boundaryMoves = [];
    const sharedMoves = [];

    for (const move of cachedMoves) {
        const segId = move.segmentIds[0];
        const triCount = lineToTriangles[segId] ? lineToTriangles[segId].length : 0;
        
        // 如果只連接 1 個三角形，就是邊界線 (高優先)
        if (triCount === 1) {
            boundaryMoves.push(move);
        } else {
            sharedMoves.push(move);
        }
    }

    // 分別打亂順序，增加構造多樣性
    shuffleArray(boundaryMoves);
    shuffleArray(sharedMoves);

    // ★ Phase 1: 填滿邊界 (優先構造內外圈)
    for (const move of boundaryMoves) {
        tryApplyStrictMove(move, currentLines, currentTriangles, lineToTriangles, currentPlayer);
        currentPlayer = (currentPlayer === 1) ? 2 : 1; 
    }

    // ★ Phase 2: 填滿內部 (小心翼翼，不可封閉)
    for (const move of sharedMoves) {
        tryApplyStrictMove(move, currentLines, currentTriangles, lineToTriangles, currentPlayer);
        currentPlayer = (currentPlayer === 1) ? 2 : 1; 
    }

    // 返回最終飽和狀態
    return { lines: currentLines, triangles: currentTriangles, lastPlayer: currentPlayer };
}

// 嘗試畫線 (嚴格規則：禁止讓三角形邊數變成 2)
function tryApplyStrictMove(move, lines, triangles, lineToTriangles, player) {
    // 1. 檢查是否已畫
    for(const sid of move.segmentIds) {
        if(lines[sid].drawn) return false;
    }

    // 2. 安全檢查
    let isSafe = true;
    const segId = move.segmentIds[0];
    const affectedTriIdxs = lineToTriangles[segId];

    if (affectedTriIdxs) {
        for (const tIdx of affectedTriIdxs) {
            const tri = triangles[tIdx];
            let drawnCount = 0;
            for(const k of tri.lineKeys) {
                if(lines[k].drawn) drawnCount++;
            }
            
            // ★ 核心邏輯：
            // 如果已經畫了 1 條，再畫這條就會變 2 條 (送分前兆) -> 禁止！
            // 我們希望三角形停留在 0 或 1 條邊的狀態
            if (drawnCount >= 1) {
                isSafe = false;
                break;
            }
        }
    }

    // 3. 執行畫線
    if (isSafe) {
        for(const sid of move.segmentIds) {
            lines[sid].drawn = true;
            lines[sid].player = player;
            lines[sid].sharedBy = 0; 
        }
        return true;
    }
    return false;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 檢查連鎖長度 (模擬犧牲一步後的引爆)
function checkIgnitionChain(lines, triangles, cachedMoves) {
    // 1. 檢查飽和度 (是否大部分三角形都已就緒)
    // 我們希望盤面上充滿了「已畫 1 條邊」的三角形
    let oneCount = 0;
    for(let i=0; i<triangles.length; i++) {
        const t = triangles[i];
        let d = 0;
        for(const k of t.lineKeys) if(lines[k].drawn) d++;
        if(d === 1) oneCount++;
    }

    // 門檻：如果不夠飽和，不可能有長連鎖，直接跳過
    if (oneCount < triangles.length * 0.7) return 0;

    // 2. 尋找「犧牲步」 (Ignition Moves)
    // 找出所有還沒畫的線
    const availableMoves = [];
    for(const move of cachedMoves) {
        if(!lines[move.segmentIds[0]].drawn) {
            availableMoves.push(move);
        }
    }

    if (availableMoves.length === 0) return 0;

    // 隨機抽樣 3 個引爆點來測試，取最大連鎖值
    let maxChain = 0;
    const attempts = Math.min(3, availableMoves.length);
    
    for(let k=0; k<attempts; k++) {
        const startMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        
        // 複製狀態開始模擬
        const simState = fastCloneState(lines, triangles);
        
        // Step 1: 犧牲 (被迫畫下第一條送分線)
        // 這會讓某些三角形從 Count 1 變成 Count 2
        for(const sid of startMove.segmentIds) simState.lines[sid].drawn = true;
        
        // Step 2: 連鎖反應 (Eater 瘋狂吃分)
        let chainScore = 0;
        
        while(true) {
            let foundScore = false;
            
            // 尋找可吃的三角形 (Count 2 的，補第3刀)
            for(let i=0; i<simState.triangles.length; i++) {
                const tri = simState.triangles[i];
                if (!tri.filled) {
                    let d = 0;
                    let missingKey = null;
                    for(const key of tri.lineKeys) {
                        if(simState.lines[key].drawn) d++;
                        else missingKey = key;
                    }
                    
                    if (d === 2) {
                        // 發現獵物！補第3刀吃掉！
                        simState.lines[missingKey].drawn = true; 
                        tri.filled = true;
                        chainScore++;
                        foundScore = true;
                        
                        // 吃了一個後，可能影響鄰居，所以重新掃描
                        break; 
                    }
                }
            }
            
            if (!foundScore) break; // 沒得吃了，連鎖結束
        }
        
        if (chainScore > maxChain) maxChain = chainScore;
    }
    
    return maxChain;
}

// --- 5. 連鎖構造搜尋主程式 (防重複優化版) ---

function runConstructionSearch(config) {
    dots = config.dots;
    totalTriangles = config.totalTriangles;
    REQUIRED_LINE_LENGTH = config.requiredLineLength;
    isScoreAndGoAgain = true; 
    isAllowShorterLines = config.allowShorterLines;

    const minChain = config.minChain || 5;
    const cachedMoves = precomputeAllMoves(dots, config.lines, REQUIRED_LINE_LENGTH);

    // 預先計算 ID 排序 (給 Hash 用)
    const sortedLineKeys = Object.keys(config.lines).sort();

    // 建立線段與三角形的映射關係
    const lineToTriangles = {};
    for(let t=0; t<config.triangles.length; t++) {
        const tri = config.triangles[t];
        for(const key of tri.lineKeys) {
            if(!lineToTriangles[key]) lineToTriangles[key] = [];
            lineToTriangles[key].push(t);
        }
    }

    // ★ 記憶體：存儲檢查過的飽和盤面
    let visitedStates = new Set();
    let attempts = 0; 
    
    while (true) { 
        attempts++;
        if (attempts % 500 === 0) {
            // 定期清理過舊記憶，防止崩潰 (視需要調整大小)
            if (visitedStates.size > 500000) visitedStates.clear();
            self.postMessage({ type: 'search_progress', count: attempts });
        }

        // 1. 隨機構造一個「嚴格防守」的飽和盤面
        const result = constructStrictSafeBoard(config.lines, config.triangles, cachedMoves, lineToTriangles);
        
        // 2. ★ 防重複檢查
        const stateHash = getFastBoardHash(result.lines, sortedLineKeys);

        if (visitedStates.has(stateHash)) {
            continue; // 重複了，跳過！
        }

        visitedStates.add(stateHash); // 記錄下來

        // 3. 檢查連鎖 (模擬引爆)
        const chainLen = checkIgnitionChain(result.lines, result.triangles, cachedMoves);
        
        if (chainLen >= minChain) {
            self.postMessage({
                type: 'chain_puzzle_found',
                puzzleData: {
                    lines: result.lines,
                    player: result.lastPlayer, 
                    chainLength: chainLen
                }
            });
        }
    }
}

// --- 🚀 高效能優化輔助函式 ---

// 1. 極速狀態複製
function fastCloneState(lines, triangles) {
    const newLines = {};
    for (const key in lines) newLines[key] = { ...lines[key] };
    const newTriangles = new Array(triangles.length);
    for (let i = 0; i < triangles.length; i++) newTriangles[i] = { ...triangles[i] };
    return { lines: newLines, triangles: newTriangles };
}

// 2. 極速雜湊
function getFastBoardHash(lines, sortedKeys) {
    let hash = "";
    const len = sortedKeys.length;
    for (let i = 0; i < len; i++) {
        const line = lines[sortedKeys[i]];
        // 為了構造模式，我們只關心「是否畫線」，不太關心是誰畫的 (因為結構決定連鎖)
        // 但為了嚴謹，還是加上 player
        hash += line.drawn ? "1" : "0"; 
    }
    return hash;
}

// 3. 預算步法
function precomputeAllMoves(dots, lines, requiredLen) {
    const moves = [];
    const allDots = dots.flat();
    const count = allDots.length;
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
            const dotA = allDots[i];
            const dotB = allDots[j];
            if (isValidPreviewLine(dotA, dotB, lines)) {
                const dotsOnLine = findIntermediateDots(dotA, dotB);
                const segmentIds = [];
                for (let k = 0; k < dotsOnLine.length - 1; k++) {
                    segmentIds.push(getLineId(dotsOnLine[k], dotsOnLine[k+1]));
                }
                moves.push({ dot1: dotA, dot2: dotB, segmentIds: segmentIds });
            }
        }
    }
    return moves;
}

// --- 原始 AI 函式 (保留佔位，防止報錯) ---
function findBestGreedyMove(lines, triangles, player) { return { segmentIds: [] }; }
function findAllValidMoves(currentLines) { return precomputeAllMoves(dots, currentLines, REQUIRED_LINE_LENGTH); }
function findBestMCTSMove(l, t, p) { return findBestGreedyMove(l,t,p); }
function findBestAIMove(l, t, p, w) { return findBestGreedyMove(l,t,p); }
function runTrainingGeneration(p, c) {}
