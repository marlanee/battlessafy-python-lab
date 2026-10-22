# WEB LAB SCAFFOLD v2 — Stage 6
# [완성] 제공 함수에 단계별 수정 사항을 반영한 코드입니다.
# 웹 연습용 뼈대이며 공식 기본 코드 원문은 아닙니다.
"""Stage 6: 보급소 암호를 해독하고 매 턴 새 맵으로 경로를 계산합니다.
이 파일 하나로 현재 웹사이트의 Stage 1~6 연습 맵을 모두 풀 수도 있습니다.
"""
import heapq

TREE_COST = 2  # 제거 1턴 + 이동 1턴

# 좌표는 (행, 열)입니다. 행은 아래로, 열은 오른쪽으로 증가합니다.
# 방향마다 (행 변화, 열 변화, 명령 문자)를 묶어 둡니다.
DIRECTIONS = [(-1, 0, "U"), (0, 1, "R"), (1, 0, "D"), (0, -1, "L")]


def find_position(grid, name):
    """맵에서 내 탱크 M 또는 적 포탑 X의 위치를 찾습니다."""
    for row in range(len(grid)):
        for col in range(len(grid[0])):
            if grid[row][col] == name:
                return (row, col)
    raise ValueError(name + "의 위치를 찾을 수 없습니다.")


def shot_direction(grid, position, target, max_range):
    """직선으로 명중할 수 있으면 방향을, 불가능하면 None을 반환합니다."""
    for dr, dc, direction in DIRECTIONS:
        for distance in range(1, max_range + 1):
            row = position[0] + dr * distance
            col = position[1] + dc * distance

            if not (0 <= row < len(grid) and 0 <= col < len(grid[0])):
                break  # 맵 밖으로 나가면 이 방향의 탐색을 멈춥니다.
            if (row, col) == target:
                return direction
            if grid[row][col] not in ("G", "W", "S"):
                break  # 바위, 나무, 보급소, 적 탱크는 포탄을 막습니다.
    return None


def find_first_step(grid, start, goals):
    """다익스트라: 이동 1턴, 나무 제거 후 이동 2턴으로 경로를 비교합니다."""
    # 큐 항목: (누적 턴 수, 현재 위치, 지나온 경로)
    queue = [(0, start, [])]
    best_cost = {start: 0}

    while queue:
        cost, position, path = heapq.heappop(queue)
        if cost != best_cost[position]:
            continue  # 더 좋은 경로를 이미 찾았다면 예전 후보는 건너뜁니다.
        if position in goals:
            return path[0] if path else None

        for dr, dc, direction in DIRECTIONS:
            row = position[0] + dr
            col = position[1] + dc
            next_position = (row, col)
            if not (0 <= row < len(grid) and 0 <= col < len(grid[0])):
                continue
            if grid[row][col] not in ("G", "M", "T"):
                continue  # 적 탱크 E1의 현재 위치도 피합니다.

            step_cost = TREE_COST if grid[row][col] == "T" else 1
            new_cost = cost + step_cost
            if new_cost < best_cost.get(next_position, float("inf")):
                best_cost[next_position] = new_cost
                new_path = path + [(row, col, direction)]
                heapq.heappush(queue, (new_cost, next_position, new_path))
    return None


def move_or_clear(grid, first_step, normal, mega):
    """다음 칸이 나무면 먼저 쏘고, 빈 땅이면 한 칸 이동합니다."""
    if first_step is None:
        return "S"
    row, col, direction = first_step
    if grid[row][col] == "T":
        if normal > 0:
            return direction + " F"
        if mega > 0:
            return direction + " F M"
        return "S"
    return direction + " A"


def attack_command(direction, target_hp, normal, mega):
    """한 발로 끝낼 수 있으면 일반탄, 그렇지 않으면 메가탄을 우선합니다."""
    if normal > 0 and target_hp <= 30:
        return direction + " F"
    if mega > 0:
        return direction + " F M"
    if normal > 0:
        return direction + " F"
    return "S"


def decode_code(cipher):
    """A~Z 알파벳을 17칸 뒤로 옮겨 원문을 복구합니다."""
    answer = ""
    for letter in cipher:
        number = ord(letter) - ord("A")  # A=0, B=1, ..., Z=25
        original = (number - 17) % 26   # 음수도 0~25 범위로 돌아옵니다.
        answer += chr(original + ord("A"))
    return answer


def next_to_supply(grid, row, col):
    """현재 칸의 상하좌우 중 보급소 F가 있는지 확인합니다."""
    for dr, dc, direction in DIRECTIONS:
        nr, nc = row + dr, col + dc
        if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]):
            if grid[nr][nc] == "F":
                return True
    return False


def choose_action(state):
    grid = state["grid"]
    me = find_position(grid, "M")
    target = find_position(grid, "X")
    hp, facing, normal, mega = state["allies"]["M"]
    target_hp = state["enemies"]["X"][0]

    # 지금 가진 탄약으로 포탑 체력을 깎을 수 있는지 계산합니다.
    # 현재 연습 맵은 보급 후 일반탄을 나무에, 메가탄을 포탑에 쓸 수 있습니다.
    total_damage = normal * 30 + mega * 70
    need_supply = total_damage < target_hp

    # 보급소 옆이면 최신 암호를 해독해 메가탄 1발을 받습니다.
    if need_supply and state["codes"]:
        plaintext = decode_code(state["codes"][0])
        return "G " + plaintext

    # 탄약이 충분하고 사선이 열려 있으면 즉시 포탑을 공격합니다.
    direction = shot_direction(grid, me, target, 3)
    if not need_supply and direction is not None:
        return attack_command(direction, target_hp, normal, mega)

    # 탄약이 부족하면 보급소 옆으로, 충분하면 사격 위치로 갑니다.
    goals = set()
    for row in range(len(grid)):
        for col in range(len(grid[0])):
            if grid[row][col] not in ("G", "M"):
                continue
            if need_supply:
                if next_to_supply(grid, row, col):
                    goals.add((row, col))
            elif shot_direction(grid, (row, col), target, 3) is not None:
                goals.add((row, col))

    # 매 턴 최신 맵을 다시 읽으므로 움직인 적의 현재 칸도 경로에서 제외됩니다.
    first_step = find_first_step(grid, me, goals)
    return move_or_clear(grid, first_step, normal, mega)
