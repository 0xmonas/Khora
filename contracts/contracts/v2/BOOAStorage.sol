// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SSTORE2} from "solady/src/utils/SSTORE2.sol";
import {IBOOAStorage} from "./interfaces/IBOOAStorage.sol";

/// @title BOOAStorage
/// @notice On-chain bitmap + traits storage via SSTORE2.
contract BOOAStorage is IBOOAStorage, Ownable {
    uint256 public constant BITMAP_SIZE = 2048;
    uint256 public constant MAX_TRAITS_SIZE = 8192;

    mapping(uint256 => address) private _bitmapPointers;
    mapping(uint256 => address) private _traitsPointers;
    mapping(address => bool) public authorizedWriters;

    error NotAuthorized();
    error InvalidBitmap();
    error TraitsTooLarge();

    event WriterUpdated(address indexed writer, bool authorized);

    modifier onlyWriter() {
        if (!authorizedWriters[msg.sender] && msg.sender != owner()) revert NotAuthorized();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setWriter(address writer, bool authorized) external onlyOwner {
        authorizedWriters[writer] = authorized;
        emit WriterUpdated(writer, authorized);
    }

    function setImageData(uint256 tokenId, bytes calldata data) external onlyWriter {
        if (data.length != BITMAP_SIZE) revert InvalidBitmap();
        _bitmapPointers[tokenId] = SSTORE2.write(data);
    }

    function setTraits(uint256 tokenId, bytes calldata traitsData) external onlyWriter {
        if (traitsData.length > MAX_TRAITS_SIZE) revert TraitsTooLarge();
        if (traitsData.length > 0) {
            _traitsPointers[tokenId] = SSTORE2.write(traitsData);
        }
    }

    function getImageData(uint256 tokenId) external view returns (bytes memory) {
        address ptr = _bitmapPointers[tokenId];
        if (ptr == address(0)) return "";
        return SSTORE2.read(ptr);
    }

    function getTraits(uint256 tokenId) external view returns (bytes memory) {
        address ptr = _traitsPointers[tokenId];
        if (ptr == address(0)) return "";
        return SSTORE2.read(ptr);
    }

    function hasBitmap(uint256 tokenId) external view returns (bool) {
        return _bitmapPointers[tokenId] != address(0);
    }
}
