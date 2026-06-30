package internal

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

// dockerComposeArgs returns the base command and args for docker compose.
// It prefers "docker compose" (plugin) but falls back to "docker-compose" (standalone).
var dockerComposeCmd []string

func initDockerCompose() {
	if dockerComposeCmd != nil {
		return
	}
	// Try plugin form first
	if err := exec.Command("docker", "compose", "version").Run(); err == nil {
		dockerComposeCmd = []string{"docker", "compose"}
		return
	}
	// Fallback to standalone
	if _, err := exec.LookPath("docker-compose"); err == nil {
		dockerComposeCmd = []string{"docker-compose"}
		return
	}
	// Default to plugin form (will fail with a clear error)
	dockerComposeCmd = []string{"docker", "compose"}
}

// DockerCompose runs docker compose with the project compose file and extra args.
func DockerCompose(extraArgs ...string) error {
	initDockerCompose()
	args := make([]string, 0, len(dockerComposeCmd)+2+len(extraArgs))
	args = append(args, dockerComposeCmd[1:]...)
	args = append(args, "-f", ComposeFile)
	args = append(args, extraArgs...)
	return Run(RootDir, dockerComposeCmd[0], args...)
}

// DockerComposeOutput runs docker compose and returns stdout.
func DockerComposeOutput(extraArgs ...string) ([]byte, error) {
	initDockerCompose()
	args := make([]string, 0, len(dockerComposeCmd)+2+len(extraArgs))
	args = append(args, dockerComposeCmd[1:]...)
	args = append(args, "-f", ComposeFile)
	args = append(args, extraArgs...)
	cmd := exec.Command(dockerComposeCmd[0], args...)
	cmd.Dir = RootDir
	cmd.Env = os.Environ()
	return cmd.Output()
}

// DockerComposeVersion returns the docker compose version string, or an error.
func DockerComposeVersion() (string, error) {
	initDockerCompose()
	args := append(dockerComposeCmd[1:], "version")
	out, err := exec.Command(dockerComposeCmd[0], args...).Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// Run executes a command with real-time streaming of stdout/stderr.
// It returns an error if the command exits with a non-zero status.
func Run(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = os.Environ()
	return cmd.Run()
}

// RunInteractive is identical to Run — both connect stdin/stdout/stderr.
// Kept as a separate function for readability at call sites.
func RunInteractive(dir string, name string, args ...string) error {
	return Run(dir, name, args...)
}

// Exec replaces the current process with the given command (syscall.Exec).
// This is used for commands like psql or redis-cli that need a full TTY.
func Exec(dir string, name string, args ...string) error {
	if dir != "" {
		if err := os.Chdir(dir); err != nil {
			return fmt.Errorf("chdir %s: %w", dir, err)
		}
	}
	binary, err := exec.LookPath(name)
	if err != nil {
		return fmt.Errorf("%s: not found in PATH", name)
	}
	argv := append([]string{name}, args...)
	return syscall.Exec(binary, argv, os.Environ())
}

// RunBash runs a bash -c command string with streaming output.
func RunBash(dir string, script string) error {
	return Run(dir, "bash", "-c", script)
}

// StartBackground starts a command in the background and returns
// the underlying os.Process. The caller is responsible for cleanup.
func StartBackground(dir string, name string, args ...string) (*os.Process, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd.Process, nil
}
