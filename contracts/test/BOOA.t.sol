// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/BOOA.sol";

contract BOOABitmapTest is Test {
    BOOA public booa;
    address owner = address(this);
    address user = address(0xBEEF);
    address user2 = address(0xCAFE);

    uint256 mintPrice = 0.0042 ether;
    uint96 royaltyFee = 500;

    // ── Bitmap helpers ──

    /// @dev Creates a 2048-byte bitmap filled with a single C64 palette index (0-15).
    ///      Each byte packs two pixels: high nibble = even column, low nibble = odd column.
    function _makeBitmap(uint8 colorIndex) internal pure returns (bytes memory) {
        bytes memory bmp = new bytes(2048);
        uint8 packed = (colorIndex << 4) | (colorIndex & 0x0F);
        for (uint256 i = 0; i < 2048; i++) {
            bmp[i] = bytes1(packed);
        }
        return bmp;
    }

    /// @dev Creates a bitmap with a horizontal stripe of `fgColor` at row `row`, starting at `startX` for `length` pixels.
    function _makeBitmapWithStripe(uint8 bgColor, uint8 fgColor, uint256 row, uint256 startX, uint256 length)
        internal pure returns (bytes memory)
    {
        bytes memory bmp = _makeBitmap(bgColor);
        for (uint256 x = startX; x < startX + length; x++) {
            uint256 byteIdx = row * 32 + (x >> 1);
            uint8 b = uint8(bmp[byteIdx]);
            if (x % 2 == 0) {
                b = (fgColor << 4) | (b & 0x0F);
            } else {
                b = (b & 0xF0) | (fgColor & 0x0F);
            }
            bmp[byteIdx] = bytes1(b);
        }
        return bmp;
    }

    // Test data
    bytes validBitmap;       // all-black (palette 0)
    bytes bitmapWithStripe;  // black bg + dark grey stripe
    bytes validTraits = bytes(
        '[{"trait_type":"Creature","value":"AI familiar"},{"trait_type":"Vibe","value":"sharp and witty"},{"trait_type":"Name","value":"TestAgent"}]'
    );

    function setUp() public {
        booa = new BOOA(mintPrice, owner, royaltyFee);
        vm.deal(user, 100 ether);
        vm.deal(user2, 100 ether);
        validBitmap = _makeBitmap(0);
        bitmapWithStripe = _makeBitmapWithStripe(0, 1, 5, 12, 3); // dark grey stripe at row 5
    }

    // Allow this test contract to receive ETH (for withdraw)
    receive() external payable {}

    // ══════════════════════════════════════════════════════════
    //  MINTING
    // ══════════════════════════════════════════════════════════

    function test_mint_withValidBitmapAndTraits() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        assertEq(booa.totalSupply(), 1);
        assertEq(booa.ownerOf(0), user);
    }

    function test_mint_sequentialTokenIds() public {
        vm.startPrank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.stopPrank();
        assertEq(booa.totalSupply(), 3);
        assertEq(booa.ownerOf(0), user);
        assertEq(booa.ownerOf(1), user);
        assertEq(booa.ownerOf(2), user);
    }

    function test_mint_revertInsufficientPayment() public {
        vm.prank(user);
        vm.expectRevert("Insufficient payment");
        booa.mintAgent{value: 0}(validBitmap, validTraits);
    }

    function test_mint_revertInvalidBitmapEmpty() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(bytes(""), validTraits);
    }

    function test_mint_revertInvalidBitmapTooShort() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(2047), validTraits);
    }

    function test_mint_revertInvalidBitmapTooLong() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(2049), validTraits);
    }

    function test_mint_emitsAgentMinted() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, false);
        emit BOOA.AgentMinted(0, user, address(0));
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
    }

    function test_mint_tracksMintCountPerWallet() public {
        vm.startPrank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.stopPrank();
        assertEq(booa.mintCount(user), 2);
        assertEq(booa.mintCount(user2), 0);
    }

    // ══════════════════════════════════════════════════════════
    //  TRAITS
    // ══════════════════════════════════════════════════════════

    function test_traits_storeAndRetrieve() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        string memory traits = booa.getTraits(0);
        assertEq(traits, string(validTraits));
    }

    function test_traits_includeInTokenURI() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
        // URI with traits is longer than without
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, bytes(""));
        string memory uriNoTraits = booa.tokenURI(1);
        assertTrue(bytes(uri).length > bytes(uriNoTraits).length);
    }

    function test_traits_emptyHandledGracefully() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, bytes(""));
        string memory traits = booa.getTraits(0);
        assertEq(traits, "");
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    // ══════════════════════════════════════════════════════════
    //  TOKEN URI & ON-CHAIN SVG RENDERING
    // ══════════════════════════════════════════════════════════

    function test_tokenURI_validDataURI() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_tokenURI_containsRenderedSVG() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        string memory uri = booa.tokenURI(0);
        assertTrue(bytes(uri).length > 100);
        // getSVG returns rendered SVG from bitmap
        string memory svg = booa.getSVG(0);
        assertTrue(_contains(svg, '<svg xmlns="http://www.w3.org/2000/svg"'));
        assertTrue(_contains(svg, '<rect fill="#000000"'));
        assertTrue(_contains(svg, "</svg>"));
    }

    function test_tokenURI_sequentialNames() public {
        vm.startPrank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.stopPrank();
        for (uint256 i = 0; i < 3; i++) {
            string memory uri = booa.tokenURI(i);
            assertTrue(_startsWith(uri, "data:application/json;base64,"));
        }
    }

    function test_tokenURI_revertNonExistent() public {
        vm.expectRevert();
        booa.tokenURI(99);
    }

    // ══════════════════════════════════════════════════════════
    //  getSVG — ON-CHAIN RENDERING
    // ══════════════════════════════════════════════════════════

    function test_getSVG_allBlackBitmap() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        string memory svg = booa.getSVG(0);
        // All-black = single rect, no paths
        assertTrue(_contains(svg, '<rect fill="#000000" width="64" height="64"/>'));
        assertFalse(_contains(svg, "<path")); // no non-background pixels
    }

    function test_getSVG_rendersPathsForNonBackgroundColors() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(bitmapWithStripe, validTraits);
        string memory svg = booa.getSVG(0);
        assertTrue(_contains(svg, '<rect fill="#000000"'));       // background
        assertTrue(_contains(svg, '<path stroke="#626262"'));     // dark grey
        assertTrue(_contains(svg, "M12 5h3"));                   // stripe at x=12, y=5, len=3
    }

    function test_getSVG_allWhiteBitmap() public {
        bytes memory whiteBmp = _makeBitmap(4); // palette 4 = #FFFFFF
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(whiteBmp, validTraits);
        string memory svg = booa.getSVG(0);
        assertTrue(_contains(svg, '<rect fill="#FFFFFF"'));
    }

    function test_getSVG_revertNonExistent() public {
        vm.expectRevert();
        booa.getSVG(99);
    }

    // ══════════════════════════════════════════════════════════
    //  getBitmap — RAW DATA RETRIEVAL
    // ══════════════════════════════════════════════════════════

    function test_getBitmap_returnsExactStoredBytes() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(bitmapWithStripe, validTraits);
        bytes memory raw = booa.getBitmap(0);
        assertEq(raw.length, 2048);
        // Verify the stripe pixel byte
        assertEq(uint8(raw[5 * 32 + 6]), uint8(bitmapWithStripe[5 * 32 + 6]));
    }

    function test_getBitmap_revertNonExistent() public {
        vm.expectRevert();
        booa.getBitmap(99);
    }

    // ══════════════════════════════════════════════════════════
    //  ENUMERATION (ERC721Enumerable)
    // ══════════════════════════════════════════════════════════

    function _mintThreeTokens() internal {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user2);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
    }

    function test_enum_totalSupply() public {
        _mintThreeTokens();
        assertEq(booa.totalSupply(), 3);
    }

    function test_enum_tokenByIndex() public {
        _mintThreeTokens();
        assertEq(booa.tokenByIndex(0), 0);
        assertEq(booa.tokenByIndex(1), 1);
        assertEq(booa.tokenByIndex(2), 2);
    }

    function test_enum_tokenOfOwnerByIndex() public {
        _mintThreeTokens();
        assertEq(booa.tokenOfOwnerByIndex(user, 0), 0);
        assertEq(booa.tokenOfOwnerByIndex(user, 1), 1);
        assertEq(booa.tokenOfOwnerByIndex(user2, 0), 2);
    }

    function test_enum_balanceOf() public {
        _mintThreeTokens();
        assertEq(booa.balanceOf(user), 2);
        assertEq(booa.balanceOf(user2), 1);
    }

    function test_enum_revertTokenOfOwnerByIndexOutOfBounds() public {
        _mintThreeTokens();
        vm.expectRevert();
        booa.tokenOfOwnerByIndex(user, 5);
    }

    // ══════════════════════════════════════════════════════════
    //  ROYALTIES (EIP-2981)
    // ══════════════════════════════════════════════════════════

    function test_royalty_defaultRoyaltyInfo() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, owner);
        assertEq(amount, 0.05 ether);
    }

    function test_royalty_ownerUpdateDefault() public {
        booa.setDefaultRoyalty(user2, 1000);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, user2);
        assertEq(amount, 0.1 ether);
    }

    function test_royalty_perTokenRoyalty() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.setTokenRoyalty(0, user2, 250);
        (address receiver, uint256 amount) = booa.royaltyInfo(0, 1 ether);
        assertEq(receiver, user2);
        assertEq(amount, 0.025 ether);
    }

    function test_royalty_revertNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert();
        booa.setDefaultRoyalty(user, 500);
        vm.expectRevert();
        booa.setTokenRoyalty(0, user, 500);
        vm.stopPrank();
    }

    function test_royalty_supportsERC2981() public view {
        assertTrue(booa.supportsInterface(0x2a55205a));
    }

    function test_royalty_supportsERC721() public view {
        assertTrue(booa.supportsInterface(0x80ac58cd));
    }

    function test_royalty_supportsERC721Enumerable() public view {
        assertTrue(booa.supportsInterface(0x780e9d63));
    }

    // ══════════════════════════════════════════════════════════
    //  SUPPLY AND WALLET LIMITS
    // ══════════════════════════════════════════════════════════

    function test_limits_enforceMaxSupply() public {
        booa.setMaxSupply(1);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user2);
        vm.expectRevert("Max supply reached");
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
    }

    function test_limits_enforceMaxPerWallet() public {
        booa.setMaxPerWallet(1);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user);
        vm.expectRevert("Wallet mint limit reached");
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
    }

    function test_limits_differentWalletsAllowedWithMaxPerWallet() public {
        booa.setMaxPerWallet(1);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user2);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        assertEq(booa.totalSupply(), 2);
    }

    function test_limits_unlimitedWhenLimitsZero() public {
        vm.startPrank(user);
        for (uint256 i = 0; i < 3; i++) {
            booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        }
        vm.stopPrank();
        assertEq(booa.totalSupply(), 3);
    }

    function test_limits_cannotSetMaxSupplyBelowCurrent() public {
        vm.startPrank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.stopPrank();
        vm.expectRevert("Below current supply");
        booa.setMaxSupply(1);
    }

    function test_limits_canSetMaxSupplyToZeroAfterMints() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.setMaxSupply(0);
        assertEq(booa.maxSupply(), 0);
    }

    function test_limits_emitMaxSupplyUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit BOOA.MaxSupplyUpdated(100);
        booa.setMaxSupply(100);
    }

    function test_limits_emitMaxPerWalletUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit BOOA.MaxPerWalletUpdated(5);
        booa.setMaxPerWallet(5);
    }

    // ══════════════════════════════════════════════════════════
    //  PAUSE
    // ══════════════════════════════════════════════════════════

    function test_pause_preventsMinting() public {
        booa.setPaused(true);
        vm.prank(user);
        vm.expectRevert("Minting is paused");
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
    }

    function test_pause_allowMintAfterUnpause() public {
        booa.setPaused(true);
        booa.setPaused(false);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        assertEq(booa.totalSupply(), 1);
    }

    function test_pause_emitPausedTrue() public {
        vm.expectEmit(false, false, false, true);
        emit BOOA.Paused(true);
        booa.setPaused(true);
    }

    function test_pause_emitPausedFalse() public {
        booa.setPaused(true);
        vm.expectEmit(false, false, false, true);
        emit BOOA.Paused(false);
        booa.setPaused(false);
    }

    function test_pause_revertNonOwner() public {
        vm.prank(user);
        vm.expectRevert();
        booa.setPaused(true);
    }

    // ══════════════════════════════════════════════════════════
    //  OWNER FUNCTIONS
    // ══════════════════════════════════════════════════════════

    function test_owner_setMintPrice() public {
        uint256 newPrice = 0.01 ether;
        booa.setMintPrice(newPrice);
        assertEq(booa.mintPrice(), newPrice);
    }

    function test_owner_revertSetMintPriceNonOwner() public {
        vm.prank(user);
        vm.expectRevert();
        booa.setMintPrice(0.01 ether);
    }

    function test_owner_withdraw() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        uint256 balBefore = owner.balance;
        booa.withdraw();
        assertEq(owner.balance - balBefore, mintPrice);
    }

    function test_owner_withdrawTo() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        uint256 balBefore = user2.balance;
        booa.withdrawTo(payable(user2));
        assertEq(user2.balance - balBefore, mintPrice);
    }

    function test_owner_withdrawToRevertZeroAddress() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.expectRevert("Zero address");
        booa.withdrawTo(payable(address(0)));
    }

    function test_owner_emitMintPriceUpdated() public {
        uint256 newPrice = 0.005 ether;
        vm.expectEmit(false, false, false, true);
        emit BOOA.MintPriceUpdated(newPrice);
        booa.setMintPrice(newPrice);
    }

    function test_owner_revertAdminFunctionsFromNonOwner() public {
        vm.startPrank(user);
        vm.expectRevert();
        booa.setMaxSupply(100);
        vm.expectRevert();
        booa.setMaxPerWallet(5);
        vm.stopPrank();
    }

    // ══════════════════════════════════════════════════════════
    //  SECURITY: BITMAP VALIDATION
    //  (Replaces all SVG sanitization — bitmap format makes
    //   injection structurally impossible)
    // ══════════════════════════════════════════════════════════

    function test_bitmap_acceptValid2048Bytes() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        assertEq(booa.totalSupply(), 1);
    }

    function test_bitmap_rejectEmpty() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(bytes(""), validTraits);
    }

    function test_bitmap_reject1Byte() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(1), validTraits);
    }

    function test_bitmap_reject2047Bytes() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(2047), validTraits);
    }

    function test_bitmap_reject2049Bytes() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(2049), validTraits);
    }

    function test_bitmap_reject4096Bytes() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(4096), validTraits);
    }

    function test_bitmap_reject24576Bytes() public {
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(new bytes(24576), validTraits);
    }

    function test_bitmap_acceptAllFFBytes() public {
        // 0xFF = palette 15 (magenta) for both nibbles
        bytes memory allFF = new bytes(2048);
        for (uint256 i = 0; i < 2048; i++) allFF[i] = bytes1(0xFF);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(allFF, validTraits);
        string memory svg = booa.getSVG(0);
        assertTrue(_contains(svg, '<rect fill="#A057A3"')); // palette 15 = magenta
    }

    function test_bitmap_acceptMixedNibbleValues() public {
        bytes memory mixed = new bytes(2048);
        for (uint256 i = 0; i < 2048; i++) {
            mixed[i] = bytes1(uint8(((i % 16) << 4) | ((i + 1) % 16)));
        }
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(mixed, validTraits);
        assertEq(booa.totalSupply(), 1);
    }

    /// @dev Fuzz test: any length != 2048 must revert
    function testFuzz_bitmap_rejectWrongLength(uint256 length) public {
        vm.assume(length != 2048);
        vm.assume(length < 50000); // keep gas reasonable
        bytes memory bmp = new bytes(length);
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.mintAgent{value: mintPrice}(bmp, validTraits);
    }

    // ══════════════════════════════════════════════════════════
    //  SECURITY: INPUT LIMITS
    // ══════════════════════════════════════════════════════════

    function test_input_rejectOversizeTraits() public {
        bytes memory big = new bytes(8193);
        for (uint256 i = 0; i < 8193; i++) big[i] = "x";
        vm.prank(user);
        vm.expectRevert(BOOA.TraitsTooLarge.selector);
        booa.mintAgent{value: mintPrice}(validBitmap, big);
    }

    // ══════════════════════════════════════════════════════════
    //  COMMIT-REVEAL MINTING
    // ══════════════════════════════════════════════════════════

    function test_commit_withCorrectPayment() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        assertEq(booa.commitmentCount(user), 1);
    }

    function test_commit_emitsCommitMint() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit BOOA.CommitMint(user, 0);
        booa.commitMint{value: mintPrice}();
    }

    function test_commit_revertInsufficientPayment() public {
        vm.prank(user);
        vm.expectRevert("Insufficient payment");
        booa.commitMint{value: 0}();
    }

    function test_commit_revertWhenPaused() public {
        booa.setPaused(true);
        vm.prank(user);
        vm.expectRevert("Minting is paused");
        booa.commitMint{value: mintPrice}();
    }

    function test_commit_enforceMaxPerWallet() public {
        booa.setMaxPerWallet(1);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user);
        vm.expectRevert("Wallet mint limit reached");
        booa.commitMint{value: mintPrice}();
    }

    function test_commit_enforceMaxSupply() public {
        booa.setMaxSupply(1);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user2);
        vm.expectRevert("Max supply reached");
        booa.commitMint{value: mintPrice}();
    }

    function test_commit_multiplePerAddress() public {
        vm.startPrank(user);
        booa.commitMint{value: mintPrice}();
        booa.commitMint{value: mintPrice}();
        vm.stopPrank();
        assertEq(booa.commitmentCount(user), 2);
    }

    function test_reveal_afterCommit() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        assertEq(booa.totalSupply(), 1);
        assertEq(booa.ownerOf(0), user);
    }

    function test_reveal_correctTokenURI() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    function test_reveal_emitsAgentMinted() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        vm.expectEmit(true, true, false, false);
        emit BOOA.AgentMinted(0, user, address(0));
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_reveal_revertAlreadyRevealed() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        vm.prank(user);
        vm.expectRevert("Already revealed");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_reveal_revertInvalidSlot() public {
        vm.prank(user);
        vm.expectRevert("Invalid slot");
        booa.revealMint(99, validBitmap, validTraits);
    }

    function test_reveal_revertAfterDeadlineExpires() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        vm.expectRevert("Commitment expired");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_reveal_tracksMintCount() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        assertEq(booa.mintCount(user), 1);
    }

    function test_commit_getCommitmentDetails() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        (uint256 ts, bool revealed) = booa.getCommitment(user, 0);
        assertTrue(ts > 0);
        assertFalse(revealed);
    }

    // ══════════════════════════════════════════════════════════
    //  RECLAIM EXPIRED
    // ══════════════════════════════════════════════════════════

    function test_reclaim_afterDeadline() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.warp(block.timestamp + 7 days + 1);
        uint256 balBefore = user.balance;
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(user.balance - balBefore, mintPrice);
    }

    function test_reclaim_revertBeforeDeadline() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        vm.expectRevert("Not expired yet");
        booa.reclaimExpired(0);
    }

    function test_reclaim_revertDoubleReclaim() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        booa.reclaimExpired(0);
        vm.prank(user);
        vm.expectRevert("Already revealed");
        booa.reclaimExpired(0);
    }

    // ══════════════════════════════════════════════════════════
    //  SECURITY: BITMAP VALIDATION VIA REVEALM INT
    // ══════════════════════════════════════════════════════════

    function _commitForUser() internal {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
    }

    function test_revealBitmap_rejectTooShort() public {
        _commitForUser();
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.revealMint(0, new bytes(100), validTraits);
    }

    function test_revealBitmap_rejectTooLong() public {
        _commitForUser();
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.revealMint(0, new bytes(4096), validTraits);
    }

    function test_revealBitmap_rejectEmpty() public {
        _commitForUser();
        vm.prank(user);
        vm.expectRevert(BOOA.InvalidBitmap.selector);
        booa.revealMint(0, bytes(""), validTraits);
    }

    function test_revealBitmap_acceptValid() public {
        _commitForUser();
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        assertEq(booa.ownerOf(0), user);
    }

    function test_revealBitmap_rejectOversizeTraits() public {
        _commitForUser();
        bytes memory big = new bytes(8193);
        for (uint256 i = 0; i < 8193; i++) big[i] = "x";
        vm.prank(user);
        vm.expectRevert(BOOA.TraitsTooLarge.selector);
        booa.revealMint(0, validBitmap, big);
    }

    // ── Slot Manipulation ──

    function test_revealAttack_anotherUsersSlot() public {
        _commitForUser();
        vm.prank(user2);
        vm.expectRevert("Invalid slot");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_revealAttack_outOfBoundsSlot() public {
        _commitForUser();
        vm.prank(user);
        vm.expectRevert("Invalid slot");
        booa.revealMint(1, validBitmap, validTraits);
    }

    function test_revealAttack_doubleReveal() public {
        _commitForUser();
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        vm.prank(user);
        vm.expectRevert("Already revealed");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_revealAttack_after7DayDeadline() public {
        _commitForUser();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        vm.expectRevert("Commitment expired");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_revealAttack_reclaimOtherUsersSlot() public {
        _commitForUser();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user2);
        vm.expectRevert("Invalid slot");
        booa.reclaimExpired(0);
    }

    function test_revealAttack_revealAfterReclaim() public {
        _commitForUser();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        booa.reclaimExpired(0);
        vm.prank(user);
        vm.expectRevert("Already revealed");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_revealAttack_emptyTraits() public {
        _commitForUser();
        vm.prank(user);
        booa.revealMint(0, validBitmap, bytes(""));
        assertEq(booa.ownerOf(0), user);
        string memory traits = booa.getTraits(0);
        assertEq(traits, "");
    }

    function test_revealAttack_traitsSpecialJSON() public {
        _commitForUser();
        bytes memory weirdTraits = bytes('[{"trait_type":"test","value":"val"}]');
        vm.prank(user);
        booa.revealMint(0, validBitmap, weirdTraits);
        string memory uri = booa.tokenURI(0);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
    }

    // ══════════════════════════════════════════════════════════
    //  FIX #1: maxPerWallet enforced in commitMint and revealMint
    // ══════════════════════════════════════════════════════════

    function test_fix1_blockSecondCommitWhenMaxPerWallet1() public {
        booa.setMaxPerWallet(1);
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user);
        vm.expectRevert("Wallet mint limit reached");
        booa.commitMint{value: mintPrice}();
    }

    function test_fix1_blockRevealWhenMintCountAtMax() public {
        booa.setMaxPerWallet(1);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.setMaxPerWallet(0);
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        booa.setMaxPerWallet(1);
        vm.prank(user);
        vm.expectRevert("Wallet mint limit reached");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_fix1_allowCommitAfterExpiredReclaimFreesSlot() public {
        booa.setMaxPerWallet(1);
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        booa.reclaimExpired(0);
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        assertEq(booa.commitmentCount(user), 2);
    }

    // ══════════════════════════════════════════════════════════
    //  FIX #2: withdraw protects reserved funds
    // ══════════════════════════════════════════════════════════

    function test_fix2_cannotWithdrawCommitReservedFunds() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user2);
        booa.commitMint{value: mintPrice}();
        vm.expectRevert("No available funds");
        booa.withdraw();
    }

    function test_fix2_withdrawOnlyUnreservedFunds() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.prank(user2);
        booa.commitMint{value: mintPrice}();
        uint256 balBefore = owner.balance;
        booa.withdraw();
        uint256 balAfter = owner.balance;
        assertEq(balAfter - balBefore, mintPrice);
        assertEq(address(booa).balance, mintPrice);
    }

    function test_fix2_releaseReservedFundsAfterReveal() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        assertEq(booa.reservedFunds(), mintPrice);
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        assertEq(booa.reservedFunds(), 0);
        booa.withdraw();
        assertEq(address(booa).balance, 0);
    }

    function test_fix2_releaseReservedFundsAfterReclaim() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        assertEq(booa.reservedFunds(), mintPrice);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(booa.reservedFunds(), 0);
    }

    function test_fix2_reclaimSucceedsWhenFundsReserved() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.prank(user2);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.withdraw();
        vm.warp(block.timestamp + 7 days + 1);
        uint256 balBefore = user.balance;
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(user.balance - balBefore, mintPrice);
    }

    // ══════════════════════════════════════════════════════════
    //  FIX #3: reclaimExpired refunds actual paid amount
    // ══════════════════════════════════════════════════════════

    function test_fix3_refundOriginalAmountAfterPriceChange() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        booa.setMintPrice(mintPrice / 2);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 balBefore = user.balance;
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(user.balance - balBefore, mintPrice);
    }

    function test_fix3_refundOriginalAmountWhenPriceSetTo0() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        booa.setMintPrice(0);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 balBefore = user.balance;
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(user.balance - balBefore, mintPrice);
    }

    function test_fix3_refundExactOverpayment() public {
        uint256 overpay = mintPrice * 2;
        vm.prank(user);
        booa.commitMint{value: overpay}();
        vm.warp(block.timestamp + 7 days + 1);
        uint256 balBefore = user.balance;
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(user.balance - balBefore, overpay);
    }

    // ══════════════════════════════════════════════════════════
    //  FIX #4: supply race condition
    // ══════════════════════════════════════════════════════════

    function test_fix4_supplyRaceConditionButReclaimSafe() public {
        booa.setMaxSupply(2);
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.startPrank(user2);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        vm.stopPrank();
        vm.prank(user);
        vm.expectRevert("Max supply reached");
        booa.revealMint(0, validBitmap, validTraits);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 balBefore = user.balance;
        vm.prank(user);
        booa.reclaimExpired(0);
        assertEq(user.balance - balBefore, mintPrice);
    }

    // ══════════════════════════════════════════════════════════
    //  FIX #5: revealMint respects pause
    // ══════════════════════════════════════════════════════════

    function test_fix5_blockRevealWhenPaused() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        booa.setPaused(true);
        vm.prank(user);
        vm.expectRevert("Minting is paused");
        booa.revealMint(0, validBitmap, validTraits);
    }

    function test_fix5_allowRevealAfterUnpause() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        booa.setPaused(true);
        booa.setPaused(false);
        vm.prank(user);
        booa.revealMint(0, validBitmap, validTraits);
        assertEq(booa.ownerOf(0), user);
    }

    function test_fix5_reclaimWorksEvenWhenPaused() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        booa.setPaused(true);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        booa.reclaimExpired(0);
        (, bool revealed) = booa.getCommitment(user, 0);
        assertTrue(revealed);
    }

    // ══════════════════════════════════════════════════════════
    //  FIX #7: traits JSON injection prevented
    // ══════════════════════════════════════════════════════════

    function test_fix7_rejectTraitsNotStartingWithBracket() public {
        bytes memory malicious = bytes('"},"injected_key":"injected_value","x":{"y":"z');
        vm.prank(user);
        vm.expectRevert(BOOA.UnsafeTraits.selector);
        booa.mintAgent{value: mintPrice}(validBitmap, malicious);
    }

    function test_fix7_rejectTraitsWithUnbalancedBraces() public {
        bytes memory bad = bytes('[{"trait_type":"test"}]}');
        vm.prank(user);
        vm.expectRevert(BOOA.UnsafeTraits.selector);
        booa.mintAgent{value: mintPrice}(validBitmap, bad);
    }

    function test_fix7_acceptValidTraitsJSONArray() public {
        bytes memory valid = bytes('[{"trait_type":"Creature","value":"Fox"},{"trait_type":"Vibe","value":"chill"}]');
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, valid);
        assertEq(booa.totalSupply(), 1);
    }

    function test_fix7_acceptEmptyTraits() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, bytes(""));
        assertEq(booa.totalSupply(), 1);
    }

    function test_fix7_acceptEmptyArrayTraits() public {
        bytes memory emptyArr = bytes("[]");
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, emptyArr);
        assertEq(booa.totalSupply(), 1);
    }

    function test_fix7_allowTraitsWithSpecialCharInsideStrings() public {
        bytes memory special = bytes('[{"trait_type":"test","value":"hello \\"world\\" }]"}]');
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, special);
        assertEq(booa.totalSupply(), 1);
    }

    // ══════════════════════════════════════════════════════════
    //  AUDIT: reentrancy via reclaimExpired
    // ══════════════════════════════════════════════════════════

    function test_audit_CEIPatternOnReclaim() public {
        vm.prank(user);
        booa.commitMint{value: mintPrice}();
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(user);
        booa.reclaimExpired(0);
        (, bool revealed) = booa.getCommitment(user, 0);
        assertTrue(revealed);
        vm.prank(user);
        vm.expectRevert("Already revealed");
        booa.reclaimExpired(0);
    }

    // ══════════════════════════════════════════════════════════
    //  AUDIT: maxSupply can be set to 0 after minting
    // ══════════════════════════════════════════════════════════

    function test_audit_removeSupplyCapAfterMints() public {
        booa.setMaxSupply(2);
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        booa.setMaxSupply(0);
        vm.startPrank(user);
        for (uint256 i = 0; i < 5; i++) {
            booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        }
        vm.stopPrank();
        assertEq(booa.totalSupply(), 6);
    }

    // ══════════════════════════════════════════════════════════
    //  AUDIT: no receive/fallback
    // ══════════════════════════════════════════════════════════

    function test_audit_rejectPlainETHTransfers() public {
        vm.prank(user);
        (bool success,) = address(booa).call{value: 1 ether}("");
        assertFalse(success, "Should not accept plain ETH");
    }

    // ══════════════════════════════════════════════════════════
    //  GAS BENCHMARKS
    // ══════════════════════════════════════════════════════════

    function test_gas_mintBitmap() public {
        vm.prank(user);
        uint256 gasBefore = gasleft();
        booa.mintAgent{value: mintPrice}(validBitmap, validTraits);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("Bitmap mint gas", gasUsed);
    }

    function test_gas_commitAndReveal() public {
        vm.prank(user);
        uint256 g1 = gasleft();
        booa.commitMint{value: mintPrice}();
        uint256 commitGas = g1 - gasleft();

        vm.prank(user);
        uint256 g2 = gasleft();
        booa.revealMint(0, validBitmap, validTraits);
        uint256 revealGas = g2 - gasleft();

        emit log_named_uint("commitMint gas", commitGas);
        emit log_named_uint("revealMint gas", revealGas);
        emit log_named_uint("Total commit+reveal", commitGas + revealGas);
    }

    function test_gas_getSVGRendering() public {
        vm.prank(user);
        booa.mintAgent{value: mintPrice}(bitmapWithStripe, validTraits);

        uint256 g = gasleft();
        booa.getSVG(0);
        uint256 gasUsed = g - gasleft();
        emit log_named_uint("getSVG render gas", gasUsed);
    }

    // ══════════════════════════════════════════════════════════
    //  HELPER FUNCTIONS
    // ══════════════════════════════════════════════════════════

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory s = bytes(str);
        bytes memory p = bytes(prefix);
        if (s.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (s[i] != p[i]) return false;
        }
        return true;
    }

    function _contains(string memory str, string memory substr) internal pure returns (bool) {
        bytes memory s = bytes(str);
        bytes memory sub = bytes(substr);
        if (sub.length > s.length) return false;
        for (uint256 i = 0; i <= s.length - sub.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < sub.length; j++) {
                if (s[i + j] != sub[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }
}
