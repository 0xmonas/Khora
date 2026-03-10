# Chain-Specific EVM Security Checklist

## Arbitrum

### Block Number & Timing
- [ ] **`block.number` returns L1 block number**: On Arbitrum, `block.number` returns the approximate L1 block number, NOT the L2 block number. Use `ArbSys(0x64).arbBlockNumber()` for L2 block number. Time-based logic using `block.number` will have ~1000x lower resolution than expected. Look for: `block.number` used for timing, deadlines, or block-frequency calculations on Arbitrum. [multichain-auditor, beirao ARB-01]

- [ ] **Multiple L2 transactions per L1 block**: Unlike mainnet (1 tx can change `block.number`), many Arbitrum transactions share the same `block.number`. This breaks assumptions like "different block = different transaction". Look for: `require(block.number > lastBlock)` for uniqueness checks. [multichain-auditor]

- [ ] **`block.basefee` returns L1 basefee on Arbitrum**: Use `ArbGasInfo.getL1BaseFeeEstimate()` for L1 fees, and `ArbGasInfo` precompile methods for L2 gas prices. Look for: `block.basefee` used for gas calculations on Arbitrum. [multichain-auditor]

### Sequencer & Retryable Tickets
- [ ] **Sequencer downtime = stale oracle prices + delayed liquidations**: When the sequencer is down, no new transactions execute. When it resumes, oracle prices are stale and positions may have gone deeply underwater. Check the Chainlink sequencer uptime feed and apply grace periods. Look for: Chainlink usage on Arbitrum without sequencer uptime check. [multichain-auditor, beirao ARB-02]

- [ ] **Retryable ticket auto-redeem failure**: If a retryable ticket's auto-redeem fails (insufficient gas), it must be manually redeemed within 7 days or funds are permanently lost. Look for: L1→L2 message passing that assumes auto-redemption always succeeds. [Arbitrum docs]

- [ ] **L2→L1 message delay is 7+ days**: Withdrawals and messages from Arbitrum to L1 are subject to the challenge period (~7 days). Protocols that need faster finality should use a bridge/liquidity network. Look for: UX flows that assume fast L2→L1 message delivery. [Arbitrum docs]

### Address Aliasing
- [ ] **L1→L2 msg.sender is aliased**: When an L1 contract sends a message to L2, the `msg.sender` on L2 is `L1_address + 0x1111000000000000000000000000000000001111`. If access control on L2 checks the raw L1 address, it will ALWAYS fail. Must un-alias the sender. Look for: L1→L2 access control that compares `msg.sender` directly with an L1 contract address. [multichain-auditor, beirao ARB-03]

## Optimism / Base / OP Stack

- [ ] **`block.number` is L2 block number**: Unlike Arbitrum, Optimism returns the L2 block number from `block.number`. But L2 blocks on OP stack are produced every 2 seconds, not 12. Code calibrated for mainnet block times will run 6x faster. Look for: block-number-based timing with mainnet assumptions on OP Stack chains. [multichain-auditor]

- [ ] **L1 data fees**: Transactions on OP Stack pay both L2 execution gas AND L1 data posting gas. The L1 portion can be 90%+ of total cost. Protocols must account for this in gas estimation. Look for: gas estimation using only `gasleft()` without L1 data fee component. [multichain-auditor]

- [ ] **No `prevrandao` / `difficulty`**: On OP Stack L2s, `block.prevrandao` (formerly `block.difficulty`) returns a fixed value. It's NOT random. Look for: `block.prevrandao` or `block.difficulty` used as randomness source. [multichain-auditor]

## zkSync Era

- [ ] **`msg.sender == tx.origin` is true for smart contracts**: In zkSync Era, account abstraction is native — ALL accounts (including smart contracts) have `tx.origin == msg.sender` when they initiate transactions. This breaks the common "is EOA" check. Look for: `require(msg.sender == tx.origin)` as a contract-blocking mechanism. [multichain-auditor]

- [ ] **`EXTCODESIZE` returns 0 for non-EVM contracts**: zkSync has system contracts and native AA accounts that are contracts but return 0 for `extcodesize`. Look for: `extcodesize`-based contract detection. [multichain-auditor]

- [ ] **Different CREATE/CREATE2 address derivation**: zkSync uses a different formula for CREATE/CREATE2 addresses than EVM. Counterfactual addresses computed using the EVM formula will be wrong. Look for: off-chain address pre-computation using standard EVM CREATE2 formula. [multichain-auditor]

