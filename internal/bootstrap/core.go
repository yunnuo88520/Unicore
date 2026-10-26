// Author: yunnuo <ymz@ebox.vip>
// Description: Minimal composition root; no platform, HTTP, Wails or SQL dependencies.
package bootstrap

import "github.com/yunnuo/unicore/internal/usecase"

func Core() usecase.Executor { return usecase.New() }
