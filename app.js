const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'battlessafy-python-lab.v1';
const groups = ['기초', '파싱', '탐색', '전투', '자원', '안정성', '대결', '완성'];
let lessons = [];
let current;
let data = { version: 1, lessons: {}, current: 'stage1' };
let worker = null;
let runtimeReady = false;
let readyPromise = null;
let readyReject = null;
let runResolve = null;
let runReject = null;
let bootTimer;
let runTimer;
let busy = false;
let toastTimer;
let pendingBackup = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

function record(id = current.id) {
  const lesson = lessons.find((l) => l.id === id);
  if (!data.lessons[id]) data.lessons[id] = { code: lesson.starter, notes: '', hints: 0 };
  // Upgrade only an untouched old starter. Preserve every edited learner draft.
  if (lesson.scaffold && data.lessons[id].code === lesson.legacyStarter) {
    data.lessons[id].code = lesson.starter;
    data.lessons[id].passed = false;
    data.lessons[id].passedCode = '';
  }
  return data.lessons[id];
}

function completed(id) {
  const saved = data.lessons[id];
  return Boolean(saved && saved.passed && saved.code === saved.passedCode);
}

function activeLessons() {
  return lessons.filter((lesson) => (lesson.kind === 'stage') === (current.kind === 'stage'));
}

function isLessonId(id) {
  return /^(stage[1-6]|[A-Z])$/.test(id);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    $('save-state').textContent = '✓ 자동 저장됨';
  } catch {
    $('save-state').textContent = '저장 공간 확인 필요';
    toast('브라우저 저장이 불가능합니다. 상단의 진도 백업으로 파일을 저장하세요.');
  }
}

function sanitizeBackup(input) {
  if (!input || input.version !== 1 || !input.lessons || typeof input.lessons !== 'object' || Array.isArray(input.lessons)) throw new Error('이 학습실에서 만든 진도 백업 파일을 선택하세요.');
  const clean = { version: 1, lessons: {}, current: isLessonId(input.current) ? input.current : 'stage1' };
  for (const lesson of lessons) {
    const r = input.lessons[lesson.id];
    if (!r || typeof r !== 'object') continue;
    if (typeof r.code !== 'string' || r.code.length > 100000 || (r.notes && (typeof r.notes !== 'string' || r.notes.length > 20000))) throw new Error('코드 또는 노트가 너무 길거나 형식이 올바르지 않습니다.');
    clean.lessons[lesson.id] = { code: r.code, notes: r.notes || '', hints: Math.min(3, Math.max(0, Number(r.hints) || 0)), passed: r.passed === true, passedCode: typeof r.passedCode === 'string' ? r.passedCode.slice(0, 100000) : '', attempts: Math.max(0, Number(r.attempts) || 0) };
  }
  return clean;
}

function refreshProgress() {
  const track = activeLessons();
  const n = track.filter((l) => completed(l.id)).length;
  $('progress').max = track.length;
  $('progress').value = n;
  $('progress-text').textContent = `${n} / ${track.length}`;
  $('progress-caption').textContent = n === track.length ? '이 학습 영역을 완주했어요. 다음 전략을 준비해요!' : n ? `${track.length - n}개의 미션이 다음 전략을 기다립니다.` : '첫 번째 미션을 시작해 보세요.';
  $('mission-state').textContent = completed(current.id) ? '✓ 채점 통과' : record().attempts ? '학습 중' : '도전 전';
  $('next').textContent = completed(current.id) ? '통과했어요! 다음 과제 →' : '다음 과제 살펴보기 →';
  renderNav();
}

