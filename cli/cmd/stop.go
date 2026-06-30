package cmd

import (
	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop all services",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Stopping Docker services")
		if err := internal.DockerCompose("down"); err != nil {
			return err
		}
		internal.Ok("All Docker services stopped")
		return nil
	},
}
