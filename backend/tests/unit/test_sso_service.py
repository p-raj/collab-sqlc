from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from src.auth.service.sso_service import SSOService
from src.shared.config import GitHubLoginMechanism


def _build_service(login_mechanism: GitHubLoginMechanism) -> SSOService:
    settings = SimpleNamespace(
        github_sso=SimpleNamespace(
            client_id="client-id",
            client_secret="client-secret",
            login_mechanism=login_mechanism,
            redirect_uri="http://localhost:5173/auth/github/callback",
        )
    )
    return SSOService(settings=settings, redis=SimpleNamespace())


def test_get_github_authorize_url_omits_scope_for_github_app() -> None:
    service = _build_service(GitHubLoginMechanism.GITHUB_APP)

    authorize_url = service.get_github_authorize_url("state-token")

    params = parse_qs(urlparse(authorize_url).query)
    assert "scope" not in params


def test_get_github_authorize_url_adds_scope_for_oauth_app() -> None:
    service = _build_service(GitHubLoginMechanism.OAUTH_APP)

    authorize_url = service.get_github_authorize_url("state-token")

    params = parse_qs(urlparse(authorize_url).query)
    assert params["scope"] == ["read:user user:email"]
