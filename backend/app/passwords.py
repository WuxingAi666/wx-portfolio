"""Salted owner-password hashes, separate from the internal API bearer token."""
import hashlib
import hmac
import secrets

ITERATIONS = 600_000


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('ascii'), ITERATIONS).hex()
    return f'pbkdf2_sha256${ITERATIONS}${salt}${digest}'


def valid_hash(value):
    try:
        algorithm, rounds, salt, digest = value.split('$')
        return (algorithm == 'pbkdf2_sha256' and 600_000 <= int(rounds) <= 1_000_000
                and len(salt) == 32 and len(digest) == 64
                and len(bytes.fromhex(salt)) == 16 and len(bytes.fromhex(digest)) == 32)
    except (ValueError, TypeError):
        return False


def verify_password(password, encoded):
    if not valid_hash(encoded):
        return False
    _, rounds, salt, expected = encoded.split('$')
    actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('ascii'), int(rounds)).hex()
    return hmac.compare_digest(actual, expected)
