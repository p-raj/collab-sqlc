from dataclasses import dataclass

import pytest
from cryptography.fernet import InvalidToken

from src.connections.service.connection_service import (
    _decrypt_ssl_private_key,
    _encrypt_ssl_private_key,
    _validate_ssl_configuration,
)
from src.shared.domain.errors import ValidationError


@dataclass
class StubEncryption:
    def encrypt(self, plaintext: str) -> str:
        return f"enc:{plaintext}"

    def decrypt(self, ciphertext: str) -> str:
        if not ciphertext.startswith("enc:"):
            raise InvalidToken
        return ciphertext.removeprefix("enc:")


def test_encrypt_ssl_private_key_uses_encryption() -> None:
    encryption = StubEncryption()

    assert _encrypt_ssl_private_key(encryption, "secret-key") == "enc:secret-key"


def test_decrypt_ssl_private_key_accepts_legacy_pem_values() -> None:
    encryption = StubEncryption()
    pem_key = "-----BEGIN PRIVATE KEY-----\nlegacy\n-----END PRIVATE KEY-----"

    assert _decrypt_ssl_private_key(encryption, pem_key) == pem_key


def test_decrypt_ssl_private_key_decrypts_encrypted_values() -> None:
    encryption = StubEncryption()

    assert _decrypt_ssl_private_key(encryption, "enc:secret-key") == "secret-key"


def test_decrypt_ssl_private_key_rejects_invalid_values() -> None:
    encryption = StubEncryption()

    with pytest.raises(ValueError, match="invalid"):
        _decrypt_ssl_private_key(encryption, "not-a-pem-or-encrypted-key")


def test_validate_ssl_configuration_requires_ca_for_client_certificates() -> None:
    with pytest.raises(ValidationError, match="CA certificate is required"):
        _validate_ssl_configuration(True, None, "client-cert")
