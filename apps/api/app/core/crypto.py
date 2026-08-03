"""Encryption for Plaid access tokens.

A Plaid access token is a long-lived credential for reading someone's bank
data. It is encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256), and the
plaintext exists only inside the Plaid client (PLAN.md section 9).

Rules that hold everywhere else in the codebase:
  - the decrypted token is never logged, never serialized into a response, and
    never leaves the API service
  - the key comes from the environment, never from the repository
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.config import get_settings
from app.core.errors import AppError


class EncryptionError(AppError):
    status_code = 500
    code = "ENCRYPTION_ERROR"
    title = "Encryption Error"


@lru_cache
def _fernet() -> MultiFernet:
    """Build the cipher from configured keys.

    MultiFernet so keys can be rotated: the first key encrypts, and any key
    can decrypt. To rotate, prepend a new key and keep the old one until
    everything has been re-encrypted.
    """
    settings = get_settings()
    keys = [k.strip() for k in settings.plaid_encryption_keys if k.strip()]

    if not keys:
        raise EncryptionError("PLAID_ENCRYPTION_KEY is not configured.")

    try:
        return MultiFernet([Fernet(key.encode()) for key in keys])
    except (ValueError, TypeError) as exc:
        raise EncryptionError(
            "PLAID_ENCRYPTION_KEY is not a valid Fernet key. "
            'Generate one with: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        ) from exc


def encrypt(plaintext: str) -> str:
    if not plaintext:
        raise EncryptionError("Refusing to encrypt an empty value.")
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        # Usually a rotated-away key or a corrupted row. Deliberately vague:
        # the caller must not be able to distinguish the two.
        raise EncryptionError("Could not decrypt stored credential.") from exc


def rotate(ciphertext: str) -> str:
    """Re-encrypt under the current primary key."""
    return _fernet().rotate(ciphertext.encode()).decode()


def generate_key() -> str:
    """Convenience for operators generating a new key."""
    return Fernet.generate_key().decode()
