// Author: yunnuo <ymz@ebox.vip>
// Description: Standalone CLI composition root.
package main

import (
	"fmt"
	"os"

	cliadapter "github.com/yunnuo/unicore/internal/adapter/cli"
	"github.com/yunnuo/unicore/internal/bootstrap"
)

func main() {
	if err := cliadapter.New(bootstrap.Core()).Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
