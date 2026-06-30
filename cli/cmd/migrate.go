package cmd

import (
	"fmt"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

// alembicRun executes an alembic command inside the backend venv.
func alembicRun(alembicArgs ...string) error {
	script := fmt.Sprintf("cd %s && source .venv/bin/activate && alembic %s",
		internal.BackendDir, joinArgs(alembicArgs))
	return internal.RunBash(internal.BackendDir, script)
}

func joinArgs(args []string) string {
	s := ""
	for i, a := range args {
		if i > 0 {
			s += " "
		}
		s += a
	}
	return s
}

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "Database migration commands",
	Long:  "Run all pending migrations (default: upgrade to head).\nUse subcommands for fine-grained control.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Upgrading database to: head")
		if err := alembicRun("upgrade", "head"); err != nil {
			return err
		}
		internal.Ok("Migration complete")
		return nil
	},
}

var migrateNewCmd = &cobra.Command{
	Use:   "new <name>",
	Short: "Create a new migration",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		name := args[0]
		internal.Header("Creating migration: " + name)
		if err := alembicRun("revision", "--autogenerate", "-m", name); err != nil {
			return err
		}
		internal.Ok("Migration created. Review the generated file in backend/alembic/versions/")
		return nil
	},
}

var migrateUpCmd = &cobra.Command{
	Use:   "up [revision]",
	Short: "Upgrade to revision (default: head)",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		rev := "head"
		if len(args) > 0 {
			rev = args[0]
		}
		internal.Header("Upgrading database to: " + rev)
		if err := alembicRun("upgrade", rev); err != nil {
			return err
		}
		internal.Ok("Migration complete")
		return nil
	},
}

var migrateDownCmd = &cobra.Command{
	Use:   "down [revision]",
	Short: "Downgrade to revision (default: -1)",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		rev := "-1"
		if len(args) > 0 {
			rev = args[0]
		}
		internal.Header("Downgrading database to: " + rev)
		if err := alembicRun("downgrade", rev); err != nil {
			return err
		}
		internal.Ok("Downgrade complete")
		return nil
	},
}

var migrateHistoryCmd = &cobra.Command{
	Use:   "history",
	Short: "Show migration history",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Migration history")
		return alembicRun("history", "--verbose")
	},
}

var migrateCurrentCmd = &cobra.Command{
	Use:   "current",
	Short: "Show current migration revision",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Current migration")
		return alembicRun("current")
	},
}

var migrateStampCmd = &cobra.Command{
	Use:   "stamp <revision>",
	Short: "Stamp the database with a revision without running migrations",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		rev := args[0]
		internal.Header("Stamping database with: " + rev)
		if err := alembicRun("stamp", rev); err != nil {
			return err
		}
		internal.Ok("Stamped to " + rev)
		return nil
	},
}

func init() {
	migrateCmd.AddCommand(migrateNewCmd, migrateUpCmd, migrateDownCmd, migrateHistoryCmd, migrateCurrentCmd, migrateStampCmd)
}
