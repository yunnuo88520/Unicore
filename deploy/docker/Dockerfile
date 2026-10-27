# Author: yunnuo <ymz@ebox.vip>
FROM golang:1.26-bookworm AS go-toolchain

FROM node:22-bookworm-slim AS frontend
COPY --from=go-toolchain /usr/local/go/bin/gofmt /usr/local/bin/gofmt
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY assets ./assets
COPY scripts ./scripts
COPY cmd/desktop/wails.json ./cmd/desktop/wails.json
COPY tsconfig.json ./
ARG FEATURE_LICENSE=false
ARG FEATURE_UPDATER=false
RUN pnpm install --frozen-lockfile
RUN FEATURE_LICENSE=${FEATURE_LICENSE} FEATURE_UPDATER=${FEATURE_UPDATER} pnpm --filter @unicore/web build

FROM go-toolchain AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/apps/web/static ./apps/web/static
ARG VERSION=0.1.0
ARG COMMIT=dev
ARG BUILD_TIME=unknown
ARG FEATURE_LICENSE=false
ARG FEATURE_UPDATER=false
RUN case "$FEATURE_LICENSE,$FEATURE_UPDATER" in true,true) tags='license,updater';; true,false) tags='license';; false,true) tags='updater';; false,false) tags='';; *) exit 1;; esac && CGO_ENABLED=0 go build -trimpath -tags "$tags" -ldflags "-s -w -X github.com/yunnuo/unicore/internal/buildinfo.Version=${VERSION} -X github.com/yunnuo/unicore/internal/buildinfo.Commit=${COMMIT} -X github.com/yunnuo/unicore/internal/buildinfo.BuildTime=${BUILD_TIME}" -o /server ./cmd/server && mkdir /data && chmod 700 /data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /server /server
COPY --from=backend --chown=65532:65532 /data /data
ENV APP_LISTEN=0.0.0.0:8080 APP_DEPLOYMENT_KIND=docker APP_DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["/server"]
