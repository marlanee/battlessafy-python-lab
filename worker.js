let runtime;
let harness;

async function initialize() {
  const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
  runtime = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/' });
  const response = await fetch(new URL('./runner.py', import.meta.url));
  if (!response.ok) throw new Error('채점 파일을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  harness = await response.text();
  const simulation = await fetch(new URL('./simulation.py', import.meta.url));
  if (!simulation.ok) throw new Error('스테이지 실습 파일을 불러오지 못했습니다.');
  runtime.FS.writeFile('simulation.py', await simulation.text());
  self.postMessage({ type: 'ready' });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      await initialize();
    } else if (data.type === 'run') {
      if (!runtime || !harness) throw new Error('Python 실행 환경이 준비되지 않았습니다.');
      runtime.globals.set('_submission_json', JSON.stringify(data.payload));
      const result = JSON.parse(await runtime.runPythonAsync(harness));
      runtime.globals.delete('_submission_json');
      self.postMessage({ type: 'result', result });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error.message || error) });
  }
};
