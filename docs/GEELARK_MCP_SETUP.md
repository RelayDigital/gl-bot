# GeeLark MCP for GL Bot

This repository includes a project-scoped Claude Code MCP configuration in `/.mcp.json`. It launches GeeLark's **official** CLI MCP server, pinned to `geelark-cli@1.0.30`.

The configuration contains **no secrets**. It is an MCP client setup, not a production deployment or Switchboard backend integration.

## One-time setup on the machine that runs the MCP client

1. Install Node.js 20+ and make sure `node` and `npx` work in your terminal.
2. Open the GeeLark desktop app and go to **GeeHub → API → MCP**. Verify **API Connection** is **Active** and the account plan supports API access (Base or Pro). Find the bearer token there.
3. Run this **in a local terminal**:

   ```bash
   npx -y geelark-cli@1.0.30 config init
   ```

   Enter the token only in the local prompt. Do not paste it into chat, commit it, place it in CI logs, or put it in `.mcp.json`.
4. Verify authentication and list devices (read-only):

   ```bash
   npx -y geelark-cli@1.0.30 auth status
   npx -y geelark-cli@1.0.30 phone list --page 1 --page-size 10
   ```

5. Pull this PR's branch locally, open the `gl-bot` repository in **Claude Code**, approve its project MCP configuration if prompted, and restart the client if required. Ask Claude to **list GeeLark cloud phones only**. Compare the count with GeeLark's UI. In Claude Code, `/mcp` should show `geelark` connected.

## Codex alternative (macOS/Linux)

Codex does not automatically consume Claude's `.mcp.json`. Add the following to `~/.codex/config.toml` (without a token; it uses the locally initialized CLI configuration):

```toml
[mcp_servers.geelark]
command = "npx"
args = ["-y", "geelark-cli@1.0.30", "mcp"]
```

For Windows, follow the official GeeLark MCP setup guide and use `cmd.exe` as the command wrapper for `npx`.

## Security and operations

- Keep credentials under local user control. Never commit `~/.geelark/config.json` or copy bearer tokens into shared files.
- Start with read-only inventory/status checks. Changes to profiles, proxies, apps and automation jobs should be explicitly scoped and reviewed.
- GeeLark cloud phones can keep consuming paid minutes after an API-initiated start. Stop phones started for temporary tasks and verify their final state.
- This is a **local stdio MCP server**. It does not directly install a ChatGPT plugin, expose a public HTTP endpoint, or make GeeLark tools available on Switchboard automatically.
- Troubleshoot Node.js/npx installation, GeeHub API Connection status, token validity, the same user account running the MCP client, and server logs. Avoid sharing logs with secrets.

Official sources:
- https://github.com/GeeLark/geelark-cli#use-as-mcp-server
- https://www.geelark.com/blog/geelark-mcp/
