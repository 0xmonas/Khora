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

**Output:**
```
Created wallet 3198bc9c-...
  eip155:1        0xab16...   m/44'/60'/0'/0/0
  solana:5eykt4   7Kz9...    m/44'/501'/0'/0'
  bip122:0000     bc1q...    m/84'/0'/0'/0/0
  ...
```

> **Save the EVM address** (`eip155:1` line) — this is your agent's wallet address on Shape and Base.

### Step 3: Back Up the Wallet

```bash
ows wallet export --wallet "my-agent"
```

Store the mnemonic phrase in secure offline storage. This is the only way to recover the wallet.

⚠️ **Never store the mnemonic in plain text, screenshots, chat messages, or version control.**

### Step 4: Define a Policy

Create a policy that restricts your agent to specific chains. Start with Shape + Base (primary), expand as needed:

```bash
cat > policy.json << 'EOF'
{
  "id": "agent-policy",
  "name": "Agent: Shape + Base",
  "version": 1,
  "created_at": "2026-04-12T00:00:00Z",
  "rules": [
    { "type": "allowed_chains", "chain_ids": ["eip155:360", "eip155:8453"] },
    { "type": "expires_at", "timestamp": "2026-12-31T23:59:59Z" }
  ],
  "action": "deny"
}
EOF
ows policy create --file policy.json
```

> **Primary chains:** Shape (`eip155:360`) for NFT & 8004 operations, Base (`eip155:8453`) for x402 payments (USDC).
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

Deposit ETH on Shape (for gas) and USDC on Base (for x402 payments):

```bash
# Shape (gas for 8004 operations)
ows fund deposit --wallet my-agent --chain shape

# Base (x402 payments — most platforms use Base for USDC)
ows fund deposit --wallet my-agent --chain base
```

Check balance:

```bash
ows fund balance --wallet my-agent --chain shape
ows fund balance --wallet my-agent --chain base
```

> **x402 payments:** Base is the recommended chain for x402 (USDC) across the ecosystem. Most platforms (Cobbee, Supermission, etc.) use Base for agent payments.

### Signing with OWS

**CLI:**
```bash
# Sign a message (SIWA authentication)
OWS_PASSPHRASE="ows_key_a1b2c3d4..." \
  ows sign message --wallet my-agent --chain shape --message "$SIWA_MESSAGE"
```

**Node.js:**
```javascript
import { signMessage } from "@open-wallet-standard/core";

const sig = signMessage(
  "my-agent", "shape", SIWA_MESSAGE,
  process.env.OWS_API_KEY  // ows_key_...
);
```

**Python:**
```python
from open_wallet_standard import sign_message

sig = sign_message(
    "my-agent", "shape", siwa_message,
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

## ERC-8004 Ownership & Agent Wallet

Your BOOA NFT and ERC-8004 registration are currently on the same personal wallet. After creating a new agent wallet, you need to connect it to your 8004 identity.

> **Why?** By default, your 8004 identity uses the holder's personal wallet. Separating the agent wallet from the holder wallet is critical — you do not want your agent signing transactions with the same keys that hold your ETH and NFTs.

### Scenario A: Set Agent Wallet Only (Minimal)

The holder keeps 8004 ownership. The agent gets an operational wallet.

1. Go to [8004scan.io/my-agents](https://8004scan.io/my-agents)
2. Select the agent → **Manage Agent**
3. **Set Agent Wallet** → enter the new wallet address
4. Sign the transaction with the holder wallet

> **Result:** Agent can use the wallet for SIWA, x402, and signing. But 8004 metadata updates still require the holder's signature.

### Scenario B: Transfer 8004 to Agent Wallet (Recommended)

The holder transfers the ERC-8004 token (it's an ERC-721) to the agent wallet. The NFT stays in the holder's personal wallet.

1. Go to [8004scan.io/my-agents](https://8004scan.io/my-agents)
2. Select the agent → **Transfer Ownership**
3. Enter the agent wallet address
4. Sign the transaction with the holder wallet

> **Result:** Agent becomes the full owner of its 8004 identity. It can independently call `setAgentURI()`, `setAgentWallet()`, and `setMetadata()`. The NFT stays safely in the holder's wallet. Verification still works because `originalOwner == currentNftOwner`.

### Scenario C: Transfer Everything (Full Handover)

Both NFT and 8004 registration transferred to the agent wallet.

1. Transfer the 8004 token (see Scenario B)
2. Transfer the BOOA NFT via OpenSea or direct `transferFrom()`

> **Result:** Agent owns everything. Verification works because `current8004Owner == currentNftOwner`. **Warning:** The NFT leaves your personal wallet permanently.

### Which Scenario?

| Scenario | Agent Independence | NFT Safety | Friction |
|----------|-------------------|-----------|---------|
| **A** — setAgentWallet | Partial (can sign, can't update 8004) | Safe (stays with holder) | Low |
| **B** — Transfer 8004 | Full (owns identity) | Safe (stays with holder) | Medium |
| **C** — Transfer all | Full (owns everything) | Risk (leaves holder) | Medium |

**Recommendation:** Scenario B. Your agent is fully independent, and your NFT is safe.

---

## Security Checklist

Before your agent starts operating, verify:

- [ ] Private key is stored securely (OWS vault, keystore, or secrets manager — not in code)
- [ ] `.gitignore` includes `.env`, `.env.local`, `*.key`, `.agent/`, `.ows/`
- [ ] Key file has `600` permissions (owner read/write only)
- [ ] No secrets in shell history (`HISTCONTROL=ignorespace`)
- [ ] Wallet has only the minimum required funds
- [ ] Policy restricts signing to Shape + Base only (OWS)
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
