//go:build (desktop || bindings) && !windows

// Author: yunnuo <ymz@ebox.vip>
// Description: Other platforms retain the existing stderr startup diagnostics.
package main

func showStartupError(err error) {}
