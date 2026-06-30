package cmd

import (
	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var logsCmd = &cobra.Command{
	Use:   "logs [service]",
	Short: "View Docker service logs",
	Long:  "Tail Docker Compose logs. Optionally specify a service (backend, worker, frontend, db, redis).",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, cmdArgs []string) error {
		cmd.SilenceUsage = true
		args := []string{"logs", "-f"}
		if len(cmdArgs) > 0 {
			args = append(args, cmdArgs...)
		}
		return internal.DockerCompose(args...)
	},
}
