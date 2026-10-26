# Author: yunnuo <ymz@ebox.vip>
SHELL := /bin/sh
VERSION := $(shell cat VERSION)
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -X github.com/yunnuo/unicore/internal/buildinfo.Version=$(VERSION) -X github.com/yunnuo/unicore/internal/buildinfo.Commit=$(COMMIT) -X github.com/yunnuo/unicore/internal/buildinfo.BuildTime=$(BUILD_TIME)

.PHONY: install dev-web dev-server dev-desktop dev-cli generate test test-e2e build-web build-cli build-desktop build-all release
install:
	pnpm install --frozen-lockfile
	go mod download
dev-web:
	pnpm --filter @unicore/web dev
dev-server:
	go run ./cmd/server
dev-desktop:
	cd cmd/desktop && wails dev -tags desktop
dev-cli:
	go run ./cmd/cli $(ARGS)
generate:
	pnpm generate
test:
	pnpm check:contracts
	pnpm check:authors
	go run ./scripts/check-boundaries
	go vet ./...
	go test -race ./...
	pnpm typecheck
	pnpm test
test-e2e:
	pnpm test:e2e
build-web:
	pnpm --filter @unicore/web build
	go build -trimpath -ldflags '$(LDFLAGS)' -o build/bin/server ./cmd/server
build-cli:
	go build -trimpath -ldflags '$(LDFLAGS)' -o build/bin/unicore ./cmd/cli
build-desktop:
	cd cmd/desktop && wails build -tags desktop -ldflags '$(LDFLAGS)'
build-all: build-web build-cli build-desktop
release:
	node scripts/release.mjs
