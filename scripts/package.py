"""Build public-source release archives. Excludes credentials and runtime data."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE = {".git", ".venv", "__pycache__", ".playwright-cli", "backups", "storage", "output", "node_modules"}
PUBLIC_DIRS = {"frontend", "backend", "deploy", "scripts", ".github"}
PUBLIC_DOCS = {"ARCHITECTURE.md", "DEPLOYMENT.md", "KNOWLEDGE.md", "VALIDATION.md", "PROJECT-STATUS.md", "LOCAL-DEVELOPMENT.md"}
SECRET = re.compile(r"sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|https://[^/\s]+:[^/@\s]+@github\.com")


def files_under(root):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if not path.is_file() or any(part in EXCLUDE for part in relative.parts):
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if path.suffix in {".pyc", ".zip", ".log", ".db", ".sqlite", ".faiss", ".pkl", ".pt", ".wav"}:
            continue
        if root == ROOT and not (
            relative.parts[0] in PUBLIC_DIRS
            or relative.parts[0] == 'docs' and path.name in PUBLIC_DOCS
            or len(relative.parts) == 1 and path.name in {'README.md', '.gitignore', '.gitattributes'}
        ):
            continue
        yield path, relative


def package(root, destination):
    count = 0
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, relative in files_under(root):
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeError:
                content = ''
            if SECRET.search(content):
                raise RuntimeError("Secret-like string found in " + relative.as_posix() + "; packaging stopped without printing it")
            archive.write(path, relative.as_posix())
            count += 1
    return {"file": destination.name, "files": count,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            "bytes": destination.stat().st_size}


if __name__ == "__main__":
    releases = [
        package(ROOT, ROOT.parent / "wx-fullstack.zip"),
    ]
    (ROOT / "output").mkdir(exist_ok=True)
    (ROOT / "output" / "release-manifest.json").write_text(json.dumps(releases, indent=2), encoding="utf-8")
    print(json.dumps(releases, indent=2))
