// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBOOAStorage {
    function setImageData(uint256 tokenId, bytes calldata bitmapData) external;
    function setTraits(uint256 tokenId, bytes calldata traitsData) external;
    function getImageData(uint256 tokenId) external view returns (bytes memory);
    function getTraits(uint256 tokenId) external view returns (bytes memory);
}
