document.addEventListener('DOMContentLoaded', () => {
    // 取得 HTML 元素
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const score1El = document.getElementById('score1');
    const score2El = document.getElementById('score2');
    const player1ScoreBox = document.getElementById('player1-score');
    const player2ScoreBox = document.getElementById('player2-score');
    const gameOverMessage = document.getElementById('game-over-message'); // 這是 Modal 的內容
    const winnerText = document.getElementById('winnerText');
    const confirmLineButton = document.getElementById('confirm-line-button');
    const cancelLineButton = document.getElementById('cancel-line-button');
    const actionBar = document.getElementById('action-bar');
    const resetButton = document.getElementById('reset-button');

    // 【新】 取得 Modal 相關元素
    const modalOverlay = document.getElementById('modal-overlay');
    const resetButtonModal = document.getElementById('reset-button-modal');

    // 遊戲設定 (...相同...)
    const ROW_LENGTHS = [4, 5, 6, 7, 6, 5, 4]; // 菱形網格的定義
    const DOT_SPACING_X = 100; // 點的水平間距
    const DOT_SPACING_Y = DOT_SPACING_X * Math.sqrt(3) / 2; // 點的垂直間距 (等邊三角形的高)
    const PADDING = 50;
    const DOT_RADIUS = 6;
    const LINE_WIDTH = 4;
    const CLICK_TOLERANCE_DOT = 15;
    const ANGLE_TOLERANCE = 1.5; // 角度容許誤差

    // 玩家顏色 (與 CSS 相同)
    const PLAYER_COLORS = {
        1: { line: '#3498db', fill: 'rgba(52, 152, 219, 0.3)' },
        2: { line: '#e74c3c', fill: 'rgba(231, 76, 60, 0.3)' },
        0: { line: '#95a5a6', fill: 'rgba(149, 165, 166, 0.2)' }
    };
    const DEFAULT_LINE_COLOR = '#e0e0e0';

    // 遊戲狀態 (...相同...)
    let currentPlayer = 1;
    let scores = { 1: 0, 2: 0 };
    let dots = []; // [r][c]
    let lines = {}; // key: "id"
    let triangles = [];
    let totalTriangles = 0;
    
    let selectedDot1 = null;
    let selectedDot2 = null;

    // ----- 輔助函式: 取得標準的線段 ID (相同) -----
    function getLineId(dot1, dot2) {
        if (!dot1 || !dot2) return null;
        let d1 = dot1, d2 = dot2;
        if (dot1.r > dot2.r || (dot1.r === dot2.r && dot1.c > dot2.c)) {
            d1 = dot2;
            d2 = dot1;
        }
        return `${d1.r},${d1.c}_${d2.r},${d2.c}`;
    }


    // 初始化遊戲
    function initGame() {
        // 1. 計算畫布大小 (...相同...)
        const gridWidth = (Math.max(...ROW_LENGTHS) - 1) * DOT_SPACING_X;
        const gridHeight = (ROW_LENGTHS.length - 1) * DOT_SPACING_Y;
        canvas.width = gridWidth + PADDING * 2;
        canvas.height = gridHeight + PADDING * 2;

        // 2. 重置所有狀態
        currentPlayer = 1;
        scores = { 1: 0, 2: 0 };
        dots = [];
        lines = {};
        triangles = [];
        totalTriangles = 0;
        selectedDot1 = null;
        selectedDot2 = null;
        actionBar.classList.add('hidden');
        // 【修改】 隱藏 modal
        modalOverlay.classList.add('hidden'); 

        // 3. 產生所有點的座標 (r, c) (...相同...)
        dots = [];
        ROW_LENGTHS.forEach((len, r) => {
            dots[r] = [];
            const rowWidth = (len - 1) * DOT_SPACING_X;
            const offsetX = (canvas.width - rowWidth) / 2;
            for (let c = 0; c < len; c++) {
                dots[r][c] = {
                    x: c * DOT_SPACING_X + offsetX,
                    y: r * DOT_SPACING_Y + PADDING,
                    r: r, c: c
                };
            }
        });

        // 4. 產生所有 "相鄰" 線段 (用於計分和虛線) (...相同...)
        lines = {};
        for (let r = 0; r < ROW_LENGTHS.length; r++) {
            for (let c = 0; c < ROW_LENGTHS[r]; c++) {
                const d1 = dots[r][c];
                // 4a. 橫向線 (同 r)
                if (c < ROW_LENGTHS[r] - 1) {
                    const d2 = dots[r][c + 1];
                    const id = getLineId(d1, d2);
                    lines[id] = { p1: d1, p2: d2, drawn: false, player: null, id: id };
                }
                // 4b. 斜向線 (到 r+1)
                if (r < ROW_LENGTHS.length - 1) {
                    const len1 = ROW_LENGTHS[r];
                    const len2 = ROW_LENGTHS[r+1];
                    if (len2 > len1) { // 菱形上半部 (r < 3)
                        const d_dl = dots[r + 1][c];
                        const id_dl = getLineId(d1, d_dl);
                        lines[id_dl] = { p1: d1, p2: d_dl, drawn: false, player: null, id: id_dl };
                        const d_dr = dots[r + 1][c + 1];
                        const id_dr = getLineId(d1, d_dr);
                        lines[id_dr] = { p1: d1, p2: d_dr, drawn: false, player: null, id: id_dr };
                    } else { // 菱形下半部 (r >= 3)
                        if (c < len2) { 
                            const d_dl = dots[r + 1][c];
                            const id_dl = getLineId(d1, d_dl);
                            lines[id_dl] = { p1: d1, p2: d_dl, drawn: false, player: null, id: id_dl };
                        }
                        if (c > 0) { 
                            const d_dr = dots[r + 1][c - 1];
                            const id_dr = getLineId(d1, d_dr);
                            lines[id_dr] = { p1: d1, p2: d_dr, drawn: false, player: null, id: id_dr };
                        }
                    }
                }
            }
        }

        // 5. 產生所有三角形 (計分用) (...相同...)
        triangles = [];
        totalTriangles = 0;
        for (let r = 0; r < ROW_LENGTHS.length - 1; r++) {
            const len1 = ROW_LENGTHS[r];
            const len2 = ROW_LENGTHS[r+1];
            if (len2 > len1) { // 菱形上半部 (r < 3)
                for (let c = 0; c < len1; c++) {
                    const d1 = dots[r][c];
                    const d2 = dots[r+1][c];
                    const d3 = dots[r+1][c+1];
                    if (d1 && d2 && d3) {
                        triangles.push({
                            lineKeys: [getLineId(d1, d2), getLineId(d1, d3), getLineId(d2, d3)],
                            dots: [d1, d2, d3],
                            filled: false, player: null
                        });
                        totalTriangles++;
                    }
                    if (c < len1 - 1) {
                        const d4 = dots[r][c+1];
                        if (d1 && d4 && d3) {
                            triangles.push({
                                lineKeys: [getLineId(d1, d4), getLineId(d1, d3), getLineId(d4, d3)],
                                dots: [d1, d4, d3],
                                filled: false, player: null
                            });
                            totalTriangles++;
                        }
                    }
                }
            } else { // 菱形下半部 (r >= 3)
                for (let c = 0; c < len2; c++) {
                    const d1 = dots[r][c];
                    const d2 = dots[r][c+1];
                    const d3 = dots[r+1][c];
                    if (d1 && d2 && d3) {
                        triangles.push({
                            lineKeys: [getLineId(d1, d2), getLineId(d1, d3), getLineId(d2, d3)],
                            dots: [d1, d2, d3],
                            filled: false, player: null
                        });
                        totalTriangles++;
                    }
                    if (c < len2 - 1) {
                        const d4 = dots[r+1][c+1];
                        if(d2 && d3 && d4) {
                            triangles.push({
                                lineKeys: [getLineId(d2, d3), getLineId(d2, d4), getLineId(d3, d4)],
                                dots: [d2, d3, d4],
                                filled: false, player: null
                            });
                            totalTriangles++;
                        }
                    }
                }
            }
        }
        
        updateUI();
        drawCanvas();
    }

    // 繪製所有遊戲元素 (相同)
    function drawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        triangles.forEach(tri => {
            if (tri.filled) {
                ctx.beginPath();
                ctx.moveTo(tri.dots[0].x, tri.dots[0].y);
                ctx.lineTo(tri.dots[1].x, tri.dots[1].y);
                ctx.lineTo(tri.dots[2].x, tri.dots[2].y);
                ctx.closePath();
                ctx.fillStyle = PLAYER_COLORS[tri.player].fill;
                ctx.fill();
            }
        });
        
        for (const id in lines) {
            const line = lines[id];
            ctx.beginPath();
            ctx.moveTo(line.p1.x, line.p1.y);
            ctx.lineTo(line.p2.x, line.p2.y);
            if (line.drawn) {
                ctx.strokeStyle = PLAYER_COLORS[line.player].line;
                ctx.lineWidth = LINE_WIDTH;
            } else {
                ctx.strokeStyle = DEFAULT_LINE_COLOR;
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 4]);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        dots.forEach(row => {
            row.forEach(dot => {
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = '#34495e';
                ctx.fill();
            });
        });
        [selectedDot1, selectedDot2].forEach(dot => {
            if (dot) {
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, DOT_RADIUS + 3, 0, 2 * Math.PI);
                ctx.strokeStyle = PLAYER_COLORS[currentPlayer].line;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        });
    }

    // 點擊/觸控畫布 (相同)
    function handleCanvasClick(e) {
        if (!actionBar.classList.contains('hidden')) {
            return;
        }
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
        const clickedDot = findNearestDot(mouseX, mouseY);
        
        if (!clickedDot) {
            if (selectedDot1) cancelLine();
            return;
        }
        if (selectedDot1 === null) {
            selectedDot1 = clickedDot;
        } else if (selectedDot2 === null) {
            if (clickedDot === selectedDot1) {
                selectedDot1 = null;
            } else {
                selectedDot2 = clickedDot;
                actionBar.classList.remove('hidden');
            }
        }
        drawCanvas();
    }

    // "確認連線" 按鈕的函式
    function confirmLine() {
        if (!selectedDot1 || !selectedDot2) return;
        const dotA = selectedDot1;
        const dotB = selectedDot2;
        
        // 1. 角度檢查 (...相同...)
        const dy = dotB.y - dotA.y;
        const dx = dotB.x - dotA.x;
        
        if (dx !== 0 || dy !== 0) {
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const absAngle = Math.abs(angle);

            const isValidAngle = isClose(absAngle, 0) || 
                                 isClose(absAngle, 60) || 
                                 isClose(absAngle, 120) || 
                                 isClose(absAngle, 180);

            if (!isValidAngle) {
                alert("無效的線條 (必須是 0, 60, 120 或 180 度)");
                cancelLine();
                return;
            }
        }

        // 2. 拆解長線為短線並執行 (...相同...)
        const allDotsOnLine = findIntermediateDots(dotA, dotB);
        const segmentIds = [];
        for (let i = 0; i < allDotsOnLine.length - 1; i++) {
            segmentIds.push(getLineId(allDotsOnLine[i], allDotsOnLine[i+1]));
        }
        if (segmentIds.length === 0) {
            alert("無效的線段 (找不到對應的格線)");
            cancelLine();
            return;
        }
        let allSegmentsExist = true;
        let anySegmentDrawn = false;
        for (const id of segmentIds) {
            if (!lines[id]) {
                allSegmentsExist = false;
                break;
            }
            if (lines[id].drawn) {
                anySegmentDrawn = true;
                break;
            }
        }
        if (!allSegmentsExist) {
            alert("無效的線段 (此連線未對齊網格)");
            cancelLine();
            return;
        }
        if (anySegmentDrawn) {
            alert("這條線 (或其中一部分) 已經被畫過了。");
            cancelLine();
            return;
        }
        for (const id of segmentIds) {
            lines[id].drawn = true;
            lines[id].player = currentPlayer;
        }


        // 6. 檢查得分
        let totalFilledThisGame = 0;
        
        triangles.forEach(tri => {
            if (!tri.filled) {
                const isComplete = tri.lineKeys.every(key => lines[key] && lines[key].drawn);
                if (isComplete) {
                    tri.filled = true;
                    tri.player = currentPlayer;
                    scores[currentPlayer]++;
                    
                    // 【新】 觸發得分動畫
                    const scoreBox = (currentPlayer === 1) ? player1ScoreBox : player2ScoreBox;
                    scoreBox.classList.add('score-pulse');
                    // 400ms 後移除 class，動畫 (0.4s) 剛好播完
                    setTimeout(() => {
                        scoreBox.classList.remove('score-pulse');
                    }, 400); 
                }
            }
            if (tri.filled) totalFilledThisGame++;
        });

        // 7. 重置選取
        selectedDot1 = null;
        selectedDot2 = null;
        actionBar.classList.add('hidden');
        
        // 8. 繪製並更新 UI
        drawCanvas();
        updateUI(); // updateUI 會更新分數文字

        // 9. 檢查遊戲是否結束
        if (totalFilledThisGame === totalTriangles) {
            endGame();
            return;
        }

        // 10. 【規則修改】 無論是否得分，一律換人
        switchPlayer();
    }

    // "取消選取" 按鈕的函式 (相同)
    function cancelLine() {
        selectedDot1 = null;
        selectedDot2 = null;
        actionBar.classList.add('hidden');
        drawCanvas();
    }


    // ----- 輔助函式 (相同) -----

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

    // 切換玩家 (相同)
    function switchPlayer() {
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
        updateUI();
    }

    // 更新分數和玩家狀態
    function updateUI() {
        score1El.textContent = scores[1];
        score2El.textContent = scores[2];
        
        // 【註】 .score-pulse 的移除交給 setTimeout
        // 這裡只處理 .active 狀態
        if (currentPlayer === 1) {
            player1ScoreBox.classList.add('active');
            player2ScoreBox.classList.remove('active', 'player2');
        } else {
            player1ScoreBox.classList.remove('active');
            player2ScoreBox.classList.add('active', 'player2');
        }
    }

    // 遊戲結束
    function endGame() {
        let winnerMessage = "";
        if (scores[1] > scores[2]) {
            winnerMessage = "玩家 1 獲勝！";
        } else if (scores[2] > scores[1]) {
            winnerMessage = "玩家 2 獲勝！";
        } else {
            winnerMessage = "平手！";
        }
        winnerText.textContent = winnerMessage;
        
        // 【修改】 顯示 Modal 彈窗
        modalOverlay.classList.remove('hidden'); 

        actionBar.classList.add('hidden');
    }

    // 綁定所有事件
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        handleCanvasClick(e);
    });

    resetButton.addEventListener('click', initGame);
    
    // 【新】 綁定 Modal 內的重置按鈕
    resetButtonModal.addEventListener('click', initGame);

    confirmLineButton.addEventListener('click', confirmLine);
    cancelLineButton.addEventListener('click', cancelLine);

    // 啟動遊戲
    initGame();
});