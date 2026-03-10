# Signature Security Checklist

## Cross-Chain & Cross-Protocol Replay

- [ ] **Missing chain ID in signature**: A valid signature on Ethereum can be replayed on Arbitrum, Polygon, etc. Every signature hash MUST include `block.chainid`. After hard forks (ETH/ETC split, EIP-155), old signatures without chain ID are valid on both chains. Look for: signature hash that doesn't include `block.chainid` or EIP-712 domain separator with `chainId`. [beirao S-01, SWC-121]

- [ ] **Missing `address(this)` in signature**: Same contract deployed at the same address on multiple chains (CREATE2 or same nonce) has identical verification. A signature valid for Contract A on chain 1 may be valid for Contract A on chain 2. Even on the SAME chain: if the same contract logic is deployed at two addresses, signatures for one instance replay on the other. Include `verifyingContract: address(this)` in domain separator. Look for: EIP-712 domain separator missing `verifyingContract`. [beirao S-02]

- [ ] **Missing `msg.sender` binding in signature**: If the signed message doesn't include the caller's address, anyone who obtains the signature can replay it as themselves. Look for: signature verification that doesn't validate `msg.sender == signer` or doesn't include intended caller in hash. [beirao S-06]

- [ ] **Nonce-less signatures are infinitely replayable**: Without a nonce, the same signature can be used to execute the same action forever. Look for: signature hash without a per-user incrementing nonce or deadline-only expiry. [beirao S-03]

- [ ] **Stale nonce check**: If nonce is checked but not incremented BEFORE the action, reentrancy can replay the same nonce. Increment nonce first, then execute. Look for: nonce increment after `call()` or `transfer()`. [beirao S-04]

## ecrecover Pitfalls

- [ ] **ecrecover returns address(0) for invalid signatures**: If `v` is invalid or `s` is out of range, `ecrecover` returns `address(0)` instead of reverting. If `address(0)` has permissions (e.g., as an uninitialized owner), the attacker gains access. Look for: `ecrecover(hash, v, r, s)` without checking `result != address(0)`. [beirao S-05, SWC-117]

