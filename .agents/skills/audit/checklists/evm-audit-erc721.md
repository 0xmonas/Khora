# ERC721/ERC1155 Security Checklist

Non-obvious NFT edge cases that break protocols. Based on real-world token behaviors.

## Dual Standard Tokens (ERC721 + ERC1155)

- [ ] **Simultaneous ERC721 and ERC1155 on same contract**: Some NFTs (Sandbox Game Asset, F1 Delta Time) implement BOTH ERC721 and ERC1155. Protocols that auto-detect via `supportsInterface` and route to ERC721 vs ERC1155 transfer logic may transfer incorrect amounts or double-count. Look for: `supportsInterface(0x80ac58cd)` checks that don't also check `supportsInterface(0xd9b67a26)`. [weird-erc721]

- [ ] **Mixed ERC20/ERC721 tokens (ERC404, DN404)**: ERC404 tokens combine ERC20 and ERC721 into one contract but are NOT fully compatible with either standard. Transferring the ERC20 portion can mint/burn NFTs automatically. DN404 (ERC-7631) uses two separate contracts but interlinks them. Look for: protocols assuming clean ERC721 behavior from tokens that also implement ERC20 functions. [weird-erc721]

## Legacy & Wrapped NFTs

- [ ] **CryptoPunks don't implement `transferFrom()`**: CryptoPunks predate the ERC721 standard. They use `offerPunkForSaleToAddress()` + `buyPunk()`. When using CryptoPunks as collateral, the `offerPunkForSaleToAddress()` call can be front-run — someone else calls `buyPunk()` before the vault does. Look for: protocols accepting CryptoPunks that rely on `transferFrom`. [weird-erc721, Decurity CDP]

- [ ] **Wrapped NFTs can be redeemed for originals**: Wrapped CryptoPunks, CryptoKitties etc. can be unwrapped at any time. If a protocol uses a wrapped NFT as collateral, the wrapper could be unwrapped by anyone holding the ERC721 wrapper token, destroying the collateral. Look for: collateral systems accepting wrapped NFTs without tracking redemption risk. [weird-erc721]

## Multiple Collections on One Contract

- [ ] **`setApprovalForAll` grants access to ALL collections on the contract**: When multiple NFT collections share one ERC721 contract (e.g., CyberKongz + CyberKongz Babies), calling `setApprovalForAll` for one collection grants access to ALL NFTs across all collections on that contract. Look for: approval patterns that don't account for multi-collection contracts. [weird-erc721]

- [ ] **`totalSupply()` and `ERC721Enumerable` break with multiple collections**: If a contract hosts multiple collections, `totalSupply()` returns the total across all collections, not per-collection. Look for: protocols using `totalSupply()` to determine collection size or derive pricing. [weird-erc721]

## Token ID Quirks

- [ ] **Large or encoded token IDs**: Some NFTs use very large token IDs (up to `type(uint256).max`) or encode metadata within the ID. Sandbox encodes creator address, NFT type, and data into the token ID. Look for: protocols assuming sequential 0-based token IDs or using token ID in arithmetic. [weird-erc721]

- [ ] **Non-sequential minting**: Not all collections mint from 0 to N. Some start at 1, some skip IDs, some mint random IDs. Look for: iteration patterns like `for (i = 0; i < totalSupply; i++)` that assume contiguous IDs. [weird-erc721]

## Self-Destructing / Auto-Burning NFTs

- [ ] **Tokens that burn on transfer**: The Complex Death collection has a 30% chance of burning the NFT on each transfer. Protocols using such NFTs as collateral can lose them during normal operations. Look for: protocols that call `safeTransferFrom` on arbitrary NFTs without checking post-transfer ownership. [weird-erc721]

- [ ] **Tokens with conditional self-destruct**: Two Degrees collection will burn its token when a global warming threshold is reached. Token IDs that existed at deposit time may cease to exist. Look for: protocols that don't verify `ownerOf(tokenId)` before operations. [weird-erc721]

## Upgradeable and Pausable NFTs

- [ ] **Upgradeable NFT contracts (DeGods, Mocaverse, Neo Tokyo)**: The NFT implementation can change at any time. A compromised upgrade could make all transfers revert, trapping collateral. Look for: protocols accepting upgradeable NFTs as collateral without monitoring for implementation changes. [weird-erc721]

- [ ] **Pausable NFTs (Pudgy Rods)**: Admin can pause all transfers. If used as collateral, users cannot add/remove collateral while paused but may still face liquidation. Look for: same pause-liquidation asymmetry as with ERC20 pausable tokens. [weird-erc721]

- [ ] **NFTs with blacklists (Azuki Elementals, goblintown)**: Registry-based blacklists (ClosedSea, operator-filter-registry) can block specific marketplaces or protocols from transferring tokens. Look for: protocols that don't handle transfer reverts from blacklisted operators. [weird-erc721]

## Reentrancy via Callbacks

- [ ] **`safeTransferFrom` and `safeMint` have callbacks**: `onERC721Received` is called on the recipient. Attacker can reenter the calling contract during this callback. Look for: state changes after `safeTransferFrom` / `_safeMint` calls. [beirao NFT-02, NFT-03]

- [ ] **ERC1155 batch operations have callbacks**: `safeBatchTransferFrom` and `_mintBatch` call `onERC1155BatchReceived`. Same reentrancy risk as ERC721 but with batch operations that may have more complex state. [Decurity CDP]

## NFT Permit (ERC-4494)

- [ ] **Uniswap V3 Position NFTs have permit**: ERC-4494 brings off-chain approval to ERC721. If a protocol assumes ERC721s have no alternative approval mechanism, an attacker with a permit signature can approve themselves and transfer without on-chain approval tx. Look for: protocols that track ERC721 approvals only via `Approval` events. [weird-erc721]

## Airdrops and Breeding

- [ ] **Holding an NFT may trigger airdrops**: Some NFTs airdrop new tokens to holders. If a vault/protocol holds NFTs, it may receive unexpected airdrops. Without `onERC721Received` implementation, airdropped ERC721s can get stuck. Look for: vault contracts that hold NFTs but don't implement ERC721Receiver for arbitrary tokens. [weird-erc721]

## Fractionalized NFTs

- [ ] **Fractional vault gaming**: When an NFT is fractionalized into ERC20 tokens, the buyout mechanism can be gamed. An attacker can acquire a fraction and initiate a buyout at manipulated prices. Look for: fractional vault integrations where buyout thresholds or pricing can be manipulated. [weird-erc721]

## Constructor Minting Without Events

- [ ] **No Transfer events during construction**: ERC721 spec allows minting during contract creation without emitting Transfer events. Off-chain indexers and protocols relying on events will miss these tokens. Look for: protocols using Transfer event logs to track ownership of arbitrary NFTs. [weird-erc721]

## ERC721 `transferFrom` vs `safeTransferFrom`

- [ ] **`transferFrom` doesn't check receiver**: Unlike `safeTransferFrom`, plain `transferFrom` doesn't call `onERC721Received`. NFTs sent to contracts without receiver support are permanently lost. Look for: protocol functions using `transferFrom` where the recipient could be a contract. [beirao NFT-01]

- [ ] **Most `from` parameters should be `msg.sender`**: If `nft.transferFrom(from, to, id)` allows arbitrary `from`, attackers can steal from users who have set approvals on the contract. Look for: `transferFrom` where `from` comes from user input rather than being hardcoded to `msg.sender`. [beirao NFT-04]
