package cmd

import (
	"fmt"
	"os/exec"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Check that all required tools are installed",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Checking required tools")

		okCount := 0
		failCount := 0

		checkTool := func(name string) {
			path, err := exec.LookPath(name)
			if err != nil {
				internal.Err(name + ": not found")
				failCount++
				return
			}
			out, _ := exec.Command(path, "--version").Output()
			ver := firstLine(string(out))
			if ver == "" {
				ver = "found"
			}
			internal.Ok(name + ": " + ver)
			okCount++
		}

		checkTool("docker")

		// docker compose (plugin or standalone)
		if ver, err := internal.DockerComposeVersion(); err == nil {
			internal.Ok("docker compose: " + firstLine(ver))
			okCount++
		} else {
			internal.Err("docker compose: not found")
			failCount++
		}

		checkTool("node")
		checkTool("npm")
		checkTool("python3")
		checkTool("uv")
		checkTool("git")

		println()
		if failCount > 0 {
			return fmt.Errorf("%d tool(s) missing — install them and try again", failCount)
		}
		internal.Ok(fmt.Sprintf("All %d required tools found.", okCount))
		return nil
	},
}

func firstLine(s string) string {
	for i, c := range s {
		if c == '\n' || c == '\r' {
			return s[:i]
		}
	}
	return s
}
