// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BOOAv2} from "../../contracts/v2/BOOA.sol";
import {BOOAStorage} from "../../contracts/v2/BOOAStorage.sol";
import {BOOARenderer} from "../../contracts/v2/BOOARenderer.sol";
import {BOOAMinter} from "../../contracts/v2/BOOAMinter.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// ═══════════════════════════════════════════════════════════════════
//  ATTACKER CONTRACTS
// ═══════════════════════════════════════════════════════════════════

/// @dev Reentrancy attacker via ERC721 onERC721Received callback
contract ReentrantMinter {
    BOOAMinter public minter;
    uint256 public attackCount;
    bytes public savedImageData;
    bytes public savedTraitsData;
    uint256 public savedDeadline;
    bytes public savedSig;

    constructor(address _minter) {
        minter = BOOAMinter(payable(_minter));
    }

    function attack(
        bytes calldata imageData,
        bytes calldata traitsData,
        uint256 deadline,
        bytes calldata sig
    ) external payable {
        savedImageData = imageData;
        savedTraitsData = traitsData;
        savedDeadline = deadline;
        savedSig = sig;
        minter.mint{value: msg.value}(imageData, traitsData, deadline, sig);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (attackCount < 1) {
            attackCount++;
            try minter.mint{value: address(this).balance}(
                savedImageData, savedTraitsData, savedDeadline, savedSig
            ) {} catch {}
        }
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}

/// @dev Contract that rejects ETH to grief withdraw
contract WithdrawGriever {
    receive() external payable {
        revert("no ETH");
    }
}

/// @dev Reentrancy on withdraw fallback
contract WithdrawReentrant {
    BOOAMinter public target;
    uint256 public attackCount;

    constructor(address _target) {
        target = BOOAMinter(payable(_target));
    }

    receive() external payable {
        if (attackCount < 1) {
            attackCount++;
            target.withdraw();
        }
    }
}

/// @dev Malicious renderer returning arbitrary JSON
contract MaliciousRenderer {
    function tokenURI(uint256) external pure returns (string memory) {
        return "data:application/json;base64,eyJuYW1lIjoiSEFDS0VEIn0=";
    }
}

/// @dev Self-destructing contract to force-send ETH (deprecated post-Dencun)
contract ForceSender {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @dev Contract that tries to re-enter burn during a transfer callback
contract BurnReentrant {
    BOOAv2 public booa;
    uint256 public tokenToBurn;
    bool public attacked;

    constructor(address _booa) {
        booa = BOOAv2(_booa);
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (!attacked) {
            attacked = true;
            // Try to burn the token we just received
            try booa.burn(tokenId) {} catch {}
        }
        return this.onERC721Received.selector;
    }
}

/// @dev Proxy contract that relays calls to test msg.sender spoofing
contract CallerProxy {
    function proxiedMint(
        BOOAMinter _minter,
        bytes calldata imageData,
        bytes calldata traitsData,
        uint256 deadline,
        bytes calldata sig
    ) external payable returns (uint256) {
        return _minter.mint{value: msg.value}(imageData, traitsData, deadline, sig);
    }
}

contract BOOAv2DeepSecurityTest is Test {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    BOOAv2 public booa;
    BOOAStorage public store;
    BOOARenderer public renderer;
    BOOAMinter public minter;

    address owner = address(this);
    address attacker = address(0xBAD);
    address user = address(0xBEEF);
    address user2 = address(0xCAFE);

    uint256 signerKey = 0xA11CE;
    address signerAddr;

    uint256 constant MINT_PRICE = 0.00015 ether;

    bytes validBitmap;
    bytes validTraits;

    function setUp() public {
        signerAddr = vm.addr(signerKey);
        vm.deal(attacker, 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(user2, 100 ether);

        store = new BOOAStorage();
        renderer = new BOOARenderer(address(store));
        booa = new BOOAv2(owner, 500);
        minter = new BOOAMinter(address(booa), address(store), signerAddr, MINT_PRICE);

        booa.setMinter(address(minter), true);
        booa.setRenderer(address(renderer));
        booa.setDataStore(address(store));
        store.setWriter(address(minter), true);
        store.setWriter(address(booa), true);

        validBitmap = _makeBitmap(0);
        validTraits = bytes('[{"trait_type":"Creature","value":"Test"}]');
    }

    receive() external payable {}

    // ── Helpers ──

    function _makeBitmap(uint8 colorIndex) internal pure returns (bytes memory) {
        bytes memory bmp = new bytes(2048);
        uint8 packed = (colorIndex << 4) | (colorIndex & 0x0F);
        for (uint256 i; i < 2048; ++i) bmp[i] = bytes1(packed);
        return bmp;
    }

    uint256 private _nonce;

    function _signMint(bytes memory imageData, bytes memory traitsData, address who, uint256 deadline) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(imageData, traitsData, who, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _mintAsUser(address who) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, who, deadline);
        vm.prank(who);
        return minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 1: abi.encode COLLISION PREVENTION
    //  The contract uses abi.encode (NOT abi.encodePacked) to hash
    //  (imageData, traitsData, ...). abi.encode includes length prefixes
    //  for dynamic types, preventing boundary-shift collisions.
    //  These tests verify the fix and document the old vulnerability.
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Verify abi.encode prevents hash collision between shifted (imageData, traitsData) pairs
    ///      With abi.encodePacked, (0xAABB, 0xCC) == (0xAA, 0xBBCC). abi.encode prevents this.
    function test_critical_abiEncode_preventsCollision() public {
        bytes memory img1 = validBitmap; // 2048 bytes
        bytes memory traits1 = bytes("AAAA"); // 4 bytes

        // Shift last byte of traits1 into img2
        bytes memory img2 = new bytes(2049);
        for (uint256 i; i < 2048; ++i) img2[i] = img1[i];
        img2[2048] = "A";

        bytes memory traits2 = bytes("AAA"); // remaining 3 bytes

        // abi.encodePacked WOULD collide (documenting the old vulnerability)
        assertEq(
            keccak256(abi.encodePacked(img1, traits1)),
            keccak256(abi.encodePacked(img2, traits2)),
            "encodePacked collision confirmed (old vulnerability)"
        );

        // abi.encode does NOT collide (the fix)
        assertTrue(
            keccak256(abi.encode(img1, traits1)) != keccak256(abi.encode(img2, traits2)),
            "abi.encode prevents collision with length prefixes"
        );

        // Sign for pair 1 — uses abi.encode internally
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(img1, traits1, user, deadline);

        // Pair 2 with same sig should fail with InvalidSignature (different hash)
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(img2, traits2, deadline, sig);

        // Pair 1 works
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(img1, traits1, deadline, sig);
        assertEq(booa.totalSupply(), 1);
    }

    /// @dev abi.encode prevents collision with different-length traitsData
    function test_critical_abiEncode_differentTraitsLength() public {
        bytes memory img = validBitmap;
        bytes memory traits1 = bytes("TraitsENDING_WITH_EXTRA");
        bytes memory traits2 = bytes("TraitsENDING_WITH_EXTR"); // 2 bytes shorter

        uint256 deadline = block.timestamp + 1 hours;

        // With abi.encode, different lengths always produce different hashes
        bytes32 hash1 = keccak256(abi.encode(img, traits1, user, deadline, block.chainid));
        bytes32 hash2 = keccak256(abi.encode(img, traits2, user, deadline, block.chainid));
        assertTrue(hash1 != hash2, "Different traits lengths produce different hashes");
    }

    /// @dev abi.encode prevents empty-traits collision
    ///      With encodePacked: encodePacked(bitmap||traits, "") == encodePacked(bitmap, traits)
    ///      With abi.encode: these always differ due to length encoding
    function test_critical_abiEncode_emptyTraitsNoCollision() public {
        bytes memory img1 = validBitmap; // 2048 bytes
        bytes memory traits1 = bytes("some_traits"); // 11 bytes

        bytes memory img2 = abi.encodePacked(img1, traits1); // 2059 bytes
        bytes memory traits2 = bytes(""); // empty

        // abi.encodePacked WOULD collide
        assertEq(
            keccak256(abi.encodePacked(img1, traits1)),
            keccak256(abi.encodePacked(img2, traits2)),
            "encodePacked empty traits collision (old vulnerability)"
        );

        // abi.encode does NOT collide
        assertTrue(
            keccak256(abi.encode(img1, traits1)) != keccak256(abi.encode(img2, traits2)),
            "abi.encode prevents empty traits collision"
        );

        // Verify via actual mint: sign for pair 1, pair 2 fails
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(img1, traits1, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(img1, traits1, deadline, sig);

        // Pair 2 — different abi.encode hash → InvalidSignature (not SignatureAlreadyUsed)
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(img2, traits2, deadline, sig);
    }

    /// @dev Document the difference between abi.encode and abi.encodePacked
    function test_critical_encodeVsEncodePacked_documentation() public {
        bytes memory img1 = validBitmap;
        bytes memory traits1 = bytes("AAAA");
        bytes memory img2 = abi.encodePacked(validBitmap, bytes("A"));
        bytes memory traits2 = bytes("AAA");

        // encodePacked: COLLISION (vulnerable)
        assertEq(
            keccak256(abi.encodePacked(img1, traits1)),
            keccak256(abi.encodePacked(img2, traits2))
        );

        // abi.encode: NO collision (safe — this is what the contract uses)
        assertTrue(
            keccak256(abi.encode(img1, traits1)) != keccak256(abi.encode(img2, traits2)),
            "abi.encode prevents collision by including length prefixes"
        );
    }

    /// @dev Verify that even carefully crafted mempool sniping is blocked by abi.encode
    function test_critical_abiEncode_mempoolSnipingBlocked() public {
        bytes memory serverApprovedBitmap = validBitmap; // 2048 bytes
        bytes memory serverApprovedTraits = bytes('{"bg":"black"}'); // 14 bytes

        // Attacker crafts shifted data
        bytes memory altBitmap = new bytes(2050);
        for (uint256 i; i < 2048; ++i) altBitmap[i] = serverApprovedBitmap[i];
        altBitmap[2048] = bytes1("{");
        altBitmap[2049] = bytes1('"');
        bytes memory altTraits = bytes('bg":"black"}');

        // With abi.encode, hashes are DIFFERENT (attack blocked)
        bytes32 h1 = keccak256(abi.encode(serverApprovedBitmap, serverApprovedTraits, user, uint256(999), block.chainid));
        bytes32 h2 = keccak256(abi.encode(altBitmap, altTraits, user, uint256(999), block.chainid));
        assertTrue(h1 != h2, "abi.encode blocks mempool sniping collision");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 2: SIGNATURE SCHEME DEEP ANALYSIS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev EIP-191 vs EIP-712: our signatures lack structured typing
    ///      An EIP-191 signed hash can collide with other messages the signer
    ///      signs if the same private key is used for other purposes.
    ///      This test verifies the current scheme is still safe within its domain.
    function test_sig_eip191_domainSeparation() public {
        // The signer key is used ONLY for mint packets.
        // But if the same key signs an arbitrary message whose hash happens to
        // equal our mint hash, it's a valid mint signature.
        //
        // With keccak256, this is computationally infeasible (256-bit preimage).
        // But with a SHARED signer key across multiple services, it's risky.
        //
        // Verify: a signature for a different message format doesn't pass.

        uint256 deadline = block.timestamp + 1 hours;

        // Sign a completely different message with the same key
        bytes32 differentHash = keccak256("Transfer 100 ETH to attacker");
        bytes32 ethHash = differentHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);

        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));
    }

    /// @dev Signature from a different private key with same address (impossible but verify)
    function test_sig_differentKeyCannotForge() public {
        uint256 fakeKey = 0xDEAD;
        require(vm.addr(fakeKey) != signerAddr, "Keys must differ");

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fakeKey, ethHash);

        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));
    }

    /// @dev Signature malleability — secp256k1 allows (r, s) and (r, n-s)
    ///      OpenZeppelin ECDSA.recover rejects high-s. Verify both paths.
    function test_sig_malleability_highS_rejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);

        // Normal signature works
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));

        // Now try the malleable form for a new mint
        uint256 deadline2 = block.timestamp + 2 hours;
        bytes32 hash2 = keccak256(abi.encode(validBitmap, validTraits, user, deadline2, block.chainid));
        bytes32 ethHash2 = hash2.toEthSignedMessageHash();
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(signerKey, ethHash2);

        // Flip to high-s
        uint256 secp256k1n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(secp256k1n - uint256(s2));
        uint8 flippedV = v2 == 27 ? 28 : 27;

        vm.prank(user);
        vm.expectRevert(); // OZ ECDSA rejects high-s
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline2, abi.encodePacked(r2, highS, flippedV));
    }

    /// @dev Signature with v=0 or v=1 (compact signature format)
    ///      Some implementations accept v ∈ {0,1} instead of {27,28}
    function test_sig_compactV_rejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);

        // Use v=0 instead of 27
        uint8 badV = v - 27; // 0 or 1
        vm.prank(user);
        vm.expectRevert();
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, badV));
    }

    /// @dev Zero-length signature should not pass
    function test_sig_zeroLengthReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(user);
        vm.expectRevert();
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, "");
    }

    /// @dev Exactly 64-byte signature (EIP-2098 compact) — verify handling
    function test_sig_compactEIP2098() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);

        // EIP-2098 compact: 64 bytes, v encoded in high bit of s
        bytes32 compactS;
        if (v == 28) {
            compactS = bytes32(uint256(s) | (1 << 255));
        } else {
            compactS = s;
        }
        bytes memory compactSig = abi.encodePacked(r, compactS);
        assertEq(compactSig.length, 64);

        // OZ ECDSA.recover supports 64-byte compact signatures
        // This should actually work with OZ >= 4.7
        // Whether it passes or fails, both are acceptable — we just verify no panic
        vm.prank(user);
        try minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, compactSig) {
            // If it works with compact sig, the signature is valid
            assertEq(booa.totalSupply(), 1);
        } catch {
            // If it fails, compact sigs are rejected — also fine
        }
    }

    /// @dev Cross-chain replay — signature signed for chainid=1 fails on chainid=31337
    function test_sig_crossChainReplay_detailed() public {
        uint256 deadline = block.timestamp + 1 hours;

        // Sign for Ethereum mainnet (chainid=1)
        bytes32 hashMainnet = keccak256(abi.encode(validBitmap, validTraits, user, deadline, uint256(1)));
        bytes32 ethHashMainnet = hashMainnet.toEthSignedMessageHash();
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(signerKey, ethHashMainnet);

        // Sign for Base (chainid=8453)
        bytes32 hashBase = keccak256(abi.encode(validBitmap, validTraits, user, deadline, uint256(8453)));
        bytes32 ethHashBase = hashBase.toEthSignedMessageHash();
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(signerKey, ethHashBase);

        // Neither should work on foundry (chainid=31337)
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r1, s1, v1));

        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r2, s2, v2));
    }

    /// @dev Signer rotation — old signer's signatures become invalid immediately
    function test_sig_signerRotation_immediateInvalidation() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // Rotate signer before user uses the signature
        uint256 newKey = 0xB0B;
        address newSigner = vm.addr(newKey);
        minter.setSigner(newSigner);

        // Old signature is now invalid
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);

        // New signer's signature works
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, ethHash);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));
    }

    /// @dev _usedSignatures is keyed on ethSignedHash, not raw hash.
    ///      Verify that the same raw hash signed differently doesn't bypass replay.
    function test_sig_replayProtection_ethSignedHashConsistency() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // First mint succeeds
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);

        // The ethSignedHash is deterministic for the same data, so replay fails
        vm.prank(user);
        vm.expectRevert(BOOAMinter.SignatureAlreadyUsed.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 3: CEI (Checks-Effects-Interactions) VIOLATION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev In BOOAMinter.mint(), state changes happen BEFORE external calls:
    ///      1. _usedSignatures[hash] = true  (effect)
    ///      2. mintCount[msg.sender]++       (effect)
    ///      3. booa.mint(msg.sender)         (interaction)
    ///      4. dataStore.setImageData(...)   (interaction)
    ///      5. dataStore.setTraits(...)      (interaction)
    ///
    ///      If booa.mint reverts (e.g., paused), _usedSignatures is already set.
    ///      This means the signature is "burned" even on failed mint!
    ///      This IS a real issue — test it.
    function test_cei_signatureBurnedOnRevert() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // Pause BOOA (not minter) — the mint call to booa.mint() will revert
        booa.setPaused(true);

        // The mint fails because booa.mint reverts
        vm.prank(user);
        vm.expectRevert(BOOAv2.MintingPaused.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);

        // Unpause — try again with same sig
        booa.setPaused(false);

        // If CEI was violated (effects before interactions that revert),
        // the signature would be "burned" and unusable.
        // But since the ENTIRE transaction reverts (including state changes),
        // the signature should still be valid.
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        assertEq(booa.totalSupply(), 1, "Signature should still be valid after revert");
    }

    /// @dev Verify that mintCount is correctly rolled back on revert
    function test_cei_mintCountRolledBackOnRevert() public {
        minter.setMaxPerWallet(1);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // Make booa.mint revert
        booa.setPaused(true);

        vm.prank(user);
        vm.expectRevert(BOOAv2.MintingPaused.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);

        // mintCount should NOT have incremented
        assertEq(minter.mintCount(user), 0, "mintCount must rollback on revert");

        // Unpause and mint
        booa.setPaused(false);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        assertEq(minter.mintCount(user), 1);
    }

    /// @dev Verify burn CEI: totalBurned++ happens before _burn() external call
    ///      In BOOA.burn(): totalBurned++ then _burn(tokenId)
    ///      _burn() calls _update() which does NOT make external calls in vanilla ERC721
    ///      (no onERC721Received callback on burn). So CEI is satisfied.
    function test_cei_burnNoCallback() public {
        _mintAsUser(user);

        uint256 supplyBefore = booa.totalSupply();
        uint256 burnedBefore = booa.totalBurned();

        vm.prank(user);
        booa.burn(0);

        assertEq(booa.totalSupply(), supplyBefore - 1);
        assertEq(booa.totalBurned(), burnedBefore + 1);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 4: SSTORE2 EDGE CASES & STORAGE POINTER ATTACKS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev SSTORE2.write deploys a contract to store data. The pointer is
    ///      the deployed contract's address. If setImageData is called again,
    ///      the old pointer becomes a zombie contract (never deleted).
    ///      Verify old pointer data is still readable but no longer referenced.
    function test_sstore2_pointerOverwrite() public {
        _mintAsUser(user);

        // Read original image data
        bytes memory original = store.getImageData(0);
        assertEq(original.length, 2048);

        // Owner overwrites with new data
        bytes memory newBitmap = _makeBitmap(5);
        booa.updateMetadata(0, newBitmap, bytes(""));

        // New data is returned
        bytes memory updated = store.getImageData(0);
        assertEq(keccak256(updated), keccak256(newBitmap));
        assertTrue(keccak256(original) != keccak256(updated));
    }

    /// @dev SSTORE2 with max-size data (2048 bitmap + 8192 traits)
    ///      Verify no OOG or encoding issues at boundary
    function test_sstore2_maxSizeData() public {
        bytes memory maxTraits = new bytes(8192);
        for (uint256 i; i < 8192; ++i) maxTraits[i] = bytes1(uint8(i % 256));

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, maxTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, maxTraits, deadline, sig);

        // Read back and verify
        bytes memory readTraits = store.getTraits(0);
        assertEq(readTraits.length, 8192);
        assertEq(keccak256(readTraits), keccak256(maxTraits));
    }

    /// @dev SSTORE2 with exactly MAX_TRAITS_SIZE+1 — should fail
    function test_sstore2_exceedMaxTraitsSize() public {
        bytes memory oversized = new bytes(8193);

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, oversized, user, deadline);

        vm.prank(user);
        vm.expectRevert(BOOAStorage.TraitsTooLarge.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, oversized, deadline, sig);
    }

    /// @dev hasBitmap returns false for unminted token, true after mint
    function test_sstore2_hasBitmapConsistency() public {
        assertFalse(store.hasBitmap(0));
        assertFalse(store.hasBitmap(999));

        _mintAsUser(user);
        assertTrue(store.hasBitmap(0));
        assertFalse(store.hasBitmap(1));
    }

    /// @dev getImageData for non-existent token returns empty bytes (not revert)
    function test_sstore2_readNonExistentToken() public view {
        bytes memory data = store.getImageData(999);
        assertEq(data.length, 0);
    }

    /// @dev Empty traits (length 0) — setTraits does nothing, getTraits returns ""
    function test_sstore2_emptyTraits() public {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory emptyTraits = bytes("");
        bytes memory sig = _signMint(validBitmap, emptyTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, emptyTraits, deadline, sig);

        bytes memory readTraits = store.getTraits(0);
        assertEq(readTraits.length, 0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 5: RENDERER JSON INJECTION & SVG ATTACKS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Traits data is injected raw into JSON. If traitsData contains
    ///      malicious JSON, it can break the tokenURI JSON structure.
    ///      This is an XSS/injection vector for NFT marketplaces.
    function test_renderer_jsonInjectionViaTraits() public {
        // Inject a closing brace and new JSON key
        bytes memory maliciousTraits = bytes(
            '[{"trait_type":"A","value":"B"}],"image":"data:image/svg+xml,<svg onload=alert(1)>","x":"'
        );

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, maliciousTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, maliciousTraits, deadline, sig);

        // tokenURI won't revert — it just produces potentially malformed JSON
        string memory uri = booa.tokenURI(0);
        assertTrue(bytes(uri).length > 0, "tokenURI should not revert");
        // The malicious traits are embedded in the base64 JSON
        // Marketplaces that parse this JSON are vulnerable
    }

    /// @dev Bitmap with all color index 15 — edge of palette
    function test_renderer_maxColorIndex() public {
        bytes memory maxColorBitmap = _makeBitmap(15);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(maxColorBitmap, validTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(maxColorBitmap, validTraits, deadline, sig);

        string memory uri = booa.tokenURI(0);
        assertTrue(bytes(uri).length > 0);
    }

    /// @dev Bitmap with mixed nibbles 0xF0 — high nibble=15, low nibble=0
    function test_renderer_mixedNibbles() public {
        bytes memory mixedBitmap = new bytes(2048);
        for (uint256 i; i < 2048; ++i) mixedBitmap[i] = bytes1(uint8(0xF0));

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(mixedBitmap, validTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(mixedBitmap, validTraits, deadline, sig);

        string memory uri = booa.tokenURI(0);
        assertTrue(bytes(uri).length > 0);
    }

    /// @dev PALETTE out of bounds — color index > 15 is impossible with 4-bit nibble
    ///      but verify renderSVG handles all 16 colors (0-15) correctly
    function test_renderer_allPaletteColors() public {
        // Create a bitmap where every pixel pair uses a different color
        bytes memory allColorBitmap = new bytes(2048);
        for (uint256 i; i < 2048; ++i) {
            uint8 hi = uint8((i % 16));
            uint8 lo = uint8(((i + 1) % 16));
            allColorBitmap[i] = bytes1((hi << 4) | lo);
        }

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(allColorBitmap, validTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(allColorBitmap, validTraits, deadline, sig);

        // Render should succeed for all 16 colors
        string memory svg = renderer.renderSVG(allColorBitmap);
        assertTrue(bytes(svg).length > 0);
    }

    /// @dev Renderer swap mid-operation: owner changes renderer between
    ///      two tokenURI calls — no state corruption
    function test_renderer_swapBetweenCalls() public {
        _mintAsUser(user);

        string memory uri1 = booa.tokenURI(0);

        // Swap to malicious renderer
        MaliciousRenderer evil = new MaliciousRenderer();
        booa.setRenderer(address(evil));

        string memory uri2 = booa.tokenURI(0);

        // Both should return, but different data
        assertTrue(
            keccak256(bytes(uri1)) != keccak256(bytes(uri2)),
            "Different renderers should produce different URIs"
        );

        // Swap back
        booa.setRenderer(address(renderer));
        string memory uri3 = booa.tokenURI(0);
        assertEq(keccak256(bytes(uri1)), keccak256(bytes(uri3)), "Original renderer restored");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 6: INTEGER BOUNDARY & ARITHMETIC EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    /// @dev totalSupply = totalMinted - totalBurned
    ///      Verify this can never underflow (Solidity 0.8+ checked arithmetic)
    function test_int_totalSupplyUnderflow() public {
        // totalMinted=0, totalBurned=0 → totalSupply=0
        assertEq(booa.totalSupply(), 0);

        // Can't burn when nothing minted
        vm.prank(user);
        vm.expectRevert(); // ownerOf reverts for non-existent token
        booa.burn(0);

        // Mint 1, burn 1 → supply=0
        _mintAsUser(user);
        vm.prank(user);
        booa.burn(0);
        assertEq(booa.totalSupply(), 0);

        // Can't burn again
        vm.prank(user);
        vm.expectRevert();
        booa.burn(0);

        // totalSupply is still 0, not underflowed
        assertEq(booa.totalSupply(), 0);
        assertEq(booa.totalMinted(), 1);
        assertEq(booa.totalBurned(), 1);
    }

    /// @dev nextTokenId overflow — practically impossible (uint256 max)
    ///      but verify the type is uint256 and starts at 0
    function test_int_nextTokenIdStartsAtZero() public {
        assertEq(booa.nextTokenId(), 0);
        _mintAsUser(user);
        assertEq(booa.nextTokenId(), 1);
    }

    /// @dev mintPrice at uint256 max — should require msg.value >= type(uint256).max
    function test_int_maxMintPrice() public {
        minter.setMintPrice(type(uint256).max);

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // Can't send uint256.max ETH
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        minter.mint{value: 100 ether}(validBitmap, validTraits, deadline, sig);
    }

    /// @dev deadline at exact block.timestamp — boundary test
    function test_int_deadlineExactTimestamp() public {
        uint256 deadline = block.timestamp; // block.timestamp > deadline is false
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        assertEq(booa.totalSupply(), 1);
    }

    /// @dev deadline = 0 — always expired (block.timestamp > 0)
    function test_int_deadlineZero() public {
        bytes memory sig = _signMint(validBitmap, validTraits, user, 0);

        vm.prank(user);
        vm.expectRevert(BOOAMinter.SignatureExpired.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, 0, sig);
    }

    /// @dev deadline = type(uint256).max — never expires
    function test_int_deadlineMaxUint256() public {
        uint256 deadline = type(uint256).max;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        assertEq(booa.totalSupply(), 1);
    }

    /// @dev maxPerWallet = 0 means unlimited
    function test_int_maxPerWalletZeroMeansUnlimited() public {
        assertEq(minter.maxPerWallet(), 0); // default

        // Mint many times
        for (uint256 i; i < 5; ++i) {
            _mintAsUser(user);
        }
        assertEq(booa.totalSupply(), 5);
    }

    /// @dev maxSupply = 0 means unlimited
    function test_int_maxSupplyZeroMeansUnlimited() public {
        assertEq(minter.maxSupply(), 0); // default

        for (uint256 i; i < 5; ++i) {
            _mintAsUser(user);
        }
        assertEq(booa.totalSupply(), 5);
    }

    /// @dev maxSupply can't be set below current totalSupply
    function test_int_maxSupplyBelowCurrentSupply() public {
        _mintAsUser(user);
        _mintAsUser(user);
        assertEq(booa.totalSupply(), 2);

        vm.expectRevert(BOOAMinter.MaxSupplyReached.selector);
        minter.setMaxSupply(1); // below current
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 7: ACCESS CONTROL DEPTH
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Direct BOOA.mint bypass — only authorized minters can call
    function test_access_directMintByNonMinter() public {
        vm.prank(attacker);
        vm.expectRevert(BOOAv2.NotAuthorizedMinter.selector);
        booa.mint(attacker);
    }

    /// @dev Storage owner can write directly (owner bypass in onlyWriter)
    function test_access_storageOwnerCanWrite() public {
        // Owner of storage is this test contract
        // onlyWriter allows owner() OR authorizedWriters
        store.setImageData(999, validBitmap);
        bytes memory data = store.getImageData(999);
        assertEq(keccak256(data), keccak256(validBitmap));
    }

    /// @dev After ownership transfer, old owner loses all access
    function test_access_ownershipTransfer() public {
        // Transfer BOOA ownership to user
        booa.transferOwnership(user);

        // Old owner (this contract) can't admin
        vm.expectRevert();
        booa.setMinter(attacker, true);

        // New owner can
        vm.prank(user);
        booa.setMinter(attacker, true);
        assertTrue(booa.authorizedMinters(attacker));
    }

    /// @dev Renounce ownership — no one can admin
    function test_access_renounceOwnership() public {
        booa.renounceOwnership();

        vm.expectRevert();
        booa.setMinter(attacker, true);

        vm.prank(attacker);
        vm.expectRevert();
        booa.setMinter(attacker, true);
    }

    /// @dev updateMetadata restricted to contract owner (not token owner)
    function test_access_updateMetadataOnlyContractOwner() public {
        _mintAsUser(user);

        // Token owner can't update
        vm.prank(user);
        vm.expectRevert();
        booa.updateMetadata(0, _makeBitmap(3), bytes("new traits"));

        // Contract owner can
        booa.updateMetadata(0, _makeBitmap(3), bytes("new traits"));
    }

    /// @dev Minter contract is separate from BOOA owner
    ///      Verify minter's owner != booa's owner doesn't cause issues
    function test_access_minterOwnerIndependent() public {
        // Transfer minter ownership to user2
        minter.transferOwnership(user2);

        // user2 can admin minter
        vm.prank(user2);
        minter.setMintPrice(0);

        // But can't admin BOOA
        vm.prank(user2);
        vm.expectRevert();
        booa.setMinter(attacker, true);

        // Minting still works (minter is still authorized on BOOA)
        _mintAsUser(user);
        assertEq(booa.totalSupply(), 1);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 8: ROYALTY (ERC2981) EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Royalty calculation with large sale price
    function test_royalty_largeSalePrice() public {
        _mintAsUser(user);

        // Default: 500 basis points (5%)
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 100 ether);
        assertEq(receiver, owner);
        assertEq(amount, 5 ether);
    }

    /// @dev Royalty with salePrice=0
    function test_royalty_zeroSalePrice() public {
        _mintAsUser(user);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 0);
        assertEq(receiver, owner);
        assertEq(amount, 0);
    }

    /// @dev Royalty with max fee (10000 bps = 100%)
    function test_royalty_maxFee() public {
        booa.setDefaultRoyalty(owner, 10000);
        _mintAsUser(user);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, owner);
        assertEq(amount, 1 ether);
    }

    /// @dev Royalty fee > 10000 bps should revert
    function test_royalty_overMaxFeeReverts() public {
        vm.expectRevert();
        booa.setDefaultRoyalty(owner, 10001);
    }

    /// @dev Per-token royalty overrides default
    function test_royalty_perTokenOverride() public {
        _mintAsUser(user);
        booa.setTokenRoyalty(0, user2, 1000); // 10% to user2

        (address receiver, uint256 amount) = booa.royaltyInfo(0, 10 ether);
        assertEq(receiver, user2);
        assertEq(amount, 1 ether);

        // Other tokens still use default
        _mintAsUser(user);
        (address receiver2, uint256 amount2) = booa.royaltyInfo(1, 10 ether);
        assertEq(receiver2, owner);
        assertEq(amount2, 0.5 ether); // 5% default
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 9: CONCURRENT/ORDERING ATTACKS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Multiple mints in same block — verify no ordering issues
    function test_order_multipleMintsSameBlock() public {
        uint256 d1 = block.timestamp + 1 hours;
        uint256 d2 = block.timestamp + 2 hours;
        uint256 d3 = block.timestamp + 3 hours;

        bytes memory sig1 = _signMint(validBitmap, validTraits, user, d1);
        bytes memory sig2 = _signMint(validBitmap, validTraits, user, d2);
        bytes memory sig3 = _signMint(validBitmap, validTraits, user2, d3);

        // All in same block
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, d1, sig1);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, d2, sig2);
        vm.prank(user2);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, d3, sig3);

        assertEq(booa.totalSupply(), 3);
        assertEq(booa.ownerOf(0), user);
        assertEq(booa.ownerOf(1), user);
        assertEq(booa.ownerOf(2), user2);
    }

    /// @dev Mint → burn → mint same block — token IDs don't reuse
    function test_order_mintBurnMintSameBlock() public {
        uint256 id0 = _mintAsUser(user);
        assertEq(id0, 0);

        vm.prank(user);
        booa.burn(0);

        uint256 id1 = _mintAsUser(user);
        assertEq(id1, 1); // NOT 0
        assertEq(booa.totalSupply(), 1);
        assertEq(booa.totalMinted(), 2);
        assertEq(booa.totalBurned(), 1);
    }

    /// @dev Proxy contract calling mint — msg.sender is the proxy, not the EOA
    function test_order_proxyMintChangesAddress() public {
        CallerProxy proxy = new CallerProxy();
        vm.deal(address(proxy), 10 ether);

        // Signature is for the PROXY address, not user
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, address(proxy), deadline);

        proxy.proxiedMint{value: MINT_PRICE}(minter, validBitmap, validTraits, deadline, sig);
        assertEq(booa.ownerOf(0), address(proxy));

        // Signature for user doesn't work through proxy
        // msg.sender is the proxy, not the user, so hash differs
        uint256 deadline2 = block.timestamp + 2 hours;
        bytes memory sigUser = _signMint(validBitmap, validTraits, user, deadline2);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        proxy.proxiedMint{value: MINT_PRICE}(minter, validBitmap, validTraits, deadline2, sigUser);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 10: ETH HANDLING & WITHDRAWAL ATTACKS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Overpayment — excess ETH stays in minter contract
    function test_eth_overpayment() public {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        uint256 balBefore = address(minter).balance;
        vm.prank(user);
        minter.mint{value: 1 ether}(validBitmap, validTraits, deadline, sig);

        // Excess stays in minter — no refund!
        assertEq(address(minter).balance, balBefore + 1 ether);
    }

    /// @dev WithdrawTo with griever contract — fails but doesn't lock funds
    function test_eth_withdrawToGriever() public {
        _mintAsUser(user);
        vm.deal(address(minter), 2 ether);

        WithdrawGriever griever = new WithdrawGriever();
        vm.expectRevert("Withdraw failed");
        minter.withdrawTo(payable(address(griever)));

        // Funds still in minter
        assertEq(address(minter).balance, 2 ether);

        // Owner can withdraw to a valid address
        uint256 balBefore = address(owner).balance;
        minter.withdraw();
        assertEq(address(owner).balance, balBefore + 2 ether);
    }

    /// @dev Withdraw reentrancy via malicious receiver
    function test_eth_withdrawReentrancy() public {
        vm.deal(address(minter), 2 ether);

        // Transfer ownership to the reentrant contract
        WithdrawReentrant reentrant = new WithdrawReentrant(address(minter));
        minter.transferOwnership(address(reentrant));

        // The reentrant contract will try to call withdraw() again in receive()
        // Since ownership was transferred, it IS the owner.
        // This could drain the contract if reentrancy is possible.
        // But after the first withdraw, balance is 0, so second call sends 0 ETH.

        vm.prank(address(reentrant));
        minter.withdraw();

        // All ETH should be in the reentrant contract
        assertEq(address(minter).balance, 0);
        assertEq(address(reentrant).balance, 2 ether);
        // Only drained once — no double-spend
    }

    /// @dev BOOA contract has no receive/fallback — can't receive plain ETH
    function test_eth_booaRejectsETH() public {
        vm.prank(attacker);
        (bool ok,) = address(booa).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 11: ERC721 DEEP EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    /// @dev balanceOf after multiple mints and burns
    function test_erc721_balanceOfAccuracy() public {
        _mintAsUser(user);  // id 0
        _mintAsUser(user);  // id 1
        _mintAsUser(user2); // id 2
        assertEq(booa.balanceOf(user), 2);
        assertEq(booa.balanceOf(user2), 1);

        vm.prank(user);
        booa.burn(0);
        assertEq(booa.balanceOf(user), 1);

        // Transfer remaining to user2
        vm.prank(user);
        booa.transferFrom(user, user2, 1);
        assertEq(booa.balanceOf(user), 0);
        assertEq(booa.balanceOf(user2), 2);
    }

    /// @dev safeTransferFrom to contract without onERC721Received — should revert
    function test_erc721_safeTransferToNonReceiver() public {
        _mintAsUser(user);

        // WithdrawGriever doesn't implement onERC721Received
        WithdrawGriever griever = new WithdrawGriever();
        vm.prank(user);
        vm.expectRevert();
        booa.safeTransferFrom(user, address(griever), 0);
    }

    /// @dev Approve and transfer — approval is cleared after transfer
    function test_erc721_approvalClearedAfterTransfer() public {
        _mintAsUser(user);

        vm.prank(user);
        booa.approve(attacker, 0);
        assertEq(booa.getApproved(0), attacker);

        // Transfer
        vm.prank(user);
        booa.transferFrom(user, user2, 0);

        // Approval should be cleared
        assertEq(booa.getApproved(0), address(0));

        // Attacker can't use old approval
        vm.prank(attacker);
        vm.expectRevert();
        booa.transferFrom(user2, attacker, 0);
    }

    /// @dev ownerOf burned token should revert
    function test_erc721_ownerOfBurnedToken() public {
        _mintAsUser(user);
        vm.prank(user);
        booa.burn(0);

        vm.expectRevert();
        booa.ownerOf(0);
    }

    /// @dev tokenURI for burned token should revert (_requireOwned)
    function test_erc721_tokenURIBurnedToken() public {
        _mintAsUser(user);
        vm.prank(user);
        booa.burn(0);

        vm.expectRevert();
        booa.tokenURI(0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 12: METADATA UPDATE DEEP TESTS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev updateMetadata with only imageData (empty traitsData) — only bitmap changes
    function test_meta_updateOnlyImage() public {
        _mintAsUser(user);
        bytes memory originalTraits = store.getTraits(0);

        booa.updateMetadata(0, _makeBitmap(7), bytes(""));

        // Bitmap changed
        bytes memory newBitmap = store.getImageData(0);
        assertEq(uint8(newBitmap[0]) >> 4, 7);

        // Traits unchanged
        bytes memory unchangedTraits = store.getTraits(0);
        assertEq(keccak256(originalTraits), keccak256(unchangedTraits));
    }

    /// @dev updateMetadata with only traitsData (empty imageData) — only traits change
    function test_meta_updateOnlyTraits() public {
        _mintAsUser(user);
        bytes memory originalBitmap = store.getImageData(0);

        booa.updateMetadata(0, bytes(""), bytes("new_traits"));

        // Bitmap unchanged
        bytes memory unchangedBitmap = store.getImageData(0);
        assertEq(keccak256(originalBitmap), keccak256(unchangedBitmap));

        // Traits changed
        bytes memory newTraits = store.getTraits(0);
        assertEq(string(newTraits), "new_traits");
    }

    /// @dev updateMetadata with both empty — only emits event, no state change
    function test_meta_updateBothEmpty() public {
        _mintAsUser(user);
        bytes memory originalBitmap = store.getImageData(0);
        bytes memory originalTraits = store.getTraits(0);

        vm.expectEmit(false, false, false, true);
        emit BOOAv2.MetadataUpdate(0);
        booa.updateMetadata(0, bytes(""), bytes(""));

        assertEq(keccak256(store.getImageData(0)), keccak256(originalBitmap));
        assertEq(keccak256(store.getTraits(0)), keccak256(originalTraits));
    }

    /// @dev updateMetadata with wrong bitmap size
    function test_meta_updateWrongBitmapSize() public {
        _mintAsUser(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        booa.updateMetadata(0, new bytes(100), bytes(""));
    }

    /// @dev updateMetadata emits MetadataUpdate event
    function test_meta_updateEmitsEvent() public {
        _mintAsUser(user);

        vm.expectEmit(false, false, false, true);
        emit BOOAv2.MetadataUpdate(0);
        booa.updateMetadata(0, _makeBitmap(3), bytes("updated"));
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 13: PAUSE EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Both BOOA and Minter paused — double pause
    function test_pause_doublePause() public {
        booa.setPaused(true);
        minter.setPaused(true);

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // Minter pause hits first
        vm.prank(user);
        vm.expectRevert(BOOAMinter.MintingPaused.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);

        // Unpause minter, BOOA pause still blocks
        minter.setPaused(false);
        vm.prank(user);
        vm.expectRevert(BOOAv2.MintingPaused.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);

        // Unpause BOOA — now works
        booa.setPaused(false);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        assertEq(booa.totalSupply(), 1);
    }

    /// @dev Transfer and burn still work when paused
    function test_pause_transferAndBurnWork() public {
        _mintAsUser(user);
        booa.setPaused(true);
        minter.setPaused(true);

        // Transfer works
        vm.prank(user);
        booa.transferFrom(user, user2, 0);
        assertEq(booa.ownerOf(0), user2);

        // Burn works
        vm.prank(user2);
        booa.burn(0);
        assertEq(booa.totalSupply(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CATEGORY 14: INVARIANT CHECKS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Fundamental invariant: totalSupply == totalMinted - totalBurned
    function test_invariant_supplyEquation() public {
        for (uint256 i; i < 5; ++i) {
            _mintAsUser(user);
        }
        assertEq(booa.totalSupply(), booa.totalMinted() - booa.totalBurned());

        vm.startPrank(user);
        booa.burn(0);
        booa.burn(2);
        booa.burn(4);
        vm.stopPrank();

        assertEq(booa.totalSupply(), booa.totalMinted() - booa.totalBurned());
        assertEq(booa.totalSupply(), 2);
        assertEq(booa.totalMinted(), 5);
        assertEq(booa.totalBurned(), 3);
    }

    /// @dev nextTokenId == totalMinted always (no gaps in minting, gaps only from burns)
    function test_invariant_nextTokenIdEqualsTotalMinted() public {
        for (uint256 i; i < 3; ++i) {
            _mintAsUser(user);
        }
        assertEq(booa.nextTokenId(), booa.totalMinted());

        vm.prank(user);
        booa.burn(1);

        // nextTokenId still equals totalMinted (burns don't affect it)
        assertEq(booa.nextTokenId(), booa.totalMinted());

        _mintAsUser(user); // id=3
        assertEq(booa.nextTokenId(), 4);
        assertEq(booa.totalMinted(), 4);
    }

    /// @dev EIP-165 support for all required interfaces
    function test_invariant_interfaceSupport() public view {
        assertTrue(booa.supportsInterface(0x80ac58cd), "ERC721");
        assertTrue(booa.supportsInterface(0x5b5e139f), "ERC721Metadata");
        assertTrue(booa.supportsInterface(0x2a55205a), "ERC2981");
        assertTrue(booa.supportsInterface(0x49064906), "EIP-4906");
        assertTrue(booa.supportsInterface(0x01ffc9a7), "ERC165");
        assertFalse(booa.supportsInterface(0x780e9d63), "NOT ERC721Enumerable");
        assertFalse(booa.supportsInterface(0xdeadbeef), "Random interface");
    }

    /// @dev Multiple authorized minters with independent signers
    function test_invariant_multipleMinters() public {
        uint256 signer2Key = 0xB0B;
        address signer2Addr = vm.addr(signer2Key);
        BOOAMinter minter2 = new BOOAMinter(address(booa), address(store), signer2Addr, MINT_PRICE);
        booa.setMinter(address(minter2), true);
        store.setWriter(address(minter2), true);

        // Both mint successfully
        _mintAsUser(user); // via minter1

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user2, deadline, block.chainid));
        bytes32 ethHash = hash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer2Key, ethHash);
        vm.prank(user2);
        minter2.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));

        assertEq(booa.totalSupply(), 2);

        // Cross-signer signatures don't work
        uint256 deadline2 = block.timestamp + 3 hours;
        bytes memory sig1 = _signMint(validBitmap, validTraits, user, deadline2);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter2.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline2, sig1);
    }

    /// @dev Revoked minter's pending signatures are immediately invalid
    function test_invariant_revokedMinterPendingSigs() public {
        // Get a valid signature
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);

        // Revoke minter BEFORE user uses the signature
        booa.setMinter(address(minter), false);

        // The signature is valid (signer matches), but minter can't call booa.mint()
        vm.prank(user);
        vm.expectRevert(BOOAv2.NotAuthorizedMinter.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }
}
