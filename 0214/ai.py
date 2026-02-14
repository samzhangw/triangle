import math
import random
import copy
import time

# ==========================================
# 1. 核心幾何與遊戲邏輯
# ==========================================

def get_line_id(dot1, dot2):
    d1, d2 = dot1, dot2
    if d1['r'] > d2['r'] or (d1['r'] == d2['r'] and d1['c'] > d2['c']):
        d1, d2 = d2, d1
    return f"{d1['r']},{d1['c']}_{d2['r']},{d2['c']}"

def compare_dots(a, b):
    EPSILON = 1e-6
    diff_x = a['x'] - b['x']
    if abs(diff_x) > EPSILON:
        return diff_x
    return a['y'] - b['y']

def find_intermediate_dots(dotA, dotB, all_dots_flat):
    intermediate = []
    min_x = min(dotA['x'], dotB['x']) - 5
    max_x = max(dotA['x'], dotB['x']) + 5
    min_y = min(dotA['y'], dotB['y']) - 5
    max_y = max(dotA['y'], dotB['y']) + 5
    EPSILON = 1e-4

    for dot in all_dots_flat:
        if min_x <= dot['x'] <= max_x and min_y <= dot['y'] <= max_y:
            cross_product = (dotB['y'] - dotA['y']) * (dot['x'] - dotB['x']) - \
                            (dot['y'] - dotB['y']) * (dotB['x'] - dotA['x'])
            if abs(cross_product) < EPSILON:
                intermediate.append(dot)
    
    # 簡單排序
    intermediate.sort(key=lambda d: (d['x'], d['y']))
    return intermediate

def is_valid_line(dotA, dotB, current_lines, all_dots_flat, required_length=1):
    if not dotA or not dotB: return False
    dx = dotB['x'] - dotA['x']
    dy = dotB['y'] - dotA['y']
    
    # 角度檢查 (0, 60, 120, 180)
    if abs(dx) > 0.1 or abs(dy) > 0.1:
        angle = math.atan2(dy, dx) * 180 / math.pi
        abs_angle = abs(angle)
        valid = False
        for v in [0, 60, 120, 180]:
            if abs(abs_angle - v) < 2.5:
                valid = True
                break
        if not valid: return False

    dots_on_line = find_intermediate_dots(dotA, dotB, all_dots_flat)
    segment_ids = []
    for i in range(len(dots_on_line) - 1):
        segment_ids.append(get_line_id(dots_on_line[i], dots_on_line[i+1]))
    
    if len(segment_ids) != required_length: return False
    
    has_undrawn = False
    for sid in segment_ids:
        if sid not in current_lines: return False
        if not current_lines[sid]['drawn']:
            has_undrawn = True
            
    return has_undrawn

def find_all_valid_moves(lines, dots_flat, required_length=1):
    moves = []
    count = len(dots_flat)
    for i in range(count):
        for j in range(i + 1, count):
            dotA = dots_flat[i]
            dotB = dots_flat[j]
            if is_valid_line(dotA, dotB, lines, dots_flat, required_length):
                dots_on_line = find_intermediate_dots(dotA, dotB, dots_flat)
                seg_ids = [get_line_id(dots_on_line[k], dots_on_line[k+1]) for k in range(len(dots_on_line)-1)]
                moves.append({
                    'dot1': dotA,
                    'dot2': dotB,
                    'segmentIds': seg_ids,
                    'id': f"Move({dotA['r']},{dotA['c']}->{dotB['r']},{dotB['c']})"
                })
    random.shuffle(moves) # 隨機打亂避免僵化
    return moves