function renderNav() {
  const container = $('lesson-list');
  container.replaceChildren();
  if (current.kind === 'stage') {
    lessons.filter((l) => l.kind === 'stage').forEach((lesson) => {
      const button = el('button', `lesson-link stage-link${lesson.id === current.id ? ' active' : ''}`);
      button.setAttribute('aria-label', lesson.title);
      if (lesson.id === current.id) button.setAttribute('aria-current', 'step');
      button.disabled = busy;
      const label = el('span', 'stage-link-label');
      label.append(el('strong', '', `Stage ${lesson.number}${lesson.number === 4 ? ' · Pass 핵심' : ''}`), el('span', 'title', lesson.title.split(' · ').slice(1).join(' · ')));
      button.append(el('span', 'letter', String(lesson.number)), label);
      if (completed(lesson.id)) button.append(el('span', 'check', '✓'));
      button.addEventListener('click', () => { location.hash = lesson.id; });
      container.append(button);
    });
    container.append(el('p', 'sidebar-note', '공식 목표를 연습하는 새 맵입니다. 실제 평가 맵과 별점은 다를 수 있어요.'));
    return;
  }
  groups.forEach((group, index) => {
    const members = lessons.filter((l) => l.group === group);
    const section = el('div', 'lesson-group');
    const heading = el('h3', 'group-title');
    heading.append(el('span', '', `${String(index + 1).padStart(2, '0')} · ${group}`), el('span', '', `${members[0].id}—${members.at(-1).id}`));
    section.append(heading);
    members.forEach((lesson) => {
      const button = el('button', `lesson-link${lesson.id === current.id ? ' active' : ''}`);
      button.setAttribute('aria-label', `${lesson.id}. ${lesson.title}${completed(lesson.id) ? ', 통과' : ''}`);
      if (lesson.id === current.id) button.setAttribute('aria-current', 'step');
      button.disabled = busy;
      button.append(el('span', 'letter', lesson.id), el('span', 'title', lesson.title));
      if (completed(lesson.id)) button.append(el('span', 'check', '✓'));
      button.addEventListener('click', () => { location.hash = lesson.id; });
      section.append(button);
    });
    container.append(section);
  });
}

function updateLines() {
  $('line-numbers').textContent = Array.from({ length: Math.max(1, $('code').value.split('\n').length) }, (_, i) => i + 1).join('\n');
  $('line-numbers').scrollTop = $('code').scrollTop;
}

function saveCode() {
  record().code = $('code').value;
  updateLines();
  persist();
  refreshProgress();
}

function renderMap(grid, map = $('map')) {
  map.replaceChildren();
  map.style.gridTemplateColumns = `16px repeat(${grid[0].length}, 1fr)`;
  map.append(el('div', 'map-axis'));
  grid[0].forEach((_, c) => map.append(el('div', 'map-axis', c)));
  grid.forEach((row, r) => {
    map.append(el('div', 'map-axis', r));
    row.forEach((cell, c) => {
      const style = { M: 'me', X: 'target', R: 'rock', W: 'water', T: 'tree', S: 'sand', F: 'supply' }[cell] || (cell.startsWith('E') ? 'enemy' : '');
      const tile = el('div', `map-cell ${style}`, cell);
      tile.title = `(${r}, ${c}) ${cell}`;
      map.append(tile);
    });
  });
  map.setAttribute('aria-label', `${grid.length}행 ${grid[0].length}열 학습 맵. ${grid.map((row, i) => `${i}행 ${row.join(' ')}`).join('. ')}`);
}

function renderHints() {
  const n = record().hints || 0;
  $('hints').replaceChildren(...current.hints.slice(0, n).map((hint) => el('li', '', hint)));
  $('hint-count').textContent = `${n} / ${current.hints.length}`;
  $('hint').disabled = n >= current.hints.length;
}

function activateTab(name) {
  for (const id of ['problem', 'answer', 'notes']) {
    const active = name === id;
    $(`${id}-tab`).classList.toggle('active', active);
    $(`${id}-tab`).setAttribute('aria-selected', String(active));
    $(`${id}-tab`).tabIndex = active ? 0 : -1;
    $(`${id}-panel`).hidden = !active;
  }
}

