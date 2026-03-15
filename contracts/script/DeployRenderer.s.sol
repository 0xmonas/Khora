// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/v2/BOOARenderer.sol";

/// @notice Deploy a new BOOARenderer and call setRenderer() on existing BOOA
contract DeployRenderer is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address dataStore = vm.envAddress("BOOA_STORAGE");
        address booa = vm.envAddress("BOOA_NFT");

        console.log("DataStore:", dataStore);
        console.log("BOOA NFT:", booa);

        vm.startBroadcast(deployerKey);

        BOOARenderer renderer = new BOOARenderer(dataStore);
        console.log("New BOOARenderer:", address(renderer));

        // Call setRenderer on BOOA contract
        (bool ok,) = booa.call(abi.encodeWithSignature("setRenderer(address)", address(renderer)));
        require(ok, "setRenderer failed");
        console.log("setRenderer() called on BOOA");

        vm.stopBroadcast();
    }
}
