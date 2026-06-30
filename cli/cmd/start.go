package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start development servers",
	Long:  "Start all services: infrastructure (PostgreSQL + Redis), backend (uvicorn), worker (Taskiq), and frontend (vite).",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting all services")

		internal.Info("Starting infrastructure (PostgreSQL + Redis)...")
		if err := internal.DockerCompose("up", "-d", "db", "redis"); err != nil {
			return err
		}
		if err := waitForDB(); err != nil {
			return err
		}

		internal.Info("Running pending migrations...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && alembic upgrade head", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			internal.Warn("Migrations skipped (might need manual intervention)")
		}

		backendProc, err := startBackendBackground()
		if err != nil {
			return fmt.Errorf("start backend: %w", err)
		}
		internal.Ok(fmt.Sprintf("Backend started (PID: %d)", backendProc.Pid))

		workerProc, err := startWorkerBackground()
		if err != nil {
			backendProc.Signal(syscall.SIGTERM)
			return fmt.Errorf("start worker: %w", err)
		}
		internal.Ok(fmt.Sprintf("Worker started (PID: %d)", workerProc.Pid))

		internal.Info("Starting frontend...")
		frontendProc, err := internal.StartBackground(internal.FrontendDir, "npm", "run", "dev", "--", "--host")
		if err != nil {
			backendProc.Signal(syscall.SIGTERM)
			workerProc.Signal(syscall.SIGTERM)
			return fmt.Errorf("start frontend: %w", err)
		}
		internal.Ok(fmt.Sprintf("Frontend started (PID: %d)", frontendProc.Pid))

		println()
		internal.Ok("All services running:")
		fmt.Println("  Frontend:  http://localhost:5173")
		fmt.Println("  Backend:   http://localhost:8000")
		fmt.Println("  API Docs:  http://localhost:8000/api/docs")
		fmt.Println("  Worker:    Taskiq query runner")
		fmt.Println("  Database:  localhost:5432")
		fmt.Println("  Redis:     localhost:6379")
		println()
		fmt.Println("Press Ctrl+C to stop dev servers.")

		// Wait for interrupt, then kill children.
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig

		println()
		backendProc.Signal(syscall.SIGTERM)
		workerProc.Signal(syscall.SIGTERM)
		frontendProc.Signal(syscall.SIGTERM)
		backendProc.Wait()
		workerProc.Wait()
		frontendProc.Wait()
		internal.Ok("Dev servers stopped.")
		return nil
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
		if err := waitForDB(); err != nil {
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

func waitForDB() error {
	internal.Info("Waiting for PostgreSQL...")
	for i := 0; i < 30; i++ {
		err := internal.DockerCompose("exec", "-T", "db", "pg_isready", "-U", internal.DBUser())
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
		"cd %s && source .venv/bin/activate && exec taskiq worker src.jobs.broker:broker --fs-discover --ack-type when_executed --max-async-tasks %s",
		internal.BackendDir,
		internal.Env("WORKER_CONCURRENCY", "10"),
	)
}

func startBackendBackground() (*os.Process, error) {
	internal.Info("Starting backend...")
	return internal.StartBackground(internal.RootDir, "bash", "-c", backendScript())
}

func startWorkerBackground() (*os.Process, error) {
	internal.Info("Starting worker...")
	return internal.StartBackground(internal.RootDir, "bash", "-c", workerScript())
}

func init() {
	startCmd.AddCommand(startInfraCmd, startBackendCmd, startWorkerCmd, startFrontendCmd)
}
