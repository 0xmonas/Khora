# DoS & Griefing Security Checklist

Non-obvious denial-of-service and griefing attack patterns.

## Gas Griefing

- [ ] **Returndata bombing via external calls**: When calling an untrusted address, the callee can return a massive amount of data. The EVM copies all return data to the caller's memory, consuming gas proportional to the return size. Use inline assembly with `returndatasize()` checks or fixed-size return buffers. Look for: `.call()` to user-controlled addresses without capping return data. [beirao E-04, E-12, E-16]

- [ ] **Insufficient gas forwarding (SWC-126)**: When a contract calls another contract via `.call{gas: X}()` with a fixed gas amount, the caller can provide just enough gas for the outer function to succeed but not enough for the inner call. The outer function may silently succeed while the inner call fails. Look for: `.call{gas: fixedAmount}()` where the fixed amount may be too low for certain execution paths. [beirao E-03, Tamjid F-08]

- [ ] **Try/catch always fails with insufficient gas**: `try/catch` blocks require enough gas for the external call. An attacker can submit a transaction with precisely enough gas for the try to fail but catch to execute, causing unexpected fallback behavior. Look for: `try/catch` on external calls in critical paths. [beirao G-18]

## Unbounded Loops

- [ ] **User-growable arrays iterated in a loop**: If users can add elements to an array (stakers, depositors, whitelisted addresses) and a function iterates over the entire array, an attacker can DoS the function by adding elements until it exceeds the block gas limit. Look for: `for (i = 0; i < array.length; i++)` where `array` can grow via public functions. [beirao L-02, Decurity LSD, Hacken UniV4]

- [ ] **External calls inside loops**: Each external call in a loop consumes significant gas and can revert (e.g., blocklisted token transfer). One revert kills the entire transaction. Look for: `token.transfer()` or `.call()` inside a for loop. Fix: use pull-payment pattern. [beirao L-02, G-04]

- [ ] **On L2s with cheap gas, array-filling attacks are economically viable**: What costs $10K on mainnet might cost $10 on Arbitrum. DoS via array filling becomes practical. Look for: any unbounded array on L2 deployments where gas costs don't deter attackers. [multichain-auditor]

## Revert-Based DoS

- [ ] **ETH receiver with reverting fallback**: If a function sends ETH to an address that reverts on receive (contract without `receive()` or with reverting fallback), the entire transaction fails. Look for: `payable(addr).transfer()` or `.call{value: amt}("")` where `addr` could be a contract. [beirao E-11, G-04]

- [ ] **Token transfer to blocklisted address**: If any recipient in a batch operation is blocklisted by the token (USDC/USDT), the entire batch reverts. Look for: batch distribution functions that iterate over recipients. [Decurity CDP]

- [ ] **Zero-amount transfer reverts**: Some tokens (LEND) revert on zero transfers. If reward calculations round to zero for some users, their claim reverts. Look for: `transfer(user, rewardAmount)` where `rewardAmount` could be 0. [weird-erc20, beirao FT-12]

## Block Stuffing & Time-Based DoS

- [ ] **Block stuffing to prevent time-sensitive actions**: An attacker fills blocks with spam transactions to prevent liquidations, auction bids, or governance actions within a deadline. More viable on L2s with lower gas costs. Look for: time-limited actions (auctions, liquidation windows, grace periods) that must execute within N blocks. [beirao G-04, multichain-auditor]

- [ ] **Timelock-based griefing at no cost**: If a protocol has a timelock, an attacker can trigger the timelock repeatedly to prevent actions from ever executing. Look for: timelocked actions that can be restarted by anyone. [beirao G-04]

## Economic Griefing

- [ ] **Front-running liquidation griefing**: An attacker front-runs a liquidation by adding a tiny amount of collateral, making the position just healthy enough to avoid liquidation but not enough to protect the borrower. The liquidator's transaction fails, wasting gas. Look for: liquidation functions where slight collateral changes can change the outcome. [beirao LEN-08]

- [ ] **Account abstraction DoS via free paymaster**: When using paymasters (ERC-4337), transactions are free for users. Attackers can spam thousands of free transactions to DoS the system. Look for: paymaster implementations without rate limiting or anti-spam measures. [beirao AA-01]

## Pause-Related DoS

- [ ] **Pausing liquidations creates solvency risk**: If both user operations AND liquidations are paused, the protocol accumulates bad debt while paused. When unpaused, a cascade of liquidations can cause system insolvency. Look for: pause mechanisms that also block liquidations. [beirao LEN-06, G-09]

- [ ] **Pause can brick contract**: If pause is permanent (no unpause mechanism, or unpause requires a condition that can't be met), all paused functions are permanently disabled. Look for: pause without corresponding unpause, or unpause conditions that can become impossible. [beirao G-09]

## Oracle DoS

- [ ] **Chainlink multisig can block price feed access**: Chainlink price feeds are controlled by a multisig. In theory, access could be revoked. Wrap Chainlink calls in try/catch with fallback oracle. Look for: direct `latestRoundData()` calls without try/catch. [Decurity CDP, beirao CL-12]

- [ ] **`balanceOf()` reverting causes DoS**: If a token's `balanceOf()` function reverts (e.g., paused token), any function that calls it also reverts. Look for: `balanceOf()` in critical paths without try/catch. [Tamjid X2, S3]
