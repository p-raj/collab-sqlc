package internal

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Project directories resolved at load time.
var (
	RootDir     string
	BackendDir  string
	FrontendDir string
	DockerDir   string
	ComposeFile string
	EnvFile     string
)

// env holds key-value pairs loaded from .env.
var env = map[string]string{}

// Load detects the project root and loads the .env file.
// It walks up from the executable's location (or cwd) looking for
// the presence of backend/, frontend/, and docker/ directories.
func Load() error {
	root, err := findRoot()
	if err != nil {
		return err
	}
	RootDir = root
	BackendDir = filepath.Join(root, "backend")
	FrontendDir = filepath.Join(root, "frontend")
	DockerDir = filepath.Join(root, "docker")
	ComposeFile = filepath.Join(DockerDir, "docker-compose.yml")
	EnvFile = filepath.Join(root, ".env")

	loadEnvFile(EnvFile)
	return nil
}

// findRoot walks up from the binary location (then cwd as fallback)
// looking for a directory that contains backend/, frontend/, and docker/.
func findRoot() (string, error) {
	// Try from executable location first.
	if exe, err := os.Executable(); err == nil {
		if dir, ok := searchUp(filepath.Dir(exe)); ok {
			return dir, nil
		}
	}
	// Fallback to cwd.
	if cwd, err := os.Getwd(); err == nil {
		if dir, ok := searchUp(cwd); ok {
			return dir, nil
		}
	}
	return "", fmt.Errorf("could not find project root (need backend/, frontend/, docker/ siblings)")
}

func searchUp(start string) (string, bool) {
	dir := start
	for {
		if isProjectRoot(dir) {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

func isProjectRoot(dir string) bool {
	for _, sub := range []string{"backend", "frontend", "docker"} {
		info, err := os.Stat(filepath.Join(dir, sub))
		if err != nil || !info.IsDir() {
			return false
		}
	}
	return true
}

// loadEnvFile reads a simple key=value .env file into the env map
// and sets each variable in the process environment.
func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // no .env is fine
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		// Strip surrounding quotes.
		val = strings.Trim(val, `"'`)
		env[key] = val
		os.Setenv(key, val)
	}
}

// Env returns a loaded environment variable (from .env or os).
func Env(key, fallback string) string {
	if v, ok := env[key]; ok && v != "" {
		return v
	}
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Convenience accessors for common env vars.

func DBHost() string { return Env("DB_HOST", "localhost") }
func DBPort() string { return Env("DB_PORT", "5432") }
func DBUser() string { return Env("DB_USER", "postgres") }
func DBPass() string { return Env("DB_PASS", "postgres") }
func DBName() string { return Env("DB_NAME", "collabsql") }

func RedisHost() string { return Env("REDIS_HOST", "localhost") }
func RedisPort() string { return Env("REDIS_PORT", "6379") }
