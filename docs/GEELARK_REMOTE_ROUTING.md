# GeeLark MCP: Private Remote Routing

**Architecture:** official `geelark-cli@1.0.30 mcp` (stdio) runs on an always-on host such as Duro's Mac mini. OpenAI Secure MCP Tunnel routes outbound-only to ChatGPT without exposing an internet-facing MCP service or opening inbound ports.

**Why not Vercel:** the official GeeLark MCP is a local stdio server; a Vercel serverless request is not a durable local MCP host. GeeLark browser tooling also defaults to the machine-local endpoint `localhost:40185`, which a Vercel function cannot access.

## Setup on the MCP host

1. Install Node.js/npm/npx and use the GeeLark account that has API access.
2. Run `npx -y geelark-cli@1.0.30 config init` and enter the GeeLark API token **interactively on the Mac mini**. Do not store it in GitHub, logs, Slack, or chat.
3. In [OpenAI Platform tunnels](https://platform.openai.com/), create a private tunnel, associate its Platform organization with the intended ChatGPT workspace, and configure a restricted runtime key (Tunnels Read + Use). Download the official `tunnel-client` for the host. Run `tunnel-client help quickstart` to confirm supported flags.
4. Supply `CONTROL_PLANE_API_KEY` securely from the host's secret manager and initialize the tunnel:

```bash
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile geelark-stdio \
  --tunnel-id 'YOUR_TUNNEL_ID' \
  --mcp-command 'npx -y geelark-cli@1.0.30 mcp'
```

5. Run `bash scripts/geelark-tunnel-preflight.sh`, then `tunnel-client run --profile geelark-stdio` on an always-on managed process. Ensure restart and reboot behavior are configured before production use.
6. In ChatGPT web, choose **Plugins → + → Add custom MCP server → Tunnel**, select or enter the tunnel ID, authenticate and review permissions, create the plugin, and test an **inventory-only** GeeLark tool call.

**Security:** Restrict high-risk tools such as shell execution, proxy changes, account changes, device deletion, and paid phone starts. Do not publish a Vercel endpoint containing GeeLark credentials or weaken Vercel Deployment Protection.

**Existing infrastructure:** The Relay Digital Vercel project `gl-bot` has encrypted environment-variable names including `GEELARK_API_TOKEN`, but its linked Git repository is `relaydigitalyyc-coder/nova-automation`, not `RelayDigital/gl-bot`. Do not overwrite or retarget that live project. Its Vercel secrets are not automatically available to the Mac mini.

**Evidence required to call connected:** CLI auth succeeded; cloud-phone list succeeded; tunnel doctor passed; tunnel active; ChatGPT plugin discovered tools; read-only inventory matched GeeLark UI.

References: https://github.com/GeeLark/geelark-cli ; https://developers.openai.com/api/docs/guides/secure-mcp-tunnels ; https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
