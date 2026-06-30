package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var dbCmd = &cobra.Command{
	Use:   "db",
	Short: "Database management commands",
}

var dbConnectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Open psql shell to the dev database",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Info(fmt.Sprintf("Connecting to %s on %s:%s...", internal.DBName(), internal.DBHost(), internal.DBPort()))
		os.Setenv("PGPASSWORD", internal.DBPass())
		return internal.Exec("", "psql", "-h", internal.DBHost(), "-p", internal.DBPort(), "-U", internal.DBUser(), "-d", internal.DBName())
	},
}

var dbResetCmd = &cobra.Command{
	Use:   "reset",
	Short: "Drop and recreate the database",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Resetting database")
		internal.Warn(fmt.Sprintf("This will DROP and RECREATE the '%s' database.", internal.DBName()))

		fmt.Print("Are you sure? [y/N] ")
		reader := bufio.NewReader(os.Stdin)
		answer, _ := reader.ReadString('\n')
		answer = strings.TrimSpace(answer)
		if !strings.EqualFold(answer, "y") {
			internal.Info("Aborted.")
			return nil
		}

		internal.Info("Dropping database...")
		if err := internal.DockerCompose("exec", "-T", "db", "dropdb", "-U", internal.DBUser(), "--if-exists", internal.DBName()); err != nil {
			return err
		}

		internal.Info("Creating database...")
		if err := internal.DockerCompose("exec", "-T", "db", "createdb", "-U", internal.DBUser(), internal.DBName()); err != nil {
			return err
		}
		internal.Ok("Database reset")

		internal.Info("Running migrations...")
		script := fmt.Sprintf("cd %s && source .venv/bin/activate && alembic upgrade head", internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Database ready")
		return nil
	},
}

var dbSeedCmd = &cobra.Command{
	Use:   "seed",
	Short: "Seed database with sample data",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Seeding database")
		script := fmt.Sprintf(`cd %s && source .venv/bin/activate && python3 -c "
import asyncio
from src.shared.config import get_settings
from src.shared.database import init_engine, get_session_factory
from src.auth.domain.models import UserModel
from src.shared.domain.base import new_id, utc_now
from argon2 import PasswordHasher

async def seed():
    settings = get_settings()
    init_engine(settings)
    factory = get_session_factory()
    hasher = PasswordHasher()

    try:
        async with factory() as session:
            from sqlalchemy import select
            existing = await session.execute(
                select(UserModel).where(UserModel.email == 'admin@collab-sqlc.dev')
            )
            if existing.scalar_one_or_none():
                print('Seed data already exists, skipping.')
                return

            admin = UserModel(
                id=new_id(), email='admin@collab-sqlc.dev',
                display_name='Admin',
                password_hash=hasher.hash('admin1234'),
                role='admin', is_active=True,
                created_at=utc_now(), updated_at=utc_now(),
            )
            session.add(admin)

            editor = UserModel(
                id=new_id(), email='editor@collab-sqlc.dev',
                display_name='Editor User',
                password_hash=hasher.hash('editor1234'),
                role='editor', is_active=True,
                created_at=utc_now(), updated_at=utc_now(),
            )
            session.add(editor)

            viewer = UserModel(
                id=new_id(), email='viewer@collab-sqlc.dev',
                display_name='Viewer User',
                password_hash=hasher.hash('viewer1234'),
                role='viewer', is_active=True,
                created_at=utc_now(), updated_at=utc_now(),
            )
            session.add(viewer)

            await session.commit()
            print('Seeded 3 users: admin / editor / viewer')
            print('  admin@collab-sqlc.dev  / admin1234  (admin)')
            print('  editor@collab-sqlc.dev / editor1234 (editor)')
            print('  viewer@collab-sqlc.dev / viewer1234 (viewer)')
    finally:
        from src.shared.database import close_engine
        await close_engine()

asyncio.run(seed())
"`, internal.BackendDir)
		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Database seeded")
		return nil
	},
}

func init() {
	dbCmd.AddCommand(dbConnectCmd, dbResetCmd, dbSeedCmd)
}
