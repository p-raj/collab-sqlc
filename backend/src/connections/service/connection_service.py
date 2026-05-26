"""Connection service — manages database connections with encryption and safety."""

from cryptography.fernet import InvalidToken

from src.admin.service.audit_service import AuditService
from src.connections.domain.models import ConnectionModel
from src.connections.domain.schemas import ConnectionCreateRequest, ConnectionUpdateRequest
from src.connections.drivers.base import ConnectionConfig, DatabaseDriver
from src.connections.drivers.factory import create_driver
from src.connections.repository.connection_repository import ConnectionRepository
from src.connections.service.encryption import CredentialEncryption
from src.connections.service.ssh_tunnel import open_tunnel
from src.shared.domain.base import new_id
from src.shared.domain.errors import ForbiddenError, NotFoundError, ValidationError
from src.shared.domain.types import UserRole


class ConnectionService:
    def __init__(
        self,
        repo: ConnectionRepository,
        encryption: CredentialEncryption,
        audit_service: AuditService,
    ) -> None:
        self._repo = repo
        self._encryption = encryption
        self._audit = audit_service

    async def create(
        self,
        request: ConnectionCreateRequest,
        user_id: str,
        user_email: str,
        ip_address: str | None,
    ) -> ConnectionModel:
        connection = ConnectionModel(
            id=new_id(),
            name=request.name,
            db_type=request.db_type,
            host=request.host,
            port=request.port,
            database=request.database,
            username=request.username,
            password_encrypted=self._encryption.encrypt(request.password),
            ssl_enabled=request.ssl_enabled,
            ssl_ca=request.ssl_ca,
            ssl_cert=request.ssl_cert,
            ssl_key=_encrypt_ssl_private_key(self._encryption, request.ssl_key),
            ssh_enabled=request.ssh_enabled,
            ssh_host=request.ssh_host,
            ssh_port=request.ssh_port,
            ssh_username=request.ssh_username,
            ssh_private_key_encrypted=(
                self._encryption.encrypt(request.ssh_private_key)
                if request.ssh_private_key
                else None
            ),
            max_concurrent_queries=request.max_concurrent_queries,
            query_timeout_seconds=request.query_timeout_seconds,
            safe_mode=request.safe_mode,
            is_shared=request.is_shared,
            dbml_context=request.dbml_context,
            created_by=user_id,
        )
        _validate_ssl_configuration(connection.ssl_enabled, connection.ssl_ca, connection.ssl_cert)
        created_connection = await self._repo.create(connection)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="connection.create",
            resource_type="connection",
            resource_id=created_connection.id,
            ip_address=ip_address,
        )
        return created_connection

    async def get_for_user(
        self, connection_id: str, user_id: str, user_role: str
    ) -> ConnectionModel:
        conn = await self._repo.get_by_id(connection_id)
        if not conn:
            raise NotFoundError("Connection", connection_id)
        if conn.created_by != user_id and not conn.is_shared and user_role != UserRole.ADMIN:
            raise ForbiddenError("You don't have access to this connection")
        return conn

    async def get_by_id(self, connection_id: str) -> ConnectionModel:
        """Fetch a connection by ID without ownership checks (system-level use)."""
        conn = await self._repo.get_by_id(connection_id)
        if not conn:
            raise NotFoundError("Connection", connection_id)
        return conn

    async def list_for_user(self, user_id: str) -> list[ConnectionModel]:
        return await self._repo.list_for_user(user_id)

    async def update(
        self,
        connection_id: str,
        update: ConnectionUpdateRequest,
        user_id: str,
        user_role: str,
        user_email: str,
        ip_address: str | None,
    ) -> ConnectionModel:
        conn = await self.get_for_user(connection_id, user_id, user_role)
        if conn.created_by != user_id and user_role != UserRole.ADMIN:
            raise ForbiddenError("Only the owner or admin can update this connection")

        if update.name is not None:
            conn.name = update.name
        if update.host is not None:
            conn.host = update.host
        if update.port is not None:
            conn.port = update.port
        if update.database is not None:
            conn.database = update.database
        if update.username is not None:
            conn.username = update.username
        if update.password is not None:
            conn.password_encrypted = self._encryption.encrypt(update.password)
        if update.ssl_enabled is not None:
            conn.ssl_enabled = update.ssl_enabled
        if "ssl_ca" in update.model_fields_set:
            conn.ssl_ca = update.ssl_ca
        if "ssl_cert" in update.model_fields_set:
            conn.ssl_cert = update.ssl_cert
        if "ssl_key" in update.model_fields_set:
            conn.ssl_key = _encrypt_ssl_private_key(self._encryption, update.ssl_key)
        if update.ssh_enabled is not None:
            conn.ssh_enabled = update.ssh_enabled
        if update.ssh_host is not None:
            conn.ssh_host = update.ssh_host
        if update.ssh_port is not None:
            conn.ssh_port = update.ssh_port
        if update.ssh_username is not None:
            conn.ssh_username = update.ssh_username
        if update.ssh_private_key is not None:
            conn.ssh_private_key_encrypted = self._encryption.encrypt(update.ssh_private_key)
        if update.max_concurrent_queries is not None:
            conn.max_concurrent_queries = update.max_concurrent_queries
        if update.query_timeout_seconds is not None:
            conn.query_timeout_seconds = update.query_timeout_seconds
        if update.safe_mode is not None:
            conn.safe_mode = update.safe_mode
        if update.is_shared is not None:
            conn.is_shared = update.is_shared
        # dbml_context uses model_fields_set to distinguish "not sent" from "set to null"
        if "dbml_context" in update.model_fields_set:
            conn.dbml_context = update.dbml_context

        _validate_ssl_configuration(conn.ssl_enabled, conn.ssl_ca, conn.ssl_cert)

        updated_connection = await self._repo.update(conn)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="connection.update",
            resource_type="connection",
            resource_id=updated_connection.id,
            ip_address=ip_address,
        )
        return updated_connection

    async def delete(
        self,
        connection_id: str,
        user_id: str,
        user_role: str,
        user_email: str,
        ip_address: str | None,
    ) -> None:
        conn = await self.get_for_user(connection_id, user_id, user_role)
        if conn.created_by != user_id and user_role != UserRole.ADMIN:
            raise ForbiddenError("Only the owner or admin can delete this connection")
        await self._repo.delete(conn)
        await self._audit.log_action(
            user_id=user_id,
            user_email=user_email,
            action="connection.delete",
            resource_type="connection",
            resource_id=connection_id,
            ip_address=ip_address,
        )

    def get_driver(self, conn: ConnectionModel) -> DatabaseDriver:
        return create_driver(conn.db_type)

    async def get_connection_config(self, conn: ConnectionModel) -> ConnectionConfig:
        host = conn.host
        port = conn.port

        if (
            conn.ssh_enabled
            and conn.ssh_host
            and conn.ssh_username
            and conn.ssh_private_key_encrypted
        ):
            local_port = await open_tunnel(
                ssh_host=conn.ssh_host,
                ssh_port=conn.ssh_port or 22,
                ssh_username=conn.ssh_username,
                ssh_private_key=self._encryption.decrypt(conn.ssh_private_key_encrypted),
                db_host=conn.host,
                db_port=conn.port,
                tunnel_id=conn.id,
            )
            host = "127.0.0.1"
            port = local_port

        return ConnectionConfig(
            host=host,
            port=port,
            database=conn.database,
            username=conn.username,
            password=self._encryption.decrypt(conn.password_encrypted),
            ssl_enabled=conn.ssl_enabled,
            ssl_ca=conn.ssl_ca,
            ssl_cert=conn.ssl_cert,
            ssl_key=_decrypt_ssl_private_key(self._encryption, conn.ssl_key),
        )

    async def test_connection(
        self,
        db_type: str,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        ssl_enabled: bool = False,
        ssl_ca: str | None = None,
        ssl_cert: str | None = None,
        ssl_key: str | None = None,
    ) -> tuple[bool, str]:
        driver = create_driver(db_type)
        config = ConnectionConfig(
            host=host,
            port=port,
            database=database,
            username=username,
            password=password,
            ssl_enabled=ssl_enabled,
            ssl_ca=ssl_ca,
            ssl_cert=ssl_cert,
            ssl_key=ssl_key,
        )
        try:
            success = await driver.test_connection(config)
            return success, "Connection successful" if success else "Connection failed"
        except Exception as e:
            return False, str(e)


_PEM_PREFIX = "-----BEGIN "


def _encrypt_ssl_private_key(
    encryption: CredentialEncryption,
    private_key: str | None,
) -> str | None:
    if private_key is None:
        return None
    return encryption.encrypt(private_key)


def _decrypt_ssl_private_key(
    encryption: CredentialEncryption,
    private_key: str | None,
) -> str | None:
    if private_key is None or private_key.startswith(_PEM_PREFIX):
        return private_key

    try:
        return encryption.decrypt(private_key)
    except InvalidToken as exc:
        raise ValueError("Stored SSL private key is invalid") from exc


def _validate_ssl_configuration(
    ssl_enabled: bool,
    ssl_ca: str | None,
    ssl_cert: str | None,
) -> None:
    if ssl_enabled and ssl_cert and not ssl_ca:
        raise ValidationError("SSL CA certificate is required when client certificates are used")
