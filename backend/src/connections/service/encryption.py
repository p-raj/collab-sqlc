"""Credential encryption using Fernet symmetric encryption."""

from cryptography.fernet import Fernet

from src.shared.config import AppSettings


class CredentialEncryption:
    def __init__(self, settings: AppSettings) -> None:
        # Derive a Fernet key from the settings key
        import base64
        import hashlib

        key_bytes = hashlib.sha256(settings.encryption.key.encode()).digest()
        self._fernet = Fernet(base64.urlsafe_b64encode(key_bytes))

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode()).decode()