function renderScaffold() {
  const scaffold = current.scaffold;
  $('scaffold-card').hidden = !scaffold;
  if (!scaffold) return;
  $('scaffold-summary').textContent = scaffold.summary;
  $('scaffold-provided').replaceChildren(...scaffold.provided.map((text) => el('li', '', text)));
  $('scaffold-tasks').replaceChildren(...scaffold.tasks.map((text) => el('li', '', text)));
  $('scaffold-saved-note').textContent = record().code.includes('# WEB LAB SCAFFOLD v2')
    ? '[제공] 함수는 그대로 활용하고 TODO가 있는 줄부터 수정하세요.'
    : '저장한 기존 코드를 유지했습니다. 새 뼈대로 연습하려면 먼저 .py로 저장한 뒤 ‘새 학습 뼈대 불러오기’를 누르세요.';
}

function renderAnswer() {
  const answer = current.answer;
  $('answer-tab').hidden = !answer;
  $('answer-code').value = answer?.code || '';
  $('answer-summary').textContent = answer?.summary || '';
  $('answer-steps').replaceChildren(...(answer?.steps || []).map((text) => el('li', '', text)));
  $('answer-note').textContent = answer?.note || '';
  $('answer-validation').textContent = answer?.validation.map((test) => `${test.name}: ${test.turns}턴 ${'★'.repeat(test.stars)}`).join(' · ') || '';
}

function jumpToTodo() {
  if (busy) return;
  const editor = $('code');
  const matches = [...editor.value.matchAll(/TODO\s*\d+/g)];
  if (!matches.length) { toast('현재 코드에 TODO가 없습니다. 새 학습 뼈대를 불러오거나 정답과 비교해 보세요.'); return; }
  const match = matches.find((item) => item.index >= editor.selectionEnd) || matches[0];
  const start = editor.value.lastIndexOf('\n', match.index) + 1;
  const lineEnd = editor.value.indexOf('\n', match.index);
  editor.focus();
  editor.setSelectionRange(start, lineEnd === -1 ? editor.value.length : lineEnd);
  const line = editor.value.slice(0, start).split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
  editor.scrollTop = Math.max(0, (line - 3) * lineHeight);
  $('line-numbers').scrollTop = editor.scrollTop;
  editor.scrollIntoView({ block: 'center' });
}

function emptyResults() {
  const wrapper = el('div', 'empty-result');
  const icon = el('span', 'terminal-icon', '›_');
  icon.setAttribute('aria-hidden', 'true');
  wrapper.append(icon, el('h3', '', '첫 번째 코드를 기다리는 중'), el('p', '', '함수를 작성하고 예제를 실행해 보세요. 입력, 기대값, 반환값을 함께 확인할 수 있어요.'));
  $('results').replaceChildren(wrapper);
}

