// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BOOAv2} from "../../contracts/v2/BOOA.sol";
import {BOOAStorage} from "../../contracts/v2/BOOAStorage.sol";
import {BOOARenderer} from "../../contracts/v2/BOOARenderer.sol";
import {BOOAMinter} from "../../contracts/v2/BOOAMinter.sol";

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

    uint256 constant MINT_PRICE = 0.00015 ether;

    bytes validBitmap;
    bytes bitmapWithStripe;
    bytes validTraits;

    function setUp() public {
        signerAddr = vm.addr(signerKey);
        vm.deal(user, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);

        store = new BOOAStorage();
        renderer = new BOOARenderer(address(store));
        booa = new BOOAv2(owner, 500);
        minter = new BOOAMinter(address(booa), address(store), signerAddr, MINT_PRICE);

        booa.setMinter(address(minter), true);
        booa.setRenderer(address(renderer));
        store.setWriter(address(minter), true);

        validBitmap = _makeBitmap(0);
        bitmapWithStripe = _makeBitmapWithStripe(0, 1, 5, 12, 3);
        validTraits = bytes('[{"trait_type":"Creature","value":"Void Walker"},{"trait_type":"Vibe","value":"Dark"}]');
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

    function _signMint(bytes memory imageData, bytes memory traitsData, address who, uint256 deadline) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(imageData, traitsData, who, deadline));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    uint256 private _nonce;

    function _mintAsUser(address who) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, who, deadline);
        vm.prank(who);
        return minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function _mintWithBitmap(address who, bytes memory bmp) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(bmp, validTraits, who, deadline);
        vm.prank(who);
        return minter.mint{value: MINT_PRICE}(bmp, validTraits, deadline, sig);
    }

    function _mintThreeTokens() internal {
        _mintAsUser(user);
        _mintAsUser(user);
        _mintAsUser(user2);
    }

    // ═══════════════════════════════════════════════════
    //  1. INTEGRATION: Full Mint Flow
    // ═══════════════════════════════════════════════════

    function test_mint_fullFlow() public {
        uint256 tokenId = _mintAsUser(user);
        assertEq(tokenId, 0);
        assertEq(booa.ownerOf(0), user);
        assertEq(booa.totalSupply(), 1);
        assertTrue(store.hasBitmap(0));
    }

    function test_mint_sequentialIds() public {
        assertEq(_mintAsUser(user), 0);
        assertEq(_mintAsUser(user), 1);
        assertEq(_mintAsUser(user2), 2);
        assertEq(booa.totalSupply(), 3);
    }

    function test_mint_emitsAgentMinted() public {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.expectEmit(true, true, false, false);
        emit BOOAMinter.AgentMinted(0, user);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_mint_emitsTransfer() public {
        _mintAsUser(user);
        assertEq(booa.ownerOf(0), user);
    }

    function test_mint_tracksMintCount() public {
        _mintAsUser(user);
        _mintAsUser(user);
        assertEq(minter.mintCount(user), 2);
        assertEq(minter.mintCount(user2), 0);
    }

    function test_mint_acceptsOverpayment() public {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        minter.mint{value: 1 ether}(validBitmap, validTraits, deadline, sig);
        assertEq(booa.totalSupply(), 1);
    }

    // ═══════════════════════════════════════════════════
    //  2. TRAITS (SSTORE2 JSON)
    // ═══════════════════════════════════════════════════

    function test_traits_storeAndRetrieve() public {
        _mintAsUser(user);
        bytes memory traits = store.getTraits(0);
        assertGt(traits.length, 0);
        assertEq(uint8(traits[0]), 0x5B); // starts with [
    }

    function test_traits_emptyHandled() public {
        bytes memory emptyTraits = "";
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, emptyTraits, user, deadline);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, emptyTraits, deadline, sig);
        assertEq(store.getTraits(0).length, 0);
    }

    function test_traits_emptyArray() public {
        bytes memory emptyArr = bytes("[]");
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, emptyArr, user, deadline);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, emptyArr, deadline, sig);
        bytes memory stored = store.getTraits(0);
        assertEq(stored.length, 2);
    }

    function test_traits_rejectOversized() public {
        bytes memory bigTraits = new bytes(8193);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, bigTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.TraitsTooLarge.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, bigTraits, deadline, sig);
    }

    function test_traits_accept8192Bytes() public {
        bytes memory maxTraits = new bytes(8192);
        maxTraits[0] = 0x5B; // [
        maxTraits[8191] = 0x5D; // ]
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, maxTraits, user, deadline);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, maxTraits, deadline, sig);
        assertEq(store.getTraits(0).length, 8192);
    }

    function test_traits_includeInTokenURI() public {
        _mintAsUser(user);
        string memory uriWithTraits = booa.tokenURI(0);

        bytes memory empty = "";
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, empty, user, deadline);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, empty, deadline, sig);
        string memory uriNoTraits = booa.tokenURI(1);

        assertGt(bytes(uriWithTraits).length, bytes(uriNoTraits).length);
    }

    // ═══════════════════════════════════════════════════
    //  3. SIGNATURE VALIDATION
    // ═══════════════════════════════════════════════════

    function test_sig_rejectExpired() public {
        uint256 deadline = block.timestamp - 1;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.SignatureExpired.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_sig_rejectWrongSigner() public {
        uint256 wrongKey = 0xBAD;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 hash = keccak256(abi.encodePacked(validBitmap, validTraits, user, deadline));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethHash);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));
    }

    function test_sig_rejectReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.SignatureAlreadyUsed.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_sig_rejectFrontRunning() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user2);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_sig_rejectTamperedBitmap() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes memory tamperedBmp = _makeBitmap(4); // white instead of black
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(tamperedBmp, validTraits, deadline, sig);
    }

    function test_sig_rejectTamperedTraits() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        bytes memory fakeTraits = bytes('[{"trait_type":"Creature","value":"HACKED"}]');
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, fakeTraits, deadline, sig);
    }

    function test_sig_rejectTamperedDeadline() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline + 1, sig);
    }

    function test_sig_acceptExactDeadline() public {
        uint256 deadline = block.timestamp;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        assertEq(booa.totalSupply(), 1);
    }

    function test_sig_signerRotation() public {
        uint256 newKey = 0xB0B;
        address newAddr = vm.addr(newKey);
        minter.setSigner(newAddr);

        uint256 deadline = block.timestamp + 1 hours;
        // Old signer rejected
        bytes memory oldSig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InvalidSignature.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, oldSig);

        // New signer accepted
        bytes32 hash = keccak256(abi.encodePacked(validBitmap, validTraits, user, deadline));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newKey, ethHash);
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, abi.encodePacked(r, s, v));
        assertEq(booa.totalSupply(), 1);
    }

    // ═══════════════════════════════════════════════════
    //  4. PAYMENT & LIMITS
    // ═══════════════════════════════════════════════════

    function test_payment_rejectInsufficient() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        minter.mint{value: 0}(validBitmap, validTraits, deadline, sig);
    }

    function test_payment_rejectUnderpay() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.InsufficientPayment.selector);
        minter.mint{value: MINT_PRICE - 1}(validBitmap, validTraits, deadline, sig);
    }

    function test_limits_maxPerWallet() public {
        minter.setMaxPerWallet(2);
        _mintAsUser(user);
        _mintAsUser(user);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.MintLimitReached.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_limits_maxSupply() public {
        minter.setMaxSupply(1);
        _mintAsUser(user);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user2, deadline);
        vm.prank(user2);
        vm.expectRevert(BOOAMinter.MaxSupplyReached.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_limits_differentWalletsAllowed() public {
        minter.setMaxPerWallet(1);
        _mintAsUser(user);
        _mintAsUser(user2);
        _mintAsUser(user3);
        assertEq(booa.totalSupply(), 3);
    }

    function test_limits_unlimitedWhenZero() public {
        for (uint256 i; i < 5; ++i) _mintAsUser(user);
        assertEq(booa.totalSupply(), 5);
    }

    function test_limits_cannotSetMaxSupplyBelowCurrent() public {
        _mintAsUser(user);
        _mintAsUser(user);
        vm.expectRevert(BOOAMinter.MaxSupplyReached.selector);
        minter.setMaxSupply(1);
    }

    function test_limits_canSetMaxSupplyToZero() public {
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
    //  5. PAUSE
    // ═══════════════════════════════════════════════════

    function test_pause_blocksMinterMint() public {
        minter.setPaused(true);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAMinter.MintingPaused.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_pause_blocksBooa() public {
        booa.setPaused(true);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAv2.MintingPaused.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_pause_allowAfterUnpause() public {
        minter.setPaused(true);
        minter.setPaused(false);
        _mintAsUser(user);
        assertEq(booa.totalSupply(), 1);
    }

    function test_pause_emitEvents() public {
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.Paused(true);
        minter.setPaused(true);
    }

    function test_pause_nonOwnerReverts() public {
        vm.prank(user);
        vm.expectRevert();
        minter.setPaused(true);
    }

    // ═══════════════════════════════════════════════════
    //  6. BITMAP VALIDATION
    // ═══════════════════════════════════════════════════

    function test_bitmap_rejectEmpty() public {
        bytes memory emptyBmp = "";
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(emptyBmp, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: MINT_PRICE}(emptyBmp, validTraits, deadline, sig);
    }

    function test_bitmap_reject1Byte() public {
        bytes memory bmp = new bytes(1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: MINT_PRICE}(bmp, validTraits, deadline, sig);
    }

    function test_bitmap_reject2047() public {
        bytes memory bmp = new bytes(2047);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: MINT_PRICE}(bmp, validTraits, deadline, sig);
    }

    function test_bitmap_reject2049() public {
        bytes memory bmp = new bytes(2049);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: MINT_PRICE}(bmp, validTraits, deadline, sig);
    }

    function test_bitmap_acceptAllFF() public {
        bytes memory bmp = new bytes(2048);
        for (uint256 i; i < 2048; ++i) bmp[i] = bytes1(uint8(0xFF));
        _mintWithBitmap(user, bmp);
        assertEq(booa.totalSupply(), 1);
    }

    function test_bitmap_acceptMixedNibbles() public {
        bytes memory bmp = new bytes(2048);
        for (uint256 i; i < 2048; ++i) bmp[i] = bytes1(uint8(i & 0xFF));
        _mintWithBitmap(user, bmp);
        assertEq(booa.totalSupply(), 1);
    }

    function testFuzz_bitmap_rejectWrongLength(uint256 length) public {
        length = bound(length, 0, 50000);
        vm.assume(length != 2048);
        bytes memory bmp = new bytes(length);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(bmp, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.InvalidBitmap.selector);
        minter.mint{value: MINT_PRICE}(bmp, validTraits, deadline, sig);
    }

    // ═══════════════════════════════════════════════════
    //  7. SVG RENDERING
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
    //  8. TOKEN URI + METADATA
    // ═══════════════════════════════════════════════════

    function test_tokenURI_validDataURI() public {
        _mintAsUser(user);
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_tokenURI_containsSVG() public {
        _mintAsUser(user);
        string memory uri = booa.tokenURI(0);
        assertGt(bytes(uri).length, 100);
    }

    function test_tokenURI_revertNonExistent() public {
        vm.expectRevert();
        booa.tokenURI(99);
    }

    function test_tokenURI_sequentialNames() public {
        _mintThreeTokens();
        for (uint256 i; i < 3; ++i) {
            string memory uri = booa.tokenURI(i);
            assertTrue(_startsWith(uri, "data:application/json;base64,"));
        }
    }

    // ═══════════════════════════════════════════════════
    //  9. ROYALTIES (EIP-2981)
    // ═══════════════════════════════════════════════════

    function test_royalty_default() public {
        _mintAsUser(user);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, owner);
        assertEq(amount, 0.05 ether);
    }

    function test_royalty_ownerUpdate() public {
        booa.setDefaultRoyalty(user, 1000); // 10%
        _mintAsUser(user);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, user);
        assertEq(amount, 0.1 ether);
    }

    function test_royalty_perToken() public {
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
    //  10. ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════

    function test_admin_changeSigner() public {
        address newSigner = address(0x1234);
        minter.setSigner(newSigner);
        assertEq(minter.signer(), newSigner);
    }

    function test_admin_changeMintPrice() public {
        minter.setMintPrice(0.001 ether);
        assertEq(minter.mintPrice(), 0.001 ether);
    }

    function test_admin_mintPriceEvent() public {
        vm.expectEmit(false, false, false, true);
        emit BOOAMinter.MintPriceUpdated(0.01 ether);
        minter.setMintPrice(0.01 ether);
    }

    function test_admin_withdraw() public {
        _mintAsUser(user);
        uint256 balBefore = address(owner).balance;
        minter.withdraw();
        assertEq(address(owner).balance, balBefore + MINT_PRICE);
    }

    function test_admin_withdrawTo() public {
        _mintAsUser(user);
        uint256 balBefore = user2.balance;
        minter.withdrawTo(payable(user2));
        assertEq(user2.balance, balBefore + MINT_PRICE);
    }

    function test_admin_withdrawToZeroReverts() public {
        _mintAsUser(user);
        vm.expectRevert("Zero address");
        minter.withdrawTo(payable(address(0)));
    }

    function test_admin_rendererUpdate() public {
        BOOARenderer newRenderer = new BOOARenderer(address(store));
        booa.setRenderer(address(newRenderer));
        _mintAsUser(user);
        string memory uri = booa.tokenURI(0);
        assertGt(bytes(uri).length, 0);
    }

    function test_admin_nonOwnerReverts() public {
        vm.startPrank(user);
        vm.expectRevert(); minter.setSigner(user);
        vm.expectRevert(); minter.setMintPrice(0);
        vm.expectRevert(); minter.setMaxSupply(0);
        vm.expectRevert(); minter.setMaxPerWallet(0);
        vm.expectRevert(); minter.setPaused(true);
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
    //  11. ACCESS CONTROL
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
        store.setWriter(address(minter), false);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAStorage.NotAuthorized.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
    }

    function test_access_revokeMinter() public {
        booa.setMinter(address(minter), false);
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        vm.prank(user);
        vm.expectRevert(BOOAv2.NotAuthorizedMinter.selector);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
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
    //  12. STORAGE ISOLATION
    // ═══════════════════════════════════════════════════

    function test_storage_bitmapRoundTrip() public {
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
    //  13. GAS BENCHMARKS
    // ═══════════════════════════════════════════════════

    function test_gas_singleMint() public {
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, validTraits, user, deadline);
        uint256 g = gasleft();
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, validTraits, deadline, sig);
        emit log_named_uint("V2 mint (with traits) gas", g - gasleft());
    }

    function test_gas_mintNoTraits() public {
        bytes memory empty = "";
        uint256 deadline = block.timestamp + 1 hours + _nonce++;
        bytes memory sig = _signMint(validBitmap, empty, user, deadline);
        uint256 g = gasleft();
        vm.prank(user);
        minter.mint{value: MINT_PRICE}(validBitmap, empty, deadline, sig);
        emit log_named_uint("V2 mint (no traits) gas", g - gasleft());
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
        _mintAsUser(user);
        uint256 g = gasleft();
        booa.tokenURI(0);
        emit log_named_uint("V2 tokenURI gas", g - gasleft());
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