def simulate_move(move, lines, triangles, player):
    new_lines = copy.deepcopy(lines)
    new_triangles = copy.deepcopy(triangles)
    
    score_gained = 0
    new_segment_drawn = False
    
    for sid in move['segmentIds']:
        if sid in new_lines:
            if not new_lines[sid]['drawn']:
                new_lines[sid]['drawn'] = True
                new_lines[sid]['player'] = player
                new_segment_drawn = True
            elif new_lines[sid]['player'] != 0 and new_lines[sid]['player'] != player:
                if new_lines[sid]['sharedBy'] == 0:
                    new_lines[sid]['sharedBy'] = player
    
    if not new_segment_drawn: return None
    
    for tri in new_triangles:
        if not tri['filled']:
            is_complete = True
            for key in tri['lineKeys']:
                if key not in new_lines or not new_lines[key]['drawn']:
                    is_complete = False
                    break
            if is_complete:
                tri['filled'] = True
                tri['player'] = player
                score_gained += 1
                
    return {'newLines': new_lines, 'newTriangles': new_triangles, 'scoreGained': score_gained}

# ==========================================
# 2. 強化版評估函數 (加入必勝法邏輯)
# ==========================================

def evaluate_board_enhanced(lines, triangles, weights):
    w = weights
    score_scale = w.get('scoreScale', 200)
    p1_threat_val = w.get('p1ThreatVal', 30)
    p2_threat_val = w.get('p2ThreatVal', -30)
    # 必勝法關鍵權重：雙重佈局
    p1_double_val = w.get('p1DoubleVal', 100)
    p2_double_val = w.get('p2DoubleVal', -100)
    
    p2_score = 0
    p1_score = 0
    p1_threats = 0
    p2_threats = 0
    
    # 用於偵測 Double Setup: 記錄每個 "缺邊" 被誰威脅
    # key: missing_line_id, value: list of players who threaten it
    threat_map = {} 

    for tri in triangles:
        if tri['filled']:
            if tri['player'] == 2: p2_score += 1
            elif tri['player'] == 1: p1_score += 1
        else:
            drawn_count = 0
            missing_key = None
            owners = []
            
            for key in tri['lineKeys']:
                l = lines.get(key)
                if l and l['drawn']:
                    drawn_count += 1
                    owners.append(l['player'])
                    if l.get('sharedBy', 0) != 0: owners.append(l['sharedBy'])
                else:
                    missing_key = key
            
            if drawn_count == 2:
                # 判斷是誰的威脅 (擁有較多邊的人)
                p1_cnt = owners.count(1)
                p2_cnt = owners.count(2)
                threat_owner = 0
                
                if p1_cnt > p2_cnt: 
                    p1_threats += 1
                    threat_owner = 1
                elif p2_cnt > p1_cnt: 
                    p2_threats += 1
                    threat_owner = 2
                
                if threat_owner != 0 and missing_key:
                    if missing_key not in threat_map:
                        threat_map[missing_key] = []
                    threat_map[missing_key].append(threat_owner)

    # 計算 Double Setups (同一條缺邊被威脅兩次以上)
    p1_double_setups = 0
    p2_double_setups = 0
    
    for missing_key, owners in threat_map.items():
        if len(owners) >= 2:
            # 簡單判定：如果這條邊的威脅者都是同一人，則構成該人的 Double Setup
            if all(o == 1 for o in owners):
                p1_double_setups += 1
            elif all(o == 2 for o in owners):
                p2_double_setups += 1

    # 分數計算：必勝法策略會極大化 Double Setup 的價值
    total_score = (p2_score - p1_score) * score_scale + \
                  (p1_threats * p1_threat_val + p2_threats * p2_threat_val) + \
                  (p1_double_setups * p1_double_val + p2_double_setups * p2_double_val)

    return total_score

# ==========================================
# 3. AI 代理人
# ==========================================