function navigate() {
  if (!lessons.length) return;
  if (busy) { stopExecution(); }
  const id = isLessonId(location.hash.slice(1)) ? location.hash.slice(1) : data.current || 'stage1';
  current = lessons.find((l) => l.id === id) || lessons[0];
  data.current = current.id;
  const r = record();
  const stage = current.kind === 'stage';
  $('stage-track').classList.toggle('active', stage);
  $('extra-track').classList.toggle('active', !stage);
  $('stage-track').setAttribute('aria-pressed', String(stage));
  $('extra-track').setAttribute('aria-pressed', String(!stage));
  $('track-eyebrow').textContent = stage ? 'STAGE PRACTICE' : 'EXTRA LEARNING';
  $('track-title').textContent = stage ? '여섯 단계, 하나의 전략.' : 'A부터 Z까지, 한 걸음씩.';
  $('track-description').textContent = stage ? 'OT의 단계별 목표를 웹에서 연습해요' : '필요한 기능을 작은 함수로 연습해요';
  $('sidebar').setAttribute('aria-label', stage ? 'Stage 1부터 6까지 실습 문제' : 'A부터 Z까지 추가 학습');
  document.title = `${stage ? '' : `${current.id}. `}${current.title} — 배틀싸피 파이썬 랩`;
  $('breadcrumb-group').textContent = current.group;
  $('breadcrumb-lesson').textContent = stage ? `STAGE ${current.number}` : `MISSION ${current.id}`;
  $('group-label').textContent = stage ? `실습 문제 · ${current.official.size}` : `추가 학습 · ${current.group}`;
  $('duration').textContent = `약 ${current.minutes}분`;
  $('mission-title').textContent = current.title;
  $('mission-story').textContent = current.story;
  $('mission-letter').replaceChildren(document.createTextNode(stage ? current.number : current.id), el('span', '', stage ? 'STAGE' : 'MISSION'));
  $('concept').textContent = current.concept;
  $('signature').textContent = `${current.signature}`;
  $('requirements').replaceChildren(...current.requirements.map((text) => el('li', '', text)));
  $('stage-guide').hidden = !stage;
  $('stage-guide').replaceChildren();
  if (stage) {
    const info = el('div', 'official-info');
    info.append(el('strong', '', 'OT 공식 평가 기준 · 웹 연습과 구분'), el('p', '', `★★★ ${current.official.three} / ★★ ${current.official.two} / ★ ${current.official.one}`));
    info.append(el('p', '', `이 웹 연습 맵: ${current.tests[0].scenario.stars[0]}턴 이하 ★★★, ${current.tests[0].scenario.stars[1]}턴 이하 ★★, 100턴 이내 ★. 별점 1개 이상이면 연습 통과입니다.`));
    const links = el('div', 'related-links');
    links.append(el('span', '', '필요한 기능 연습 →'));
    current.related.forEach((id) => {
      const link = el('a', '', id);
      link.href = `#${id}`;
      link.title = lessons.find((lesson) => lesson.id === id).title;
      links.append(link);
    });
    $('stage-guide').append(info, links);
  }
  $('questions').replaceChildren(...current.questions.map((text) => el('li', '', text)));
  $('notes').value = r.notes || '';
  $('code').value = r.code;
  $('code').scrollTop = 0;
  $('code').scrollLeft = 0;
  $('filename').textContent = `mission_${current.id.toLowerCase()}.py`;
  renderScaffold();
  renderAnswer();
  $('reset').textContent = stage ? '제공 뼈대로' : '시작 코드';
  $('reset-dialog-title').textContent = stage ? '제공된 학습 뼈대를 불러올까요?' : '시작 코드로 되돌릴까요?';
  $('examples').replaceChildren();
  current.tests.filter((test) => test.visible).forEach((test, i) => {
    const example = el('div', 'example');
    const label = el('div', 'example-label');
    label.append(el('b', '', `EXAMPLE ${String(i + 1).padStart(2, '0')}`), el('span', '', test.name));
    const expected = el('div', 'expected');
    expected.append(el('span', '', stage ? '성공 조건' : '기대 반환값'), el('code', '', test.expected));
    example.append(label, el('pre', '', test.call), expected);
    $('examples').append(example);
  });
  const track = activeLessons();
  const index = track.indexOf(current);
  $('previous').disabled = index === 0;
  $('next').disabled = index === track.length - 1;
  $('next').textContent = completed(current.id) ? '통과했어요! 다음 과제 →' : '다음 과제 살펴보기 →';
  $('sidebar').classList.remove('open');
  $('menu').setAttribute('aria-expanded', 'false');
  renderMap(current.grid);
  renderHints();
  activateTab('problem');
  emptyResults();
  updateLines();
  refreshProgress();
  persist();
}

function setRuntime(message, className = '') {
  $('runtime-status').className = className;
  $('runtime-status').replaceChildren(el('i'), document.createTextNode(message));
}

