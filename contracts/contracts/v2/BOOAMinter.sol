// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IBOOA} from "./interfaces/IBOOA.sol";
import {IBOOAStorage} from "./interfaces/IBOOAStorage.sol";

/// @title BOOAMinter
/// @notice Server-signed single-tx mint with Merkle allowlist + public phases.
contract BOOAMinter is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    enum MintPhase { Closed, Allowlist, Public }

    IBOOA public booa;
    IBOOAStorage public dataStore;

    address public signer;
    uint256 public allowlistPrice;
    uint256 public publicPrice;
    uint256 public maxSupply;
    uint256 public maxPerWallet;
    MintPhase public currentPhase;
    bytes32 public merkleRoot;

    mapping(address => uint256) public mintCount;
    mapping(bytes32 => bool) private _usedSignatures;

    event AgentMinted(uint256 indexed tokenId, address indexed minter);
    event SignerUpdated(address indexed newSigner);
    event AllowlistPriceUpdated(uint256 newPrice);
    event PublicPriceUpdated(uint256 newPrice);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event MaxPerWalletUpdated(uint256 newMaxPerWallet);
    event PhaseUpdated(MintPhase newPhase);
    event MerkleRootUpdated(bytes32 newRoot);

    error MintingClosed();
    error SignatureExpired();
    error InsufficientPayment();
    error MintLimitReached();
    error MaxSupplyReached();
    error InvalidSignature();
    error SignatureAlreadyUsed();
    error NotAllowlisted();
    error SoldOut();

    constructor(
        address _booa,
        address _dataStore,
        address _signer,
        uint256 _allowlistPrice,
        uint256 _publicPrice
    ) Ownable(msg.sender) {
        booa = IBOOA(_booa);
        dataStore = IBOOAStorage(_dataStore);
        signer = _signer;
        allowlistPrice = _allowlistPrice;
        publicPrice = _publicPrice;
        // currentPhase defaults to Closed (0)
    }

    /// @notice Returns the effective mint price for the current phase.
    function mintPrice() external view returns (uint256) {
        if (currentPhase == MintPhase.Allowlist) return allowlistPrice;
        if (currentPhase == MintPhase.Public) return publicPrice;
        return 0;
    }

    /// @param imageData    2048-byte bitmap (64x64, 4-bit C64 palette)
    /// @param traitsData   Traits JSON (SSTORE2)
    /// @param deadline     Signature expiry (unix timestamp)
    /// @param signature    EIP-191 signature over abi.encode(imageData, traitsData, msg.sender, deadline, chainId)
    /// @param merkleProof  Merkle proof for allowlist verification (empty array for public phase)
    function mint(
        bytes calldata imageData,
        bytes calldata traitsData,
        uint256 deadline,
        bytes calldata signature,
        bytes32[] calldata merkleProof
    ) external payable returns (uint256 tokenId) {
        if (currentPhase == MintPhase.Closed) revert MintingClosed();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Phase-based price and allowlist check
        uint256 price;
        if (currentPhase == MintPhase.Allowlist) {
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
            if (!MerkleProof.verifyCalldata(merkleProof, merkleRoot, leaf)) revert NotAllowlisted();
            price = allowlistPrice;
        } else {
            price = publicPrice;
        }

        if (msg.value < price) revert InsufficientPayment();
        if (maxPerWallet > 0 && mintCount[msg.sender] >= maxPerWallet) revert MintLimitReached();
        if (maxSupply > 0 && booa.nextTokenId() >= maxSupply) revert MaxSupplyReached();

        bytes32 hash = keccak256(abi.encode(imageData, traitsData, msg.sender, deadline, block.chainid, address(this)));
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

        if (msg.value > price) {
            (bool ok,) = msg.sender.call{value: msg.value - price}("");
            require(ok, "Refund failed");
        }
    }

    /// @notice Owner-only mint: free, no phase/wallet-limit checks.
    ///         Still requires a valid server signature for data integrity.
    function ownerMint(
        bytes calldata imageData,
        bytes calldata traitsData,
        uint256 deadline,
        bytes calldata signature
    ) external onlyOwner returns (uint256 tokenId) {
        if (block.timestamp > deadline) revert SignatureExpired();
        if (maxSupply > 0 && booa.nextTokenId() >= maxSupply) revert MaxSupplyReached();

        bytes32 hash = keccak256(abi.encode(imageData, traitsData, msg.sender, deadline, block.chainid, address(this)));
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();

        if (_usedSignatures[ethSignedHash]) revert SignatureAlreadyUsed();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != signer) revert InvalidSignature();

        _usedSignatures[ethSignedHash] = true;

        tokenId = booa.mint(msg.sender);
        dataStore.setImageData(tokenId, imageData);
        dataStore.setTraits(tokenId, traitsData);

        emit AgentMinted(tokenId, msg.sender);
    }

    // ═══════════════════════════════════════
    //  Admin functions
    // ═══════════════════════════════════════

    function setDataStore(address _dataStore) external onlyOwner {
        require(_dataStore != address(0), "Zero address");
        dataStore = IBOOAStorage(_dataStore);
    }

    function setSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Zero address");
        signer = _signer;
        emit SignerUpdated(_signer);
    }

    function renounceOwnership() public pure override {
        revert("Cannot renounce");
    }

    function setPhase(MintPhase _phase) external onlyOwner {
        if (_phase == MintPhase.Allowlist && merkleRoot == bytes32(0)) revert NotAllowlisted();
        currentPhase = _phase;
        emit PhaseUpdated(_phase);
    }

    function setMerkleRoot(bytes32 _root) external onlyOwner {
        merkleRoot = _root;
        emit MerkleRootUpdated(_root);
    }

    function setAllowlistPrice(uint256 _price) external onlyOwner {
        allowlistPrice = _price;
        emit AllowlistPriceUpdated(_price);
    }

    function setPublicPrice(uint256 _price) external onlyOwner {
        publicPrice = _price;
        emit PublicPriceUpdated(_price);
    }

    function setMaxSupply(uint256 _maxSupply) external onlyOwner {
        uint256 currentTotal = booa.nextTokenId();
        // Cannot reduce below lifetime minted count
        if (_maxSupply > 0 && _maxSupply < currentTotal) {
            revert MaxSupplyReached();
        }
        maxSupply = _maxSupply;
        emit MaxSupplyUpdated(_maxSupply);
    }

    function setMaxPerWallet(uint256 _max) external onlyOwner {
        maxPerWallet = _max;
        emit MaxPerWalletUpdated(_max);
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