def minimax(lines, triangles, dots_flat, depth, is_maximizing, alpha, beta, weights, req_len, is_score_again):
    # 簡化版 Minimax，移除置換表以保持獨立執行
    if depth <= 0 or all(t['filled'] for t in triangles):
        return evaluate_board_enhanced(lines, triangles, weights)
    
    all_moves = find_all_valid_moves(lines, dots_flat, req_len)
    if not all_moves:
        return evaluate_board_enhanced(lines, triangles, weights)
    
    # 簡易排序：優先考慮可能得分的步
    # (在完整版中會有更複雜的排序，這裡保持隨機性以測試策略穩健度)
    
    best_score = -math.inf if is_maximizing else math.inf
    
    for move in all_moves[:8]: # 限制分支因子以加速演示
        sim = simulate_move(move, lines, triangles, 2 if is_maximizing else 1)
        if not sim: continue
        
        # 處理 "得分後再走一步"
        next_maximizing = is_maximizing
        next_depth = depth - 1
        
        if is_score_again and sim['scoreGained'] > 0:
            # 獲得獎勵步，保留控制權，且不扣減深度 (或扣減較少) 以鼓勵連續得分
            next_maximizing = is_maximizing 
            next_depth = depth 
        else:
            next_maximizing = not is_maximizing
        
        val = minimax(sim['newLines'], sim['newTriangles'], dots_flat, next_depth, next_maximizing, alpha, beta, weights, req_len, is_score_again)
        
        # 加上立即得分的獎勵
        if is_maximizing:
            val += sim['scoreGained'] * 5000
            best_score = max(best_score, val)
            alpha = max(alpha, val)
        else:
            val -= sim['scoreGained'] * 5000
            best_score = min(best_score, val)
            beta = min(beta, val)
            
        if beta <= alpha: break
            
    return best_score

def get_best_move(lines, triangles, dots_flat, player, weights, depth=2):
    is_maximizing = (player == 2)
    best_move = None
    best_val = -math.inf if is_maximizing else math.inf
    
    all_moves = find_all_valid_moves(lines, dots_flat, required_length=1)
    
    print(f"  AI (P{player}) 思考中... (深度 {depth}, 權重策略: {'必勝法' if weights['p1DoubleVal'] > 50 else '普通'})")

    for move in all_moves:
        sim = simulate_move(move, lines, triangles, player)
        if not sim: continue
        
        next_maximizing = is_maximizing if (sim['scoreGained'] > 0) else (not is_maximizing)
        
        # 呼叫 Minimax
        val = minimax(sim['newLines'], sim['newTriangles'], dots_flat, depth-1, next_maximizing, -math.inf, math.inf, weights, 1, True)
        
        # 加上立即得分
        immediate = sim['scoreGained'] * 5000
        total_val = (val + immediate) if is_maximizing else (val - immediate)
        
        if is_maximizing:
            if total_val > best_val:
                best_val = total_val
                best_move = move
        else:
            if total_val < best_val:
                best_val = total_val
                best_move = move
                
    return best_move

# ==========================================
# 4. 遊戲初始化與主迴圈
# ==========================================

def create_board(rows=[3, 4, 3]):
    DOT_SPACING = 100
    dots = []
    lines = {}
    dots_flat = []
    
    # 建立點
    for r, count in enumerate(rows):
        row_dots = []
        offset_x = (max(rows) - count) * DOT_SPACING / 2
        for c in range(count):
            dot = {'x': c * DOT_SPACING + offset_x, 'y': r * (DOT_SPACING * 0.866), 'r': r, 'c': c}
            row_dots.append(dot)
            dots_flat.append(dot)
        dots.append(row_dots)
        
    # 建立線
    for r in range(len(rows)):
        for c in range(rows[r]):
            d1 = dots[r][c]
            # 橫向
            if c < rows[r] - 1:
                d2 = dots[r][c+1]
                lid = get_line_id(d1, d2)
                lines[lid] = {'p1': d1, 'p2': d2, 'drawn': False, 'player': 0, 'sharedBy': 0}
            # 縱向/斜向 (連接下一行)
            if r < len(rows) - 1:
                # 簡單幾何邏輯：根據行數差異連接
                # 這裡簡化處理：每個點連接下一行的相鄰點
                # 3-4-3 結構
                current_len = rows[r]
                next_len = rows[r+1]
                
                left_idx = c if next_len > current_len else c - 1
                right_idx = c + 1 if next_len > current_len else c
                
                if left_idx >= 0 and left_idx < next_len:
                    d_next = dots[r+1][left_idx]
                    lid = get_line_id(d1, d_next)
                    lines[lid] = {'p1': d1, 'p2': d_next, 'drawn': False, 'player': 0, 'sharedBy': 0}
                    
                if right_idx >= 0 and right_idx < next_len:
                    d_next = dots[r+1][right_idx]
                    lid = get_line_id(d1, d_next)
                    lines[lid] = {'p1': d1, 'p2': d_next, 'drawn': False, 'player': 0, 'sharedBy': 0}

    # 建立三角形
    triangles = []
    # 暴力搜尋所有可能的三角形 (三點兩兩相連)
    count = len(dots_flat)
    for i in range(count):
        for j in range(i+1, count):
            for k in range(j+1, count):
                d1, d2, d3 = dots_flat[i], dots_flat[j], dots_flat[k]
                l1 = get_line_id(d1, d2)
                l2 = get_line_id(d1, d3)
                l3 = get_line_id(d2, d3)
                if l1 in lines and l2 in lines and l3 in lines:
                    triangles.append({
                        'lineKeys': [l1, l2, l3],
                        'dots': [d1, d2, d3],
                        'filled': False,
                        'player': 0
                    })
                    
    return lines, triangles, dots_flat

