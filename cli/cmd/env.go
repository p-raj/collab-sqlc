package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var envCmd = &cobra.Command{
	Use:   "env",
	Short: "Environment configuration",
}

var envShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Display environment (secrets masked)",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Environment configuration")

		f, err := os.Open(internal.EnvFile)
		if err != nil {
			internal.Warn("No .env file found. Run: ./codb init")
			return nil
		}
		defer f.Close()

		sensitiveKeys := []string{"SECRET", "PASSWORD", "PASS", "KEY", "TOKEN"}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			trimmed := strings.TrimSpace(line)

			// Pass through comments and blank lines.
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				fmt.Println(line)
				continue
			}

			key, _, ok := strings.Cut(trimmed, "=")
			if !ok {
				fmt.Println(line)
				continue
			}

			upper := strings.ToUpper(key)
			masked := false
			for _, s := range sensitiveKeys {
				if strings.Contains(upper, s) {
					fmt.Printf("%s=********\n", key)
					masked = true
					break
				}
			}
			if !masked {
				fmt.Println(line)
			}
		}
		return nil
	},
}

func init() {
	envCmd.AddCommand(envShowCmd)
}
