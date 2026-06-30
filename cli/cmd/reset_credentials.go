package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
)

var resetCredentialsCmd = &cobra.Command{
	Use:   "reset-credentials",
	Short: "Reset password and secret key for a user",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Reset user credentials")

		reader := bufio.NewReader(os.Stdin)

		fmt.Print("Email of user to reset: ")
		email, _ := reader.ReadString('\n')
		email = strings.TrimSpace(email)
		if email == "" {
			return fmt.Errorf("email is required")
		}

		internal.Info("Resetting credentials...")

		// Pass values via environment to avoid shell injection
		os.Setenv("RESET_EMAIL", email)
		defer os.Unsetenv("RESET_EMAIL")

		script := fmt.Sprintf(`cd %s && source .venv/bin/activate && python3 -c "
import asyncio, os, sys, secrets, string
from src.shared.config import get_settings
from src.shared.database import init_engine, get_session_factory
from src.auth.domain.models import UserModel
from argon2 import PasswordHasher
from sqlalchemy import select

def generate_secret_key():
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(12))

def generate_password():
    alphabet = string.ascii_letters + string.digits + '!@#%%&*'
    return ''.join(secrets.choice(alphabet) for _ in range(20))

async def reset_credentials():
    email = os.environ['RESET_EMAIL']
    password = generate_password()

    settings = get_settings()
    init_engine(settings)
    factory = get_session_factory()
    hasher = PasswordHasher()

    try:
        async with factory() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.email == email)
            )
            user = result.scalar_one_or_none()
            if not user:
                print(f'No user found with email: {email}')
                sys.exit(1)

            user.password_hash = hasher.hash(password)
            new_secret_key = generate_secret_key()
            user.secret_key = new_secret_key
            await session.commit()

            print(f'Credentials reset for: {email}')
            print(f'Role: {user.role}')
            print(f'Password:       {password}')
            print(f'New secret key: {new_secret_key}')
            print()
            print(f'Share these credentials with the user — they will need both to log in.')
    finally:
        from src.shared.database import close_engine
        await close_engine()

asyncio.run(reset_credentials())
"`, internal.BackendDir)

		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Credentials reset successfully.")
		return nil
	},
}

func init() {
	usersCmd.AddCommand(resetCredentialsCmd)
}
