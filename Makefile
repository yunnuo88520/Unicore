# Author: yunnuo <ymz@ebox.vip>
SHELL := /bin/sh
override VERSION := $(shell cat VERSION)
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
FEATURE_LICENSE ?= false
FEATURE_UPDATER ?= true
RELEASE_TARGETS ?= linux/amd64,linux/arm64,darwin/amd64,darwin/arm64,windows/amd64,windows/arm64
RELEASE_PROFILES ?= web-platform,web-standalone,cli
export FEATURE_LICENSE FEATURE_UPDATER
export RELEASE_TARGETS RELEASE_PROFILES
FEATURE_TAGS = $(strip $(if $(filter true,$(FEATURE_LICENSE)),license) $(if $(filter true,$(FEATURE_UPDATER)),updater))
LDFLAGS := -X github.com/yunnuo/unicore/internal/buildinfo.Version=$(VERSION) -X github.com/yunnuo/unicore/internal/buildinfo.Commit=$(COMMIT) -X github.com/yunnuo/unicore/internal/buildinfo.BuildTime=$(BUILD_TIME)

.PHONY: install dev-web dev-server dev-desktop dev-cli generate docs wiki wiki-publish test test-e2e test-features build-web build-cli build-desktop build-all build-ops doctor dev-deps-up dev-deps-down release package package-desktop version docker-build compose-up compose-down test-deploy test-upgrade check-features
install:
	pnpm install --frozen-lockfile
	go mod download
dev-web:
	pnpm --filter @unicore/web dev
dev-server: check-features
	pnpm version:sync
	go run -tags '$(FEATURE_TAGS)' ./cmd/server
dev-desktop: check-features
	pnpm design:generate
	cd cmd/desktop && wails dev -tags 'desktop $(FEATURE_TAGS)'
dev-cli:
	go run ./cmd/cli $(ARGS)
generate:
	node scripts/update-history.mjs
	pnpm design:generate
	pnpm generate:migrations
docs: generate
	pnpm ai:context
	pnpm wiki:generate
wiki:
	pnpm wiki:generate
wiki-publish:
	pnpm wiki:publish
test:
	node scripts/update-history.mjs --check
	pnpm check:version
	pnpm check:release-notes
	node scripts/test-version.mjs
	pnpm test:tooling
	pnpm check:migrations
	pnpm test:migrations
	node scripts/build-features.mjs
	pnpm check:docs
	pnpm check:design
	pnpm check:i18n
	pnpm check:contracts
	pnpm check:authors
	go run ./scripts/check-boundaries
	go vet ./...
	go test -race ./...
	go test -race -tags updater ./cmd/server ./internal/adapter/http ./internal/adapter/desktop
	pnpm typecheck
	pnpm test
test-e2e:
	pnpm test:e2e
test-features:
	pnpm test:features
check-features:
	node scripts/build-features.mjs
build-web: check-features
	pnpm --filter @unicore/web build
	go build -trimpath -tags '$(FEATURE_TAGS)' -ldflags '$(LDFLAGS)' -o build/bin/server ./cmd/server
build-cli:
	pnpm design:generate
	go build -trimpath -ldflags '$(LDFLAGS)' -o build/bin/unicore ./cmd/cli
build-desktop: check-features
	pnpm design:generate
	cd cmd/desktop && wails build -tags 'desktop $(FEATURE_TAGS)' -ldflags '$(LDFLAGS)'
	pnpm check:native --bundle
build-ops:
	go build -trimpath -ldflags '$(LDFLAGS)' -o build/bin/unicore-ops ./cmd/ops
build-all: build-web build-cli build-ops build-desktop
doctor:
	node scripts/doctor.mjs $(ARGS)
dev-deps-up:
	docker compose -f deploy/docker/compose.dev.yaml up -d --wait $(SERVICES)
dev-deps-down:
	docker compose -f deploy/docker/compose.dev.yaml down
release:
	node scripts/release.mjs
package:
	node scripts/release.mjs
package-desktop:
	node scripts/release-assets.mjs desktop
version:
	node scripts/version.mjs --release '$(NEW_VERSION)'
	$(MAKE) docs
docker-build:
	node scripts/container.mjs build
compose-up:
	node scripts/container.mjs up
compose-down:
	node scripts/container.mjs down
test-upgrade:
	UPGRADE_FROM_REF='$(FROM_REF)' node scripts/test-upgrade.mjs
test-deploy:
	node scripts/test-deployment.mjs

# Native credentials are optional for previews; required mode fails closed.
sign-desktop:
	node scripts/platform-sign.mjs
