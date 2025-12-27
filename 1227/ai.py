# @title 啟動 AI 運算伺服器 (V8.0 - 全局平衡修正版)
# 修正：開局位置偏差 (隨機洗牌)，不再只下上半部
# 保持：無限思考、防呆檢查、置換表

!pip install flask pyngrok flask-cors

import os
import json
import math
import random
import time
import copy
import traceback
import functools
from flask import Flask, request, jsonify
from flask_cors import CORS
from pyngrok import ngrok

app = Flask(__name__)
CORS(app)

# ==========================================
# 1. 核心幾何邏輯 (保持 V6.0 的正確性)
# ==========================================

def get_line_id(dot1, dot2):
    d1, d2 = dot1, dot2
    if d1['r'] > d2['r'] or (d1['r'] == d2['r'] and d1['c'] > d2['c']):
        d1, d2 = d2, d1
    return f"{d1['r']},{d1['c']}_{d2['r']},{d2['c']}"

def compare_dots_js_style(a, b):
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
    
    intermediate.sort(key=functools.cmp_to_key(compare_dots_js_style))
    return intermediate

def is_valid_preview_line(dotA, dotB, current_lines, all_dots_flat, required_length):
    if not dotA or not dotB: return False
    dx = dotB['x'] - dotA['x']
    dy = dotB['y'] - dotA['y']
    
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
    
    all_segments_exist = True
    has_undrawn = False
    
    for sid in segment_ids:
        if sid not in current_lines:
            all_segments_exist = False
            break
        if not current_lines[sid]['drawn']:
            has_undrawn = True
            
    if not all_segments_exist: return False
    if not has_undrawn: return False
    return True

def find_all_valid_moves(lines, dots_flat, required_length):
    moves = []
    count = len(dots_flat)
    for i in range(count):
        for j in range(i + 1, count):
            dotA = dots_flat[i]
            dotB = dots_flat[j]
            if is_valid_preview_line(dotA, dotB, lines, dots_flat, required_length):
                dots_on_line = find_intermediate_dots(dotA, dotB, dots_flat)
                seg_ids = [get_line_id(dots_on_line[k], dots_on_line[k+1]) for k in range(len(dots_on_line)-1)]
                moves.append({
                    'dot1': dotA,
                    'dot2': dotB,
                    'segmentIds': seg_ids
                })
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

def evaluate_board(lines, triangles, weights):
    w = weights or {}
    score_scale = w.get('scoreScale', 150)
    p1_threat_val = w.get('p1ThreatVal', 30)
    p2_threat_val = w.get('p2ThreatVal', -30)
    
    p2_score = 0
    p1_score = 0
    p1_threats = 0
    p2_threats = 0
    
    for tri in triangles:
        if tri['filled']:
            if tri['player'] == 2: p2_score += 1
            elif tri['player'] == 1: p1_score += 1
        else:
            drawn_count = 0
            owners = []
            for key in tri['lineKeys']:
                l = lines.get(key)
                if l and l['drawn']:
                    drawn_count += 1
                    owners.append(l['player'])
                    if l.get('sharedBy', 0) != 0: owners.append(l['sharedBy'])
            
            if drawn_count == 2:
                p1_cnt = owners.count(1)
                p2_cnt = owners.count(2)
                if p1_cnt > p2_cnt: p1_threats += 1
                elif p2_cnt > p1_cnt: p2_threats += 1

    return (p2_score - p1_score) * score_scale + \
           (p1_threats * p1_threat_val + p2_threats * p2_threat_val)

def get_ordered_moves(all_moves, lines, triangles):
    scored_moves = []
    for move in all_moves:
        priority = 0
        m_ids = set(move['segmentIds'])
        
        is_third_edge = False
        is_bad_move = False
        
        for tri in triangles:
            if not tri['filled']:
                existing = 0
                has_target = False
                for key in tri['lineKeys']:
                    if key in m_ids: has_target = True
                    elif lines[key]['drawn']: existing += 1
                
                if has_target:
                    if existing == 2: is_third_edge = True
                    elif existing == 1: is_bad_move = True
        
        if is_third_edge: priority = 100
        elif is_bad_move: priority = -10
        
        scored_moves.append((priority, move))
        
    scored_moves.sort(key=lambda x: x[0], reverse=True)
    return [x[1] for x in scored_moves]

# ==========================================
# 2. 進階 AI (置換表 + 無限時間 Minimax)
# ==========================================

transposition_table = {}

def get_board_hash(lines, triangles, player):
    drawn_lines = []
    for k in sorted(lines.keys()):
        l = lines[k]
        if l['drawn']:
            drawn_lines.append(f"{k}{l['player']}")
            
    filled_tris = []
    for i, t in enumerate(triangles):
        if t['filled']:
            filled_tris.append(f"{i}{t['player']}")
            
    return hash( (tuple(drawn_lines), tuple(filled_tris), player) )

