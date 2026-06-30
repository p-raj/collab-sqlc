package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var typecheckCmd = &cobra.Command{
	Use:   "typecheck",
	Short: "Run static type checkers",
	Long:  "Run mypy on backend and tsc --noEmit on frontend.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Running type checks")

		internal.Info("Backend (mypy)...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && mypy src/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend types OK")

		internal.Info("Frontend (tsc)...")
		if err := internal.Run(internal.FrontendDir, "npx", "tsc", "--noEmit"); err != nil {
			return err
		}
		internal.Ok("Frontend types OK")
		return nil
	},
}
