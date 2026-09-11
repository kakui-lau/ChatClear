<p align="center">
  <img src="./public/chatclear-logo.png" width="112" height="112" alt="ChatClear logo">
</p>

<h1 align="center">ChatClear</h1>

<p align="center">
  A local-first, safety-focused desktop utility for organizing Telegram groups and channels.
</p>

<p align="center">
  <a href="https://github.com/kakui-lau/ChatClear/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/kakui-lau/ChatClear/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/kakui-lau/ChatClear/releases"><img alt="Release" src="https://img.shields.io/github/v/release/kakui-lau/ChatClear?include_prereleases"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-1f6f57">
</p>

<p align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

ChatClear uses Telegram's official TDLib to synchronize group and channel metadata so you can filter, protect, and organize conversations in batches. It does not read message bodies. API credentials, Telegram sessions, preferences, and activity records remain on your computer.

> ChatClear is an unofficial Telegram client utility. It is not affiliated with, endorsed by, or sponsored by Telegram. You are responsible for complying with the Telegram API Terms of Service and applicable laws.

## Download

Download the latest prerelease from [GitHub Releases](https://github.com/kakui-lau/ChatClear/releases).

| Platform | Architecture          | Package          | Notes                          |
| -------- | --------------------- | ---------------- | ------------------------------ |
| macOS    | Apple Silicon / arm64 | `.dmg` or `.zip` | For M1 and newer Apple chips   |
| Windows  | x64                   | `.exe`           | NSIS installer                 |
| Linux    | x64                   | `.AppImage`      | Make the file executable first |

The public builds are not yet signed with an Apple Developer ID, notarized by Apple, or signed with Windows Authenticode. macOS packages receive a complete ad-hoc signature, but the operating system may still report an unidentified developer. Windows may display a SmartScreen warning. Download packages only from this repository's Releases page and verify checksums before installation. Production distribution should use platform signing and notarization.

If macOS blocks the first launch, open System Settings → Privacy & Security, confirm the application name, and choose Open Anyway. Never bypass platform security for packages from an unknown source or with a mismatched checksum.

## Features

### Precise filtering

- Combine multiple include and exclude keywords separated by commas
- Filter by group or channel, main list or archive, and owner, administrator, or member role
- Filter by member count, recent activity, and watchlist status
- Save reusable filter presets and select conversations inactive for 90 days with one click

### Safer batch operations

- Archive, unarchive, mute, clear your local chat history, or leave groups in batches
- Conversations you own are always locked; administrator conversations can be protected by default
- Local allowlist protection and a seven-day watchlist
- Destructive actions require an exact confirmation phrase
- Sequential execution, Telegram rate-limit waiting, safe pause, task resume, and failed-item retry

### Local-first storage

- Does not read or display message bodies
- Does not upload Telegram sessions or provide cloud account custody
- Encrypts API credentials, proxy passwords, and TDLib database keys with AES-256-GCM and a random local key without invoking the system keychain
- Keeps a local audit trail and supports CSV export with spreadsheet-formula injection protection
- Preference backups contain settings, filter presets, allowlists, and watchlists only
- Manages up to ten local accounts, each with an isolated TDLib data directory and database key

### Desktop experience

- Simplified Chinese and English
- Light, dark, and system themes
- Fixed application frame and a single list scroller for large group collections
- Keyboard focus, skip-link, and reduced-motion support
- Update checks at startup and a direct GitHub Release download entry
- Optional crash reporting, disabled by default

## Quick start

1. Download the package for your operating system from Releases and launch ChatClear.
2. Sign in to [my.telegram.org/apps](https://my.telegram.org/apps), create a Telegram API application, and obtain an `api_id` and `api_hash`.
3. Enter your own credentials on ChatClear's first-run screen. Developer credentials are never bundled or shared by the application.
4. Enter a phone number with its country or region code, such as `+14155552671`.
5. Retrieve the verification code from an official Telegram client and complete two-step or email verification if requested.
6. If your network cannot reach Telegram, configure a SOCKS5 or HTTP CONNECT proxy in Connection Settings.

After signing in, narrow the list with filters, allowlists, and the watchlist before reviewing selected conversations. Leaving a private group may be irreversible, so prefer archiving or observing it first.

## Data and privacy

ChatClear retrieves only the metadata needed to organize the list: conversation name, type, member count, current-account role, archive and mute status, and recent activity time.

Preference backups never contain:

- `api_id`, `api_hash`, or proxy authentication details
- Telegram sessions or TDLib database keys
- Phone numbers, verification codes, or two-step verification passwords
- Local activity history, failed tasks, or unfinished tasks

Local application data is normally stored in:

- macOS: `~/Library/Application Support/chatclear`
- Windows: `%APPDATA%\chatclear`
- Linux: `$XDG_CONFIG_HOME/chatclear` or `~/.config/chatclear`

See [PRIVACY.md](./PRIVACY.md) and [SECURITY.md](./SECURITY.md) for details.

## Architecture

```text
React Renderer
      │ allowlisted IPC only
Electron Preload
      │ contextIsolation + sandbox
Electron Main Process
      ├── encrypted local file storage
      ├── local preferences and audit records
      └── tdl / Telegram TDLib
```

The local master key and encrypted data both reside in the current system user's application-data directory. File permissions are restricted to that user where supported. This design avoids macOS keychain authorization dialogs and prevents plaintext credentials from being written to disk, but it is not equivalent to an operating-system keychain: malware that can read the user's application-data directory may obtain both the key and ciphertext.

When upgrading from 0.3.1 or earlier to 0.3.2, ChatClear does not access legacy keychain-protected data. You must enter the connection settings and sign in to Telegram once more. Legacy session files are preserved but are not loaded by the new version.

Networking, authentication, batch operations, file import and export, and system capabilities run in the Electron main process. The renderer cannot access Node.js, plaintext credentials, or TDLib sessions.

## Local development

Requirements:

- Node.js 24
- pnpm 11
- A macOS, Windows, or Linux desktop environment

```bash
git clone https://github.com/kakui-lau/ChatClear.git
cd ChatClear
pnpm install --frozen-lockfile
pnpm dev
```

Quality checks and packaging:

```bash
pnpm check
pnpm package
pnpm dist -- --mac --arm64
pnpm dist -- --win --x64
pnpm dist -- --linux --x64
```

`pnpm check` runs ESLint, Prettier, TypeScript, Vitest, and a production build. Never commit `.env` files, user sessions, verification codes, two-step verification passwords, or Telegram API credentials.

## Cross-platform releases

The [release workflow](./.github/workflows/release.yml) builds macOS arm64, Windows x64, and Linux x64 packages in parallel whenever a `v*` tag is pushed, then uploads them to one GitHub Release. A manual workflow run creates build artifacts without publishing a Release.

Production signing requires these GitHub Secrets:

| Platform        | Secrets                                                    |
| --------------- | ---------------------------------------------------------- |
| macOS signing   | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`                     |
| macOS notarize  | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows signing | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     |

Release steps:

```bash
pnpm check
git tag v0.3.2
git push origin v0.3.2
```

Without signing secrets, the workflow still produces prerelease test packages. Do not describe those artifacts as signed builds.

## Project documentation

- [Changelog](./CHANGELOG.md)
- [Privacy notice](./PRIVACY.md)
- [Security policy](./SECURITY.md)
- [Acceptance record](./ACCEPTANCE.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)
- [Contributing guide](./CONTRIBUTING.md)
- [Brand guide](./docs/BRAND.md)

## Contact and support

- Telegram: [@tg_kakui](https://t.me/tg_kakui)
- Issues: [Report a problem or suggest a feature](https://github.com/kakui-lau/ChatClear/issues)
- Sponsor address: `0x435d2f7f70c220e4218adfa090da964928888888`

Before transferring funds, verify the blockchain network, asset, and address. On-chain transactions are generally irreversible.

## Telegram API terms

Use, modification, and distribution of this project are subject to the [Telegram API Terms of Service](https://core.telegram.org/api/terms). The application name, icon, and description must not imply that ChatClear is an official Telegram product.
