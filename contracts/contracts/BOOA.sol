// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {SSTORE2} from "solady/src/utils/SSTORE2.sol";

/// @title BOOA by Khora — Bitmap Edition

contract BOOA is ERC721Enumerable, ERC2981, Ownable {
    using Strings for uint256;

    // ── State ──

    uint256 private _nextTokenId;
    uint256 public mintPrice;
    uint256 public maxSupply;
    uint256 public maxPerWallet;
    bool public paused;

    uint256 public constant BITMAP_SIZE = 2048;   // 64×64×4bit / 8
    uint256 public constant MAX_TRAITS_SIZE = 8192;

    mapping(uint256 => address) private _bitmapPointers;
    mapping(uint256 => address) private _traitsPointers;
    mapping(address => uint256) public mintCount;

    // ── Commit-Reveal ──

    struct Commitment {
        uint256 timestamp;
        uint256 pricePaid;
        bool revealed;
    }

    mapping(address => Commitment[]) private _commitments;
    uint256 public constant REVEAL_DEADLINE = 7 days;
    uint256 public reservedFunds;

    // ── Events & Errors ──

    event AgentMinted(uint256 indexed tokenId, address indexed minter, address bitmapPointer);
    event CommitMint(address indexed committer, uint256 indexed slotIndex);
    event MintPriceUpdated(uint256 newPrice);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event MaxPerWalletUpdated(uint256 newMaxPerWallet);
    event Paused(bool isPaused);

    error TraitsTooLarge();
    error UnsafeTraits();
    error InvalidBitmap();

    // ── Constructor ──

    constructor(uint256 _mintPrice, address royaltyReceiver, uint96 royaltyFeeNumerator)
        ERC721("BOOA by Khora", "BOOA")
        Ownable(msg.sender)
    {
        mintPrice = _mintPrice;
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    // ══════════════════════════════════════════════════════════════
    //  VALIDATION
    // ══════════════════════════════════════════════════════════════

    /// @notice Bitmap validation: only length check.
    ///         Every nibble 0-15 maps to a valid C64 palette color.
    ///         No SVG content = no injection surface.
    function _validateBitmap(bytes calldata data) internal pure {
        if (data.length != BITMAP_SIZE) revert InvalidBitmap();
    }

    /// @notice Traits validation: JSON array structure check.
    function _validateTraits(bytes calldata data) internal pure {
        if (data.length == 0) return;
        uint8 first = uint8(data[0]);
        uint8 last = uint8(data[data.length - 1]);
        if (first != 0x5B || last != 0x5D) revert UnsafeTraits();

        uint256 braceDepth = 0;
        bool inString = false;
        bool escaped = false;
        for (uint256 i = 0; i < data.length; i++) {
            uint8 b = uint8(data[i]);
            if (escaped) { escaped = false; continue; }
            if (b == 0x5C) { escaped = true; continue; }
            if (b == 0x22) { inString = !inString; continue; }
            if (inString) continue;
            if (b == 0x7B) braceDepth++;
            if (b == 0x7D) {
                if (braceDepth == 0) revert UnsafeTraits();
                braceDepth--;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  DIRECT MINTING
    // ══════════════════════════════════════════════════════════════

    function mintAgent(
        bytes calldata bitmapData,
        bytes calldata traitsData
    ) external payable returns (uint256) {
        require(!paused, "Minting is paused");
        require(msg.value >= mintPrice, "Insufficient payment");
        _validateBitmap(bitmapData);
        if (traitsData.length > MAX_TRAITS_SIZE) revert TraitsTooLarge();
        _validateTraits(traitsData);

        if (maxSupply > 0) {
            require(_nextTokenId < maxSupply, "Max supply reached");
        }
        if (maxPerWallet > 0) {
            require(mintCount[msg.sender] < maxPerWallet, "Wallet mint limit reached");
        }

        uint256 tokenId = _nextTokenId++;
        mintCount[msg.sender]++;

        _bitmapPointers[tokenId] = SSTORE2.write(bitmapData);
        if (traitsData.length > 0) {
            _traitsPointers[tokenId] = SSTORE2.write(traitsData);
        }

        _safeMint(msg.sender, tokenId);
        emit AgentMinted(tokenId, msg.sender, _bitmapPointers[tokenId]);
        return tokenId;
    }

    // ══════════════════════════════════════════════════════════════
    //  COMMIT-REVEAL MINTING
    // ══════════════════════════════════════════════════════════════

    function commitMint() external payable returns (uint256 slotIndex) {
        require(!paused, "Minting is paused");
        require(msg.value >= mintPrice, "Insufficient payment");

        if (maxSupply > 0) {
            require(_nextTokenId < maxSupply, "Max supply reached");
        }
        if (maxPerWallet > 0) {
            uint256 pending = _pendingCommitCount(msg.sender);
            require(mintCount[msg.sender] + pending < maxPerWallet, "Wallet mint limit reached");
        }

        slotIndex = _commitments[msg.sender].length;
        _commitments[msg.sender].push(Commitment({
            timestamp: block.timestamp,
            pricePaid: msg.value,
            revealed: false
        }));

        reservedFunds += msg.value;
        emit CommitMint(msg.sender, slotIndex);
    }

    function revealMint(
        uint256 slotIndex,
        bytes calldata bitmapData,
        bytes calldata traitsData
    ) external returns (uint256 tokenId) {
        require(!paused, "Minting is paused");
        require(slotIndex < _commitments[msg.sender].length, "Invalid slot");
        Commitment storage c = _commitments[msg.sender][slotIndex];
        require(!c.revealed, "Already revealed");
        require(c.timestamp > 0, "No commitment");
        require(block.timestamp <= c.timestamp + REVEAL_DEADLINE, "Commitment expired");

        c.revealed = true;
        reservedFunds -= c.pricePaid;

        _validateBitmap(bitmapData);
        if (traitsData.length > MAX_TRAITS_SIZE) revert TraitsTooLarge();
        _validateTraits(traitsData);

        if (maxSupply > 0) {
            require(_nextTokenId < maxSupply, "Max supply reached");
        }
        if (maxPerWallet > 0) {
            require(mintCount[msg.sender] < maxPerWallet, "Wallet mint limit reached");
        }

        tokenId = _nextTokenId++;
        mintCount[msg.sender]++;

        _bitmapPointers[tokenId] = SSTORE2.write(bitmapData);
        if (traitsData.length > 0) {
            _traitsPointers[tokenId] = SSTORE2.write(traitsData);
        }

        _safeMint(msg.sender, tokenId);
        emit AgentMinted(tokenId, msg.sender, _bitmapPointers[tokenId]);
    }

    function reclaimExpired(uint256 slotIndex) external {
        require(slotIndex < _commitments[msg.sender].length, "Invalid slot");
        Commitment storage c = _commitments[msg.sender][slotIndex];
        require(!c.revealed, "Already revealed");
        require(c.timestamp > 0, "No commitment");
        require(block.timestamp > c.timestamp + REVEAL_DEADLINE, "Not expired yet");

        c.revealed = true;
        uint256 refundAmount = c.pricePaid;
        reservedFunds -= refundAmount;

        (bool ok, ) = msg.sender.call{value: refundAmount}("");
        require(ok, "Refund failed");
    }

    function _pendingCommitCount(address account) internal view returns (uint256 count) {
        uint256 len = _commitments[account].length;
        for (uint256 i = 0; i < len; i++) {
            Commitment memory c = _commitments[account][i];
            if (!c.revealed && c.timestamp > 0 && block.timestamp <= c.timestamp + REVEAL_DEADLINE) {
                count++;
            }
        }
    }

    function commitmentCount(address account) external view returns (uint256) {
        return _commitments[account].length;
    }

    function getCommitment(address account, uint256 slotIndex)
        external view returns (uint256 timestamp, bool revealed)
    {
        require(slotIndex < _commitments[account].length, "Invalid slot");
        Commitment memory c = _commitments[account][slotIndex];
        return (c.timestamp, c.revealed);
    }

    // ══════════════════════════════════════════════════════════════
    //  ON-CHAIN SVG RENDERER
    // ══════════════════════════════════════════════════════════════

    /// @dev C64 16-color palette: 3 bytes (RGB) per color, 48 bytes total.
    ///  0: #000000  1: #626262  2: #898989  3: #ADADAD  4: #FFFFFF
    ///  5: #9F4E44  6: #CB7E75  7: #6D5412  8: #A1683C  9: #C9D487
    /// 10: #9AE29B 11: #5CAB5E 12: #6ABFC6 13: #887ECB 14: #50459B
    /// 15: #A057A3
    bytes private constant PALETTE =
        hex"000000626262898989ADADADFFFFFF"
        hex"9F4E44CB7E756D5412A1683CC9D487"
        hex"9AE29B5CAB5E6ABFC6887ECB50459B"
        hex"A057A3";

    /// @notice Reconstructs SVG from a 2048-byte bitmap.
    /// @dev Uses horizontal run-length encoding: <path stroke="#color" d="M{x} {y}h{len}..."/>
    ///      Output is identical in structure to svgConverter.ts.
    function _renderSVG(bytes memory bitmap) internal pure returns (string memory) {
        // 1. Count color frequency to find background
        uint16[16] memory counts;
        for (uint256 i = 0; i < BITMAP_SIZE; i++) {
            uint8 b = uint8(bitmap[i]);
            counts[b >> 4]++;
            counts[b & 0x0F]++;
        }
        uint8 bgColor = 0;
        uint16 maxCount = 0;
        for (uint8 c = 0; c < 16; c++) {
            if (counts[c] > maxCount) {
                maxCount = counts[c];
                bgColor = c;
            }
        }

        // 2. SVG header + background rect
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges">',
            '<rect fill="#', _colorHex(bgColor), '" width="64" height="64"/>'
        );

        // 3. One <path> per non-background color with horizontal run encoding
        for (uint8 color = 0; color < 16; color++) {
            if (color == bgColor || counts[color] == 0) continue;

            bytes memory pathData = _buildPathData(bitmap, color);
            if (pathData.length == 0) continue;

            svg = abi.encodePacked(
                svg,
                '<path stroke="#', _colorHex(color), '" d="', pathData, '"/>'
            );
        }

        return string(abi.encodePacked(svg, '</svg>'));
    }

    /// @dev Builds d="M{x} {y}h{len}..." for all horizontal runs of `color`.
    function _buildPathData(bytes memory bitmap, uint8 color)
        internal pure returns (bytes memory)
    {
        bytes memory result;
        bool first = true;

        for (uint256 y = 0; y < 64; y++) {
            uint256 rowOffset = y * 32; // 64 pixels / 2 bytes per pixel pair
            uint256 x = 0;

            while (x < 64) {
                // Skip non-matching pixels
                if (_getPixel(bitmap, rowOffset, x) != color) {
                    x++;
                    continue;
                }

                // Found run start — measure length
                uint256 runStart = x;
                while (x < 64 && _getPixel(bitmap, rowOffset, x) == color) {
                    x++;
                }

                // Encode: M{runStart} {y}h{runLen}
                bytes memory segment = abi.encodePacked(
                    "M", runStart.toString(), " ", y.toString(),
                    "h", (x - runStart).toString()
                );

                if (first) {
                    result = segment;
                    first = false;
                } else {
                    result = abi.encodePacked(result, segment);
                }
            }
        }

        return result;
    }

    /// @dev Read pixel at column `x` from row starting at `rowOffset`.
    ///      High nibble = even column, low nibble = odd column.
    function _getPixel(bytes memory bitmap, uint256 rowOffset, uint256 x)
        internal pure returns (uint8)
    {
        uint8 b = uint8(bitmap[rowOffset + (x >> 1)]);
        return (x & 1 == 0) ? (b >> 4) : (b & 0x0F);
    }

    /// @dev Returns 6-char uppercase hex for a palette index (0-15).
    function _colorHex(uint8 index) internal pure returns (bytes memory) {
        uint256 offset = uint256(index) * 3;
        bytes memory hex6 = new bytes(6);
        for (uint256 i = 0; i < 3; i++) {
            uint8 b = uint8(PALETTE[offset + i]);
            hex6[i * 2]     = _hexChar(b >> 4);
            hex6[i * 2 + 1] = _hexChar(b & 0x0F);
        }
        return hex6;
    }

    function _hexChar(uint8 v) internal pure returns (bytes1) {
        return v < 10 ? bytes1(v + 0x30) : bytes1(v + 0x37);
    }

    // ══════════════════════════════════════════════════════════════
    //  METADATA & TOKEN URI
    // ══════════════════════════════════════════════════════════════

    function tokenURI(uint256 tokenId)
        public view override returns (string memory)
    {
        _requireOwned(tokenId);

        bytes memory bitmap = SSTORE2.read(_bitmapPointers[tokenId]);
        string memory svg = _renderSVG(bitmap);
        string memory tokenName = string(abi.encodePacked("BOOA #", tokenId.toString()));

        bytes memory json;

        if (_traitsPointers[tokenId] != address(0)) {
            string memory traits = string(SSTORE2.read(_traitsPointers[tokenId]));
            json = abi.encodePacked(
                '{"name":"', tokenName,
                '","description":"BOOA on-chain AI agent PFP',
                '","image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(svg)),
                '","attributes":', traits, '}'
            );
        } else {
            json = abi.encodePacked(
                '{"name":"', tokenName,
                '","description":"BOOA on-chain AI agent PFP',
                '","image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(svg)),
                '"}'
            );
        }

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(json)
            )
        );
    }

    /// @notice Returns the reconstructed SVG for a token.
    function getSVG(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        bytes memory bitmap = SSTORE2.read(_bitmapPointers[tokenId]);
        return _renderSVG(bitmap);
    }

    /// @notice Returns raw bitmap bytes for a token.
    function getBitmap(uint256 tokenId) public view returns (bytes memory) {
        _requireOwned(tokenId);
        return SSTORE2.read(_bitmapPointers[tokenId]);
    }

    /// @notice Returns raw traits JSON for a token.
    function getTraits(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        if (_traitsPointers[tokenId] == address(0)) return "";
        return string(SSTORE2.read(_traitsPointers[tokenId]));
    }

    // ══════════════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════════════

    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
        emit MintPriceUpdated(_price);
    }

    function setMaxSupply(uint256 _maxSupply) external onlyOwner {
        require(_maxSupply == 0 || _maxSupply >= _nextTokenId, "Below current supply");
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

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }

    function withdraw() external onlyOwner {
        uint256 available = address(this).balance - reservedFunds;
        require(available > 0, "No available funds");
        (bool ok, ) = owner().call{value: available}("");
        require(ok, "Withdrawal failed");
    }

    function withdrawTo(address payable to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 available = address(this).balance - reservedFunds;
        require(available > 0, "No available funds");
        (bool ok, ) = to.call{value: available}("");
        require(ok, "Withdrawal failed");
    }

    // ══════════════════════════════════════════════════════════════
    //  OVERRIDES
    // ══════════════════════════════════════════════════════════════

    function _increaseBalance(address account, uint128 value) internal override(ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
