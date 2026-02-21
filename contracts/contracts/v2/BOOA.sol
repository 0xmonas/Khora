// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IBOOARenderer} from "./interfaces/IBOOARenderer.sol";

//
//    ██████╗  ██████╗  ██████╗  █████╗
//    ██╔══██╗██╔═══██╗██╔═══██╗██╔══██╗
//    ██████╔╝██║   ██║██║   ██║███████║
//    ██╔══██╗██║   ██║██║   ██║██╔══██║
//    ██████╔╝╚██████╔╝╚██████╔╝██║  ██║
//    ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
//
//    on-chain AI agent PFPs by Khora
//    64x64 · C64 palette · SSTORE2 bitmap
//

/// @title BOOAv2
/// @notice Minimal ERC721. Minting delegated to authorized contracts.
contract BOOAv2 is ERC721, ERC2981, Ownable {
    uint256 public nextTokenId;
    uint256 public totalMinted;
    bool public paused;

    IBOOARenderer public renderer;
    mapping(address => bool) public authorizedMinters;

    error NotAuthorizedMinter();
    error MintingPaused();

    event MinterUpdated(address indexed minter, bool authorized);
    event RendererUpdated(address indexed renderer);
    event Paused(bool isPaused);

    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter();
        _;
    }

    constructor(
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) ERC721("BOOA by Khora", "BOOA") Ownable(msg.sender) {
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    function mint(address to) external onlyMinter returns (uint256 tokenId) {
        if (paused) revert MintingPaused();
        tokenId = nextTokenId++;
        totalMinted++;
        _safeMint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return renderer.tokenURI(tokenId);
    }

    function totalSupply() public view returns (uint256) {
        return totalMinted;
    }

    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterUpdated(minter, authorized);
    }

    function setRenderer(address _renderer) external onlyOwner {
        renderer = IBOOARenderer(_renderer);
        emit RendererUpdated(_renderer);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }

    function withdraw() external onlyOwner {
        (bool ok,) = msg.sender.call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    function withdrawTo(address payable to) external onlyOwner {
        require(to != address(0), "Zero address");
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
