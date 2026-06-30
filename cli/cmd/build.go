package cmd

import (
	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var buildCmd = &cobra.Command{
	Use:   "build",
	Short: "Build artifacts",
	Long:  "Build backend wheel and frontend bundle.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		if err := buildBackend(); err != nil {
			return err
		}
		if err := buildFrontend(); err != nil {
			return err
		}
		internal.Ok("Full build complete")
		return nil
	},
}

var buildBackendCmd = &cobra.Command{
	Use:   "backend",
	Short: "Build Python wheel",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return buildBackend()
	},
}

var buildFrontendCmd = &cobra.Command{
	Use:   "frontend",
	Short: "Build frontend bundle",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return buildFrontend()
	},
}

func buildBackend() error {
	internal.Header("Building backend")
	script := "cd " + internal.BackendDir + " && source .venv/bin/activate && uv build"
	if err := internal.RunBash(internal.BackendDir, script); err != nil {
		return err
	}
	internal.Ok("Backend wheel built → backend/dist/")
	return nil
}

func buildFrontend() error {
	internal.Header("Building frontend")
	if err := internal.Run(internal.FrontendDir, "npm", "run", "build"); err != nil {
		return err
	}
	internal.Ok("Frontend bundle built → frontend/dist/")
	return nil
}

func init() {
	buildCmd.AddCommand(buildBackendCmd, buildFrontendCmd)
}
