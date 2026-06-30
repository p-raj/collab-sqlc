package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var lintCmd = &cobra.Command{
	Use:   "lint",
	Short: "Lint source code",
	Long:  "Lint all code: backend with ruff, frontend with oxlint.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Linting all code")

		internal.Info("Backend (ruff)...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && ruff check src/ tests/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend lint passed")

		internal.Info("Frontend (oxlint)...")
		if err := internal.Run(internal.FrontendDir, "npx", "oxlint", "src/"); err != nil {
			return err
		}
		internal.Ok("Frontend lint passed")
		return nil
	},
}

var lintFixCmd = &cobra.Command{
	Use:   "fix",
	Short: "Lint and auto-fix",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Linting and fixing")

		internal.Info("Backend (ruff --fix)...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && ruff check --fix src/ tests/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend lint fixed")

		internal.Info("Frontend (oxlint --fix)...")
		if err := internal.Run(internal.FrontendDir, "npx", "oxlint", "--fix", "src/"); err != nil {
			return err
		}
		internal.Ok("Frontend lint fixed")
		return nil
	},
}

func init() {
	lintCmd.AddCommand(lintFixCmd)
}
