package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var shellCmd = &cobra.Command{
	Use:   "shell",
	Short: "Interactive shells",
}

var shellBackendCmd = &cobra.Command{
	Use:   "backend",
	Short: "Python shell with app context",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Python shell with app context")
		script := fmt.Sprintf(
			`cd %s && source .venv/bin/activate && exec python3 -i -c "
from src.app import create_app
from src.shared.config import get_settings
settings = get_settings()
app = create_app()
print('App and settings loaded. Available: app, settings')
"`, internal.BackendDir)
		return internal.Exec(internal.BackendDir, "bash", "-c", script)
	},
}

var shellFrontendCmd = &cobra.Command{
	Use:   "frontend",
	Short: "Node REPL",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Node REPL")
		return internal.Exec(internal.FrontendDir, "node")
	},
}

func init() {
	shellCmd.AddCommand(shellBackendCmd, shellFrontendCmd)
}
