"""Taskiq tasks for query run execution."""

from src.history.service.query_run_runner import QueryRunRunner
from src.jobs.broker import broker


@broker.task
async def execute_query_run(run_id: str) -> None:
    await QueryRunRunner().execute(run_id)
