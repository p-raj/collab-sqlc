package cmd

import (
	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var deployCmd = &cobra.Command{
	Use:   "deploy",
	Short: "Docker deployment commands",
	Long:  "Deploy the production Docker Compose stack, including backend, worker, frontend, PostgreSQL, and Redis.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Deploying with Docker Compose")
		if err := internal.DockerCompose("up", "-d", "--build"); err != nil {
			return err
		}
		internal.Ok("Deployed. Services:")
		return internal.DockerCompose("ps")
	},
}

var deployBuildCmd = &cobra.Command{
	Use:   "build",
	Short: "Build Docker images",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Building Docker images")
		if err := internal.DockerCompose("build"); err != nil {
			return err
		}
		internal.Ok("Images built")
		return nil
	},
}

var deployUpCmd = &cobra.Command{
	Use:   "up",
	Short: "Start production stack",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Starting production stack")
		if err := internal.DockerCompose("up", "-d"); err != nil {
			return err
		}
		internal.Ok("Stack is up")
		return internal.DockerCompose("ps")
	},
}

var deployDownCmd = &cobra.Command{
	Use:   "down",
	Short: "Stop production stack",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Stopping production stack")
		if err := internal.DockerCompose("down"); err != nil {
			return err
		}
		internal.Ok("Stack is down")
		return nil
	},
}

func init() {
	deployCmd.AddCommand(deployBuildCmd, deployUpCmd, deployDownCmd)
}
