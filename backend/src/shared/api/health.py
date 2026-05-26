"""Health check endpoint."""

from fastapi import APIRouter

from src.shared.domain.schemas import ApiResponse

router = APIRouter(tags=["health"])


class HealthResponse(ApiResponse):
    status: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="healthy")
