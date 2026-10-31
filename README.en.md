<!-- Author: yunnuo <ymz@ebox.vip> -->
# Unicore

[简体中文](README.md) · **English**

![Unicore](assets/brand/wordmark.svg)

**One Go Core and one React UI across Web, desktop, and CLI.**

[![Quality and builds](https://github.com/yunnuo88520/Unicore/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yunnuo88520/Unicore/actions/workflows/ci.yml)
[![Dependency security](https://github.com/yunnuo88520/Unicore/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/yunnuo88520/Unicore/actions/workflows/security.yml)
[![MIT](https://img.shields.io/badge/license-MIT-6662ec)](LICENSE)

Unicore is an open-source Go + React application framework for AI-assisted development. Domain logic and use cases are shared, with separate HTTP, Wails, and Cobra composition roots. Installation, identity, settings, file storage, a sample business module, and development documentation provide a runnable and testable starting point.

Author: yunnuo · ymz@ebox.vip · Current version: [VERSION](VERSION) · **Development preview**

[Quick start](#quick-start) · [Create your application](#create-your-application) · [Wiki](https://github.com/yunnuo88520/Unicore/wiki) · [Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md) · [Support](SUPPORT.md) · [Changelog](CHANGELOG.md)

The README and new release notes are available in Chinese and English. Detailed guides currently remain primarily in Chinese. See [support boundaries and known limitations](docs/support.md); start with the [user guide](docs/product/index.md) and consult standards and Skills as needed.

## Choose a profile

| Profile | Intended use | Identity and administration | Database |
| --- | --- | --- | --- |
| `web-platform` | Online applications with multiple users | Separate administrator/user pages, APIs, accounts, and sessions | MySQL / PostgreSQL recommended; SQLite optional |
| `web-standalone` | Self-hosted tools for one user | No accounts, administration, or global settings pages; local appearance only | MySQL / PostgreSQL / SQLite |
| `desktop` | Native Wails v2 applications | No installation wizard, accounts, or platform administration | Local SQLite initialized automatically |
| `cli` | Commands and scripting | Calls the shared Core directly | No HTTP, Wails, or database dependencies |

The platform includes one-time installation, server-enforced permissions, six-digit email verification, SMTP, OIDC, global settings, file metadata, and private signed downloads. Local storage is the default; MinIO / S3 / OSS / COS adapters support configurable limits, multipart uploads, pause, and resume across refreshes or restarts. Local, MinIO, and Alibaba Cloud OSS have been exercised in development; Tencent COS still needs account permissions and real cloud validation. See the [storage guide](docs/03-runbooks/storage.md). Standalone and desktop profiles expose business features and local appearance; branding is configured at build time.

The three database profiles share a personal-notes sample covering domain logic, repositories, migrations, API/native transport, concurrency, and modal forms. The platform also demonstrates attachments by `file_id`; CLI stays database-free. Other foundations include a single OpenAPI contract, shared themes/icons/messages, lifecycle and health checks, offline encrypted backup and restore, AI documentation, and 12 task Skills.

![Platform notes and attachments](docs/images/notes-platform.png)

Platform administration includes searchable, sortable, paginated audit logs with CSV export, and a separate email-template editor with preview and test delivery. See [administration tools](docs/03-runbooks/admin-tools.md). Announcements provide an additional administrator/user business example. Default email content is Chinese and is independent of the UI language.

Graphical profiles share Chinese/English UI switching and a local theme drawer for colors, radius, density, and layout. Preferences persist locally and remain separate from server settings. See [client preferences](docs/03-runbooks/client-preferences.md).

Download development previews and checksums from [GitHub Releases](https://github.com/yunnuo88520/Unicore/releases). On macOS, use the DMG and drag the app into Applications. On Windows, run the EXE directly. Linux desktop uses a tar archive. Web archives include `./unicorehelp`, `./unicore config generate`, and `./unicore --config unicore.json`; first-time setup stays in `/install`. OTA continues to use complete tar release directories. A standalone Windows EXE only checks for updates without the full release directory.

Signed OTA channels and offline release history are implemented; inspect each release's actual signature assets and verification results. Publisher signatures are mandatory for OTA; OS signing/notarization is optional for free distribution. Derived projects currently default to requiring signed OS binaries, so their trust policy needs explicit review. Licensing remains a placeholder, and there is no public container-registry image. See [updates](docs/03-runbooks/updates.md) and [support boundaries](docs/support.md).

## Quick start

Requirements: Go 1.26.10+, Node 22.22.2+ (Node 22 is the CI baseline; see `package.json` engines for other supported series), pnpm 11.25.0, Git, Make, and ripgrep (`rg`). Run `make doctor` to check your environment. Install ripgrep with `brew install ripgrep` on macOS or `sudo apt-get install ripgrep` on Ubuntu/Debian. WSL2 is recommended for Web/CLI development on Windows. Build native Windows desktop applications on Windows with Make, Wails, and WebView2; see [Wails native dependencies](https://wails.io/docs/gettingstarted/installation).

```sh
git clone https://github.com/yunnuo88520/Unicore.git
cd Unicore
make install
make doctor
make dev-server
# In a second terminal, in the same directory:
make dev-web
```

Open `http://127.0.0.1:5173`. On first launch, visit `/install` and read the one-time installation token from the private `data/bootstrap.token` file. Choose the platform or standalone profile. MySQL is the default recommendation; PostgreSQL is also recommended. Create a dedicated database, fill in the connection fields, and test the connection. Explicitly choose SQLite for a quick local trial. Create the administrator in the wizard with your own strong password; the framework ships no account.

Initializing a nonempty database clears its data and requires a backup and exact database-name confirmation. Existing Unicore installations cannot be overwritten. Preserve the database, private directory, and encryption key together; normal restarts restore the installation. The installation token and encryption key serve different purposes. See [installation and deployment](docs/03-runbooks/deployment.md).

```sh
# Build a Web binary with the embedded frontend; open http://127.0.0.1:8080
make build-web
build/bin/server

# CLI needs neither installation nor a running server
make dev-cli ARGS='execute --text "Hello Unicore"'

# Install native dependencies and the Wails CLI matching go.mod first
go install "github.com/wailsapp/wails/v2/cmd/wails@$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v2)"
make dev-desktop
```

Desktop data defaults to `Unicore/desktop` under the OS application-data directory; use `APP_DATA_DIR` for an isolated directory. Web listens on loopback by default. Remote standalone deployments need external authentication or access control.

## Create your application

Run from committed framework source. The destination must not exist and must be outside this repository:

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp
cd ../my-app
git init
make install
make docs
make doctor
make dev-server
# In a second terminal: make dev-web
```

The creator replaces the name, Go module, product slug, and desktop bundle ID, and records the upstream revision. It excludes Git history, instance data, environment files, and build outputs. Edit [tokens.json](assets/theme/tokens.json) for the theme/name and [identity.json](assets/brand/identity.json) for brand identity; builds generate logos, ICO/native icons, and email colors. Replace repository links, support contacts, and security policy in the derived project. See [upstream integration](docs/03-runbooks/framework-upgrade.md).

For isolated development services, configure temporary credentials in [development Compose](deploy/docker/compose.dev.yaml), then run `make dev-deps-up SERVICES='postgres mysql mail'`. Start MinIO separately if needed. `make dev-deps-down` stops services and preserves volumes by default. Never use production databases or real SMTP for automated tests.

## Verification and builds

```sh
make docs                        # Contracts, design assets, and AI context
make test                        # Drift, boundaries, vet/race, TypeScript, frontend tests
pnpm exec playwright install chromium
make build-web && make test-e2e  # Isolated instance; desktop-size and 375px browser checks
make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform
make release                     # Complete Web / CLI tar matrix
make docker-build                # Build locally; does not push
make compose-up                  # Build and start on 127.0.0.1:8088
make build-desktop               # Native build on the target OS
make package-desktop             # Native tar plus DMG on macOS or EXE on Windows
make build-ops                   # Offline encrypted backup/restore tool
```

[VERSION](VERSION) is the only handwritten application version. `make version NEW_VERSION=x.y.z` updates projections and archives bilingual Changelog entries; `pnpm check:release-notes` checks paired notes and README links. Archives go to `build/releases/` with manifests/checksums. Web packages include the operations tool; image tags read the same version. See [release](docs/03-runbooks/release.md), [deployment](docs/03-runbooks/deployment.md), and [backup](docs/03-runbooks/backup.md).

Use CI results for the current commit. Native builds/helper tests do not prove complete GUI upgrades and failure recovery. Verify target systems and deployment environments before release; historical results are not current acceptance evidence.

## Documentation and collaboration

| Task | Entry point (detailed guides currently in Chinese) |
| --- | --- |
| Scope and architecture | [Support](docs/support.md), [architecture](docs/01-architecture/architecture.md) |
| Business modules, APIs, pages, settings | [Notes sample](docs/03-runbooks/business-example.md), [AI workflow](docs/04-ai/development.md), [context map](docs/04-ai/context.gen.md) |
| Theme, branding, storage | [Design system](docs/02-standards/design-system.md), [storage](docs/03-runbooks/storage.md) |
| API and runtime configuration | [Contracts](docs/02-standards/api-contract.md), [runtime](docs/02-standards/runtime.md); set `APP_API_DOCS=true` for `/docs/api` |
| Contributing and feedback | [Contributing](CONTRIBUTING.md), [support](SUPPORT.md), [security](SECURITY.md), [code of conduct](CODE_OF_CONDUCT.md) |
| GitHub maintenance | [Maintainer guide](docs/03-runbooks/open-source.md) |
| Wiki synchronization | [Guide](docs/wiki/README.md); `make wiki` generates locally; `make wiki-publish` publishes only with explicit authorization |

Licensed under [MIT](LICENSE): use, modify, and redistribute while preserving copyright and license notices. Full navigation: [docs/README.md](docs/README.md). Backend extensions follow the [layering/entity standards](docs/02-standards/backend.md); [announcements](docs/03-runbooks/announcements.md) provide a complete administrator/user example.
