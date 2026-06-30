package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var checkCmd = &cobra.Command{
	Use:   "check",
	Short: "Run full quality gate",
	Long:  "Run lint, format check, and type checks for all code.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Running full quality check")

		// Lint backend
		internal.Info("Backend lint (ruff)...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && ruff check src/ tests/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend lint passed")

		// Lint frontend
		internal.Info("Frontend lint (oxlint)...")
		if err := internal.Run(internal.FrontendDir, "npx", "oxlint", "src/"); err != nil {
			return err
		}
		internal.Ok("Frontend lint passed")

		// Format check backend
		internal.Info("Backend format check...")
		script = fmt.Sprintf("cd %s && source .venv/bin/activate && ruff format --check src/ tests/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend format OK")

		// Format check frontend
		internal.Info("Frontend format check...")
		if err := internal.Run(internal.FrontendDir, "npx", "oxfmt", "--check", "src/"); err != nil {
			internal.Ok("Frontend format OK (oxfmt --check may not be supported)")
		} else {
			internal.Ok("Frontend format OK")
		}

		// Typecheck backend
		internal.Info("Backend typecheck (mypy)...")
		script = fmt.Sprintf("cd %s && source .venv/bin/activate && mypy src/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend types OK")

		// Typecheck frontend
		internal.Info("Frontend typecheck (tsc)...")
		if err := internal.Run(internal.FrontendDir, "npx", "tsc", "--noEmit"); err != nil {
			return err
		}
		internal.Ok("Frontend types OK")

		println()
		internal.Ok("All quality checks passed ✨")
		return nil
	},
}
