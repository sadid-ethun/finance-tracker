from app.core.logging import _redact


def test_redacts_sensitive_keys() -> None:
    event = {"access_token": "secret-value", "user_id": "u_1"}

    result = _redact(None, "info", event)

    assert result["access_token"] == "[REDACTED]"
    assert result["user_id"] == "u_1"


def test_redaction_is_case_insensitive() -> None:
    event = {"Authorization": "Bearer abc"}

    assert _redact(None, "info", event)["Authorization"] == "[REDACTED]"


def test_leaves_ordinary_keys_untouched() -> None:
    event = {"path": "/health", "duration_ms": 1.2}

    assert _redact(None, "info", event) == event
