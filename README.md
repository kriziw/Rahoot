<p align="center">
  <img width="450" height="120" src="https://raw.githubusercontent.com/kriziw/MindBuzz/main/.github/logo.svg" alt="MindBuzz logo">
</p>

<p align="center">
  <img alt="Visitor Badge" src="https://api.visitorbadge.io/api/visitors?path=https://github.com/kriziw/MindBuzz/edit/main/README.md&countColor=%2337d67a">
  <img src="https://img.shields.io/docker/pulls/kriziw/mindbuzz?style=for-the-badge&color=37d67a" alt="Docker Pulls">
</p>

MindBuzz is a self-hosted quiz platform for classrooms, team sessions, events, and internal training. This repository is an enhanced fork of the original [Ralex91/Rahoot](https://github.com/Ralex91/Rahoot), expanding the manager experience with richer quiz administration, run history, exports, settings, media support, and mobile reconnect improvements.

Public documentation is available at [kriziw.github.io/mindbuzz](https://kriziw.github.io/mindbuzz/).

Original credit belongs to [Ralex91](https://github.com/Ralex91) for the original Rahoot project and foundation.

> Warning: the project is still under active development. If you hit bugs or have feature ideas, please open an [issue](https://github.com/kriziw/MindBuzz/issues).

## AI-Assisted Development

MindBuzz is developed with AI assistance for parts of implementation, refactoring, UI copy, documentation, and release preparation. All AI-assisted changes are reviewed and approved by a human maintainer before they are merged, but the project intentionally discloses that AI tooling is part of the development workflow.

## Why This Fork Exists

The original project is a great lightweight self-hosted Kahoot-style game. This fork keeps that spirit, but pushes the admin side much further so you can manage quizzes and review results without constantly dropping into JSON files by hand.

## What's Added In This Version

- Manager dashboard with quiz creation, editing, deletion, and launch
- In-browser quiz editor for question text, answers, single or multiple correct answers, timers, and optional media
- SQLite-backed manager accounts with `admin` and `manager` roles
- First-run bootstrap flow for creating the initial admin account
- SQLite-backed run history for completed games
- CSV export for the current run and retrospective exports from history
- Per-manager settings and password management
- Admin-only manager account management for creating, disabling, and resetting manager accounts
- Optional generic OpenID Connect (OIDC) / OAuth2 SSO for manager sign-in
- Support for remote audio URLs and local audio uploads stored in `media/`
- Improved manager session persistence and explicit logout flow
- One active game per manager account with explicit take over from another session
- Better mobile reconnect recovery for players after app switching or screen lock
- Published Docker image and release automation for easier deployments

## Core Features

- Self-hosted multiplayer quiz sessions
- Host / manager interface plus player join flow by room code
- Manager-owned quizzes, settings, and history stored in SQLite at `config/history.db`
- Optional dual-path manager authentication with local login or SSO
- Optional image, video, and audio per question
- Global fallback audio when a question does not define its own audio
- Docker-first deployment with persistent config and media volumes

## Requirements

Choose one setup path:

- Docker and Docker Compose
- Node.js 24+ and PNPM

## Quick Start

### Docker Compose

The simplest way to run MindBuzz is with Docker Compose:

```bash
docker compose up -d
```

The app will be available at [http://localhost:3000](http://localhost:3000).

The repository `compose.yml` uses the published Docker Hub image:

- `kriziw/mindbuzz:latest`

It mounts:

- `./config:/app/config`
- `./media:/app/media`

Those folders persist:

- the main SQLite application database
- legacy migration files in `config/`
- quiz run history
- uploaded local media

### Docker Run

```bash
docker run -d \
  -p 3000:3000 \
  -v ./config:/app/config \
  -v ./media:/app/media \
  kriziw/mindbuzz:latest
```

### Local Development

```bash
git clone https://github.com/kriziw/MindBuzz.git
cd MindBuzz
pnpm install
pnpm run dev
```

For a production build:

```bash
pnpm run build
pnpm start
```

### Build From Source With Docker

```bash
git clone https://github.com/kriziw/MindBuzz.git
cd MindBuzz
docker build -t kriziw/mindbuzz:local .
docker run -d \
  -p 3000:3000 \
  -v ./config:/app/config \
  -v ./media:/app/media \
  kriziw/mindbuzz:local
```

## How To Use

1. Open [http://localhost:3000/manager](http://localhost:3000/manager)
2. On a fresh install, create the initial admin account
3. Sign in with your manager account
   You can use either local credentials or SSO when SSO is enabled and configured.
4. Create, edit, delete, or launch a quiz
5. Share the main app URL and room code with players
6. Run the quiz
7. Download current results or revisit them later from the history view

## Data Layout

MindBuzz stores its runtime data in a few simple locations.

### `config/history.db`

This SQLite database stores:

- manager accounts
- per-manager settings
- quizzes
- completed quiz runs

Fresh installs create the initial admin account through the `/manager` setup flow.

Existing installs are automatically migrated on first startup after upgrade:

- the legacy manager password becomes the `admin` account password
- existing quizzes, history, and settings are assigned to that `admin` account

### `config/game.json`

Legacy migration source:

```json
{
  "managerPassword": "PASSWORD",
  "defaultAudio": "/media/example.mp3"
}
```

Fields:

- `managerPassword`: used only for one-time migration from older installs
- `defaultAudio`: legacy fallback audio value imported into the first migrated admin account

### `config/auth.json`

MindBuzz stores OIDC provider settings in a file-backed auth config so you can
recover from a bad SSO setup without editing the database.

This file is managed from the admin UI at `/manager` -> `SSO`.

Example:

```json
{
  "oidc": {
    "enabled": true,
    "autoProvisionEnabled": true,
    "discoveryUrl": "https://id.example.com/application/o/mindbuzz/.well-known/openid-configuration",
    "clientId": "mindbuzz",
    "clientSecret": "replace-me",
    "scopes": ["openid", "profile", "email"],
    "roleClaimPath": "groups",
    "adminRoleValues": ["mindbuzz-admin"],
    "managerRoleValues": ["mindbuzz-manager"]
  }
}
```

Fields:

- `enabled`: shows the `Sign in with SSO` option on the manager page
- `autoProvisionEnabled`: allows the identity provider to create users automatically on first login
- `discoveryUrl`: provider OpenID configuration URL
- `clientId`: OIDC client identifier
- `clientSecret`: OIDC client secret
- `scopes`: requested scopes, typically `openid`, `profile`, `email`
- `roleClaimPath`: dotted claim path used for role mapping, such as `groups`
- `adminRoleValues`: claim values that map to the local `admin` role
- `managerRoleValues`: claim values that map to the local `manager` role

### `config/quizz/*.json`

Legacy quiz definitions live in `config/quizz/`.

Example:

```json
{
  "subject": "Example Quiz",
  "questions": [
    {
      "question": "What is the correct answer?",
      "answers": ["No", "Yes", "No", "No"],
      "image": "https://images.unsplash.com/....",
      "solutions": [1],
      "cooldown": 5,
      "time": 15
    }
  ]
}
```

Question fields:

- `question`: question text
- `answers`: 2 to 4 possible answers
- `image`: optional image URL
- `video`: optional video URL
- `audio`: optional audio URL
- `solutions`: zero-based indexes of the correct answers. Players still choose one answer, and any listed correct answer counts as correct.
- `cooldown`: delay before answers are shown
- `time`: answer timer in seconds

### `media/`

Manager-uploaded local audio files are stored here and served by the app at `/media/<filename>`.

## Manager Capabilities

The manager UI now covers much more than starting a game:

- authenticate into the admin dashboard
- create the initial admin account on a fresh install
- create new quizzes
- edit existing quizzes from the browser
- delete quizzes
- launch quiz sessions
- review historic runs
- export detailed CSV results
- update the current account password
- set a default audio track by URL or upload a local file
- see the current active game and take over control from another session if needed
- create and manage non-admin manager accounts when signed in as an admin
- configure OIDC / SSO entirely from the admin UI while still persisting it to `config/auth.json`

## SSO / OIDC

MindBuzz supports a generic OpenID Connect provider, including self-hosted
providers like Authentik.

### Authentication model

- the first admin account is always created locally
- local username/password login remains available
- SSO is optional and can be enabled later by an admin
- once enabled, the manager login page offers either local login or `Sign in with SSO`

### Role mapping

MindBuzz keeps application authorization local, but it can map roles from your
identity provider at login time.

Example:

- `roleClaimPath`: `groups`
- `adminRoleValues`: `mindbuzz-admin`
- `managerRoleValues`: `mindbuzz-manager`

Behavior:

- if the configured claim contains an admin role value, the user becomes a local `admin`
- otherwise, if it contains a manager role value, the user becomes a local `manager`
- if neither matches, sign-in is denied

If `autoProvisionEnabled` is on, a matching SSO user can be created
automatically on first login. If it is off, only already-linked users can sign
in through SSO.

### Redirect URI

Configure your identity provider to use:

- `https://your-domain.example/auth/oidc/callback`

For local development, the equivalent route is:

- `http://localhost:3000/auth/oidc/callback`

### Recovery and fallback

- the SSO configuration is written to `config/auth.json`, not hidden only in the database
- local admin login remains the break-glass fallback if your provider or mapping is misconfigured
- if needed, you can disable or repair SSO by editing `config/auth.json` directly
- disabling a local manager account still blocks access even if the identity provider grants a valid role

## Releases

MindBuzz uses automated release management on `main`:

- merge commits should follow Conventional Commits, such as `feat:`, `fix:`, or `feat!:`
- pull request titles are validated against the same Conventional Commit format
- Release Please keeps a release PR up to date with the next version and changelog
- merging that release PR creates the GitHub release and triggers Docker publishing
- the Docker release workflow publishes:
  - the full version, for example `1.6.0`
  - the major/minor line, for example `1.6`
  - `latest`

The release workflow expects these repository secrets:

- `RELEASE_PLEASE_TOKEN`
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Repository setup note:

- enable `Allow GitHub Actions to create and approve pull requests` in the repository Actions settings

## Contributing

1. Fork the repository
2. Create a branch
3. Make your changes
4. Open a pull request

For bugs or feature requests, use [GitHub Issues](https://github.com/kriziw/MindBuzz/issues).

## Attribution

This repository builds on the original [Ralex91/Rahoot](https://github.com/Ralex91/Rahoot) project. If you are evaluating MindBuzz for the first time, please consider checking out the upstream project and giving credit to the original work as well.

## Star History

<a href="https://www.star-history.com/?repos=kriziw%2FMindBuzz&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=kriziw/MindBuzz&type=date&theme=dark&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=kriziw/MindBuzz&type=date&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=kriziw/MindBuzz&type=date&legend=bottom-right" />
 </picture>
</a>

