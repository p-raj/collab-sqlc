"""SSH tunnel management for database connections."""

from typing import Any

import asyncssh
from loguru import logger

# Track active tunnels: connection_model_id → (listener, task)
_active_tunnels: dict[str, Any] = {}


async def open_tunnel(
    ssh_host: str,
    ssh_port: int,
    ssh_username: str,
    ssh_private_key: str,
    db_host: str,
    db_port: int,
    tunnel_id: str,
) -> int:
    """Open an SSH tunnel and return the local port.

    The tunnel forwards localhost:<local_port> → db_host:db_port
    through the SSH server.
    """
    if tunnel_id in _active_tunnels:
        # Tunnel already open — return its port
        listener = _active_tunnels[tunnel_id]
        return int(listener.get_port())

    key = asyncssh.import_private_key(ssh_private_key)

    conn = await asyncssh.connect(
        ssh_host,
        port=ssh_port,
        username=ssh_username,
        client_keys=[key],
        known_hosts=None,
    )

    listener = await conn.forward_local_port("127.0.0.1", 0, db_host, db_port)
    local_port = listener.get_port()
    _active_tunnels[tunnel_id] = listener

    logger.info(
        f"SSH tunnel {tunnel_id}: 127.0.0.1:{local_port} "
        f"→ {db_host}:{db_port} via {ssh_host}:{ssh_port}"
    )
    return local_port


async def close_tunnel(tunnel_id: str) -> None:
    """Close an SSH tunnel if one is open for this connection."""
    listener = _active_tunnels.pop(tunnel_id, None)
    if listener is not None:
        listener.close()
        logger.info(f"SSH tunnel {tunnel_id} closed")


async def close_all_tunnels() -> None:
    """Close all active tunnels (called on shutdown)."""
    for tid in list(_active_tunnels.keys()):
        await close_tunnel(tid)
