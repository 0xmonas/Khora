// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BOOA} from "../../contracts/v2/BOOA.sol";
import {BOOAStorage} from "../../contracts/v2/BOOAStorage.sol";
import {BOOARenderer} from "../../contracts/v2/BOOARenderer.sol";
import {BOOAMinter} from "../../contracts/v2/BOOAMinter.sol";

/// @dev Mock Gasback contract that records calls
contract MockGasback {
    uint256 public callCount;
    uint256 public lastGasToBurn;

    fallback() external payable {
        require(msg.data.length == 32, "Expected 32 bytes");
        lastGasToBurn = abi.decode(msg.data, (uint256));
        callCount++;
    }

    receive() external payable {}
}

/// @dev Mock Gasback that always reverts
contract RevertingGasback {
    fallback() external payable {
        revert("Gasback failed");
    }
}

contract BOOAGasbackTest is Test {
    BOOA public booa;
    BOOAStorage public store;
    BOOARenderer public renderer;
    BOOAMinter public minter;
    MockGasback public mockGasback;

    address owner = address(this);
    address user = address(0xBEEF);
    address user2 = address(0xCAFE);

    uint256 signerKey = 0xA11CE;
    address signerAddr;

    uint256 constant ALLOWLIST_PRICE = 0.0042 ether;
    uint256 constant PUBLIC_PRICE = 0.0069 ether;

    bytes validBitmap;
    bytes validTraits;

    function setUp() public {
        signerAddr = vm.addr(signerKey);
        vm.deal(user, 100 ether);
        vm.deal(user2, 100 ether);

        store = new BOOAStorage();
        renderer = new BOOARenderer(address(store));
        booa = new BOOA(owner, 500);
        minter = new BOOAMinter(address(booa), address(store), signerAddr, ALLOWLIST_PRICE, PUBLIC_PRICE);
        mockGasback = new MockGasback();

        booa.setMinter(address(minter), true);
        booa.setRenderer(address(renderer));
        booa.setDataStore(address(store));
        store.setWriter(address(minter), true);
        store.setWriter(address(booa), true);

        validBitmap = _makeBitmap(0);
        validTraits = bytes('{"trait_type":"Creature","value":"Test"}');
    }

    // ========================
    // setGasback
    // ========================

    function test_gasback_defaultDisabled() public view {
        assertEq(booa.gasbackEnabled(), false);
        assertEq(booa.gasbackAddress(), address(0));
        assertEq(booa.gasbackGasToBurn(), 0);
    }

    function test_gasback_ownerCanSet() public {
        booa.setGasback(address(mockGasback), 10000, true);
        assertEq(booa.gasbackAddress(), address(mockGasback));
        assertEq(booa.gasbackGasToBurn(), 10000);
        assertEq(booa.gasbackEnabled(), true);
    }

    function test_gasback_nonOwnerCannotSet() public {
        vm.prank(user);
        vm.expectRevert();
        booa.setGasback(address(mockGasback), 10000, true);
    }

    function test_gasback_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit BOOA.GasbackUpdated(address(mockGasback), 10000, true);
        booa.setGasback(address(mockGasback), 10000, true);
    }

    function test_gasback_canToggleOff() public {
        booa.setGasback(address(mockGasback), 10000, true);
        assertEq(booa.gasbackEnabled(), true);

        booa.setGasback(address(mockGasback), 10000, false);
        assertEq(booa.gasbackEnabled(), false);
    }

    function test_gasback_canUpdateGasToBurn() public {
        booa.setGasback(address(mockGasback), 10000, true);
        assertEq(booa.gasbackGasToBurn(), 10000);

        booa.setGasback(address(mockGasback), 50000, true);
        assertEq(booa.gasbackGasToBurn(), 50000);
    }

    // ========================
    // Gasback on mint
    // ========================

    function test_gasback_notCalledWhenDisabled() public {
        // Gasback disabled (default), mint should work without calling gasback
        _mintPublic(user);
        assertEq(mockGasback.callCount(), 0);
    }

    function test_gasback_calledOnMint() public {
        booa.setGasback(address(mockGasback), 10000, true);
        _mintPublic(user);
        assertEq(mockGasback.callCount(), 1);
        assertEq(mockGasback.lastGasToBurn(), 10000);
    }

    // ========================
    // Gasback on transfer
    // ========================

    function test_gasback_calledOnTransfer() public {
        booa.setGasback(address(mockGasback), 10000, true);
        _mintPublic(user);
        uint256 countAfterMint = mockGasback.callCount();

        vm.prank(user);
        booa.transferFrom(user, user2, 0);
        assertEq(mockGasback.callCount(), countAfterMint + 1);
        assertEq(mockGasback.lastGasToBurn(), 10000);
    }

    function test_gasback_notCalledOnTransferWhenDisabled() public {
        _mintPublic(user);
        assertEq(mockGasback.callCount(), 0);

        vm.prank(user);
        booa.transferFrom(user, user2, 0);
        assertEq(mockGasback.callCount(), 0);
    }

    // ========================
    // Gasback on burn
    // ========================

    function test_gasback_calledOnBurn() public {
        booa.setGasback(address(mockGasback), 10000, true);
        _mintPublic(user);
        uint256 countAfterMint = mockGasback.callCount();

        vm.prank(user);
        booa.burn(0);
        assertEq(mockGasback.callCount(), countAfterMint + 1);
    }

    // ========================
    // Gasback failure handling
    // ========================

    function test_gasback_revertDoesNotBlockTransfer() public {
        RevertingGasback reverting = new RevertingGasback();
        booa.setGasback(address(reverting), 10000, true);

        // Mint should still succeed even if gasback reverts
        _mintPublic(user);
        assertEq(booa.ownerOf(0), user);

        // Transfer should still succeed
        vm.prank(user);
        booa.transferFrom(user, user2, 0);
        assertEq(booa.ownerOf(0), user2);
    }

    function test_gasback_zeroAddressDoesNotCall() public {
        // Enable gasback but with zero address — should not call
        booa.setGasback(address(0), 10000, true);
        _mintPublic(user);
        // No revert = success
        assertEq(booa.ownerOf(0), user);
    }

    // ========================
    // Multiple operations
    // ========================

    function test_gasback_multipleMintsTrackCount() public {
        booa.setGasback(address(mockGasback), 10000, true);
        _mintPublic(user);
        _mintPublic(user2);
        assertEq(mockGasback.callCount(), 2);
    }

    function test_gasback_mintTransferBurnAllCall() public {
        booa.setGasback(address(mockGasback), 5000, true);

        // Mint
        _mintPublic(user);
        assertEq(mockGasback.callCount(), 1);

        // Transfer
        vm.prank(user);
        booa.transferFrom(user, user2, 0);
        assertEq(mockGasback.callCount(), 2);

        // Burn
        vm.prank(user2);
        booa.burn(0);
        assertEq(mockGasback.callCount(), 3);

        assertEq(mockGasback.lastGasToBurn(), 5000);
    }

    // ========================
    // Helpers
    // ========================

    function _mintPublic(address to) internal {
        minter.setPhase(BOOAMinter.MintPhase.Public);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(validBitmap, validTraits, to, deadline);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(to);
        minter.mint{value: PUBLIC_PRICE}(validBitmap, validTraits, deadline, sig, emptyProof);
    }

    function _signMint(bytes memory bitmap, bytes memory traits, address to, uint256 deadline) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encode(bitmap, traits, to, deadline, block.chainid, address(minter)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _makeBitmap(uint8 color) internal pure returns (bytes memory) {
        bytes memory bmp = new bytes(2048);
        for (uint256 i = 0; i < 2048; i++) {
            bmp[i] = bytes1(color);
        }
        return bmp;
    }
}