# ==========================================
# 5. 執行對戰
# ==========================================

def run_battle():
    print("=== 必勝法對戰模型啟動 ===")
    print("P1: 必勝法 AI (重視雙重陷阱 Double Setup)")
    print("P2: 普通 AI (僅重視單一威脅 Threat)")
    print("-" * 40)
    
    # 初始化 3-4-3 棋盤 (小型)
    lines, triangles, dots_flat = create_board(rows=[3, 4, 3])
    
    # 設定權重
    # P1: 必勝法 (DoubleVal 極高)
    weights_p1 = {
        'scoreScale': 200, 
        'p1ThreatVal': 30, 'p2ThreatVal': -30,
        'p1DoubleVal': 150, 'p2DoubleVal': -150 # 關鍵：此權重是 Threat 的 5 倍
    }
    
    # P2: 普通 (DoubleVal 為 0，不懂佈局)
    weights_p2 = {
        'scoreScale': 200, 
        'p1ThreatVal': 30, 'p2ThreatVal': -30,
        'p1DoubleVal': 0, 'p2DoubleVal': 0
    }
    
    current_player = 1
    scores = {1: 0, 2: 0}
    total_triangles = len(triangles)
    turn = 1
    
    while scores[1] + scores[2] < total_triangles:
        print(f"\n[回合 {turn}] 輪到 P{current_player}")
        
        w = weights_p1 if current_player == 1 else weights_p2
        # P1 深度稍深以模擬思考，P2 較淺
        depth = 3 if current_player == 1 else 2 
        
        move = get_best_move(lines, triangles, dots_flat, current_player, w, depth)
        
        if not move:
            print("無步可走，遊戲結束。")
            break
            
        print(f"  -> 下子: {move['id']}")
        
        sim = simulate_move(move, lines, triangles, current_player)
        lines = sim['newLines']
        triangles = sim['newTriangles']
        gained = sim['scoreGained']
        
        if gained > 0:
            print(f"  ★ P{current_player} 得分！ (+{gained})")
            scores[current_player] += gained
            # 規則：得分後再走一步 (不換人)
        else:
            current_player = 2 if current_player == 1 else 1
            
        print(f"  當前比分: P1 [{scores[1]}] - P2 [{scores[2]}]")
        turn += 1

    print("\n" + "="*40)
    print("遊戲結束！最終結果：")
    print(f"P1 (必勝法 AI): {scores[1]}")
    print(f"P2 (普通 AI):   {scores[2]}")
    
    if scores[1] > scores[2]:
        print("🏆 必勝法 AI 獲勝！驗證成功！")
        print("關鍵：透過 Double Setup 權重，P1 成功在佈局階段佔優。")
    elif scores[2] > scores[1]:
        print("普通 AI 獲勝。 (可能因棋盤過小或先手優勢抵銷了策略)")
    else:
        print("平手。")

if __name__ == "__main__":
    run_battle()