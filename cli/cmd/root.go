// Package cmd defines all CLI commands for the codb tool.
package cmd

import (
	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "codb",
	Short: "codb — Collab SQLC project CLI",
	Long:  "codb is the development CLI for the Collab SQLC monorepo.\nIt manages backend, frontend, database, and Docker services.",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Skip config loading for completion commands.
		if cmd.Name() == "completion" || cmd.Parent() != nil && cmd.Parent().Name() == "completion" {
			return nil
		}
		return internal.Load()
	},
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(
		initCmd,
		doctorCmd,
		startCmd,
		stopCmd,
		logsCmd,
		dbCmd,
		migrateCmd,
		redisCmd,
		testCmd,
		lintCmd,
		fmtCmd,
		typecheckCmd,
		checkCmd,
		buildCmd,
		deployCmd,
		usersCmd,
		cleanCmd,
		shellCmd,
		envCmd,
		completionCmd,
	)
}