def minimax(lines, triangles, dots_flat, depth, is_maximizing, alpha, beta, weights, req_len, is_score_again):
    board_hash = get_board_hash(lines, triangles, 2 if is_maximizing else 1)
    if board_hash in transposition_table:
        entry = transposition_table[board_hash]
        if entry['depth'] >= depth:
            if entry['flag'] == 0: return entry['score']
            if entry['flag'] == 1: alpha = max(alpha, entry['score'])
            if entry['flag'] == 2: beta = min(beta, entry['score'])
            if alpha >= beta: return entry['score']

    if depth <= 0 or all(t['filled'] for t in triangles):
        return evaluate_board(lines, triangles, weights)
    
    all_moves = find_all_valid_moves(lines, dots_flat, req_len)
    if not all_moves:
        return evaluate_board(lines, triangles, weights)

    # 這裡的 moves 排序也需要注意，我們只對優先級做排序，同優先級隨機
    # get_ordered_moves 內部目前是穩定排序，我們讓外部傳進來前先 shuffle 即可
    ordered_moves = get_ordered_moves(all_moves, lines, triangles)
    
    best_score = -math.inf if is_maximizing else math.inf
    
    if is_maximizing:
        for move in ordered_moves:
            sim = simulate_move(move, lines, triangles, 2)
            if not sim: continue
            
            next_depth = depth - 1
            next_maximizing = False
            if is_score_again and sim['scoreGained'] > 0:
                next_depth = depth 
                next_maximizing = True
            
            val = minimax(sim['newLines'], sim['newTriangles'], dots_flat, next_depth, next_maximizing, alpha, beta, weights, req_len, is_score_again)
            val += sim['scoreGained'] * 5000 
            
            best_score = max(best_score, val)
            alpha = max(alpha, val)
            if beta <= alpha: break
    else:
        for move in ordered_moves:
            sim = simulate_move(move, lines, triangles, 1)
            if not sim: continue
            
            next_depth = depth - 1
            next_maximizing = True
            if is_score_again and sim['scoreGained'] > 0:
                next_depth = depth
                next_maximizing = False
            
            val = minimax(sim['newLines'], sim['newTriangles'], dots_flat, next_depth, next_maximizing, alpha, beta, weights, req_len, is_score_again)
            val -= sim['scoreGained'] * 5000
            
            best_score = min(best_score, val)
            beta = min(beta, val)
            if beta <= alpha: break
            
    flag = 0
    if best_score <= alpha: flag = 2
    elif best_score >= beta: flag = 1
    
    transposition_table[board_hash] = {'depth': depth, 'score': best_score, 'flag': flag}
    return best_score

# ==========================================
# 3. 伺服器路由
# ==========================================

@app.route('/get_move', methods=['POST'])
def get_move():
    global transposition_table
    try:
        data = request.json
        game_state = data['gameState']
        lines = game_state['lines']
        triangles = game_state['triangles']
        dots_rows = game_state['dots']
        dots_flat = [d for row in dots_rows for d in row]
        player = game_state['player']
        req_len = game_state['requiredLineLength']
        is_score_again = game_state['isScoreAndGoAgain']
        weights = data.get('weights')
        
        print(f"收到請求: P{player} (V8.0 平衡版)")
        
        if len(transposition_table) > 200000:
            transposition_table.clear()

        start_time = time.time()
        
        empty_lines = sum(1 for k, v in lines.items() if not v['drawn'])
        
        # 目標深度設定
        target_depth = 3
        if empty_lines < 30: target_depth = 4
        if empty_lines < 15: target_depth = 5 
        if empty_lines < 10: target_depth = 7 
        if req_len == 1 and target_depth > 4: target_depth = 4
        
        print(f"  - 剩餘線段: {empty_lines}, 目標深度: {target_depth}")
        
        all_moves = find_all_valid_moves(lines, dots_flat, req_len)
        
        # [關鍵修正] 在排序前先隨機洗牌，解決開局只下上面的問題
        random.shuffle(all_moves)
        
        ordered_moves = get_ordered_moves(all_moves, lines, triangles)
        
        if not ordered_moves:
            return jsonify({'bestMove': None})

        best_move = ordered_moves[0]
        current_best_val = -math.inf if player == 2 else math.inf
        
        # 紀錄所有最佳分數的步數，避免排序後永遠取第一個
        candidates = []

        for move in ordered_moves:
            sim = simulate_move(move, lines, triangles, player)
            if not sim: continue
            
            is_maximizing = (player == 2)
            next_maximizing = is_maximizing if (is_score_again and sim['scoreGained'] > 0) else (not is_maximizing)
            next_depth = target_depth if (is_score_again and sim['scoreGained'] > 0) else target_depth - 1
            
            val = minimax(sim['newLines'], sim['newTriangles'], dots_flat, next_depth, next_maximizing, -math.inf, math.inf, weights, req_len, is_score_again)
            
            immediate = sim['scoreGained'] * 5000
            total_val = (val + immediate) if is_maximizing else (val - immediate)
            
            candidates.append((total_val, move))
            
            if is_maximizing:
                if total_val > current_best_val:
                    current_best_val = total_val
                    best_move = move
            else:
                if total_val < current_best_val:
                    current_best_val = total_val
                    best_move = move

        # [二次隨機] 如果有多個分數相同的最佳步，隨機選一個
        # 允許誤差範圍 (浮點數安全)
        best_candidates = [m for s, m in candidates if abs(s - current_best_val) < 0.1]
        
        if best_candidates:
            best_move = random.choice(best_candidates)
            print(f"  - 從 {len(best_candidates)} 個最佳步中隨機選擇")

        # 防呆
        if best_move:
             if not simulate_move(best_move, lines, triangles, player):
                 print("警告：最佳步無效，強制選擇第一合法步")
                 for move in ordered_moves:
                     if simulate_move(move, lines, triangles, player):
                         best_move = move
                         break

        duration = time.time() - start_time
        print(f"運算完成: 深度 {target_depth}, 耗時 {duration:.2f}s")
        
        return jsonify({'bestMove': best_move})
        
    except Exception as e:
        error_msg = str(e)
        print("★ 錯誤:", error_msg)
        traceback.print_exc()
        return jsonify({'error': error_msg}), 500

public_url = ngrok.connect(5000).public_url
print(f"★ V8.0 平衡修正版網址: {public_url}")

app.run(port=5000)
