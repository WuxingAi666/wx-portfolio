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
    website = ROOT / 'output/github/wx-portfolio'
    collection = ROOT / 'output/github/ai-application-projects'
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
    # One complete repository: migrate the old flat Pages layout into frontend/.
    # Delete only known former frontend paths within this checkout, never .git.
    for old in ['index.html', '.nojekyll', 'assets', 'css', 'js', 'content', 'deploy.bat', '.github/workflows/checks.yml']:
        obsolete = website / old
        if not obsolete.resolve().is_relative_to(website.resolve()):
            raise RuntimeError('Migration path escaped checkout')
        if obsolete.is_dir():
            shutil.rmtree(obsolete)
        elif obsolete.is_file():
            obsolete.unlink()
    for source, relative in project:
        target = website / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    project_root = collection / 'projects/portfolio-rag'
    obsolete_workflow = project_root / '.github/workflows/checks.yml'
    if obsolete_workflow.is_file():
        obsolete_workflow.unlink()
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
        records = [release.package(ROOT, ROOT.parent / 'wx-fullstack.zip')]
        tracked = git(collection, 'ls-files', '-z').split('\0')
        tracked = [n for n in tracked if n and not n.startswith('projects/portfolio-rag/')]
        paths = set(tracked) | {'projects/portfolio-rag/' + r.as_posix() for _, r in project}
        target = ROOT.parent / 'AI-Application-Projects.zip'
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(paths):
                source = collection / name
                if not source.resolve().is_relative_to(collection.resolve()):
                    raise RuntimeError('Invalid archive path')
                public_content(source)
                archive.write(source, name)
        records.append({'file': target.name, 'files': len(paths), 'bytes': target.stat().st_size,
                        'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        for record in records:
            with zipfile.ZipFile(ROOT.parent / record['file']) as archive:
                assert archive.testzip() is None
        report['archives'] = records
        report['archive_stage'] = 'local-candidate-not-deployed'
        (ROOT / 'output/release-manifest.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
    (ROOT / 'output/local-sync.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
