"""Access token encryption."""

from collections.abc import Iterator

import pytest
from cryptography.fernet import Fernet

from app.core import crypto
from app.core.crypto import EncryptionError


@pytest.fixture(autouse=True)
def _keys(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point the cipher at throwaway keys, and clear the cached instance."""
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("PLAID_ENCRYPTION_KEY", key)
    crypto._fernet.cache_clear()
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    crypto._fernet.cache_clear()
    get_settings.cache_clear()


def test_round_trip() -> None:
    token = "access-sandbox-abc123"
    assert crypto.decrypt(crypto.encrypt(token)) == token


def test_ciphertext_does_not_contain_plaintext() -> None:
    """The stored value must not leak the token to anyone reading the table."""
    ciphertext = crypto.encrypt("access-sandbox-secret")
    assert "access-sandbox-secret" not in ciphertext


def test_encryption_is_non_deterministic() -> None:
    """Fernet includes a random IV, so equal tokens do not produce equal rows."""
    assert crypto.encrypt("same") != crypto.encrypt("same")


def test_refuses_empty_value() -> None:
    with pytest.raises(EncryptionError):
        crypto.encrypt("")


def test_tampered_ciphertext_is_rejected() -> None:
    ciphertext = crypto.encrypt("access-sandbox-abc")
    tampered = ciphertext[:-4] + "AAAA"

    with pytest.raises(EncryptionError):
        crypto.decrypt(tampered)


def test_wrong_key_cannot_decrypt(monkeypatch: pytest.MonkeyPatch) -> None:
    ciphertext = crypto.encrypt("access-sandbox-abc")

    monkeypatch.setenv("PLAID_ENCRYPTION_KEY", Fernet.generate_key().decode())
    crypto._fernet.cache_clear()
    from app.config import get_settings

    get_settings.cache_clear()

    with pytest.raises(EncryptionError):
        crypto.decrypt(ciphertext)


def test_rotation_keeps_old_keys_readable(monkeypatch: pytest.MonkeyPatch) -> None:
    """A value encrypted under the old key must still decrypt after rotation."""
    old_key = Fernet.generate_key().decode()
    monkeypatch.setenv("PLAID_ENCRYPTION_KEY", old_key)
    crypto._fernet.cache_clear()
    from app.config import get_settings

    get_settings.cache_clear()
    ciphertext = crypto.encrypt("access-sandbox-rotate")

    # New key first (it encrypts), old key retained so it can still decrypt.
    new_key = Fernet.generate_key().decode()
    monkeypatch.setenv("PLAID_ENCRYPTION_KEY", f"{new_key},{old_key}")
    crypto._fernet.cache_clear()
    get_settings.cache_clear()

    assert crypto.decrypt(ciphertext) == "access-sandbox-rotate"


def test_missing_key_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLAID_ENCRYPTION_KEY", "")
    crypto._fernet.cache_clear()
    from app.config import get_settings

    get_settings.cache_clear()

    with pytest.raises(EncryptionError):
        crypto.encrypt("anything")


def test_invalid_key_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLAID_ENCRYPTION_KEY", "not-a-fernet-key")
    crypto._fernet.cache_clear()
    from app.config import get_settings

    get_settings.cache_clear()

    with pytest.raises(EncryptionError):
        crypto.encrypt("anything")
