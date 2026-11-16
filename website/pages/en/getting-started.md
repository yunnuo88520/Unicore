<!-- Author: yunnuo <ymz@ebox.vip> -->
# Get started

Unicore is an application framework with an optional notes demo. Create your own project and choose the modules you need, or run the demo below to explore the framework.

## Choose a product form

| Form | Carrier / profile | Accounts and database |
| --- | --- | --- |
| Platform | Web / `web-platform` | Unified accounts, multiple roles, shared sessions; SQLite, PostgreSQL, or MySQL |
| Standalone | Web / `web-standalone` | No platform accounts; SQLite, PostgreSQL, or MySQL |
| Standalone | Native desktop / `desktop` | The same local business features; SQLite initialized automatically |
| CLI | Command line / `cli` | Calls Core directly; no UI or persistent state of its own |

Web installations choose a profile in the installation wizard; it cannot change after installation. Standalone Web listens locally by default and needs an external authentication or access control layer for remote use.

## Prepare your environment

Install Go 1.26.11+, Node.js 22.22.2+ (other supported versions are listed in the root `package.json` engines), pnpm 11.25.0, Git, Make, and ripgrep. Windows developers can use WSL2 for Web and CLI; native desktop development requires the target OS and [Wails dependencies](https://wails.io/docs/gettingstarted/installation).

```sh
git clone https://github.com/yunnuo88520/Unicore.git
cd Unicore
make install
make doctor
```

## Run the sample

Start the backend from the repository root:

```sh
make dev-server
```

In a second terminal, enter the same directory and run:

```sh
make dev-web
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), or the address printed by Vite if that port is busy.

1. Enter the installation wizard at `/install`. Read the one-time token from `data/bootstrap.token` and paste it into the wizard.
2. Select **Platform** and **SQLite** for a local trial without an external database.
3. Enter your site details and create your administrator account with your own password. There are no default credentials.
4. Complete installation, sign in, open “My notes,” and create a note with an attachment.
5. Refresh the page, then restart the development processes to confirm the note persists.

Keep the complete `data/` directory: it contains the database, private configuration, files, and keys. Normal restarts do not require installation again.

::: warning Database initialization
Use a new, dedicated database for a trial. Clearing a nonempty database requires explicit confirmation and the exact database name. Never use an existing business database for a trial.
:::

The user entry is `/login`; administration defaults to `/admin` and can be configured during installation. Both workspaces share accounts, passwords, and sessions. Roles determine access to administration.

## Create your application

From a clean framework checkout, choose a destination outside the repository that does not already exist:

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp --repository https://github.com/team/my-app
cd ../my-app
make install
make docs
make doctor
make dev-server
# In a second terminal, inside my-app: make dev-web
```

Replace the example identity and repository with your own. The creator initializes an independent Git repository and an upstream reference; it does not create a hosted repository or push code. Continue with [application development (中文)](../../../docs/product/development.md) and the [first feature tutorial (中文)](../../../docs/product/first-feature.md).

## Trim the demo

After creating your project, build without the notes business module:

```sh
FEATURE_NOTES=false make build-web
```

This omits notes business code, APIs, permissions, navigation, and page bundles. New databases skip notes migrations; existing databases retain notes data and migration history. In development, set the same flag for both `make dev-server` and `make dev-web`. See [feature trimming (中文)](../../../docs/product/features.md) for optional updates and permanent source removal.

## Build or install

```sh
make docs
make test
make build-web build-cli
make dev-cli ARGS='execute --text "Hello Unicore"'
```

Web and CLI packages are separate products even though both use the default executable name `unicore`. The CLI sample performs stateless text analysis and does not read notes. Web packages include server and offline maintenance subcommands.

For prebuilt packages, select your OS and architecture from [Releases](https://github.com/yunnuo88520/Unicore/releases). macOS desktop uses a DMG, Windows an EXE, and Linux desktop a tar archive. Read [desktop and CLI installation (中文)](../../../docs/product/install-desktop.md) and [source builds (中文)](../../../docs/product/build.md).

For a server or NAS, follow [Web deployment (中文)](../../../docs/product/deployment.md) for Docker, Compose, or tar/systemd, including persistent storage, HTTPS, and first installation. Preserve your data and keys with [backup and restore (中文)](../../../docs/product/backup.md) before [updating (中文)](../../../docs/product/updates.md).

Unicore is a development preview. See the matching release notes and [support policy (中文)](../../../docs/support.md) for compatibility and deployment limits.
