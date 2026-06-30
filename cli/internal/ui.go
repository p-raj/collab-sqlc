// Package internal provides shared utilities for the codb CLI.
package internal

import (
	"fmt"
	"os"
	"strings"

	"github.com/fatih/color"
)

var (
	cyan   = color.New(color.FgCyan)
	green  = color.New(color.FgGreen)
	yellow = color.New(color.FgYellow)
	red    = color.New(color.FgRed)
	bold   = color.New(color.Bold)
	dim    = color.New(color.Faint)
)

// Info prints an informational message with a cyan prefix.
func Info(msg string) {
	cyan.Print("▸ ")
	fmt.Println(msg)
}

// Ok prints a success message with a green checkmark.
func Ok(msg string) {
	green.Print("✓ ")
	fmt.Println(msg)
}

// Warn prints a warning message with a yellow prefix.
func Warn(msg string) {
	yellow.Print("⚠ ")
	fmt.Println(msg)
}

// Err prints an error message with a red prefix to stderr.
func Err(msg string) {
	red.Fprint(os.Stderr, "✗ ")
	fmt.Fprintln(os.Stderr, msg)
}

// Header prints a bold title with an underline.
func Header(title string) {
	fmt.Println()
	bold.Println(title)
	dim.Println(strings.Repeat("─", len(title)))
}

// Die prints an error message and exits with code 1.
func Die(msg string) {
	Err(msg)
	os.Exit(1)
}
