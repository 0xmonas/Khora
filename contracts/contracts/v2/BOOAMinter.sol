// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IBOOA} from "./interfaces/IBOOA.sol";
import {IBOOAStorage} from "./interfaces/IBOOAStorage.sol";

/// @title BOOAMinter
/// @notice Server-signed single-tx mint. The server generates bitmap + traits
///         off-chain and signs the packet with EIP-191.
contract BOOAMinter is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IBOOA public booa;
    IBOOAStorage public dataStore;

    address public signer;
    uint256 public mintPrice;
    uint256 public maxSupply;
    uint256 public maxPerWallet;
    bool public paused;

    mapping(address => uint256) public mintCount;
    mapping(bytes32 => bool) private _usedSignatures;

    event AgentMinted(uint256 indexed tokenId, address indexed minter);
    event SignerUpdated(address indexed newSigner);
    event MintPriceUpdated(uint256 newPrice);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event MaxPerWalletUpdated(uint256 newMaxPerWallet);
    event Paused(bool isPaused);

    error MintingPaused();
    error SignatureExpired();
    error InsufficientPayment();
    error MintLimitReached();
    error MaxSupplyReached();
    error InvalidSignature();
    error SignatureAlreadyUsed();

    constructor(
        address _booa,
        address _dataStore,
        address _signer,
        uint256 _mintPrice
    ) Ownable(msg.sender) {
        booa = IBOOA(_booa);
        dataStore = IBOOAStorage(_dataStore);
        signer = _signer;
        mintPrice = _mintPrice;
    }

    /// @param imageData  2048-byte bitmap (64x64, 4-bit C64 palette)
    /// @param traitsData Traits JSON (SSTORE2)
    /// @param deadline   Signature expiry (unix timestamp)
    /// @param signature  EIP-191 signature over abi.encode(imageData, traitsData, msg.sender, deadline, chainId)
    function mint(
        bytes calldata imageData,
        bytes calldata traitsData,
        uint256 deadline,
        bytes calldata signature
    ) external payable returns (uint256 tokenId) {
        if (paused) revert MintingPaused();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (msg.value < mintPrice) revert InsufficientPayment();
        if (maxPerWallet > 0 && mintCount[msg.sender] >= maxPerWallet) revert MintLimitReached();
        if (maxSupply > 0 && booa.totalSupply() >= maxSupply) revert MaxSupplyReached();

        bytes32 hash = keccak256(abi.encode(imageData, traitsData, msg.sender, deadline, block.chainid));
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();

        if (_usedSignatures[ethSignedHash]) revert SignatureAlreadyUsed();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != signer) revert InvalidSignature();

        _usedSignatures[ethSignedHash] = true;
        mintCount[msg.sender]++;

        tokenId = booa.mint(msg.sender);
        dataStore.setImageData(tokenId, imageData);
        dataStore.setTraits(tokenId, traitsData);

        emit AgentMinted(tokenId, msg.sender);
    }

    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
        emit SignerUpdated(_signer);
    }

    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
        emit MintPriceUpdated(_price);
    }

    function setMaxSupply(uint256 _maxSupply) external onlyOwner {
        if (_maxSupply > 0 && _maxSupply < booa.totalSupply()) {
            revert MaxSupplyReached();
        }
        maxSupply = _maxSupply;
        emit MaxSupplyUpdated(_maxSupply);
    }

    function setMaxPerWallet(uint256 _max) external onlyOwner {
        maxPerWallet = _max;
        emit MaxPerWalletUpdated(_max);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
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

    receive() external payable {}
}
