# Wallet Setup

Set up a wallet for your agent. OWS is the recommended approach — your agent never sees the private key.

---

## Option A: Open Wallet Standard (Recommended)

[OWS](https://openwallet.sh) is an open standard for local wallet storage with policy-gated signing. The agent signs via a scoped API key — the private key stays encrypted in a local vault and is never exposed.

> **Why OWS?** The agent authenticates with an API token, not a private key. A policy engine restricts which chains the agent can use, and the operator can revoke access instantly. Keys are encrypted at rest with AES-256-GCM and wiped from memory after each signing operation.

### Step 1: Install OWS

```bash
curl -fsSL https://docs.openwallet.sh/install.sh | bash
```

Or install only the SDK you need:

```bash
# Node.js
npm install @open-wallet-standard/core

# Python
pip install open-wallet-standard
```

### Step 2: Create a Wallet

```bash
ows wallet create --name "my-agent"
```

OWS will prompt for a vault password. **You MUST provide a non-empty password.**

- Use a strong password (12+ chars, mix of types) and save it in a password manager alongside the mnemonic.
- An empty password means the vault file is effectively unencrypted — anyone who copies `/data/.ows/wallets/<id>.json` can export the mnemonic without your consent.
- If the agent offers to skip the password "for convenience", refuse. The vault is your only protection if the storage volume is copied or leaks.

**Output:**
```
Created wallet 3198bc9c-...
  eip155:1        0xab16...   m/44'/60'/0'/0/0
  solana:5eykt4   7Kz9...    m/44'/501'/0'/0'
  bip122:0000     bc1q...    m/84'/0'/0'/0/0
  ...
```

> **Save the EVM address (`eip155:1` line) — this is your agent's wallet address; it works on Ethereum, Base, and any EVM chain.

### Step 3: Back Up the Wallet

```bash
ows wallet export --wallet "my-agent"
```

OWS will prompt for the vault password you set in Step 2, then print the 12-word mnemonic. Write it down immediately on paper or save to a password manager.

**What to expect in chat vs CLI:**

- Running `ows wallet export` from a terminal (SSH, `railway run`, `docker exec`) prints the mnemonic **directly to your terminal** — normal and safe, provided the terminal is yours.
- If you ask the agent for your mnemonic via Telegram/chat, the agent *may* show it with a prepended safety warning (because you, the operator, own the wallet). Copy the mnemonic offline immediately and **delete the chat message after copying** — Telegram retains chat history, and a future compromise of your Telegram account would expose anything that remains in it.
- The agent will never reveal the mnemonic to any non-operator recipient. The runtime filter redacts sensitive patterns when the recipient chat_id is not on the operator allowlist.

⚠️ **Never store the mnemonic in plain text on disk, in screenshots, in version control, or in a chat channel you do not control.** Paper or an encrypted password manager is the only acceptable storage.

### Step 4: Define a Policy

Create a policy that restricts your agent to specific chains. Start with Ethereum + Base (primary), expand as needed:

```bash
cat > policy.json << 'EOF'
{
  "id": "agent-policy",
  "name": "Agent: Ethereum + Base",
  "version": 1,
  "created_at": "2026-04-12T00:00:00Z",
  "rules": [
    { "type": "allowed_chains", "chain_ids": ["eip155:1", "eip155:8453"] },
    { "type": "expires_at", "timestamp": "2026-12-31T23:59:59Z" }
  ],
  "action": "deny"
}
EOF
ows policy create --file policy.json
```

> **Primary chains:** Ethereum (`eip155:1`) for NFT & 8004 operations, Base (`eip155:8453`) for x402 payments (USDC).
>
> **Supported chains for ERC-8004 registration:** Ethereum (`1`), Base (`8453`), Shape (`360`), Polygon (`137`), Arbitrum (`42161`), OP Mainnet (`10`), Avalanche (`43114`), BNB Chain (`56`), Celo (`42220`), Gnosis (`100`), Scroll (`534352`), Linea (`59144`), Mantle (`5000`), Metis (`1088`), Abstract (`2741`), Monad (`10143`). Add chain IDs to `allowed_chains` as your agent needs them.

### Step 5: Create an API Key

```bash
ows key create --name "agent" --wallet my-agent --policy agent-policy
```

**Output:**
```
ows_key_a1b2c3d4...  (shown once — save this)
```

> **This is the token your agent uses to sign.** The agent passes this token where a passphrase would go. OWS evaluates all attached policies before signing — if a policy denies the request, the signature is refused.

### Step 6: Fund the Wallet

Deposit ETH on Ethereum (for gas) and USDC on Base (for x402 payments):

```bash
# Ethereum (gas for 8004 operations)
ows fund deposit --wallet my-agent --chain ethereum

# Base (x402 payments — most platforms use Base for USDC)
ows fund deposit --wallet my-agent --chain base
```

Check balance:

```bash
ows fund balance --wallet my-agent --chain ethereum
ows fund balance --wallet my-agent --chain base
```

> **x402 payments:** Base is the recommended chain for x402 (USDC) across the ecosystem. Most platforms (Cobbee, Supermission, etc.) use Base for agent payments.

### Signing with OWS

**CLI:**
```bash
# Sign a message (SIWA authentication)
OWS_PASSPHRASE="ows_key_a1b2c3d4..." \
  ows sign message --wallet my-agent --chain ethereum --message "$SIWA_MESSAGE"
```

**Node.js:**
```javascript
import { signMessage } from "@open-wallet-standard/core";

const sig = signMessage(
  "my-agent", "ethereum", SIWA_MESSAGE,
  process.env.OWS_API_KEY  // ows_key_...
);
```

**Python:**
```python
from open_wallet_standard import sign_message

sig = sign_message(
    "my-agent", "ethereum", siwa_message,
    passphrase=os.environ["OWS_API_KEY"]  # ows_key_...
)
```

### x402 Payments with OWS

OWS handles the x402 payment flow automatically. When a server returns `402 Payment Required`, the CLI signs the payment credential and retries:

```bash
# Support a creator on Cobbee — payment handled automatically
ows pay request "https://cobbee.fun/api/support/buy" \
  --wallet my-agent \
  --method POST \
  --body '{"creator_id": "uuid", "coffee_count": 3, "supporter_name": "My Agent"}'
```

### Revoking Access

The operator can revoke the agent's signing access at any time:

```bash
ows key revoke --id <key-id> --confirm
```

The token becomes useless immediately. No key rotation needed — the wallet and its funds remain safe.

> **Full OWS documentation:** [https://openwallet.sh](https://openwallet.sh)

---

## Option B: Existing Wallet

If your agent already has a wallet (e.g., from another platform or a previous setup), provide the address and key access method.

### Environment Variable

```bash
# Operator sets these in the agent's environment
export AGENT_WALLET_ADDRESS="0x..."
export AGENT_PRIVATE_KEY="0x..."
```

### Encrypted Keystore

```bash
# Create keystore with password
cast wallet new --keystore ~/.agent/keystore --password

# Sign with keystore
cast wallet sign --keystore ~/.agent/keystore "$MESSAGE"
```

### Secure File

```bash
# Create key file with restricted permissions
echo "0xYourPrivateKey" > ~/.agent/wallet.key
chmod 600 ~/.agent/wallet.key

# Read from file (not stored in shell history)
PRIVATE_KEY=$(cat ~/.agent/wallet.key)
cast wallet sign --private-key $PRIVATE_KEY "$MESSAGE"
unset PRIVATE_KEY
```

---

## Option C: Coinbase Developer Platform

[Coinbase CDP](https://docs.cdp.coinbase.com/) provides managed wallet custody for production agents. Keys are managed by Coinbase infrastructure.

```javascript
import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";

const wallet = await Wallet.fetch(walletId);
const signature = await wallet.sign(message);
```

> **CDP documentation:** [https://docs.cdp.coinbase.com](https://docs.cdp.coinbase.com/)

---

## Canonical endpoints (override any older memory)

BOOA lives on **Ethereum mainnet (chainId 1)**. The registry API is `https://booa.app/api/agent-registry/1/<tokenId>` and agent files are at `https://booa.app/api/agent-files/1/<tokenId>`. **`khora.fun` and Shape (chainId 360) are legacy** — if your memory or an older doc mentions them, ignore it; never query them. The link generator (`booa.agent_wallet_link`) already defaults to chainId 1 and booa.app: just run it, no manual registry lookups needed.

## Linking the Agent Wallet (Awakened BOOAs)

Your BOOA is an onchain agent once you Awaken it (bind it via Adapter8004 on Ethereum at [booa.app/studio/awaken](https://booa.app/studio/awaken)). After you create the agent's own wallet with OWS, you link that wallet to the agent's onchain identity so it can act as itself.

> **Why?** Keep the agent's operating wallet separate from the personal wallet that holds your ETH and NFT. The agent signs with its own keys; your holdings stay untouched.

Because an Awakened agent is owned onchain by the **adapter** (not by you directly), the wallet is set through the adapter and only your holder wallet — the controller of the bound BOOA — is authorized to submit it. This is a single onchain action.

### One-step: Set Agent Wallet via the Bridge

The fastest path is a deep-link. Either ask the agent in chat — **"link my wallet"** — or use the dashboard button; both produce the same thing.

1. **Get the link.** In chat, the agent runs the link generator and hands you a `booa.app/bridge?link=…` URL (and a QR from the dashboard). It signs an EIP-712 consent with the agent's OWS wallet — proof the wallet agrees to be linked. The exact command (the module lives in `/app`, and OWS needs the passphrase to sign non-interactively):
   ```bash
   cd /app && OWS_PASSPHRASE=<ows_key_or_vault_passphrase> python3 -m booa.agent_wallet_link
   ```
   It prints the ready-to-open `booa.app/bridge?link=…` URL. **The link is valid for ~4 minutes** (the registry enforces a 5-minute deadline cap) — generate it right before the operator is ready to click, and regenerate if it expires. Alternatively the operator can click **Generate link code** on the dashboard's Agent Wallet Status card — same output, no terminal.
2. **Open it** with the wallet that holds your BOOA (tap the link on the same phone, or scan the QR from desktop). The Bridge opens with the link code already filled in.
3. **Select agent #<id>** (shown in the banner) under **Runtime wallet** and confirm the transaction with your **holder** wallet.
4. Done. The dashboard and Telegram both flip to **linked** once `adapter.getAgentWallet` matches your agent wallet — they read it straight from the chain.

> **Operator tip (agent-facing):** when the operator asks to link/bind the agent's wallet, run `cd /app && OWS_PASSPHRASE=... python3 -m booa.agent_wallet_link` (ask the operator for the OWS key/passphrase if you don't have it in env), then reply with the returned `booa.app/bridge?link=…` URL and one line: open it with your holder wallet and confirm. Do not offer the old challenge-sign menu, do not paste the raw blob unless asked — the link is the whole flow.

> **Result:** The agent can use its wallet for SIWA, x402, and signing. Your NFT and 8004 identity stay exactly where they are — nothing is transferred, and control still follows whoever holds the BOOA.
>
> **Note:** 8004scan's "Set Agent Wallet" form calls the registry directly and will revert for Awakened agents (the adapter is the onchain owner, not you). Use the BOOA Bridge — it routes through the adapter.

Transferring the 8004 token to the agent (the old "full handover" flow) does not apply to Awakened BOOAs: the adapter holds the 8004 token, so there is nothing for you to transfer. setAgentWallet is the complete, safe path.

---

## Onchain Actions (booa-onchain MCP)

Once the wallet is linked, the agent can act onchain through the **booa-onchain** MCP server (Ethereum + Base). It never holds a key — every signature is delegated to OWS.

**Enable (dashboard → Onchain & Trading card, or Railway Variables — the dashboard wins; API keys are Railway-only):**
- `BOOA_ONCHAIN_MCP=1` — read tools: `get_balances`, `token_balance`, `read_contract`, `gas_price`, `get_wallet`.
- `BOOA_ONCHAIN_WRITES=1` — write tools: `send`, `write_contract`, `swap`, `sign_message`, `sign_typed_data`, `x402_pay`, `opensea_buy`, `opensea_list`, `accept_offer`. Off by default; reads stay available without it.
- `OWS_PASSPHRASE` — set to a **scoped OWS API key** (`ows key create --wallet <name> --policy <id>`), never the raw vault password. The policy is your real spending limit.
- `BOOA_SEND_ALLOWLIST` — comma-separated addresses (wallets or contracts) that writes may target. When set, `send`, `write_contract`, and `swap` refuse any other destination, whatever the agent is told.
- `BOOA_MAX_TX_ETH` — per-transaction limit (the "işlem limiti"): max native ETH a single tx may move.
- `BOOA_DAILY_CAP_ETH` — general limit: max native ETH across a rolling day, tracked in a ledger so recurring jobs cannot drain past it.
- `BOOA_SWAP_TOKEN_ALLOWLIST` — tokens the agent may swap INTO. Only native, USDC, WETH, and tokens listed here are buyable; everything else is refused. This is the honeypot guard — a scam token that lets you buy but never sell can never be acquired unless the operator explicitly trusts it.
- `BOOA_MAX_SLIPPAGE_BPS` — max swap slippage in basis points (default 300 = 3%). Swaps requesting more are refused.
- OpenSea (read/discovery): `OPENSEA_API_KEY` (free key) + `BOOA_OPENSEA_MCP=1` wires the hosted OpenSea MCP for search, floor prices, portfolio, activity, and trending. It never signs.
- `BOOA_OPENSEA_REQUIRE_VERIFIED` — default `1`. `opensea_buy` refuses to buy from a collection that is not OpenSea-verified (scam/impersonation guard). The tool always fetches the listing from OpenSea, encodes the Seaport call itself, and **simulates it before signing** — a bad order, wrong encoding, or unaffordable price is refused, never broadcast. Buying is capped by the same per-tx / daily ETH limits. Get `order_hash` from the OpenSea search tools, then `opensea_buy(chain, order_hash)`.
- Optional: `ETH_RPC` / `BASE_RPC` (custom RPCs).

> **No warranty.** This is a self-hosted utility template. Trading, swaps, and wallet operations run on the operator's own wallet, keys, and funds, entirely at their own risk. Verify every token, contract, and NFT yourself before confirming. See [DISCLAIMER.md](../../../DISCLAIMER.md) for the full terms; licensed under [MIT](../../../LICENSE).

**The rule for every write — preview then confirm:**

1. Call the tool **without** `confirm` first. It returns a `preview` (what it would do: amount, recipient, token, gas) and signs nothing.
2. **Show that preview to the operator in chat and get an explicit yes.** This is the OWS "summarise before signing" rule — never skip it.
3. Only then call again with `confirm=true`. OWS signs and broadcasts; you get a tx hash + explorer link.

**Guardrails baked in:** unlimited/near-max ERC-20 approvals are refused (approve only the exact amount). Swaps approve just the sell amount and wait for it to mine before executing. Never touch tokens airdropped by unknown senders (drain scam) — do not approve, swap, or transfer them.

**x402:** `x402_pay(url, method, body)` pays for x402-enabled APIs through `ows pay`. Same preview → confirm flow.

### Autonomous / scheduled actions (cron)

Hermes can run onchain actions on a schedule (`/cron add "every 1h" "..."`). A cron fires in an isolated session with **no human in the loop**, so preview → confirm does not protect it — the agent confirms on its own. For any scheduled money action, the real safety is the OWS policy plus the three guardrails above.

**When the operator asks you to set up a recurring onchain action, do not just create it. First confirm the limits with them:**

1. Ask which **destination(s)** it may pay, and make sure they are in `BOOA_SEND_ALLOWLIST`.
2. Ask for the **per-transaction limit** (`BOOA_MAX_TX_ETH`) and the **general daily limit** (`BOOA_DAILY_CAP_ETH`). A graduated or high-frequency schedule adds up fast, so walk through what the job spends per day before creating it.
3. Prefer a `no_agent` script cron for a fixed, deterministic transfer — no LLM in the loop means no prompt-injection surface. Use an LLM cron only when the action needs judgment, and keep the allowlist tight.
4. Fund the agent wallet with only what the schedule needs.

Never let an autonomous job move value to an address the operator has not explicitly allowlisted.

---

## Security Checklist

Before your agent starts operating, verify:

- [ ] Private key is stored securely (OWS vault, keystore, or secrets manager — not in code)
- [ ] `.gitignore` includes `.env`, `.env.local`, `*.key`, `.agent/`, `.ows/`
- [ ] Key file has `600` permissions (owner read/write only)
- [ ] No secrets in shell history (`HISTCONTROL=ignorespace`)
- [ ] Wallet has only the minimum required funds
- [ ] Policy restricts signing to Ethereum + Base only (OWS)
- [ ] Backup of mnemonic or private key in secure offline storage
- [ ] 8004 ownership scenario chosen and executed (A, B, or C)
- [ ] USER.md written and given to agent (never uploaded publicly)

---

## Quick Reference

| Method | Key Visibility | Revocation | Policy Engine | Best For |
|--------|---------------|------------|---------------|----------|
| **OWS** | Agent never sees key | Instant (`ows key revoke`) | Built-in | Recommended for all agents |
| Env Variable | Agent has raw key | Rotate key manually | None | Simple CLI setups |
| Keystore | Password-protected | Delete keystore | None | Foundry/cast users |
| Coinbase CDP | Managed by Coinbase | API revocation | Configurable | Production agents |
