# Author: yunnuo <ymz@ebox.vip>
ARG GO_IMAGE=golang:1.26.11-bookworm
ARG NODE_IMAGE=node:22-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/static-debian12:nonroot
FROM ${GO_IMAGE} AS go-toolchain

FROM ${NODE_IMAGE} AS frontend
COPY --from=go-toolchain /usr/local/go/bin/gofmt /usr/local/bin/gofmt
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# The identity chain validates and projects the whole repository (go.mod, Makefile, deploy, docs),
# so the frontend stage receives the full source just like the backend stage.
COPY . .
ARG FEATURE_LICENSE=false
ARG FEATURE_UPDATER=true
ARG FEATURE_NOTES=true
RUN FEATURE_LICENSE=${FEATURE_LICENSE} FEATURE_UPDATER=${FEATURE_UPDATER} FEATURE_NOTES=${FEATURE_NOTES} pnpm --filter @unicore/web build
RUN FEATURE_LICENSE=${FEATURE_LICENSE} FEATURE_UPDATER=${FEATURE_UPDATER} FEATURE_NOTES=${FEATURE_NOTES} node scripts/build-features.mjs --tags > /tmp/build-tags.txt

FROM go-toolchain AS backend
WORKDIR /src
COPY go.mod go.sum ./
ARG GOPROXY=https://proxy.golang.org,direct
RUN GOPROXY=${GOPROXY} go mod download
COPY . .
COPY --from=frontend /src/apps/web/static ./apps/web/static
ARG VERSION
ARG COMMIT=dev
ARG BUILD_TIME=unknown
ARG FEATURE_LICENSE=false
ARG FEATURE_UPDATER=true
ARG FEATURE_NOTES=true
COPY --from=frontend /tmp/build-tags.txt /tmp/build-tags.txt
RUN test "$VERSION" = "$(cat VERSION)" && tags="$(cat /tmp/build-tags.txt)" && CGO_ENABLED=0 go build -trimpath -tags "$tags" -ldflags "-s -w -X github.com/yunnuo/unicore/internal/buildinfo.Version=${VERSION} -X github.com/yunnuo/unicore/internal/buildinfo.Commit=${COMMIT} -X github.com/yunnuo/unicore/internal/buildinfo.BuildTime=${BUILD_TIME}" -o /server ./cmd/server && mkdir /data && chmod 700 /data

FROM ${RUNTIME_IMAGE}
ARG VERSION
ARG COMMIT=dev
ARG BUILD_TIME=unknown
LABEL org.opencontainers.image.title="Unicore" org.opencontainers.image.version=$VERSION org.opencontainers.image.revision=$COMMIT org.opencontainers.image.created=$BUILD_TIME
COPY --from=backend /server /server
COPY --from=backend --chown=65532:65532 /data /data
ENV APP_LISTEN=0.0.0.0:3000 APP_DEPLOYMENT_KIND=docker APP_DATA_DIR=/data
EXPOSE 3000
ENTRYPOINT ["/server"]
