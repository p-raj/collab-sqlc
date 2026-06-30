package cmd

import (
	"os"
	"path/filepath"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var cleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Remove build artifacts and Docker volumes",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Cleaning build artifacts")

		internal.Info("Backend...")
		for _, sub := range []string{"dist", ".pytest_cache", ".mypy_cache", ".ruff_cache"} {
			os.RemoveAll(filepath.Join(internal.BackendDir, sub))
		}
		// Remove __pycache__ directories.
		filepath.Walk(internal.BackendDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if info.IsDir() && info.Name() == "__pycache__" {
				os.RemoveAll(path)
				return filepath.SkipDir
			}
			return nil
		})
		internal.Ok("Backend cleaned")

		internal.Info("Frontend...")
		for _, sub := range []string{"dist", ".vite"} {
			os.RemoveAll(filepath.Join(internal.FrontendDir, sub))
		}
		os.RemoveAll(filepath.Join(internal.FrontendDir, "node_modules", ".vite"))
		internal.Ok("Frontend cleaned")

		internal.Info("Docker...")
		internal.DockerCompose("down", "-v", "--remove-orphans")
		internal.Ok("Docker volumes cleaned")

		println()
		internal.Ok("All clean. Run ./codb init to reinstall.")
		return nil
	},
}
