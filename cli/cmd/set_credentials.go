package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/p-raj/collab-sqlc/cli/internal"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var setCredentialsCmd = &cobra.Command{
	Use:   "set-credentials",
	Short: "Set specific password and secret key for a user",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		internal.Header("Set user credentials")

		reader := bufio.NewReader(os.Stdin)

		fmt.Print("Email: ")
		email, _ := reader.ReadString('\n')
		email = strings.TrimSpace(email)
		if email == "" {
			return fmt.Errorf("email is required")
		}

		var password string
		for {
			fmt.Print("Password (min 8 chars): ")
			pass1, err := readPassword()
			if err != nil {
				return err
			}
			fmt.Println()
			if len(pass1) < 8 {
				internal.Warn("Password must be at least 8 characters.")
				continue
			}

			fmt.Print("Confirm password: ")
			pass2, err := readPassword()
			if err != nil {
				return err
			}
			fmt.Println()
			if pass1 != pass2 {
				internal.Warn("Passwords do not match.")
				continue
			}
			password = pass1
			break
		}

		fmt.Print("Secret key (min 8 chars): ")
		secretKey, _ := reader.ReadString('\n')
		secretKey = strings.TrimSpace(secretKey)
		if len(secretKey) < 8 {
			return fmt.Errorf("secret key must be at least 8 characters")
		}

		internal.Info("Setting credentials...")

		// Pass values via environment to avoid shell injection
		os.Setenv("SET_EMAIL", email)
		os.Setenv("SET_PASS", password)
		os.Setenv("SET_KEY", secretKey)
		defer os.Unsetenv("SET_EMAIL")
		defer os.Unsetenv("SET_PASS")
		defer os.Unsetenv("SET_KEY")

		script := fmt.Sprintf(`cd %s && source .venv/bin/activate && python3 -c "
import asyncio, os, sys
from src.shared.config import get_settings
from src.shared.database import init_engine, get_session_factory
from src.auth.domain.models import UserModel
from argon2 import PasswordHasher
from sqlalchemy import select

async def set_credentials():
    email = os.environ['SET_EMAIL']
    password = os.environ['SET_PASS']
    secret_key = os.environ['SET_KEY']

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
            user.secret_key = secret_key
            await session.commit()

            print(f'Credentials set for: {email}')
            print(f'Role: {user.role}')
    finally:
        from src.shared.database import close_engine
        await close_engine()

asyncio.run(set_credentials())
"`, internal.BackendDir)

		if err := internal.RunBash(internal.BackendDir, script); err != nil {
			return err
		}
		internal.Ok("Credentials set successfully.")
		return nil
	},
}

// readPassword reads a password from the terminal with echo disabled (cross-platform).
func readPassword() (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		reader := bufio.NewReader(os.Stdin)
		line, _ := reader.ReadString('\n')
		return strings.TrimSpace(line), nil
	}
	bytes, err := term.ReadPassword(fd)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func init() {
	usersCmd.AddCommand(setCredentialsCmd)
}