function destroyWorker(reason) {
  clearTimeout(bootTimer);
  clearTimeout(runTimer);
  worker?.terminate();
  worker = null;
  runtimeReady = false;
  readyPromise = null;
  readyReject?.(new Error(reason));
  runReject?.(new Error(reason));
  readyReject = runReject = runResolve = null;
  setRuntime('다음 실행 때 다시 준비', 'error');
}

function ensureRuntime() {
  if (runtimeReady) return Promise.resolve();
  if (readyPromise) return readyPromise;
  setRuntime('Python 다운로드 중…');
  readyPromise = new Promise((resolve, reject) => {
    readyReject = reject;
    worker = new Worker(new URL('./worker.js?v=3', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: message }) => {
      if (message.type === 'ready') {
        clearTimeout(bootTimer);
        runtimeReady = true;
        readyReject = null;
        setRuntime('Python 준비 완료', 'ready');
        resolve();
      } else if (message.type === 'result') {
        clearTimeout(runTimer);
        runResolve?.(message.result);
        runResolve = runReject = null;
      } else if (message.type === 'error') {
        destroyWorker(message.error);
      }
    };
    worker.onerror = () => destroyWorker('Python을 불러오지 못했습니다. 인터넷 연결이나 CDN 차단 여부를 확인하고 다시 실행하세요.');
    bootTimer = setTimeout(() => destroyWorker('Python 준비 시간이 초과되었습니다. 인터넷 연결을 확인하고 다시 실행하세요.'), 90000);
    worker.postMessage({ type: 'init' });
  });
  return readyPromise;
}

function setBusy(value) {
  busy = value;
  $('run').disabled = $('grade').disabled = $('reset').disabled = $('restore').disabled = value;
  $('load-scaffold').disabled = $('jump-todo').disabled = value;
  $('stage-track').disabled = $('extra-track').disabled = value;
  $('code').readOnly = value;
  $('stop').hidden = !value;
  $('grade').textContent = value ? '실행 중…' : '▶ 전체 채점하기';
  renderNav();
}

function stopExecution() {
  if (busy) destroyWorker('실행을 중지했습니다. 코드를 수정한 뒤 다시 실행할 수 있습니다.');
}

function renderReplay(test) {
  const replay = el('section', 'replay');
  replay.setAttribute('aria-label', '스테이지 턴별 리플레이');
  replay.append(el('h3', '', `${test.name} · 턴별 리플레이`));
  const stats = el('div', 'replay-stats');
  const board = el('div', 'map replay-map');
  board.setAttribute('role', 'img');
  const controls = el('div', 'replay-controls');
  const previous = el('button', 'outline-button', '←');
  previous.setAttribute('aria-label', '이전 턴');
  const slider = el('input');
  slider.type = 'range'; slider.min = '0'; slider.max = String(test.trace.length - 1); slider.value = '0';
  slider.setAttribute('aria-label', '리플레이 턴');
  const next = el('button', 'outline-button', '→');
  next.setAttribute('aria-label', '다음 턴');
  const note = el('p', 'replay-note');
  const render = () => {
    const index = Number(slider.value);
    const snapshot = test.trace[index];
    stats.textContent = `턴 ${snapshot.turn} / ${test.turns} · HP ${snapshot.hp} · 일반탄 ${snapshot.normal} · 메가탄 ${snapshot.mega} · 포탑 HP ${snapshot.targetHp}`;
    note.textContent = `${snapshot.action} → ${snapshot.note}`;
    renderMap(snapshot.grid, board);
    previous.disabled = index === 0;
    next.disabled = index === test.trace.length - 1;
  };
  slider.addEventListener('input', render);
  previous.addEventListener('click', () => { slider.value = String(Math.max(0, Number(slider.value) - 1)); render(); });
  next.addEventListener('click', () => { slider.value = String(Math.min(test.trace.length - 1, Number(slider.value) + 1)); render(); });
  controls.append(previous, slider, next);
  replay.append(stats, board, controls, note);
  render();
  return replay;
}

