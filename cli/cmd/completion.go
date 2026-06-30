package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var completionCmd = &cobra.Command{
	Use:   "completion",
	Short: "Generate shell completions",
	Long: `Generate shell completion scripts for codb.

To load completions:

Bash:
  $ source <(codb completion bash)

Zsh:
  $ codb completion zsh > "${fpath[1]}/_codb"

Fish:
  $ codb completion fish | source

PowerShell:
  PS> codb completion powershell | Out-String | Invoke-Expression
`,
}

var completionBashCmd = &cobra.Command{
	Use:   "bash",
	Short: "Generate bash completion",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return rootCmd.GenBashCompletion(os.Stdout)
	},
}

var completionZshCmd = &cobra.Command{
	Use:   "zsh",
	Short: "Generate zsh completion",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return rootCmd.GenZshCompletion(os.Stdout)
	},
}

var completionFishCmd = &cobra.Command{
	Use:   "fish",
	Short: "Generate fish completion",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return rootCmd.GenFishCompletion(os.Stdout, true)
	},
}

var completionPowershellCmd = &cobra.Command{
	Use:   "powershell",
	Short: "Generate PowerShell completion",
	RunE: func(cmd *cobra.Command, args []string) error {
		cmd.SilenceUsage = true
		return rootCmd.GenPowerShellCompletionWithDesc(os.Stdout)
	},
}

func init() {
	completionCmd.AddCommand(completionBashCmd, completionZshCmd, completionFishCmd, completionPowershellCmd)
}
