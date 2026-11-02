<!-- Author: yunnuo <ymz@ebox.vip> -->
# Get started

Unicore shares Go domain logic and use cases across HTTP, Wails, and Cobra entry points, with React UI shared by the graphical profiles. It is currently a development preview.

## Choose a profile

| Profile | Use | Database and identity |
| --- | --- | --- |
| `web-platform` | Applications with multiple users | SQLite, PostgreSQL, or MySQL; separate administrator and user identities |
| `web-standalone` | Local tools for one user | The same database choices; no platform identity; keep access local |
| `desktop` | Native Wails v2 applications | Local SQLite; no platform identity |
| `cli` | Commands and scripts calling Core | No HTTP, Wails, database, or platform identity dependencies |

## Run from source

Install Go 1.26.10+, a Node version satisfying the root `package.json` engines, pnpm 11.25.0, Git, and ripgrep. Native desktop builds also require Wails and the target OS dependencies.

```sh
git clone https://github.com/yunnuo88520/Unicore.git
cd Unicore
make install
make doctor
make dev-server
# In a second terminal:
make dev-web
```

Open the frontend address printed by Vite and visit `/install` on the first Web launch. Use a dedicated database you own. The one-time installation token is in the server's private `bootstrap.token` file. Installation initializes the selected target, so use an isolated environment for trials.

For packaged downloads, use [GitHub Releases](https://github.com/yunnuo88520/Unicore/releases) and the matching tag's instructions. macOS uses a DMG, Windows a standalone EXE, and Linux desktop a tar archive. Web and CLI archives have different entry points; see [builds (中文)](../../../docs/product/build.md).

## Create your application

```sh
pnpm create:project --directory ../MyApp --name MyApp --slug myapp --module github.com/team/myapp --bundle com.example.myapp --repository https://github.com/team/myapp
cd ../MyApp
make install
make docs
make doctor
```

Replace the example identity and repository with your own. The creator initializes a local Git baseline and a read-only upstream reference; it does not create a hosted repository or push code. Read [application development (中文)](../../../docs/product/development.md) for product identity, framework updates, and business extensions.

## Make and verify changes

Edit `packages/contracts/openapi.json` before changing API DTOs, then run `pnpm generate`. Keep domain logic independent of transports and databases. Add business use cases through ports, and reuse the existing frontend layout, forms, client, and Chinese/English messages.

```sh
make docs
make test
make build-web build-cli
```

Run the builds and tests relevant to your profile. A successful build does not establish native GUI behavior, all database compatibility, or production readiness. Consult [support (中文)](../../../docs/support.md), [deployment (中文)](../../../docs/product/deployment.md), [backup (中文)](../../../docs/product/backup.md), and [updates (中文)](../../../docs/product/updates.md).