- [ ] **Missing opcodes**: `SELFDESTRUCT` is a no-op. `CALLCODE` is not supported. `EXTCODECOPY` may behave differently. Look for: usage of these opcodes on zkSync. [multichain-auditor]

- [ ] **No `receive()` / `fallback()` for ETH transfers**: On zkSync, receiving ETH may require explicit function handling. The default receive/fallback may not work as expected for system-level transfers. Look for: contracts expecting ETH via `receive()` on zkSync. [multichain-auditor]

## Blast

- [ ] **Native yield accrual on ETH balances**: On Blast, ETH held by contracts automatically earns yield. If a contract's logic depends on `address(this).balance` being stable, the balance will drift upward. Look for: precise balance checks like `require(address(this).balance == expectedAmount)`. [Blast docs]

- [ ] **USDB/WETH rebasing**: Blast-native tokens (USDB, WETH) are rebasing by default. Protocols that assume stable balances will have accounting errors. Opt for non-rebasing mode via `IERC20Rebasing(token).configure(YieldMode.CLAIMABLE)` or `YieldMode.VOID`. Look for: Blast deployments using USDB/WETH without configuring yield mode. [Blast docs]

- [ ] **Gas refund claim**: Blast refunds gas fees to contracts. If the contract doesn't implement yield/gas claiming, the refund is stuck. Look for: Blast contracts without `IBlast.claimAllGas()` functionality. [Blast docs]

## BNB Chain (BSC)

- [ ] **BNB token quirks**: BNB reverts on `approve(addr, 0)` but requires approval reset for USDT pattern. There's no universal approve pattern that works for both BNB and USDT. Look for: generic approve-to-zero patterns on BSC. [weird-erc20]

- [ ] **3-second block times**: BSC produces blocks every 3 seconds. Block-number-based timing runs 4x faster than Ethereum mainnet. Look for: block-count timing calibrated for 12-second blocks. [multichain-auditor]

- [ ] **Different precompiles**: BSC has custom precompiles for BLS signature verification and other functions at non-standard addresses. Look for: precompile address assumptions. [multichain-auditor]

## Polygon

- [ ] **MATIC → POL migration**: MATIC is being replaced by POL as the native gas token. Protocols hardcoding WMATIC addresses or assuming MATIC will need updates. Look for: hardcoded MATIC/WMATIC addresses. [multichain-auditor]

- [ ] **Reorgs are more common**: Polygon has more frequent chain reorganizations than Ethereum mainnet. Protocols that rely on block finality with fewer confirmations are at risk. Look for: single-block confirmation assumptions. [multichain-auditor]

- [ ] **USDT on Polygon returns bool (unlike Ethereum)**: Ethereum USDT has no return value; Polygon USDT returns bool. SafeERC20 handles both, but custom transfer wrappers may not. Look for: custom token interaction code that assumes no return value. [multichain-auditor]

## General L2 Considerations

- [ ] **PUSH0 support**: Solidity ≥0.8.20 defaults to Shanghai EVM which uses `PUSH0`. Chains that haven't adopted Shanghai (older L2s, app-chains) reject this opcode. Must compile with `--evm-version paris` or earlier. Look for: Solidity ≥0.8.20 deployed to chains without PUSH0 support. [multichain-auditor]

- [ ] **EIP-1559 parameters differ**: Each chain has its own base fee calculation, fee markets, and priority fee handling. Hardcoded gas parameters from mainnet will be wrong. Look for: hardcoded gas prices, base fee assumptions, or priority fee calculations. [multichain-auditor]

- [ ] **Bridged token addresses differ**: USDC on Ethereum ≠ USDC on Arbitrum ≠ USDC on Optimism. Each is a different contract address. Native USDC vs bridged USDC.e are completely different contracts. Look for: hardcoded token addresses in multi-chain config. [multichain-auditor]

- [ ] **Pre-deployed contract addresses may differ**: OpenZeppelin's `Create2` library, Gnosis Safe singleton, Uniswap factories — their addresses may vary across chains. Look for: hardcoded infrastructure contract addresses. [multichain-auditor]

- [ ] **`block.chainid` must be checked dynamically**: After hard forks, `block.chainid` changes. If cached at deploy time and used for signatures, the cached value is wrong on one fork. Look for: `immutable CHAIN_ID` set in constructor vs runtime `block.chainid` check. [multichain-auditor]

## Arbitrum Deep Dive (Expanded from Arbitrum Checklist)

- [ ] **`block.number` on Arbitrum returns L1 block number, not L2**: The L1 block number updates approximately every minute (~5 block jumps). Short-term timing based on `block.number` is unreliable. For L2 block numbers, use `ArbSys(100).arbBlockNumber()`. Look for: `block.number` used for short-term timing on Arbitrum. [Arbitrum Checklist]

