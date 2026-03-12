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
 * Testnet (Shape Sepolia):
 *   cd contracts
 *   source ../.env
 *   forge script script/DeployV2.s.sol:DeployV2 \
 *     --rpc-url $SHAPE_SEPOLIA_RPC_URL \
 *     --broadcast -vvvv
 *
 * Mainnet (Shape):
 *   cd contracts
 *   source ../.env
 *   MAINNET=true forge script script/DeployV2.s.sol:DeployV2 \
 *     --rpc-url $SHAPE_MAINNET_RPC_URL \
 *     --broadcast --verify -vvvv
 */
contract DeployV2 is Script {
    function run() external {
        // ── Read env ──
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 signerKey = vm.envUint("SIGNER_PRIVATE_KEY");
        address signer = vm.addr(signerKey);
        address deployer = vm.addr(deployerKey);

        // ── Config: mainnet vs testnet ──
        bool isMainnet = vm.envOr("MAINNET", false);

        uint256 allowlistPrice;
        uint256 publicPrice;
        if (isMainnet) {
            allowlistPrice = 0.0042 ether;
            publicPrice = 0.0069 ether;
        } else {
            allowlistPrice = 0.00042 ether;
            publicPrice = 0.00069 ether;
        }

        address royaltyReceiver = deployer;
        uint96 royaltyBps = 500; // 5%

        console.log(isMainnet ? "=== MAINNET DEPLOY ===" : "=== TESTNET DEPLOY ===");
        console.log("Deployer:", deployer);
        console.log("Signer:", signer);
        console.log("Allowlist price:", allowlistPrice);
        console.log("Public price:", publicPrice);

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

        // 4. BOOAMinter (needs booa + storage + signer + prices)
        BOOAMinter minter = new BOOAMinter(
            address(booa),
            address(dataStore),
            signer,
            allowlistPrice,
            publicPrice
        );
        console.log("BOOAMinter:", address(minter));

        // ── Post-deploy wiring ──
        booa.setMinter(address(minter), true);
        booa.setRenderer(address(renderer));
        console.log("BOOAv2: minter authorized, renderer set");

        dataStore.setWriter(address(minter), true);
        dataStore.setWriter(address(booa), true);
        console.log("BOOAStorage: minter + booa authorized as writers");

        booa.setDataStore(address(dataStore));
        console.log("BOOAv2: dataStore set");

        minter.setMaxPerWallet(10);
        minter.setMaxSupply(3333);
        minter.setPhase(BOOAMinter.MintPhase.Public);
        console.log("BOOAMinter: maxPerWallet=10, maxSupply=3333, phase=Public");

        vm.stopBroadcast();

        // ── Summary ──
        console.log("");
        console.log("=== DEPLOY COMPLETE ===");
        string memory suffix = isMainnet ? "" : "_TESTNET";
        console.log("Add to .env:");
        console.log(string.concat("NEXT_PUBLIC_BOOA_V2_ADDRESS", suffix, "="), address(booa));
        console.log(string.concat("NEXT_PUBLIC_BOOA_V2_MINTER_ADDRESS", suffix, "="), address(minter));
        console.log(string.concat("NEXT_PUBLIC_BOOA_V2_STORAGE_ADDRESS", suffix, "="), address(dataStore));
        console.log(string.concat("NEXT_PUBLIC_BOOA_V2_RENDERER_ADDRESS", suffix, "="), address(renderer));
    }
}
