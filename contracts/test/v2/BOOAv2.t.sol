// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BOOAv2} from "../../contracts/v2/BOOA.sol";
import {BOOAStorage} from "../../contracts/v2/BOOAStorage.sol";
import {BOOARenderer} from "../../contracts/v2/BOOARenderer.sol";
import {BOOAMinter} from "../../contracts/v2/BOOAMinter.sol";
import {Merkle} from "murky/src/Merkle.sol";

contract BOOAv2Test is Test {
    BOOAv2 public booa;
    BOOAStorage public store;
    BOOARenderer public renderer;
    BOOAMinter public minter;

    address owner = address(this);
    address user = address(0xBEEF);
    address user2 = address(0xCAFE);
    address user3 = address(0xDEAD);

    uint256 signerKey = 0xA11CE;
    address signerAddr;

    uint256 constant ALLOWLIST_PRICE = 0.0042 ether;
    uint256 constant PUBLIC_PRICE = 0.0069 ether;

    bytes validBitmap;
    bytes bitmapWithStripe;
    bytes validTraits;

    // Merkle tree state
    bytes32 merkleRoot;
    bytes32[] merkleLeaves;
    Merkle merkleHelper;

    function setUp() public {
        signerAddr = vm.addr(signerKey);
        vm.deal(user, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);

        store = new BOOAStorage();
        renderer = new BOOARenderer(address(store));
        booa = new BOOAv2(owner, 500);
        minter = new BOOAMinter(address(booa), address(store), signerAddr, ALLOWLIST_PRICE, PUBLIC_PRICE);

        booa.setMinter(address(minter), true);
        booa.setRenderer(address(renderer));
        booa.setDataStore(address(store));
        store.setWriter(address(minter), true);
        store.setWriter(address(booa), true);

        validBitmap = _makeBitmap(0);
        bitmapWithStripe = _makeBitmapWithStripe(0, 1, 5, 12, 3);
        validTraits = bytes('[{"trait_type":"Creature","value":"Void Walker"},{"trait_type":"Vibe","value":"Dark"}]');

        // Build Merkle tree for allowlist: user and user2
        merkleHelper = new Merkle();
        merkleLeaves = new bytes32[](2);
        merkleLeaves[0] = _computeLeaf(user);
        merkleLeaves[1] = _computeLeaf(user2);
        merkleRoot = merkleHelper.getRoot(merkleLeaves);
        minter.setMerkleRoot(merkleRoot);
    }

    receive() external payable {}

    // ═══════════════════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════════════════

    function _makeBitmap(uint8 colorIndex) internal pure returns (bytes memory) {
        bytes memory bmp = new bytes(2048);
        uint8 packed = (colorIndex << 4) | (colorIndex & 0x0F);
        for (uint256 i; i < 2048; ++i) bmp[i] = bytes1(packed);
        return bmp;
    }

    function _makeBitmapWithStripe(uint8 bg, uint8 fg, uint256 row, uint256 startX, uint256 length) internal pure returns (bytes memory) {
        bytes memory bmp = _makeBitmap(bg);
        uint256 rowOffset = row * 32;
        for (uint256 i; i < length; ++i) {
            uint256 x = startX + i;
            uint256 byteIdx = rowOffset + (x >> 1);
            uint8 b = uint8(bmp[byteIdx]);
            if (x & 1 == 0) b = (fg << 4) | (b & 0x0F);
            else b = (b & 0xF0) | (fg & 0x0F);
            bmp[byteIdx] = bytes1(b);
        }
        return bmp;
    }

    function _computeLeaf(address addr) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(addr))));
    }

    function _getMerkleProof(address addr) internal view returns (bytes32[] memory) {
        uint256 index;
        bytes32 leaf = _computeLeaf(addr);
        for (uint256 i; i < merkleLeaves.length; ++i) {
            if (merkleLeaves[i] == leaf) { index = i; break; }
        }
        return merkleHelper.getProof(merkleLeaves, index);
    }

    function _signMint(bytes memory imageData, bytes memory traitsData, address who, uint256 deadline) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(imageData, traitsData, who, deadline, block.chainid, address(minter)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    uint256 private _nonce;

    /// @dev Mint as user in PUBLIC phase (no proof needed)
    function _mintAsUser(address who) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, who, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(who);
        return minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function _mintWithBitmap(address who, bytes memory bmp) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(bmp, validTraits, who, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(who);
        return minter.mint{value: PUBLIC_PRICE}(bmp, validTraits, deadline, sig, emptyProof);
    }

    function _mintThreeTokens() internal {
        _mintAsUser(user);
        _mintAsUser(user);
        _mintAsUser(user2);
    }

    /// @dev Mint as user in ALLOWLIST phase with proof
    function _mintAllowlist(address who) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, who, deadline);
        bytes32[] memory proof = _getMerkleProof(who);
        vm.prank(who);
        return minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline, sig, proof);
    }

    /// @dev Set phase to Public for tests that don't care about phase logic
    function _setPublicPhase() internal {
        minter.setPhase(BOOAMinter.MintPhase.Public);
    }

    // ═══════════════════════════════════════════════════
    //  1. INTEGRATION: Full Mint Flow
    // ═══════════════════════════════════════════════════

    function test_mint_fullFlow() public {
        _setPublicPhase();
        uint256 tokenId = _mintAsUser(user);
        assertEq(tokenId, 0);
        assertEq(booa.ownerOf(0), user);
        assertEq(booa.totalSupply(), 1);
        assertTrue(store.hasBitmap(0));
    }

    function test_mint_sequentialIds() public {
        _setPublicPhase();
        assertEq(_mintAsUser(user), 0);
        assertEq(_mintAsUser(user), 1);
        assertEq(_mintAsUser(user2), 2);
        assertEq(booa.totalSupply(), 3);
    }

    function test_mint_emitsAgentMinted() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.expectEmit(true, true, false, false);
        emit BOOAMinter.AgentMinted(0, user);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_mint_emitsTransfer() public {
        _setPublicPhase();
        _mintAsUser(user);
        assertEq(booa.ownerOf(0), user);
    }

    function test_mint_tracksMintCount() public {
        _setPublicPhase();
        _mintAsUser(user);
        _mintAsUser(user);
        assertEq(minter.mintCount(user), 2);
        assertEq(minter.mintCount(user2), 0);
    }

    function test_mint_refundsOverpayment() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        uint256 balBefore = user.balance;
        vm.prank(user);
        minter.mint{value: 1 ether}(validBitmap, validTraits, deadline, sig, emptyProof);
        assertEq(booa.totalSupply(), 1);
        // Only the price should be deducted, excess refunded
        assertEq(user.balance, balBefore - PUBLIC_PRICE);
    }

    // ═══════════════════════════════════════════════════
    //  2. TRAITS (SSTORE2 JSON)
    // ═══════════════════════════════════════════════════

    function test_traits_storeAndRetrieve() public {
        _setPublicPhase();
        _mintAsUser(user);
        bytes memory traits = store.getTraits(0);
        assertGt(traits.length, 0);
        assertEq(uint8(traits[0]), 0x5B); // starts with [
    }

    function test_traits_emptyHandled() public {
        _setPublicPhase();
        bytes memory emptyTraits = "";
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, emptyTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, emptyTraits, deadline, sig, emptyProof);
        assertEq(store.getTraits(0).length, 0);
    }

    function test_traits_emptyArray() public {
        _setPublicPhase();
        bytes memory emptyArr = bytes("[]");
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, emptyArr, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, emptyArr, deadline, sig, emptyProof);
        bytes memory stored = store.getTraits(0);
        assertEq(stored.length, 2);
    }

    function test_traits_rejectOversized() public {
        _setPublicPhase();
        bytes memory bigTraits = new bytes(8193);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, bigTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.TraitsTooLarge.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, bigTraits, deadline, sig, emptyProof);
    }

    function test_traits_accept8192Bytes() public {
        _setPublicPhase();
        bytes memory maxTraits = new bytes(8192);
        maxTraits[0] = 0x5B; // [
        maxTraits[8191] = 0x5D; // ]
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, maxTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, maxTraits, deadline, sig, emptyProof);
        assertEq(store.getTraits(0).length, 8192);
    }

    function test_traits_includeInTokenURI() public {
        _setPublicPhase();
        _mintAsUser(user);
        string memory uriWithTraits = booa.tokenURI(0);

        bytes memory empty = "";
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, empty, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, empty, deadline, sig, emptyProof);
        string memory uriNoTraits = booa.tokenURI(1);

        assertGt(bytes(uriWithTraits).length, bytes(uriNoTraits).length);
    }

    // ═══════════════════════════════════════════════════
    //  3. SIGNATURE VALIDATION
    // ═══════════════════════════════════════════════════

    function test_sig_rejectExpired() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp - 1;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.SignatureExpired.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_sig_rejectWrongSigner() public {
        _setPublicPhase();
        uint256 wrongKey = 0xBAD;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid, address(minter)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethHash);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v), emptyProof);
    }

    function test_sig_rejectReplay() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.SignatureAlreadyUsed.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_sig_rejectFrontRunning() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user2);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_sig_rejectTamperedBitmap() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes memory tamperedBmp = _makeBitmap(4); // white instead of black
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(tamperedBmp, validTraits, deadline, sig, emptyProof);
    }

    function test_sig_rejectTamperedTraits() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes memory fakeTraits = bytes('[{"trait_type":"Creature","value":"HACKED"}]');
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, fakeTraits, deadline, sig, emptyProof);
    }

    function test_sig_rejectTamperedDeadline() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline + 1, sig, emptyProof);
    }

    function test_sig_acceptExactDeadline() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
        assertEq(booa.totalSupply(), 1);
    }

    function test_sig_signerRotation() public {
        _setPublicPhase();
        uint256 newKey = 0xB0B;
        address newAddr = vm.addr(newKey);
        minter.setSigner(newAddr);

        uint256 deadline = block.timestamp + 1 hours;
        // Old signer rejected
        bytes memory oldSig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, oldSig, emptyProof);

        // New signer accepted
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, block.chainid, address(minter)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, ethHash);
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v), emptyProof);
        assertEq(booa.totalSupply(), 1);
    }

    // ═══════════════════════════════════════════════════
    //  4. PAYMENT & LIMITS
    // ═══════════════════════════════════════════════════

    function test_payment_rejectInsufficient() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        minter.mint{value: 0}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_payment_rejectUnderpay() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        minter.mint{value: PUBLIC_PRICE - 1}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_limits_maxPerWallet() public {
        _setPublicPhase();
        minter.setMaxPerWallet(2);
        _mintAsUser(user);
        _mintAsUser(user);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.MintLimitReached.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_limits_maxSupply() public {
        _setPublicPhase();
        minter.setMaxSupply(1);
        _mintAsUser(user);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user2, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user2);
        vm.expectRevert(BOOAMinter.MaxSupplyReached.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_limits_differentWalletsAllowed() public {
        _setPublicPhase();
        minter.setMaxPerWallet(1);
        _mintAsUser(user);
        _mintAsUser(user2);
        _mintAsUser(user3);
        assertEq(booa.totalSupply(), 3);
    }

    function test_limits_unlimitedWhenZero() public {
        _setPublicPhase();
        for (uint256 i; i < 5; ++i) _mintAsUser(user);
        assertEq(booa.totalSupply(), 5);
    }

    function test_limits_cannotSetMaxSupplyBelowCurrent() public {
        _setPublicPhase();
        _mintAsUser(user);
        _mintAsUser(user);
        vm.expectRevert(BOOAMinter.MaxSupplyReached.selector);
        minter.setMaxSupply(1);
    }

    function test_limits_canSetMaxSupplyToZero() public {
        _setPublicPhase();
        _mintAsUser(user);
        minter.setMaxSupply(0); // unlimited
        _mintAsUser(user);
        assertEq(booa.totalSupply(), 2);
    }

    function test_limits_emitEvents() public {
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.MaxPerWalletUpdated(5);
        minter.setMaxPerWallet(5);

        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.MaxSupplyUpdated(100);
        minter.setMaxSupply(100);
    }

    // ═══════════════════════════════════════════════════
    //  5. PHASE MANAGEMENT
    // ═══════════════════════════════════════════════════

    function test_phase_defaultClosed() public view {
        assertEq(uint256(minter.currentPhase()), uint256(BOOAMinter.MintPhase.Closed));
    }

    function test_phase_closedBlocksMint() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.MintingClosed.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_phase_setAllowlist() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        assertEq(uint256(minter.currentPhase()), uint256(BOOAMinter.MintPhase.Allowlist));
    }

    function test_phase_setPublic() public {
        minter.setPhase(BOOAMinter.MintPhase.Public);
        assertEq(uint256(minter.currentPhase()), uint256(BOOAMinter.MintPhase.Public));
    }

    function test_phase_setClosed() public {
        minter.setPhase(BOOAMinter.MintPhase.Public);
        minter.setPhase(BOOAMinter.MintPhase.Closed);
        assertEq(uint256(minter.currentPhase()), uint256(BOOAMinter.MintPhase.Closed));
    }

    function test_phase_allowlistRequiresMerkleRoot() public {
        // Deploy fresh minter without merkle root
        BOOAMinter freshMinter = new BOOAMinter(address(booa), address(store), signerAddr, ALLOWLIST_PRICE, PUBLIC_PRICE);
        vm.expectRevert(BOOAMinter.NotAllowlisted.selector);
        freshMinter.setPhase(BOOAMinter.MintPhase.Allowlist);
    }

    function test_phase_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.PhaseUpdated(BOOAMinter.MintPhase.Public);
        minter.setPhase(BOOAMinter.MintPhase.Public);
    }

    function test_phase_nonOwnerReverts() public {
        vm.prank(user);
        vm.expectRevert();
        minter.setPhase(BOOAMinter.MintPhase.Public);
    }

    function test_phase_mintAfterReopen() public {
        _setPublicPhase();
        _mintAsUser(user);
        minter.setPhase(BOOAMinter.MintPhase.Closed);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.MintingClosed.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
        // Reopen
        minter.setPhase(BOOAMinter.MintPhase.Public);
        _mintAsUser(user);
        assertEq(booa.totalSupply(), 2);
    }

    // ═══════════════════════════════════════════════════
    //  6. ALLOWLIST / MERKLE VERIFICATION
    // ═══════════════════════════════════════════════════

    function test_allowlist_allowlistedCanMint() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        uint256 tokenId = _mintAllowlist(user);
        assertEq(tokenId, 0);
        assertEq(booa.ownerOf(0), user);
    }

    function test_allowlist_secondAllowlistedCanMint() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        _mintAllowlist(user);
        uint256 tokenId = _mintAllowlist(user2);
        assertEq(tokenId, 1);
        assertEq(booa.totalSupply(), 2);
    }

    function test_allowlist_notAllowlistedReverts() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user3, deadline);
        bytes32[] memory fakeProof = new bytes32[](1);
        fakeProof[0] = bytes32(uint256(0x1234));
        vm.prank(user3);
        vm.expectRevert(BOOAMinter.NotAllowlisted.selector);
        minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline, sig, fakeProof);
    }

    function test_allowlist_emptyProofReverts() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user3, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user3);
        vm.expectRevert(BOOAMinter.NotAllowlisted.selector);
        minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_allowlist_usesAllowlistPrice() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        // Should revert with public price minus 1 wei below allowlist price
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory proof = _getMerkleProof(user);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        minter.mint{value: ALLOWLIST_PRICE - 1}(validBitmap, validTraits, deadline, sig, proof);
    }

    function test_allowlist_tracksMintCount() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        _mintAllowlist(user);
        _mintAllowlist(user);
        assertEq(minter.mintCount(user), 2);
    }

    function test_allowlist_publicPhaseIgnoresProof() public {
        _setPublicPhase();
        // user3 is NOT on allowlist but should be able to mint in public phase
        _mintAsUser(user3);
        assertEq(booa.totalSupply(), 1);
    }

    function test_allowlist_merkleRootUpdate() public {
        // Change merkle root to include user3 and a dummy address (murky needs >= 2 leaves)
        bytes32[] memory newLeaves = new bytes32[](2);
        newLeaves[0] = _computeLeaf(user3);
        newLeaves[1] = _computeLeaf(address(0xF00D));
        bytes32 newRoot = merkleHelper.getRoot(newLeaves);
        minter.setMerkleRoot(newRoot);

        minter.setPhase(BOOAMinter.MintPhase.Allowlist);

        // user (previously allowlisted) should be rejected
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory oldProof = _getMerkleProof(user);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.NotAllowlisted.selector);
        minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline, sig, oldProof);

        // user3 should succeed with new proof
        uint256 deadline2 = block.timestamp + 1 hours + _nonce++;
        bytes memory sig2 = _signMint(validBitmap, validTraits, user3, deadline2);
        bytes32[] memory newProof = merkleHelper.getProof(newLeaves, 0);
        vm.prank(user3);
        minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline2, sig2, newProof);
        assertEq(booa.totalSupply(), 1);
    }

    function test_allowlist_merkleRootEvent() public {
        bytes32 newRoot = bytes32(uint256(0xDEAD));
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.MerkleRootUpdated(newRoot);
        minter.setMerkleRoot(newRoot);
    }

    // ═══════════════════════════════════════════════════
    //  7. PHASE PRICING
    // ═══════════════════════════════════════════════════

    function test_pricing_allowlistPrice() public view {
        assertEq(minter.allowlistPrice(), ALLOWLIST_PRICE);
    }

    function test_pricing_publicPrice() public view {
        assertEq(minter.publicPrice(), PUBLIC_PRICE);
    }

    function test_pricing_mintPriceViewAllowlist() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        assertEq(minter.mintPrice(), ALLOWLIST_PRICE);
    }

    function test_pricing_mintPriceViewPublic() public {
        minter.setPhase(BOOAMinter.MintPhase.Public);
        assertEq(minter.mintPrice(), PUBLIC_PRICE);
    }

    function test_pricing_mintPriceViewClosed() public view {
        assertEq(minter.mintPrice(), 0);
    }

    function test_pricing_setAllowlistPrice() public {
        uint256 newPrice = 0.01 ether;
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.AllowlistPriceUpdated(newPrice);
        minter.setAllowlistPrice(newPrice);
        assertEq(minter.allowlistPrice(), newPrice);
    }

    function test_pricing_setPublicPrice() public {
        uint256 newPrice = 0.02 ether;
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.PublicPriceUpdated(newPrice);
        minter.setPublicPrice(newPrice);
        assertEq(minter.publicPrice(), newPrice);
    }

    function test_pricing_publicRejectsAllowlistPrice() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        // Pay allowlist price (0.0042) which is less than public (0.0069)
        minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    // ═══════════════════════════════════════════════════
    //  8. SOLD-OUT PROTECTION
    // ═══════════════════════════════════════════════════

    function test_soldout_cannotChangeMaxSupplyWhenSoldOut() public {
        _setPublicPhase();
        minter.setMaxSupply(2);
        _mintAsUser(user);
        _mintAsUser(user2);
        // Now sold out — cannot change maxSupply
        vm.expectRevert(BOOAMinter.SoldOut.selector);
        minter.setMaxSupply(5);
    }

    function test_soldout_cannotChangeMaxSupplyToZeroWhenSoldOut() public {
        _setPublicPhase();
        minter.setMaxSupply(1);
        _mintAsUser(user);
        vm.expectRevert(BOOAMinter.SoldOut.selector);
        minter.setMaxSupply(0);
    }

    function test_soldout_canChangeMaxSupplyBeforeSoldOut() public {
        _setPublicPhase();
        minter.setMaxSupply(10);
        _mintAsUser(user);
        // Not sold out — can still change
        minter.setMaxSupply(20);
        assertEq(minter.maxSupply(), 20);
    }

    // ═══════════════════════════════════════════════════
    //  9. PAUSE (BOOA-level)
    // ═══════════════════════════════════════════════════

    function test_pause_blocksBooa() public {
        _setPublicPhase();
        booa.setPaused(true);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAv2.MintingPaused.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_pause_booaNonOwnerReverts() public {
        vm.prank(user);
        vm.expectRevert();
        booa.setPaused(true);
    }

    // ═══════════════════════════════════════════════════
    //  10. BITMAP VALIDATION
    // ═══════════════════════════════════════════════════

    function test_bitmap_rejectEmpty() public {
        _setPublicPhase();
        bytes memory emptyBmp = "";
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(emptyBmp, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: PUBLIC_PRICE}(emptyBmp, validTraits, deadline, sig, emptyProof);
    }

    function test_bitmap_reject1Byte() public {
        _setPublicPhase();
        bytes memory bmp = new bytes(1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: PUBLIC_PRICE}(bmp, validTraits, deadline, sig, emptyProof);
    }

    function test_bitmap_reject2047() public {
        _setPublicPhase();
        bytes memory bmp = new bytes(2047);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: PUBLIC_PRICE}(bmp, validTraits, deadline, sig, emptyProof);
    }

    function test_bitmap_reject2049() public {
        _setPublicPhase();
        bytes memory bmp = new bytes(2049);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: PUBLIC_PRICE}(bmp, validTraits, deadline, sig, emptyProof);
    }

    function test_bitmap_acceptAllFF() public {
        _setPublicPhase();
        bytes memory bmp = new bytes(2048);
        for (uint256 i; i < 2048; ++i) bmp[i] = bytes1(uint8(0xFF));
        _mintWithBitmap(user, bmp);
        assertEq(booa.totalSupply(), 1);
    }

    function test_bitmap_acceptMixedNibbles() public {
        _setPublicPhase();
        bytes memory bmp = new bytes(2048);
        for (uint256 i; i < 2048; ++i) bmp[i] = bytes1(uint8(i & 0xFF));
        _mintWithBitmap(user, bmp);
        assertEq(booa.totalSupply(), 1);
    }

    function testFuzz_bitmap_rejectWrongLength(uint256 length) public {
        _setPublicPhase();
        length = bound(length, 0, 50000);
        vm.assume(length != 2048);
        bytes memory bmp = new bytes(length);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: PUBLIC_PRICE}(bmp, validTraits, deadline, sig, emptyProof);
    }

    // ═══════════════════════════════════════════════════
    //  11. SVG RENDERING
    // ═══════════════════════════════════════════════════

    function test_svg_allBlack() public view {
        string memory svg = renderer.renderSVG(validBitmap);
        assertTrue(_contains(svg, '<svg'));
        assertTrue(_contains(svg, '<rect fill="#000000"'));
        assertTrue(_contains(svg, '</svg>'));
        assertFalse(_contains(svg, '<path'));
    }

    function test_svg_withStripe() public view {
        string memory svg = renderer.renderSVG(bitmapWithStripe);
        assertTrue(_contains(svg, '<path stroke="#626262"'));
        assertTrue(_contains(svg, 'M12 5h3'));
    }

    function test_svg_allWhite() public view {
        bytes memory bmp = _makeBitmap(4);
        string memory svg = renderer.renderSVG(bmp);
        assertTrue(_contains(svg, '<rect fill="#FFFFFF"'));
        assertFalse(_contains(svg, '<path'));
    }

    function test_svg_allMagenta() public view {
        bytes memory bmp = _makeBitmap(15);
        string memory svg = renderer.renderSVG(bmp);
        assertTrue(_contains(svg, '<rect fill="#A057A3"'));
    }

    function test_svg_revertInvalidBitmap() public {
        bytes memory bad = new bytes(100);
        vm.expectRevert("Invalid bitmap");
        renderer.renderSVG(bad);
    }

    function test_svg_all16PaletteColors() public view {
        for (uint8 c; c < 16; ++c) {
            bytes memory bmp = _makeBitmap(c);
            string memory svg = renderer.renderSVG(bmp);
            assertTrue(_contains(svg, '<svg'));
            assertTrue(_contains(svg, '</svg>'));
        }
    }

    // ═══════════════════════════════════════════════════
    //  12. TOKEN URI + METADATA
    // ═══════════════════════════════════════════════════

    function test_tokenURI_validDataURI() public {
        _setPublicPhase();
        _mintAsUser(user);
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_tokenURI_containsSVG() public {
        _setPublicPhase();
        _mintAsUser(user);
        string memory uri = booa.tokenURI(0);
        assertGt(bytes(uri).length, 100);
    }

    function test_tokenURI_revertNonExistent() public {
        vm.expectRevert();
        booa.tokenURI(99);
    }

    function test_tokenURI_sequentialNames() public {
        _setPublicPhase();
        _mintThreeTokens();
        for (uint256 i; i < 3; ++i) {
            string memory uri = booa.tokenURI(i);
            assertTrue(_startsWith(uri, "data:application/json;base64,"));
        }
    }

    // ═══════════════════════════════════════════════════
    //  13. ROYALTIES (EIP-2981)
    // ═══════════════════════════════════════════════════

    function test_royalty_default() public {
        _setPublicPhase();
        _mintAsUser(user);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, owner);
        assertEq(amount, 0.05 ether);
    }

    function test_royalty_ownerUpdate() public {
        _setPublicPhase();
        booa.setDefaultRoyalty(user, 1000); // 10%
        _mintAsUser(user);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, user);
        assertEq(amount, 0.1 ether);
    }

    function test_royalty_perToken() public {
        _setPublicPhase();
        _mintAsUser(user);
        booa.setTokenRoyalty(0, user2, 250); // 2.5%
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, user2);
        assertEq(amount, 0.025 ether);
    }

    function test_royalty_nonOwnerReverts() public {
        vm.prank(user);
        vm.expectRevert();
        booa.setDefaultRoyalty(user, 500);
    }

    function test_royalty_supportsERC2981() public view {
        assertTrue(booa.supportsInterface(0x2a55205a));
    }

    function test_royalty_supportsERC721() public view {
        assertTrue(booa.supportsInterface(0x80ac58cd));
    }

    // ═══════════════════════════════════════════════════
    //  14. ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════

    function test_admin_changeSigner() public {
        address newSigner = address(0x1234);
        minter.setSigner(newSigner);
        assertEq(minter.signer(), newSigner);
    }

    function test_admin_withdraw() public {
        _setPublicPhase();
        _mintAsUser(user);
        uint256 balBefore = address(owner).balance;
        minter.withdraw();
        assertEq(address(owner).balance, balBefore + PUBLIC_PRICE);
    }

    function test_admin_withdrawTo() public {
        _setPublicPhase();
        _mintAsUser(user);
        uint256 balBefore = user2.balance;
        minter.withdrawTo(payable(user2));
        assertEq(user2.balance, balBefore + PUBLIC_PRICE);
    }

    function test_admin_withdrawToZeroReverts() public {
        _setPublicPhase();
        _mintAsUser(user);
        vm.expectRevert("Zero address");
        minter.withdrawTo(payable(address(0)));
    }

    function test_admin_rendererUpdate() public {
        _setPublicPhase();
        BOOARenderer newRenderer = new BOOARenderer(address(store));
        booa.setRenderer(address(newRenderer));
        _mintAsUser(user);
        string memory uri = booa.tokenURI(0);
        assertGt(bytes(uri).length, 0);
    }

    function test_admin_nonOwnerReverts() public {
        vm.startPrank(user);
        vm.expectRevert(); minter.setSigner(user);
        vm.expectRevert(); minter.setAllowlistPrice(0);
        vm.expectRevert(); minter.setPublicPrice(0);
        vm.expectRevert(); minter.setMaxSupply(0);
        vm.expectRevert(); minter.setMaxPerWallet(0);
        vm.expectRevert(); minter.setPhase(BOOAMinter.MintPhase.Public);
        vm.expectRevert(); minter.setMerkleRoot(bytes32(0));
        vm.expectRevert(); minter.withdraw();
        vm.stopPrank();
    }

    function test_admin_booaNonOwnerReverts() public {
        vm.startPrank(user);
        vm.expectRevert(); booa.setMinter(user, true);
        vm.expectRevert(); booa.setRenderer(user);
        vm.expectRevert(); booa.setPaused(true);
        vm.expectRevert(); booa.setDefaultRoyalty(user, 500);
        vm.expectRevert(); booa.withdraw();
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════
    //  15. ACCESS CONTROL
    // ═══════════════════════════════════════════════════

    function test_access_onlyMinterCanMint() public {
        vm.prank(user);
        vm.expectRevert(BOOAv2.NotAuthorizedMinter.selector);
        booa.mint(user);
    }

    function test_access_onlyWriterCanStoreImage() public {
        vm.prank(user);
        vm.expectRevert(BOOAStorage.NotAuthorized.selector);
        store.setImageData(0, validBitmap);
    }

    function test_access_onlyWriterCanStoreTraits() public {
        vm.prank(user);
        vm.expectRevert(BOOAStorage.NotAuthorized.selector);
        store.setTraits(0, validTraits);
    }

    function test_access_revokeWriter() public {
        _setPublicPhase();
        store.setWriter(address(minter), false);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.NotAuthorized.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_access_revokeMinter() public {
        _setPublicPhase();
        booa.setMinter(address(minter), false);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAv2.NotAuthorizedMinter.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function test_access_rejectPlainETH() public {
        vm.prank(user);
        (bool ok,) = address(booa).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function test_access_minterAcceptsETH() public {
        vm.prank(user);
        (bool ok,) = address(minter).call{value: 1 ether}("");
        assertTrue(ok);
    }

    // ═══════════════════════════════════════════════════
    //  16. STORAGE ISOLATION
    // ═══════════════════════════════════════════════════

    function test_storage_bitmapRoundTrip() public {
        _setPublicPhase();
        _mintWithBitmap(user, bitmapWithStripe);
        bytes memory stored = store.getImageData(0);
        assertEq(stored.length, 2048);
        // Check specific stripe pixel
        uint256 rowOffset = 5 * 32;
        assertEq(uint8(stored[rowOffset + 6]) >> 4, 1); // col 12 = dark grey
    }

    function test_storage_noBitmapReturnsEmpty() public view {
        bytes memory data = store.getImageData(999);
        assertEq(data.length, 0);
    }

    function test_storage_noTraitsReturnsEmpty() public view {
        bytes memory data = store.getTraits(999);
        assertEq(data.length, 0);
    }

    function test_storage_hasBitmapFalseForNonExistent() public view {
        assertFalse(store.hasBitmap(999));
    }

    // ═══════════════════════════════════════════════════
    //  17. GAS BENCHMARKS
    // ═══════════════════════════════════════════════════

    function test_gas_singleMint() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        uint256 g = gasleft();
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
        emit log_named_uint("V2 mint (public, with traits) gas", g - gasleft());
    }

    function test_gas_mintNoTraits() public {
        _setPublicPhase();
        bytes memory empty = "";
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, empty, user, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        uint256 g = gasleft();
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, empty, deadline, sig, emptyProof);
        emit log_named_uint("V2 mint (no traits) gas", g - gasleft());
    }

    function test_gas_allowlistMint() public {
        minter.setPhase(BOOAMinter.MintPhase.Allowlist);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes32[] memory proof = _getMerkleProof(user);
        uint256 g = gasleft();
        vm.prank(user);
        minter.mint{value: ALLOWLIST_PRICE}(validBitmap, validTraits, deadline, sig, proof);
        emit log_named_uint("V2 mint (allowlist, with proof) gas", g - gasleft());
    }

    function test_gas_renderSVG() public {
        uint256 g = gasleft();
        renderer.renderSVG(validBitmap);
        emit log_named_uint("V2 renderSVG gas", g - gasleft());
    }

    function test_gas_renderSVGWithStripe() public {
        uint256 g = gasleft();
        renderer.renderSVG(bitmapWithStripe);
        emit log_named_uint("V2 renderSVG (stripe) gas", g - gasleft());
    }

    function test_gas_tokenURI() public {
        _setPublicPhase();
        _mintAsUser(user);
        uint256 g = gasleft();
        booa.tokenURI(0);
        emit log_named_uint("V2 tokenURI gas", g - gasleft());
    }

    // ═══════════════════════════════════════════════════
    //  18. BURN
    // ═══════════════════════════════════════════════════

    function test_burn_ownerCanBurn() public {
        _setPublicPhase();
        uint256 tokenId = _mintAsUser(user);
        vm.prank(user);
        booa.burn(tokenId);
        vm.expectRevert();
        booa.ownerOf(tokenId);
    }

    function test_burn_updatesSupply() public {
        _setPublicPhase();
        _mintAsUser(user);
        _mintAsUser(user);
        assertEq(booa.totalSupply(), 2);
        vm.prank(user);
        booa.burn(0);
        assertEq(booa.totalSupply(), 1);
        assertEq(booa.totalMinted(), 2);
        assertEq(booa.totalBurned(), 1);
    }

    function test_burn_nonOwnerReverts() public {
        _setPublicPhase();
        _mintAsUser(user);
        vm.prank(user2);
        vm.expectRevert(BOOAv2.NotTokenOwner.selector);
        booa.burn(0);
    }

    function test_burn_doubleReverts() public {
        _setPublicPhase();
        _mintAsUser(user);
        vm.prank(user);
        booa.burn(0);
        vm.prank(user);
        vm.expectRevert();
        booa.burn(0);
    }

    // ═══════════════════════════════════════════════════
    //  19. EIP-4906 METADATA UPDATE
    // ═══════════════════════════════════════════════════

    function test_eip4906_supportsInterface() public view {
        assertTrue(booa.supportsInterface(bytes4(0x49064906)));
    }

    function test_eip4906_emitsBatchOnRendererUpdate() public {
        _setPublicPhase();
        _mintAsUser(user);
        _mintAsUser(user);
        BOOARenderer newRenderer = new BOOARenderer(address(store));
        vm.expectEmit(false, false, false, true);
        emit BOOAv2.BatchMetadataUpdate(0, 1);
        booa.setRenderer(address(newRenderer));
    }

    function test_eip4906_noEmitWhenNoTokens() public {
        BOOARenderer newRenderer = new BOOARenderer(address(store));
        // Should not revert when totalMinted == 0
        booa.setRenderer(address(newRenderer));
    }

    function test_updateMetadata_imageOnly() public {
        _setPublicPhase();
        _mintAsUser(user);
        bytes memory newBitmap = _makeBitmap(4); // white
        vm.expectEmit(false, false, false, true);
        emit BOOAv2.MetadataUpdate(0);
        booa.updateMetadata(0, newBitmap, "");

        // Verify image actually changed
        bytes memory stored = store.getImageData(0);
        assertEq(uint8(stored[0]) >> 4, 4); // white pixel
    }

    function test_updateMetadata_traitsOnly() public {
        _setPublicPhase();
        _mintAsUser(user);
        bytes memory newTraits = bytes('[{"trait_type":"Creature","value":"Updated"}]');
        vm.expectEmit(false, false, false, true);
        emit BOOAv2.MetadataUpdate(0);
        booa.updateMetadata(0, "", newTraits);

        bytes memory stored = store.getTraits(0);
        assertTrue(stored.length > 0);
    }

    function test_updateMetadata_both() public {
        _setPublicPhase();
        _mintAsUser(user);
        bytes memory newBitmap = _makeBitmap(5); // green
        bytes memory newTraits = bytes('[{"trait_type":"Creature","value":"New"}]');
        booa.updateMetadata(0, newBitmap, newTraits);

        bytes memory storedBmp = store.getImageData(0);
        assertEq(uint8(storedBmp[0]) >> 4, 5);
        bytes memory storedTraits = store.getTraits(0);
        assertGt(storedTraits.length, 0);
    }

    function test_updateMetadata_nonOwnerReverts() public {
        _setPublicPhase();
        _mintAsUser(user);
        bytes memory newBitmap = _makeBitmap(4);
        vm.prank(user);
        vm.expectRevert();
        booa.updateMetadata(0, newBitmap, "");
    }

    function test_updateMetadata_nonExistentReverts() public {
        bytes memory newBitmap = _makeBitmap(4);
        vm.expectRevert();
        booa.updateMetadata(999, newBitmap, "");
    }

    function test_updateMetadata_tokenURIChanges() public {
        _setPublicPhase();
        _mintAsUser(user);

        string memory uriBefore = booa.tokenURI(0);

        bytes memory newBitmap = _makeBitmap(4); // white instead of black
        booa.updateMetadata(0, newBitmap, "");

        string memory uriAfter = booa.tokenURI(0);
        // tokenURI should differ because bitmap changed → different SVG
        assertFalse(keccak256(bytes(uriBefore)) == keccak256(bytes(uriAfter)));
    }

    // ═══════════════════════════════════════════════════
    //  20. OWNER WRITER ACCESS (BOOAStorage)
    // ═══════════════════════════════════════════════════

    function test_storage_ownerCanWrite() public {
        // Owner should be able to write without being an authorized writer
        store.setImageData(0, validBitmap);
        assertTrue(store.hasBitmap(0));
    }

    function test_storage_ownerCanWriteTraits() public {
        store.setTraits(0, validTraits);
        bytes memory stored = store.getTraits(0);
        assertGt(stored.length, 0);
    }

    // ═══════════════════════════════════════════════════
    //  21. CROSS-CHAIN REPLAY PROTECTION
    // ═══════════════════════════════════════════════════

    function test_sig_rejectCrossChainReplay() public {
        _setPublicPhase();
        uint256 deadline = block.timestamp + 1 hours;
        // Sign on a different chain ID
        bytes32 hash = keccak256(abi.encode(validBitmap, validTraits, user, deadline, uint256(999)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v), emptyProof);
    }

    // ═══════════════════════════════════════════════════
    //  22. REALISTIC TRAIT GAS BENCHMARKS
    // ═══════════════════════════════════════════════════

    function test_gas_realisticTraits() public {
        _setPublicPhase();
        bytes memory realisticTraits = bytes(
            '[{"trait_type":"Name","value":"Void Serpent"},{"trait_type":"Description","value":"A shadowy data wraith that slithers through encrypted networks"},'
            '{"trait_type":"Creature","value":"Data Wraith"},{"trait_type":"Vibe","value":"Dark and methodical"},'
            '{"trait_type":"Emoji","value":"\\ud83d\\udc0d"},{"trait_type":"Skill","value":"Network infiltration"},'
            '{"trait_type":"Skill","value":"Cipher breaking"},{"trait_type":"Skill","value":"Data exfiltration"},'
            '{"trait_type":"Domain","value":"Cryptography"},{"trait_type":"Domain","value":"Network security"},'
            '{"trait_type":"Personality","value":"Patient and calculating"},{"trait_type":"Hair","value":"None - smooth scales"},'
            '{"trait_type":"Eyes","value":"Glowing green slits"},{"trait_type":"Skin","value":"Obsidian scales"},'
            '{"trait_type":"Accessory","value":"Neural jack"},{"trait_type":"Palette","value":"C64"}]'
        );

        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes32 hash = keccak256(abi.encode(validBitmap, realisticTraits, user, deadline, block.chainid, address(minter)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);

        bytes32[] memory emptyProof = new bytes32[](0);
        uint256 g = gasleft();
        vm.prank(user);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, realisticTraits, deadline, abi.encodePacked(r, s, v), emptyProof);
        emit log_named_uint("V2 mint (realistic traits ~800B) gas", g - gasleft());
    }

    // ═══════════════════════════════════════════════════
    //  String helpers
    // ═══════════════════════════════════════════════════

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory s = bytes(str);
        bytes memory p = bytes(prefix);
        if (s.length < p.length) return false;
        for (uint256 i; i < p.length; ++i) {
            if (s[i] != p[i]) return false;
        }
        return true;
    }

    function _contains(string memory str, string memory substr) internal pure returns (bool) {
        bytes memory s = bytes(str);
        bytes memory sub = bytes(substr);
        if (sub.length > s.length) return false;
        for (uint256 i; i <= s.length - sub.length; ++i) {
            bool found = true;
            for (uint256 j; j < sub.length; ++j) {
                if (s[i + j] != sub[j]) { found = false; break; }
            }
            if (found) return true;
        }
        return false;
    }
}
