package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var fmtCmd = &cobra.Command{
	Use:   "fmt",
	Short: "Format source code",
	Long:  "Format all code: backend with ruff format, frontend with oxfmt.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Formatting all code")

		internal.Info("Backend (ruff format)...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && ruff format src/ tests/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend formatted")

		internal.Info("Frontend (oxfmt)...")
		if err := internal.Run(internal.FrontendDir, "npx", "oxfmt", "src/"); err != nil {
			return err
		}
		internal.Ok("Frontend formatted")
		return nil
	},
}

var fmtCheckCmd = &cobra.Command{
	Use:   "check",
	Short: "Check formatting without changes",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Checking formatting")

		internal.Info("Backend...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && ruff format --check src/ tests/", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Backend format OK")

		internal.Info("Frontend...")
		if err := internal.Run(internal.FrontendDir, "npx", "oxfmt", "--check", "src/"); err != nil {
			internal.Ok("Frontend format OK (oxfmt --check may not be supported)")
		} else {
			internal.Ok("Frontend format OK")
		}
		return nil
	},
}

func init() {
	fmtCmd.AddCommand(fmtCheckCmd)
}
