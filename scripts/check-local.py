"""Offline project checks; never builds an index, calls a model or publishes."""
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    steps = []

    def run(name, command, cwd=ROOT):
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=120)
        steps.append({'name': name, 'passed': result.returncode == 0})
        print(('PASS ' if result.returncode == 0 else 'FAIL ') + name)
        if result.returncode:
            print((result.stdout + result.stderr)[-5000:])

    node = shutil.which('node')
    if not node:
        steps.append({'name': 'Node.js available', 'passed': False})
        print('FAIL Node.js unavailable; install Node.js to check frontend syntax.')
    else:
        for source in sorted((ROOT / 'frontend/js').glob('*.js')):
            run('JavaScript: ' + source.name, [node, '--check', str(source)])
    for script in ['sync-project-content.py', 'sync-knowledge.py']:
        run('Content: ' + script, [sys.executable, '-B', str(ROOT / 'scripts' / script), '--check'])

    python_sources = [p for folder in ['backend', 'scripts'] for p in (ROOT / folder).rglob('*.py')
                      if not {'.venv', '__pycache__', 'storage'} & set(p.parts)]
    for source in python_sources:
        try:
            compile(source.read_text(encoding='utf-8-sig'), str(source), 'exec')
        except (SyntaxError, UnicodeError) as error:
            steps.append({'name': 'Python: ' + str(source.relative_to(ROOT)), 'passed': False})
            print('FAIL Python syntax: ' + str(source.relative_to(ROOT)) + ' ' + str(error))
    steps.append({'name': 'Python source syntax', 'passed': not any(s['name'].startswith('Python:') for s in steps),
                  'files': len(python_sources)})
    print(('PASS ' if steps[-1]['passed'] else 'FAIL ') + 'Python source syntax')
    json_paths = [ROOT / 'frontend/content/projects.json', ROOT / 'backend/data/public/manifest.json']
    for source in json_paths:
        try:
            json.loads(source.read_text(encoding='utf-8'))
            steps.append({'name': 'JSON: ' + source.name, 'passed': True})
        except (ValueError, OSError):
            steps.append({'name': 'JSON: ' + source.name, 'passed': False})
    run('Offline API/index/quota boundaries', [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], ROOT / 'backend')
    report = {'checked_at': datetime.now(timezone(timedelta(hours=8))).isoformat(),
              'mode': 'offline-local', 'model_calls': False, 'github_calls': False,
              'passed': all(s['passed'] for s in steps), 'steps': steps}
    (ROOT / 'output').mkdir(exist_ok=True)
    (ROOT / 'output/local-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'checks': len(steps), 'model_calls': False, 'github_calls': False}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
