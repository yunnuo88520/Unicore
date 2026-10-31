// Author: yunnuo <ymz@ebox.vip>
// Description: Cobra commands call the shared core with no network or database.
package cliadapter

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/spf13/cobra"
	"github.com/yunnuo/unicore/internal/buildinfo"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"github.com/yunnuo/unicore/internal/usecase"
)

func New(core usecase.Executor) *cobra.Command {
	root := &cobra.Command{Use: buildinfo.CLIRootCommand, Short: buildinfo.CLIRootDescription, SilenceUsage: true, SilenceErrors: true}
	root.Version = buildinfo.Version
	root.AddCommand(&cobra.Command{Use: "version", Short: "Print version metadata", RunE: func(cmd *cobra.Command, args []string) error {
		return json.NewEncoder(cmd.OutOrStdout()).Encode(map[string]string{"version": buildinfo.Version, "commit": buildinfo.Commit, "build_time": buildinfo.BuildTime, "profile": "cli"})
	}})
	var text string
	execute := &cobra.Command{Use: "execute", Short: "Analyze text; output JSON (stdin when --text is omitted)", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, args []string) error {
		if !cmd.Flags().Changed("text") {
			data, err := io.ReadAll(io.LimitReader(cmd.InOrStdin(), domain.MaxTextBytes+1))
			if err != nil {
				return fmt.Errorf("read stdin: %w", err)
			}
			text = string(data)
		}
		output, err := core.Execute(cmd.Context(), contracts.ExecuteInput{Text: text})
		if err != nil {
			return err
		}
		return json.NewEncoder(cmd.OutOrStdout()).Encode(output)
	}}
	execute.Flags().StringVar(&text, "text", "", "UTF-8 text, maximum 65,536 bytes")
	root.AddCommand(execute)
	return root
}
