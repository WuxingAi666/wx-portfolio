"""Align existing local publication copies and optionally build candidate ZIPs.

No commit, push, GitHub request, deployment, dependency download or model call.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import package as release

ROOT = Path(__file__).resolve().parent.parent


def public_content(path):
    try:
        content = path.read_text(encoding='utf-8')
    except UnicodeError:
        return
    if release.SECRET.search(content):
        raise RuntimeError('Credential pattern detected; copy stopped without printing the content: ' + path.name)


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, check=True).stdout.decode('utf-8').strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', action='store_true', help='Rebuild local candidate archives after copy verification')
    args = parser.parse_args()
    website = ROOT.parent / '本机维护/github/wx-portfolio'
    collection = ROOT.parent / '本机维护/github/ai-application-projects'
    for repo in (website, collection):
        if not (repo / '.git').exists():
            raise RuntimeError('Existing local checkout required; nothing will be cloned: ' + repo.name)
    for name in ['sync-project-content.py', 'sync-knowledge.py']:
        subprocess.run([sys.executable, '-B', str(ROOT / 'scripts' / name), '--check'], cwd=ROOT, check=True)
    frontend = [(p, p.relative_to(ROOT / 'frontend')) for p in (ROOT / 'frontend').rglob('*') if p.is_file()]
    project = list(release.files_under(ROOT))
    # Check all content before starting the copy. Never enumerate private envs.
    for source, _ in project:
        public_content(source)
    # Only remove obsolete tracked files in this project's publication scope.
    # git rm retains their history and refuses unreviewed local modifications.
    expected = {relative.as_posix() for _, relative in project}
    for repo, prefix in [(website, ''), (collection, 'projects/portfolio-rag/')]:
        tracked_paths = git(repo, 'ls-files', '-z').split('\0')
        stale = [path for path in tracked_paths if path and path.startswith(prefix)
                 and path[len(prefix):] not in expected]
        if stale:
            git(repo, 'rm', '--', *stale)
    for source, relative in project:
        target = website / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    project_root = collection / 'projects/portfolio-rag'
    for source, relative in project:
        target = project_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    assert all(p.read_bytes() == (website / r).read_bytes() for p, r in project)
    assert all(p.read_bytes() == (project_root / r).read_bytes() for p, r in project)
    report = {'updated_at': datetime.now(timezone(timedelta(hours=8))).isoformat(),
              'stage': 'local-development', 'published_this_run': False,
              'frontend_files': len(frontend), 'project_files': len(project),
              'copies_match': True, 'repositories': {}}
    for repo in (website, collection):
        changes = git(repo, 'status', '--porcelain').splitlines()
        report['repositories'][repo.name] = {'head': git(repo, 'rev-parse', 'HEAD'), 'pending_paths': len(changes)}

    if args.package:
        subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/build-deliverables.py')], check=True)
    (ROOT / 'output').mkdir(exist_ok=True)
    (ROOT / 'output/local-sync.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
