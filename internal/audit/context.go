// Author: yunnuo <ymz@ebox.vip>
// Description: Server-owned audit metadata; never includes payloads, credentials or message bodies.
package audit

import "context"

type Metadata struct{ ActorName, Realm, Target, Detail, IP string }
type contextKey struct{}

func With(ctx context.Context, value Metadata) context.Context {
	return context.WithValue(ctx, contextKey{}, value)
}
func From(ctx context.Context) (Metadata, bool) {
	v, ok := ctx.Value(contextKey{}).(Metadata)
	return v, ok
}
func Target(ctx context.Context, target, detail string) context.Context {
	v, _ := From(ctx)
	v.Target = target
	v.Detail = detail
	return With(ctx, v)
}
