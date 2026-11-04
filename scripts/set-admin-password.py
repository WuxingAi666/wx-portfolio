"""Set the private dashboard login password without changing internal API tokens."""
import getpass
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.passwords import hash_password


def main():
    path = ROOT / 'backend/.env'
    if not path.exists():
        raise SystemExit('Prepare backend/.env first.')
    password = getpass.getpass('Dashboard password: ')
    if not 8 <= len(password) <= 256:
        raise SystemExit('Use between 8 and 256 characters.')
    if password != getpass.getpass('Confirm password: '):
        raise SystemExit('Passwords do not match.')
    lines = [line for line in path.read_text(encoding='utf-8').splitlines()
             if line.split('=', 1)[0] != 'ADMIN_PASSWORD_HASH']
    lines.append('ADMIN_PASSWORD_HASH=' + hash_password(password))
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('Private password hash updated. Restart the API; internal tokens are unchanged.')


if __name__ == '__main__':
    main()