- [ ] **Signature malleability**: For every valid `(r, s, v)` there's a second valid signature `(r, s', v')` where `s' = secp256k1.n - s`. Both recover to the same address. If signatures are used as unique identifiers (e.g., in a mapping), the second signature bypasses the "already used" check. Look for: signature hashes used as keys without canonicalizing `s` to the lower half-order. Fix: use OpenZeppelin ECDSA which enforces `s` in lower half. [beirao S-07, SWC-117]

- [ ] **Different encoding schemes produce different hashes**: `abi.encode` vs `abi.encodePacked` vs `keccak256(abi.encode(keccak256(abi.encode(...))))`. If the signer uses one encoding and the verifier uses another, the signature is invalid. Look for: encoding mismatches between frontend/backend signing and on-chain verification. [beirao S-08]

- [ ] **`abi.encodePacked` collision with dynamic types**: `abi.encodePacked` concatenates without padding. `abi.encodePacked("ab", "cd") == abi.encodePacked("a", "bcd")`. This creates signature collisions for different inputs. Look for: `abi.encodePacked` with multiple dynamic-length arguments (strings, bytes, arrays) in signature hashes. [SWC-133, beirao G-09]

## EIP-712 Typed Signatures

- [ ] **`DOMAIN_SEPARATOR` cached at deployment**: If `DOMAIN_SEPARATOR` is computed once in the constructor and cached, it contains the deployment chain's `block.chainid`. After a hard fork, the cached value is wrong on one chain. Must recompute if `block.chainid` changed. Look for: `immutable DOMAIN_SEPARATOR` without runtime chain ID check. [beirao S-09]

- [ ] **Struct hash must include ALL fields**: Omitting a field from the struct hash means it's not signed. An attacker can change the unsigned field freely. Look for: EIP-712 type hash that doesn't include all struct fields. [beirao S-10]

- [ ] **EIP-712 salt for unintended cross-protocol replay**: Two protocols using the same EIP-712 struct types can have signature replay between them. Using a unique `salt` in the domain separator prevents this. Look for: protocols with identical struct types and no differentiating domain parameter. [beirao S-11]

## Permit (ERC-2612) Specific

- [ ] **Permit front-running griefing (DoS)**: User creates permit signature → submits `permit()` + `transferFrom()` in one transaction → attacker front-runs by extracting the signature and calling `permit()` first → user's transaction reverts because the nonce was consumed. Fix: wrap permit in try/catch, or use separate transactions. Look for: `permit()` followed by `transferFrom()` in the same function without try/catch on permit. [beirao S-12, weird-erc20]

- [ ] **DAI non-standard permit**: DAI's permit function signature differs from ERC-2612: `permit(holder, spender, nonce, expiry, allowed, v, r, s)` vs `permit(owner, spender, value, deadline, v, r, s)`. Code calling standard permit on DAI will revert. Look for: generic permit wrappers without DAI special-casing. [beirao S-13]

- [ ] **Not all ERC20s support permit**: Tokens without EIP-2612 have no `permit()` function. Calling it reverts. Look for: mandatory permit calls on user-provided tokens. [beirao S-14]

## Meta-Transactions & Gas Abstraction

- [ ] **Trusted forwarder in ERC-2771**: When using meta-transactions, `_msgSender()` extracts the real sender from the last 20 bytes of calldata (appended by the trusted forwarder). If the forwarder doesn't properly validate signatures, anyone can forge the appended address. Look for: ERC-2771 recipient contracts with misconfigured or untrusted forwarders. [beirao S-15]

- [ ] **Gas griefing on relayed transactions**: A relayer can provide just enough gas to execute the outer call but not the inner forwarded call. The inner call fails silently, but the outer call succeeds and the nonce is consumed. The user's action didn't execute but can't be retried. Look for: relayed calls without gas sufficiency checks (EIP-150's 1/64th rule). [SWC-126]

## Smart Contract Signatures (ERC-1271)

- [ ] **`isValidSignature` called on non-contract address**: If `isValidSignature()` is called on an EOA (no code), the call returns empty data which may be interpreted as success. Look for: `isValidSignature` calls without `extcodesize` check on the verifying address. [ERC4337 checklist]

- [ ] **`isValidSignature` can be upgraded to accept anything**: If the contract implementing `isValidSignature` is upgradeable, a future upgrade could change the validation logic. Don't treat ERC-1271 signatures as permanently valid. Look for: timestamped or cached ERC-1271 validations that don't re-verify. [ERC4337 checklist]

## Signature Edge Cases (Expanded from Beirao/Multichain-Auditor)

- [ ] **Signature malleability with raw ecrecover**: Raw `ecrecover` accepts both `s` values (s and n-s) for the same signature, producing the same signer. An attacker can flip `s` to create a "different" signature that recovers to the same address. If signatures are used as unique identifiers (stored in a mapping), the attacker bypasses uniqueness checks. Fix: use OZ ECDSA library (latest version — earlier versions had their own bugs). Look for: direct `ecrecover()` calls without `s` value validation. [beirao S-02]

- [ ] **Recovered address of zero means invalid signature**: `ecrecover` returns `address(0)` for invalid signatures. If the expected signer is also `address(0)` (unset), the check passes. Always verify `recoveredAddress != address(0) && recoveredAddress == expectedSigner`. Look for: `ecrecover` result compared to a potentially-unset signer variable. [beirao S-03]

- [ ] **Signature used by wrong person**: If a signature doesn't bind to a specific authorized user, anyone who obtains the signature can use it. Look for: signed messages that don't include the intended `msg.sender` or authorized address. [beirao S-04]

- [ ] **Missing expiration / deadline in signatures**: Signatures without a deadline are valid forever. An old signature can be replayed years later. Look for: signed message schemas without a `deadline` or `expiry` field. [beirao S-05]

- [ ] **Cross-chain signature replay**: Signatures valid on one chain can be replayed on another if the chain ID isn't included. After chain forks (ETH/ETC), signatures without chain ID are valid on both chains. Look for: EIP-712 domains without `chainId`, or `chainId` computed once in constructor (breaks if chain forks). [multichain-auditor, beirao S-01]

- [ ] **EIP-712 `DOMAIN_SEPARATOR` cached in constructor breaks on fork**: If `DOMAIN_SEPARATOR` is computed in the constructor with the current `block.chainid`, it becomes invalid after a chain fork. Must recompute dynamically or use OZ's `_domainSeparatorV4()`. Look for: `DOMAIN_SEPARATOR` stored as `immutable` without runtime recomputation fallback. [multichain-auditor]

- [ ] **`abi.encodePacked` with multiple dynamic types causes hash collisions**: `abi.encodePacked("ab", "c")` == `abi.encodePacked("a", "bc")`. If signed message data uses `abi.encodePacked` with multiple dynamic types, two different messages can produce the same hash. Use `abi.encode` instead. Look for: `keccak256(abi.encodePacked(dynamic1, dynamic2))` in signature hashing. [beirao G-15, Tamjid C12]

---

## Dacian — Signature Replay Attacks (Phase 3)

- [ ] **Missing nonce allows KYC/privilege replay**: Signatures granting privileges (KYC status, whitelisting) without nonces can be replayed after revocation. User simply resubmits the original signature. Fix: include incrementing nonce in signature, store used nonces. [Source: Dacian — Signature Replay Attacks, Code4rena Ondo]

- [ ] **Cross-chain replay — UserOperation not signed with chain_id**: If `getHash()` for account abstraction operations doesn't include `block.chainid`, a valid signature from one chain can be replayed on another chain where the same contract exists at the same address. [Source: Dacian — Signature Replay Attacks, Code4rena Biconomy]

- [ ] **Missing parameter in signature allows fund drainage**: If `tokenGasPriceFactor` is used in refund calculation but not included in the signed message, the transaction submitter can set it to an arbitrarily large value to drain user funds while passing signature verification. [Source: Dacian — Signature Replay Attacks, Code4rena Biconomy]

- [ ] **No signature expiration grants lifetime license**: Without an expiration timestamp, a signed message remains valid forever. Even if a user's circumstances change, old signatures can be used indefinitely. Conform to EIP-712 with deadline. [Source: Dacian — Signature Replay Attacks, Sherlock NFTPort]

- [ ] **Unchecked ecrecover() return of address(0)**: `ecrecover()` returns address(0) for invalid signatures. If `require(o.maker == ecrecover(...))` is used and attacker passes `o.maker = address(0)`, the check passes for an invalid signature. Always verify recovered address != address(0). [Source: Dacian — Signature Replay Attacks, Code4rena Swivel]

- [ ] **Signature malleability — dual valid [v,r,s]**: Due to elliptic curve symmetry, for every valid [v,r,s] there exists another valid [v',r',s'] that passes `ecrecover()`. Use OpenZeppelin's ECDSA library (v4.7.3+) which restricts s to lower half-order. [Source: Dacian — Signature Replay Attacks]
