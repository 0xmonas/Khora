// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/v2/BOOA.sol";
import "../contracts/v2/BOOAStorage.sol";
import "../contracts/v2/BOOARenderer.sol";
import "../contracts/v2/BOOAMinter.sol";

/**
 * @title DeployV2
 * @notice Deploys all 4 V2 contracts + post-deploy wiring
 *
 * Usage:
 *   cd contracts
 *   source ../.env
 *   forge script script/DeployV2.s.sol:DeployV2 \
 *     --rpc-url $ALCHEMY_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 */
contract DeployV2 is Script {
    function run() external {
        // ── Read env ──
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 signerKey = vm.envUint("SIGNER_PRIVATE_KEY");
        address signer = vm.addr(signerKey);
        address deployer = vm.addr(deployerKey);

        // ── Config ──
        uint256 mintPrice = 0; // Free mint for testnet
        address royaltyReceiver = deployer;
        uint96 royaltyBps = 500; // 5%

        console.log("Deployer:", deployer);
        console.log("Signer:", signer);
        console.log("Mint price:", mintPrice);

        vm.startBroadcast(deployerKey);

        // 1. BOOAStorage
        BOOAStorage dataStore = new BOOAStorage();
        console.log("BOOAStorage:", address(dataStore));

        // 2. BOOARenderer (needs storage address)
        BOOARenderer renderer = new BOOARenderer(address(dataStore));
        console.log("BOOARenderer:", address(renderer));

        // 3. BOOAv2 (ERC721)
        BOOAv2 booa = new BOOAv2(royaltyReceiver, royaltyBps);
        console.log("BOOAv2:", address(booa));

        // 4. BOOAMinter (needs booa + storage + signer)
        BOOAMinter minter = new BOOAMinter(
            address(booa),
            address(dataStore),
            signer,
            mintPrice
        );
        console.log("BOOAMinter:", address(minter));

        // ── Post-deploy wiring ──
        // BOOAv2: authorize minter + set renderer
        booa.setMinter(address(minter), true);
        booa.setRenderer(address(renderer));
        console.log("BOOAv2: minter authorized, renderer set");

        // BOOAStorage: authorize minter as writer
        dataStore.setWriter(address(minter), true);
        console.log("BOOAStorage: minter authorized as writer");

        vm.stopBroadcast();

        // ── Summary ──
        console.log("");
        console.log("=== DEPLOY COMPLETE ===");
        console.log("Add to .env:");
        console.log("NEXT_PUBLIC_BOOA_V2_ADDRESS_TESTNET=", address(booa));
        console.log("NEXT_PUBLIC_BOOA_V2_MINTER_ADDRESS_TESTNET=", address(minter));
        console.log("NEXT_PUBLIC_BOOA_V2_STORAGE_ADDRESS_TESTNET=", address(dataStore));
        console.log("NEXT_PUBLIC_BOOA_V2_RENDERER_ADDRESS_TESTNET=", address(renderer));
    }
}