function renderResults(result, mode, lesson, source) {
  const container = $('results');
  container.replaceChildren();
  if (result.error) {
    const box = el('div', 'error-box');
    box.append(el('strong', '', '코드 실행을 확인해 주세요.'), el('pre', '', result.error));
    container.append(box);
  } else {
    const passed = result.results.filter((r) => r.passed).length;
    const allPassed = passed === result.results.length;
    const heading = el('div', `result-summary${allPassed ? '' : ' failure'}`);
    const name = lesson.kind === 'stage' ? `Stage ${lesson.number}` : lesson.id;
    heading.append(el('strong', '', allPassed ? mode === 'grade' ? `${name} 미션 통과! 잘 해냈어요.` : '공개 예제를 모두 통과했어요.' : result.simulation ? '리플레이에서 멈춘 지점과 명령을 확인해요.' : '반환값을 비교하며 한 번 더 살펴봐요.'), el('span', '', `${passed} / ${result.results.length} 통과 · ${mode === 'grade' ? '전체 채점' : '공개 예제 실행'}`));
    if (allPassed && mode !== 'grade') heading.append(el('p', '', '전체 채점하기로 추가 예제도 확인하면 진도가 기록됩니다.'));
    container.append(heading);
    if (result.simulation && result.results[0]?.trace) container.append(renderReplay(result.results[0]));
    result.results.forEach((test, i) => {
      const row = el('div', `result-row${test.passed ? '' : ' fail'}`);
      row.append(el('h3', '', `${test.passed ? '✓' : '×'} ${String(i + 1).padStart(2, '0')} · ${test.name}`));
      const details = el('details');
      if (!test.passed) details.open = true;
      details.append(el('summary', '', test.passed ? '입력과 결과 보기' : '기대값과 내 결과 비교'));
      details.append(el('pre', '', `${test.call}\n\n기대값: ${test.expected}\n반환값: ${test.actual}${test.error ? `\n\n${test.error}` : ''}`));
      row.append(details);
      container.append(row);
    });
    if (mode === 'grade') {
      const r = record(lesson.id);
      r.passed = allPassed;
      r.passedCode = allPassed ? source : '';
      persist();
      refreshProgress();
      if (allPassed) {
        const track = activeLessons();
        const next = track[track.indexOf(lesson) + 1];
        if (next) {
          const button = el('button', 'grade-button', `${next.kind === 'stage' ? `Stage ${next.number}` : next.id} 미션으로 이어가기 →`);
          button.style.margin = '8px 16px 16px';
          button.addEventListener('click', () => { location.hash = next.id; });
          container.append(button);
          $('next').textContent = '통과했어요! 다음 과제 →';
        } else {
          const note = el('p', 'map-note', lesson.kind === 'stage' ? 'Stage 6 연습을 통과했습니다. .py로 저장하고 실제 게임의 정식 기본 코드에 연결해 검증하세요. 추가 학습으로 전략을 더 다듬을 수 있습니다.' : 'Z의 통합 검사를 통과했습니다. .py 저장으로 코드를 내려받아 정식 기본 코드에 통합하고 실제 게임에서 검증하세요.');
          note.style.padding = '0 16px';
          container.append(note);
        }
      }
    }
  }
  if (result.stdout) container.append(el('pre', 'console', `프로그램 출력\n${result.stdout}`));
}

