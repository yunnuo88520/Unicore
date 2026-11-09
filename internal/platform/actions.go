// Author: yunnuo <ymz@ebox.vip>
// Description: Contract-bound action registration shared by all platform business pages.
package platform

import (
	"sort"
	"strconv"

	"github.com/yunnuo/unicore/internal/contracts"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

// DefaultActions derives one button node per grantable, page-bound operation.
// The shared tree has a single action namespace (`op:{operationId}`): a button
// is granted once and renders in every workspace its page declares.
func DefaultActions(n contracts.Navigation) []contracts.NavigationNode {
	pages := map[string]contracts.NavigationNode{}
	for _, page := range n.Nodes {
		if page.Type == "page" && page.RouteID != nil {
			pages[*page.RouteID] = page
		}
	}
	ops := apispec.Operations()
	keys := []string{}
	for k := range ops {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	result := []contracts.NavigationNode{}
	for _, key := range keys {
		op := ops[key]
		if op.Policy.UIPage == "" || op.Policy.SuperAdmin || len(op.Policy.Permissions) == 0 {
			continue
		}
		page, ok := pages[op.Policy.UIPage]
		if !ok {
			continue
		}
		permissions := op.Policy.Permissions
		if op.Policy.PermissionMode != "any" {
			for _, permission := range permissions {
				if permission != "admin:access" {
					permissions = []string{permission}
					break
				}
			}
		}
		for i, permission := range permissions {
			id := "op:" + op.ID
			if i > 0 {
				id += ":alt" + strconv.Itoa(i)
			}
			parent := page.ID
			p := permission
			label := op.Summary
			for _, definition := range PermissionCatalog() {
				if definition.ID == permission {
					label = definition.Name
				}
			}
			result = append(result, contracts.NavigationNode{ID: id, SectionID: page.SectionID, Surfaces: append([]string{}, page.Surfaces...), Type: "action", ParentID: &parent, Permission: &p, Label: label, OperationIds: []string{op.ID}, Visible: true, OpenMode: "same_tab"})
		}
	}
	return result
}
