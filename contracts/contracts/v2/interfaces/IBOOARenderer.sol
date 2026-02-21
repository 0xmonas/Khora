// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBOOARenderer {
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function renderSVG(bytes memory bitmap) external pure returns (string memory);
}