async function execute(mode) {
  if (busy) return;
  const lesson = current;
  const source = $('code').value;
  record().code = source;
  record().attempts = (record().attempts || 0) + 1;
  persist();
  setBusy(true);
  $('results').replaceChildren(el('div', 'result-summary', runtimeReady ? '코드를 실행하고 반환값을 비교하고 있어요…' : '최초 실행을 위해 Python을 준비하고 있어요. 인터넷 속도에 따라 잠시 걸릴 수 있습니다.'));
  try {
    await ensureRuntime();
    const result = await new Promise((resolve, reject) => {
      runResolve = resolve;
      runReject = reject;
      setRuntime('코드 실행 중…', 'ready');
      runTimer = setTimeout(() => destroyWorker('실행 제한 6초를 넘었습니다. 무한 반복이나 방문 처리 누락을 확인하세요.'), 6000);
      worker.postMessage({ type: 'run', payload: { mode: lesson.kind === 'stage' ? 'stage' : 'function', code: source, tests: mode === 'grade' ? lesson.tests : lesson.tests.filter((t) => t.visible) } });
    });
    if (current.id === lesson.id) renderResults(result, mode, lesson, source);
    setRuntime('Python 준비 완료', 'ready');
  } catch (error) {
    if (current.id === lesson.id) {
      const box = el('div', 'error-box');
      box.append(el('strong', '', '실행을 마치지 못했어요.'), el('p', '', error.message));
      $('results').replaceChildren(box);
    }
  } finally {
    setBusy(false);
    refreshProgress();
  }
}

