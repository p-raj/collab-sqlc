package cmd

import (
	"os"
	"path/filepath"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize the project (venv, npm, .env)",
	Long:  "Sets up the backend virtual environment, installs frontend dependencies, and creates a default .env file.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Initializing Collab SQLC")

		// Create .env if missing.
		if _, err := os.Stat(internal.EnvFile); os.IsNotExist(err) {
			internal.Info("Creating .env from template...")
			if err := os.WriteFile(internal.EnvFile, []byte(defaultEnv), 0644); err != nil {
				return err
			}
			internal.Ok(".env created")
		} else {
			internal.Ok(".env already exists")
		}

		// Backend setup.
		internal.Header("Setting up backend")
		venvDir := filepath.Join(internal.BackendDir, ".venv")
		if _, err := os.Stat(venvDir); os.IsNotExist(err) {
			internal.Info("Creating Python virtual environment...")
			if err := internal.Run(internal.BackendDir, "uv", "venv"); err != nil {
				return err
			}
			internal.Ok("Virtual environment created")
		} else {
			internal.Ok("Virtual environment exists")
		}

		internal.Info("Installing Python dependencies...")
		if err := internal.Run(internal.BackendDir, "uv", "sync", "--all-extras"); err != nil {
			return err
		}
		internal.Ok("Backend dependencies installed")

		// Frontend setup.
		internal.Header("Setting up frontend")
		internal.Info("Installing Node dependencies...")
		if err := internal.Run(internal.FrontendDir, "npm", "install"); err != nil {
			return err
		}
		internal.Ok("Frontend dependencies installed")

		println()
		internal.Ok("Project initialized! Next steps:")
		println("  1. ./codb start infra     # Start PostgreSQL + Redis")
		println("  2. ./codb migrate         # Run database migrations")
		println("  3. ./codb create admin    # Create superadmin user")
		println("  4. ./codb start           # Start dev servers")
		return nil
	},
}

const defaultEnv = `# ─── Database ─────────────────────────────────────
DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/collabsql
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=collabsql

# ─── Redis ────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0
REDIS_HOST=localhost
REDIS_PORT=6379

# ─── Auth ─────────────────────────────────────────
AUTH_SECRET_KEY=dev-secret-change-in-production

# ─── Encryption ──────────────────────────────────
ENCRYPTION_KEY=dev-encryption-key-change-me

# ─── App ──────────────────────────────────────────
APP_DEBUG=true
APP_CORS_ORIGINS=["http://localhost:5173"]

# ─── Frontend ────────────────────────────────────
VITE_API_URL=http://localhost:8000
`
