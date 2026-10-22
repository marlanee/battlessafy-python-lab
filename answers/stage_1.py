# WEB LAB SCAFFOLD v2 — Stage 1
# [완성] 제공 함수에 단계별 수정 사항을 반영한 코드입니다.
# 웹 연습용 뼈대이며 공식 기본 코드 원문은 아닙니다.
from collections import deque

# [설정] 이동 가능한 지형과 사거리
MOVE_CELLS = {"G", "M"}
MAX_RANGE = 3

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


def find_next_direction(grid, start, target, max_range):
    """BFS: 가까운 칸부터 살펴보고 사격 위치까지의 첫 이동을 찾습니다."""
    # 큐 항목: (현재 위치, 출발점에서 처음 이동할 방향)
    queue = deque([(start, None)])
    visited = {start}

    while queue:
        position, first_direction = queue.popleft()
        if shot_direction(grid, position, target, max_range) is not None:
            return first_direction

        for dr, dc, direction in DIRECTIONS:
            row = position[0] + dr
            col = position[1] + dc
            next_position = (row, col)
            if not (0 <= row < len(grid) and 0 <= col < len(grid[0])):
                continue
            if next_position in visited:
                continue
            if grid[row][col] not in MOVE_CELLS:
                continue  # 물 W, 바위 R 등을 밟지 않습니다.

            visited.add(next_position)
            # 첫 칸에서만 방향을 정하고, 이후에는 그 값을 그대로 전달합니다.
            next_first = direction if first_direction is None else first_direction
            queue.append((next_position, next_first))
    return None


def choose_action(state):
    # [제공] 최신 상태에서 내 위치와 포탑 위치를 찾습니다.
    grid = state["grid"]
    me = find_position(grid, "M")
    target = find_position(grid, "X")

    # [판단] 명중할 수 있으면 먼저 사격합니다.
    direction = shot_direction(grid, me, target, MAX_RANGE)
    if direction is not None:
        return direction + " F"

    # [제공] BFS 결과 중 첫 이동만 실행하고, 다음 턴에 다시 판단합니다.
    direction = find_next_direction(grid, me, target, MAX_RANGE)
    if direction is not None:
        return direction + " A"
    return "S"
