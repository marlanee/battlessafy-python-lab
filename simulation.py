"""Small educational stage simulator; not the official Battle SSAFY engine."""
import contextlib
import copy
import io
import json
import traceback

DIRECTIONS = {"U": (-1, 0), "R": (0, 1), "D": (1, 0), "L": (0, -1)}


class LimitedOutput(io.StringIO):
    def write(self, text):
        remaining = max(0, 6000 - self.tell())
        super().write(text[:remaining])
        return len(text)


def encrypted(text, shift=17):
    return "".join(chr((ord(c) - 65 + shift) % 26 + 65) for c in text)


def simulate(code, scenario):
    namespace = {"__name__": "__student__"}
    exec(compile(code, "solution.py", "exec"), namespace)
    bot = namespace.get("choose_action")
    if not callable(bot):
        raise NameError("choose_action(state) 함수를 정의하세요.")
    grid = copy.deepcopy(scenario["grid"])
    hp = scenario.get("hp", 100)
    normal = scenario.get("normal", 1)
    mega = scenario.get("mega", 0)
    target_hp = scenario.get("targetHp", 10)
    facing = "R"
    position = next((r, c) for r, row in enumerate(grid) for c, cell in enumerate(row) if cell == "M")
    target = next((r, c) for r, row in enumerate(grid) for c, cell in enumerate(row) if cell == "X")
    enemy = copy.deepcopy(scenario.get("enemy"))
    trace = []
    invalid = 0

    def snapshot(turn, action, note):
        return {"turn": turn, "action": action, "note": note, "grid": copy.deepcopy(grid), "hp": hp, "normal": normal, "mega": mega, "targetHp": max(0, target_hp)}

    def inside(r, c):
        return 0 <= r < len(grid) and 0 <= c < len(grid[0])

    trace.append(snapshot(0, "START", "시작 상태"))
    for turn in range(1, scenario.get("limit", 100) + 1):
        plaintext = ("PYTHON", "ALGORITHM", "TANK", "VICTORY")[(turn - 1) % 4]
        nearby = any(inside(position[0] + dr, position[1] + dc) and grid[position[0] + dr][position[1] + dc] == "F" for dr, dc in DIRECTIONS.values())
        enemies = {"X": [target_hp]}
        if enemy and enemy["hp"] > 0:
            enemies["E1"] = [enemy["hp"]]
        state = {"height": len(grid), "width": len(grid[0]), "grid": copy.deepcopy(grid), "allies": {"M": [hp, facing, normal, mega]}, "enemies": enemies, "codes": [encrypted(plaintext)] if nearby else [], "turn": turn - 1}
        command = bot(state)
        if not isinstance(command, str):
            raise TypeError("명령은 문자열이어야 합니다. 예: 'U A', 'R F', 'G 해독문', 'S'")
        parts = command.split()
        note = ""
        valid = True
        if parts and parts[0] in DIRECTIONS:
            facing = parts.pop(0)
            note = "방향 전환"
        if not parts and command.strip() in DIRECTIONS:
            pass
        elif parts == ["S"]:
            note = "대기"
        elif parts == ["A"]:
            dr, dc = DIRECTIONS[facing]
            r, c = position[0] + dr, position[1] + dc
            if inside(r, c) and grid[r][c] in ("G", "S"):
                if grid[r][c] == "S":
                    hp -= 10
                grid[position[0]][position[1]] = "G"
                grid[r][c] = "M"
                position = r, c
                note = "이동"
            else:
                valid = False
                note = "이동할 수 없는 칸입니다."
        elif parts in (["F"], ["F", "M"]):
            is_mega = len(parts) == 2
            if (mega if is_mega else normal) <= 0:
                valid = False
                note = "발사할 탄약이 없습니다."
            else:
                if is_mega:
                    mega -= 1
                else:
                    normal -= 1
                damage = 70 if is_mega else 30
                note = "발사했지만 목표에 맞지 않았습니다."
                dr, dc = DIRECTIONS[facing]
                for distance in range(1, 4):
                    r, c = position[0] + dr * distance, position[1] + dc * distance
                    if not inside(r, c):
                        break
                    cell = grid[r][c]
                    if cell in ("G", "S", "W"):
                        continue
                    if cell == "T":
                        grid[r][c] = "G"
                        note = "나무 제거"
                    elif cell == "X":
                        target_hp -= damage
                        note = f"적 포탑에 {damage} 피해"
                        if target_hp <= 0:
                            grid[r][c] = "G"
                    elif cell == "E1" and enemy:
                        enemy["hp"] -= damage
                        note = f"적 탱크에 {damage} 피해"
                        if enemy["hp"] <= 0:
                            grid[r][c] = "G"
                    else:
                        note = f"{cell}에 사격이 막혔습니다."
                    break
        elif len(parts) == 2 and parts[0] == "G":
            if nearby and parts[1] == plaintext and mega < 10:
                mega += 1
                note = "암호 해독 성공 · 메가탄 +1"
            else:
                valid = False
                note = "인접 여부, 해독문, 메가탄 보유 상한을 확인하세요."
        else:
            valid = False
            note = "알 수 없는 명령입니다."
        if not valid:
            invalid += 1
        if target_hp <= 0:
            trace.append(snapshot(turn, command, note))
            thresholds = scenario.get("stars", [20, 30])
            stars = 3 if turn <= thresholds[0] else 2 if turn <= thresholds[1] else 1
            return {"passed": True, "turns": turn, "stars": stars, "trace": trace, "invalid": invalid, "reason": "적 포탑 파괴"}
        # Explicit training rule: a patrol moves once after each learner action.
        if enemy and enemy["hp"] > 0:
            old = tuple(enemy["position"])
            route = enemy["patrol"]
            next_pos = tuple(route[turn % len(route)])
            if grid[next_pos[0]][next_pos[1]] in ("G", "E1"):
                grid[old[0]][old[1]] = "G"
                grid[next_pos[0]][next_pos[1]] = "E1"
                enemy["position"] = list(next_pos)
            er, ec = enemy["position"]
            dr, dc = position[0] - er, position[1] - ec
            distance = abs(dr) + abs(dc)
            if (dr == 0 or dc == 0) and 1 <= distance <= 3:
                rr, cc = (dr > 0) - (dr < 0), (dc > 0) - (dc < 0)
                if all(grid[er + rr * k][ec + cc * k] in ("G", "W", "S") for k in range(1, distance)):
                    hp -= 30
                    note += " · 적 사격으로 체력 -30"
        trace.append(snapshot(turn, command, note))
        if hp <= 0:
            return {"passed": False, "turns": turn, "stars": 0, "trace": trace, "invalid": invalid, "reason": "체력이 0이 되었습니다."}
    return {"passed": False, "turns": len(trace) - 1, "stars": 0, "trace": trace, "invalid": invalid, "reason": "100턴 안에 적 포탑을 파괴하지 못했습니다."}


def grade_stages(payload):
    results = []
    output = LimitedOutput()
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        for test in payload["tests"]:
            try:
                result = simulate(payload["code"], test["scenario"])
                results.append({**result, "name": test["name"], "call": test["call"], "expected": "100턴 이내 생존 상태로 적 포탑 파괴", "actual": f"{result['turns']}턴 · {'★' * result['stars']} · {result['reason']}", "error": ""})
            except BaseException:
                results.append({"name": test["name"], "passed": False, "call": test["call"], "expected": "유효한 명령을 반환하는 choose_action(state)", "actual": "실행 오류", "error": traceback.format_exc(limit=5)})
    return json.dumps({"results": results, "stdout": output.getvalue()[:6000], "simulation": True}, ensure_ascii=False)
