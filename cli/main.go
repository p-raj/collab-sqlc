package main

import (
	"os"

	"github.com/p-raj/collab-sqlc/cli/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
