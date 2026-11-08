# Local GitLens fork

This fork grants local Pro feature access immediately. It has no GitKraken account, check-in, license refresh, organization policy, cloud notification inbox, or telemetry exporter.

## Development

Use `nvm use` to select the Node version in `.nvmrc`. Corepack uses the pnpm version pinned in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm run build`. Webview changes also require `pnpm run benchmark:graph:bundle`.

## AI and integrations

Choose a provider and model in GitLens Settings. Ollama connects to the configured local server. OpenAI-compatible and other supported providers use the user's own endpoint and credentials. Credentials are stored in VS Code SecretStorage. GitKraken AI, its usage allowance, and credit purchase features have been removed.

Hosting and issue integrations authenticate directly through an available VS Code authentication provider or an access token. Native credentials are checked silently against their original VS Code account before reuse, so sign-out and token rotation are respected. Self-managed connections prompt for a server URL. Trello also requires its application key. Jira Cloud accepts an OAuth access token for the existing Atlassian API integration. Each platform still enforces its own scopes and token expiration. Browser support depends on that platform's cross-origin API policy.

Launchpad pins and snoozed items are stored locally. Local patches can be copied and applied through the clipboard. Local VS Code workspaces and repository operations remain available. Cloud Patches, cloud workspaces, organization sharing, and the official notification inbox are removed.

CLI agents are detected locally on PATH without running an installer. The bundled GitKraken MCP service and automatic CLI installation/update are removed. Local IPC session tracking remains available without a GitKraken CLI; CLI-backed session reads run only when `gitlens.gitkraken.cli.localPath` is explicitly configured. Third-party agent authentication remains the responsibility of the chosen agent.

Repository and file sharing use direct editor deep links rather than an official web redirect.
