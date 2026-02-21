// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBOOA {
    function mint(address to) external returns (uint256 tokenId);
    function totalSupply() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}