- [ ] **Chainlink price feed staleness thresholds differ on Arbitrum**: LINK/ETH feed has 24h heartbeat with 18 decimals, while LINK/USD has 1h heartbeat with 8 decimals. Wrong threshold = stale prices accepted. Look for: hardcoded staleness thresholds or decimal values that don't match the specific Arbitrum feed. [Arbitrum Checklist]

- [ ] **Chainlink minAnswer/maxAnswer on Arbitrum feeds**: ETH/USD limited to [$10, $1M], USDC/USD limited to [$0.01, $1000], USDT/USD limited to [$0.01, $1000]. During flash crashes or extreme events, the feed returns min/max instead of real price. Look for: Chainlink integrations without checking `answer > minAnswer && answer < maxAnswer`. [Arbitrum Checklist]

- [ ] **Orbit chains with custom fee tokens**: Orbit chains (L3s built on Arbitrum) can use any ERC20 as the fee token instead of ETH. If the fee token has non-18 decimals (e.g., USDC = 6), amounts are scaled between L1 decimals and L2 native currency (18 decimals). Rounding losses occur during conversion. Look for: Orbit chain integrations assuming ETH-denominated fees. [Arbitrum Checklist]

- [ ] **Retryable ticket parameters use mixed denominations on Orbit**: `tokenTotalFeeAmount` uses the fee token's decimals (e.g., 6 for USDC), but `l2CallValue`, `maxSubmissionCost`, and `maxFeePerGas` use 18-decimal native currency denomination. Mixing these causes incorrect fee calculations. Look for: retryable ticket creation on Orbit chains where parameters aren't properly denominated. [Arbitrum Checklist]

## Multichain Deployment Gotchas (Expanded from Multichain-Auditor)

- [ ] **PUSH0 opcode not supported on all chains**: Solidity >=0.8.20 generates PUSH0. Arbitrum added support in ArbOS 11, Optimism in Canyon upgrade, but many chains still don't support it. Deploying 0.8.20+ compiled code to unsupported chains causes deployment failure. Look for: Solidity version >=0.8.20 in multichain deployments. [multichain-auditor, beirao MC-03]

- [ ] **`tx.origin == msg.sender` is not always true for EOAs on L2**: On Optimism, L1→L2 messages can have `tx.origin == msg.sender` even when the sender is a smart contract on L1. EOA-only checks using `tx.origin == msg.sender` are bypassable. Look for: `require(tx.origin == msg.sender)` as an EOA check on L2s. [multichain-auditor]

- [ ] **`transfer()` and `send()` fail on chains with different gas costs**: These forward 2300 gas, which may not be enough on chains with different gas pricing (zkSync Era). Use `.call{value: amount}("")` instead. Look for: `.transfer()` or `.send()` in multichain contracts. [multichain-auditor, beirao MC-04]

- [ ] **Frontrunning impossible on some L2s but trivial on others**: Optimism has a private mempool making frontrunning very difficult. Polygon has a public mempool making it cheap. Threat models must be chain-specific. Look for: frontrunning protections assumed unnecessary based on single-chain behavior. [multichain-auditor]

- [ ] **Hardcoded WETH/token addresses invalid across chains**: WETH is 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 on Ethereum but 0x7ceb23fd6bc0add59e62ac25578270cff1b9f619 on Polygon. Look for: any hardcoded contract address that's assumed same across chains. [multichain-auditor]

- [ ] **zkSync ERA has fundamentally different opcode behavior**: CREATE, CREATE2, CALL, STATICCALL, DELEGATECALL, MSTORE, MLOAD, CALLDATALOAD, CALLDATACOPY all behave differently on zkSync. Direct EVM contract deployment often fails. Look for: contracts deployed to zkSync without ERA-specific adaptation. [multichain-auditor, beirao MC-11]

- [ ] **Precompile addresses differ across chains**: Precompiled contracts exist at different addresses on Arbitrum, Optimism, and other L2s. Using a precompile address from one chain on another may call empty addresses or different contracts. Look for: hardcoded precompile addresses in multichain deployments. [multichain-auditor]

- [ ] **XDai/Gnosis chain token contracts have callbacks**: On Gnosis chain, USDC/WBTC/WETH had post-transfer callbacks unlike their Ethereum counterparts. This enabled reentrancy attacks and led to a chain hard fork. Look for: same-name tokens assumed to behave identically across chains. [multichain-auditor]
