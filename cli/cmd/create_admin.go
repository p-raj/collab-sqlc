package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var usersCmd = &cobra.Command{
	Use:   "users",
	Short: "Manage users (create admin, reset credentials)",
}

var createAdminCmd = &cobra.Command{
	Use:   "create-admin",
	Short: "Create a superadmin user (interactive)",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Create superadmin user")

		reader := bufio.NewReader(os.Stdin)

		fmt.Print("Email: ")
		email, _ := reader.ReadString('\n')
		email = strings.TrimSpace(email)
		if email == "" {
			return fmt.Errorf("email is required")
		}

		fmt.Print("Display name: ")
		name, _ := reader.ReadString('\n')
		name = strings.TrimSpace(name)
		if name == "" {
			return fmt.Errorf("name is required")
		}

		internal.Info("Creating admin user with auto-generated credentials...")

		// Pass values via environment to avoid shell injection
		os.Setenv("ADMIN_EMAIL", email)
		os.Setenv("ADMIN_NAME", name)
		defer os.Unsetenv("ADMIN_EMAIL")
		defer os.Unsetenv("ADMIN_NAME")

		script := fmt.Sprintf(`cd %s && source .venv/bin/activate && python3 -c "
import asyncio, os, sys, secrets, string
from src.shared.config import get_settings
from src.shared.database import init_engine, get_session_factory
from src.auth.domain.models import UserModel
from src.shared.domain.base import new_id, utc_now
from argon2 import PasswordHasher
from sqlalchemy import select

def generate_secret_key():
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(12))

def generate_password():
    alphabet = string.ascii_letters + string.digits + '!@#%%&*'
    return ''.join(secrets.choice(alphabet) for _ in range(20))

async def create_admin():
    email = os.environ['ADMIN_EMAIL']
    display_name = os.environ['ADMIN_NAME']
    password = generate_password()

    settings = get_settings()
    init_engine(settings)
    factory = get_session_factory()
    hasher = PasswordHasher()
    secret_key = generate_secret_key()

    try:
        async with factory() as session:
            existing = await session.execute(
                select(UserModel).where(UserModel.email == email)
            )
            if existing.scalar_one_or_none():
                print(f'User with email {email} already exists.')
                sys.exit(1)

            user = UserModel(
                id=new_id(),
                email=email,
                display_name=display_name,
                password_hash=hasher.hash(password),
                secret_key=secret_key,
                role='admin',
                is_active=True,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            session.add(user)
            await session.commit()
            print(f'Admin user created: {email}')
            print(f'Password:   {password}')
            print(f'Secret key: {secret_key}')
            print()
            print(f'Share these credentials with the user — they will need both to log in.')
    finally:
        from src.shared.database import close_engine
        await close_engine()

asyncio.run(create_admin())
"`, internal.BackendDir)

		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Superadmin user ready. Sign in at http://localhost:5173")
		return nil
	},
}

func init() {
	usersCmd.AddCommand(createAdminCmd)
}
