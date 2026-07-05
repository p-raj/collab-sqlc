package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start Docker development stack",
	Long:  "Start all development services in Docker: PostgreSQL, Redis, backend, worker, and frontend with hot reload.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting Docker development stack")

		internal.Info("Building development images...")
		if err := internal.DockerComposeDev("build", "backend", "worker", "frontend"); err != nil {
			return err
		}

		internal.Info("Starting infrastructure (PostgreSQL + Redis)...")
		if err := internal.DockerComposeDev("up", "-d", "db", "redis"); err != nil {
			return err
		}
		if err := waitForDB(internal.DockerComposeDev); err != nil {
			return err
		}

		internal.Info("Running pending migrations...")
		if err := internal.DockerComposeDev("run", "--rm", "backend", "uv", "run", "alembic", "upgrade", "head"); err != nil {
			internal.Warn("Migrations skipped (might need manual intervention)")
		}

		println()
		internal.Ok("Starting dev services:")
		fmt.Println("  Frontend:  http://localhost:5173")
		fmt.Println("  Backend:   http://localhost:8000")
		fmt.Println("  API Docs:  http://localhost:8000/api/docs")
		fmt.Println("  Worker:    Taskiq query runner")
		fmt.Println("  Database:  localhost:5432")
		fmt.Println("  Redis:     localhost:6379")
		println()
		fmt.Println("Press Ctrl+C to stop attached dev services. Run ./codb stop to remove containers.")

		return internal.DockerComposeDev("up", "backend", "worker", "frontend")
	},
}

var startInfraCmd = &cobra.Command{
	Use:   "infra",
	Short: "Start only PostgreSQL + Redis",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting infrastructure")
		if err := internal.DockerCompose("up", "-d", "db", "redis"); err != nil {
			return err
		}
		if err := waitForDB(internal.DockerCompose); err != nil {
			return err
		}
		internal.Ok("PostgreSQL and Redis are ready")
		fmt.Println("  Database:  localhost:" + internal.DBPort())
		fmt.Println("  Redis:     localhost:" + internal.RedisPort())
		return nil
	},
}

var startBackendCmd = &cobra.Command{
	Use:   "backend",
	Short: "Start only backend dev server",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting backend")
		internal.Info("http://localhost:8000")
		return internal.Exec(internal.BackendDir, "bash", "-c", backendScript())
	},
}

var startWorkerCmd = &cobra.Command{
	Use:   "worker",
	Short: "Start only Taskiq query worker",
	Long:  "Start the Taskiq worker that executes durable query runs from Redis Streams.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting query worker")
		internal.Info("Taskiq worker: src.jobs.broker:broker")
		return internal.Exec(internal.BackendDir, "bash", "-c", workerScript())
	},
}

var startFrontendCmd = &cobra.Command{
	Use:   "frontend",
	Short: "Start only frontend dev server",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting frontend")
		internal.Info("http://localhost:5173")
		return internal.Exec(internal.FrontendDir, "npm", "run", "dev", "--", "--host")
	},
}

func waitForDB(compose func(...string) error) error {
	internal.Info("Waiting for PostgreSQL...")
	for i := 0; i < 30; i++ {
		err := compose("exec", "-T", "db", "pg_isready", "-U", internal.DBUser())
		if err == nil {
			internal.Ok("PostgreSQL is ready")
			return nil
		}
		internal.Run(internal.RootDir, "sleep", "1")
	}
	return fmt.Errorf("database failed to start after 30 retries")
}

func backendScript() string {
	return fmt.Sprintf(
		"cd %s && source .venv/bin/activate && exec uvicorn src.app:create_app --factory --host 0.0.0.0 --port 8000 --reload --loop uvloop",
		internal.BackendDir,
	)
}

func workerScript() string {
	return fmt.Sprintf(
		"cd %s && source .venv/bin/activate && exec taskiq worker src.jobs.broker:broker src.history.tasks --ack-type when_executed --max-async-tasks %s",
		internal.BackendDir,
		internal.Env("WORKER_CONCURRENCY", "10"),
	)
}

func init() {
	startCmd.AddCommand(startInfraCmd, startBackendCmd, startWorkerCmd, startFrontendCmd)
}
