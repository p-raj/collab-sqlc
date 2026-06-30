package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var redisCmd = &cobra.Command{
	Use:   "redis",
	Short: "Redis management commands",
}

var redisConnectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Open redis-cli to dev Redis",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Info(fmt.Sprintf("Connecting to Redis at %s:%s...", internal.RedisHost(), internal.RedisPort()))
		return internal.Exec("", "redis-cli", "-h", internal.RedisHost(), "-p", internal.RedisPort())
	},
}

func init() {
	redisCmd.AddCommand(redisConnectCmd)
}
