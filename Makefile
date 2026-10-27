# Author: yunnuo <ymz@ebox.vip>
SHELL := /bin/sh
VERSION := $(shell cat VERSION)
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
FEATURE_LICENSE ?= false
FEATURE_UPDATER ?= false
export FEATURE_LICENSE FEATURE_UPDATER
FEATURE_TAGS = $(strip $(if $(filter true,$(FEATURE_LICENSE)),license) $(if $(filter true,$(FEATURE_UPDATER)),updater))
LDFLAGS := -X github.com/yunnuo/unicore/internal/buildinfo.Version=$(VERSION) -X github.com/yunnuo/unicore/internal/buildinfo.Commit=$(COMMIT) -X github.com/yunnuo/unicore/internal/buildinfo.BuildTime=$(BUILD_TIME)

.PHONY: install dev-web dev-server dev-desktop dev-cli generate docs test test-e2e test-features build-web build-cli build-desktop build-all release check-features
install:
	pnpm install --frozen-lockfile
	go mod download
dev-web:
	pnpm --filter @unicore/web dev
dev-server: check-features
	go run -tags '$(FEATURE_TAGS)' ./cmd/server
dev-desktop: check-features
	pnpm design:generate
	cd cmd/desktop && wails dev -tags 'desktop $(FEATURE_TAGS)'
dev-cli:
	go run ./cmd/cli $(ARGS)
generate:
	pnpm design:generate
docs: generate
	pnpm ai:context
test:
	node scripts/build-features.mjs
	pnpm check:docs
	pnpm check:design
	pnpm check:contracts
	pnpm check:authors
	go run ./scripts/check-boundaries
	go vet ./...
	go test -race ./...
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
build-all: build-web build-cli build-desktop
release:
	node scripts/release.mjs
