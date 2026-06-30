package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var testCmd = &cobra.Command{
	Use:   "test [args...]",
	Short: "Run tests",
	Long:  "Run all tests (backend + frontend). Extra arguments are passed to both test runners.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Running all tests")

		if err := runBackendTests(args); err != nil {
			return err
		}
		if err := runFrontendTests(args); err != nil {
			return err
		}

		internal.Ok("All tests passed")
		return nil
	},
}

var testBackendCmd = &cobra.Command{
	Use:                "backend [args...]",
	Short:              "Run backend tests (pytest)",
	DisableFlagParsing: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return runBackendTests(args)
	},
}

var testFrontendCmd = &cobra.Command{
	Use:                "frontend [args...]",
	Short:              "Run frontend tests (vitest)",
	DisableFlagParsing: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return runFrontendTests(args)
	},
}

func runBackendTests(extraArgs []string) error {
	internal.Header("Running backend tests")
	args := []string{}
	if len(extraArgs) > 0 {
		args = extraArgs
	} else {
		args = []string{"--tb=short", "-q"}
	}
	script := fmt.Sprintf("cd %s && source .venv/bin/activate && pytest %s",
		internal.BackendDir, joinArgs(args))
	return internal.RunBash(internal.BackendDir, script)
}

func runFrontendTests(extraArgs []string) error {
	internal.Header("Running frontend tests")
	args := append([]string{"vitest", "run"}, extraArgs...)
	return internal.Run(internal.FrontendDir, "npx", args...)
}

func init() {
	testCmd.AddCommand(testBackendCmd, testFrontendCmd)
}