function download(name, content, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyReview() {
  const r = record();
  const text = `배틀싸피 파이썬 랩 ${current.id} 과제: ${current.title}\n\n아래 풀이를 검토하고 필요한 힌트를 주세요.\n\n\`\`\`python\n${r.code}\n\`\`\`\n\n복습 질문\n${current.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n내 설명\n${r.notes || '(아직 작성하지 않았습니다.)'}\n\n채점 상태: ${completed(current.id) ? '공개 및 추가 예제 통과' : '미통과 또는 채점 전'}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('복사했어요. 이 채팅에 붙여 넣어 제출하세요.');
  } catch {
    download(`mission_${current.id.toLowerCase()}_review.md`, text);
    toast('클립보드 대신 검토 요청 파일로 저장했어요.');
  }
}

function editorKeys(event) {
  const editor = $('code');
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); execute('grade'); return; }
  if (busy) return;
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (event.shiftKey) {
      const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
      const spaces = editor.value.slice(lineStart).match(/^ {1,4}/)?.[0].length || 0;
      if (spaces) { editor.setRangeText('', lineStart, lineStart + spaces, 'preserve'); editor.setSelectionRange(Math.max(lineStart, start - spaces), Math.max(lineStart, end - spaces)); }
    } else editor.setRangeText('    ', start, end, 'end');
    saveCode();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const start = editor.selectionStart;
    const before = editor.value.slice(0, start).split('\n').at(-1);
    const indent = before.match(/^ */)[0] + (before.trimEnd().endsWith(':') ? '    ' : '');
    editor.setRangeText(`\n${indent}`, start, editor.selectionEnd, 'end');
    saveCode();
  }
}

function bindEvents() {
  $('code').addEventListener('input', saveCode);
  $('code').addEventListener('scroll', () => { $('line-numbers').scrollTop = $('code').scrollTop; });
  $('code').addEventListener('keydown', editorKeys);
  $('notes').addEventListener('input', () => { record().notes = $('notes').value; persist(); });
  $('run').addEventListener('click', () => execute('example'));
  $('grade').addEventListener('click', () => execute('grade'));
  $('stop').addEventListener('click', stopExecution);
  $('hint').addEventListener('click', () => { record().hints = Math.min(current.hints.length, (record().hints || 0) + 1); renderHints(); persist(); });
  for (const id of ['problem', 'answer', 'notes']) {
    $(`${id}-tab`).addEventListener('click', () => activateTab(id));
    $(`${id}-tab`).addEventListener('keydown', (event) => {
      const tabs = ['problem', 'answer', 'notes'].filter((name) => !$(`${name}-tab`).hidden);
      let index = tabs.indexOf(id);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault(); activateTab(tabs[index]); $(`${tabs[index]}-tab`).focus();
    });
  }
  $('copy-answer').addEventListener('click', async () => {
    if (!current.answer) return;
    try { await navigator.clipboard.writeText(current.answer.code); toast('완성 코드를 복사했어요. 전체 코드를 붙여 넣어 사용하세요.'); }
    catch { download(`stage_${current.number}_answer.py`, current.answer.code, 'text/x-python;charset=utf-8'); toast('클립보드 대신 정답 .py 파일로 저장했어요.'); }
  });
  $('download-answer').addEventListener('click', () => { if (current.answer) download(`stage_${current.number}_answer.py`, current.answer.code, 'text/x-python;charset=utf-8'); });
  $('load-scaffold').addEventListener('click', () => $('reset-dialog').showModal());
  $('jump-todo').addEventListener('click', jumpToTodo);
  $('download').addEventListener('click', () => download(`mission_${current.id.toLowerCase()}.py`, record().code, 'text/x-python;charset=utf-8'));
  $('review').addEventListener('click', copyReview);
  $('reset').addEventListener('click', () => $('reset-dialog').showModal());
  $('reset-dialog').addEventListener('close', () => { if ($('reset-dialog').returnValue === 'reset') { record().code = current.starter; record().passed = false; record().passedCode = ''; $('code').value = current.starter; $('code').scrollTop = 0; saveCode(); renderScaffold(); emptyResults(); toast(current.scaffold ? '제공 뼈대를 불러왔어요. TODO를 수정해 보세요.' : '시작 코드로 되돌렸어요.'); } });
  $('about').addEventListener('click', () => $('about-dialog').showModal());
  $('guide').addEventListener('click', () => $('guide-dialog').showModal());
  $('stage-track').addEventListener('click', () => { location.hash = 'stage1'; });
  $('extra-track').addEventListener('click', () => { location.hash = 'A'; });
  $('backup').addEventListener('click', () => { persist(); download(`battlessafy-progress-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json'); });
  $('restore').addEventListener('click', () => $('backup-file').click());
  $('backup-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('백업 파일은 5MB 이하로 선택하세요.');
      pendingBackup = sanitizeBackup(JSON.parse(await file.text()));
      $('restore-dialog').showModal();
    } catch (error) { toast(`복원하지 못했어요: ${error.message}`); }
  });
  $('restore-dialog').addEventListener('close', () => { if ($('restore-dialog').returnValue === 'restore' && pendingBackup) { data = pendingBackup; history.replaceState(null, '', `#${data.current}`); navigate(); toast('백업의 코드와 진도를 복원했어요.'); } pendingBackup = null; });
  $('previous').addEventListener('click', () => { const track = activeLessons(); const l = track[track.indexOf(current) - 1]; if (l) location.hash = l.id; });
  $('next').addEventListener('click', () => { const track = activeLessons(); const l = track[track.indexOf(current) + 1]; if (l) location.hash = l.id; });
  $('menu').addEventListener('click', () => { const open = $('sidebar').classList.toggle('open'); $('menu').setAttribute('aria-expanded', String(open)); });
  window.addEventListener('hashchange', navigate);
  window.addEventListener('beforeunload', () => { if (current) persist(); });
}

async function main() {
  try {
    const responses = await Promise.all(['stages.json', 'lessons.json'].map((file) => fetch(new URL(`./${file}?v=4`, import.meta.url))));
    if (responses.some((r) => !r.ok)) throw new Error('과제 파일을 읽지 못했습니다.');
    const [stages, extra] = await Promise.all(responses.map((r) => r.json()));
    lessons = [...stages, ...extra];
    if (stages.length !== 6 || extra.length !== 26) throw new Error('학습 자료를 다시 불러와 주세요.');
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) data = sanitizeBackup(JSON.parse(saved)); } catch { toast('저장된 진도를 읽지 못했습니다. 백업이 있다면 불러오세요.'); }
    bindEvents();
    navigate();
  } catch (error) {
    $('workspace').replaceChildren(el('div', 'fatal-error', `${error.message} 새로고침하거나 인터넷 연결을 확인해 주세요.`));
  }
}

main();
