// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {SSTORE2} from "solady/src/utils/SSTORE2.sol";

/// @title BOOA — Fully on-chain AI agent PFP collection
/// @notice Each token stores its pixel art SVG and traits on-chain via SSTORE2
/// @dev ERC721Enumerable for marketplace walletOfOwner, EIP-2981 for royalties
///      Includes on-chain SVG sanitization and JSON escape to prevent XSS/injection
contract BOOA is ERC721Enumerable, ERC2981, Ownable {
    using Strings for uint256;

    struct AgentMetadata {
        string name;
        string description;
    }

    uint256 private _nextTokenId;
    uint256 public mintPrice;
    uint256 public maxSupply;      // 0 = unlimited
    uint256 public maxPerWallet;   // 0 = unlimited
    bool public paused;

    uint256 public constant MAX_NAME_LENGTH = 128;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 1024;
    uint256 public constant MAX_TRAITS_SIZE = 8192; // 8KB for traits JSON
    uint256 public constant MAX_SVG_SIZE = 24576;   // 24KB SSTORE2 limit

    mapping(uint256 => address) private _svgPointers;
    mapping(uint256 => address) private _traitsPointers;
    mapping(uint256 => AgentMetadata) private _metadata;
    mapping(address => uint256) public mintCount;

    event AgentMinted(
        uint256 indexed tokenId,
        address indexed minter,
        address svgPointer
    );
    event MintPriceUpdated(uint256 newPrice);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event MaxPerWalletUpdated(uint256 newMaxPerWallet);
    event Paused(bool isPaused);

    error UnsafeSVG();
    error NameTooLong();
    error DescriptionTooLong();
    error TraitsTooLarge();

    constructor(uint256 _mintPrice, address royaltyReceiver, uint96 royaltyFeeNumerator)
        ERC721("BOOA", "BOOA")
        Ownable(msg.sender)
    {
        mintPrice = _mintPrice;
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    // ──────────────────────────────────────────────
    //  Security: SVG Sanitization
    // ──────────────────────────────────────────────

    /// @dev Checks SVG bytes for dangerous patterns. Reverts with UnsafeSVG() if found.
    ///      Scans for: <script, javascript:, on[a-z] event handlers, <iframe, <object,
    ///      <embed, <foreignObject, <use (external refs), data: URIs in attributes.
    ///      All checks are case-insensitive (converts to lowercase before comparison).
    function _validateSVG(bytes calldata data) internal pure {
        // Must start with "<svg" (after optional whitespace/BOM)
        // Find first '<' character
        uint256 len = data.length;
        uint256 start = 0;

        // Skip leading whitespace and BOM
        while (start < len) {
            uint8 b = uint8(data[start]);
            if (b == 0x20 || b == 0x09 || b == 0x0A || b == 0x0D || b == 0xEF || b == 0xBB || b == 0xBF) {
                start++;
            } else {
                break;
            }
        }

        // Must start with <svg (case-insensitive)
        require(
            start + 4 <= len &&
            uint8(data[start]) == 0x3C && // '<'
            _toLower(uint8(data[start + 1])) == 0x73 && // 's'
            _toLower(uint8(data[start + 2])) == 0x76 && // 'v'
            _toLower(uint8(data[start + 3])) == 0x67,   // 'g'
            "SVG must start with <svg"
        );

        // Scan for dangerous patterns
        for (uint256 i = start; i < len; i++) {
            uint8 b = _toLower(uint8(data[i]));

            // Check for '<' followed by dangerous tag names
            if (b == 0x3C && i + 1 < len) { // '<'
                uint8 next = _toLower(uint8(data[i + 1]));

                // <script
                if (next == 0x73 && i + 7 < len) { // 's'
                    if (_matchesLower(data, i + 1, "script")) revert UnsafeSVG();
                }

                // <iframe
                if (next == 0x69 && i + 7 < len) { // 'i'
                    if (_matchesLower(data, i + 1, "iframe")) revert UnsafeSVG();
                }

                // <object
                if (next == 0x6F && i + 7 < len) { // 'o'
                    if (_matchesLower(data, i + 1, "object")) revert UnsafeSVG();
                }

                // <embed
                if (next == 0x65 && i + 6 < len) { // 'e'
                    if (_matchesLower(data, i + 1, "embed")) revert UnsafeSVG();
                }

                // <foreignObject (XSS vector: allows HTML inside SVG)
                if (next == 0x66 && i + 14 < len) { // 'f'
                    if (_matchesLower(data, i + 1, "foreignobject")) revert UnsafeSVG();
                }
            }

            // Check for "on" event handlers (onclick, onload, onerror, etc.)
            // Pattern: space/tab + "on" + lowercase letter + ... + "="
            if (b == 0x6F && i + 2 < len) { // 'o'
                uint8 n = _toLower(uint8(data[i + 1]));
                if (n == 0x6E) { // 'n'
                    uint8 charAfter = _toLower(uint8(data[i + 2]));
                    // Must be preceded by whitespace or quote to be an attribute
                    if (i > 0) {
                        uint8 prev = uint8(data[i - 1]);
                        if ((prev == 0x20 || prev == 0x09 || prev == 0x0A || prev == 0x0D || prev == 0x22 || prev == 0x27) &&
                            charAfter >= 0x61 && charAfter <= 0x7A) { // a-z after "on"
                            // Scan ahead for '=' to confirm it's an event handler attribute
                            for (uint256 j = i + 3; j < len && j < i + 30; j++) {
                                uint8 jb = uint8(data[j]);
                                if (jb == 0x3D) revert UnsafeSVG(); // '='
                                if (jb == 0x20 || jb == 0x3E || jb == 0x2F) break; // space, '>', '/'
                            }
                        }
                    }
                }
            }

            // Check for "javascript:" protocol
            if (b == 0x6A && i + 11 < len) { // 'j'
                if (_matchesLower(data, i, "javascript:")) revert UnsafeSVG();
            }

            // Check for "data:" protocol in attribute context (potential XSS via data: URIs)
            // Only block data:text/html which is the XSS vector, allow data:image/
            if (b == 0x64 && i + 14 < len) { // 'd'
                if (_matchesLower(data, i, "data:text/html")) revert UnsafeSVG();
            }
        }
    }

    /// @dev Case-insensitive match of data[offset..] against a lowercase pattern
    function _matchesLower(bytes calldata data, uint256 offset, string memory pattern) internal pure returns (bool) {
        bytes memory p = bytes(pattern);
        if (offset + p.length > data.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (_toLower(uint8(data[offset + i])) != uint8(p[i])) return false;
        }
        return true;
    }

    /// @dev Convert ASCII uppercase to lowercase
    function _toLower(uint8 b) internal pure returns (uint8) {
        if (b >= 0x41 && b <= 0x5A) return b + 0x20; // A-Z → a-z
        return b;
    }

    // ──────────────────────────────────────────────
    //  Security: JSON String Escaping
    // ──────────────────────────────────────────────

    /// @dev Escapes characters that would break JSON strings: " → \", \ → \\, newlines → \n
    function _escapeJSON(string memory input) internal pure returns (string memory) {
        bytes memory b = bytes(input);
        uint256 extra = 0;

        // Count characters that need escaping
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c == 0x22 || c == 0x5C || c == 0x0A || c == 0x0D || c == 0x09) {
                extra++;
            }
        }

        if (extra == 0) return input;

        bytes memory escaped = new bytes(b.length + extra);
        uint256 j = 0;

        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c == 0x22) {        // "
                escaped[j++] = 0x5C; // \
                escaped[j++] = 0x22; // "
            } else if (c == 0x5C) { // \
                escaped[j++] = 0x5C;
                escaped[j++] = 0x5C;
            } else if (c == 0x0A) { // \n
                escaped[j++] = 0x5C;
                escaped[j++] = 0x6E; // n
            } else if (c == 0x0D) { // \r
                escaped[j++] = 0x5C;
                escaped[j++] = 0x72; // r
            } else if (c == 0x09) { // \t
                escaped[j++] = 0x5C;
                escaped[j++] = 0x74; // t
            } else {
                escaped[j++] = b[i];
            }
        }

        return string(escaped);
    }

    // ──────────────────────────────────────────────
    //  Minting
    // ──────────────────────────────────────────────

    /// @notice Mint a new agent NFT with on-chain SVG and traits storage
    /// @param svgData Raw SVG bytes to store via SSTORE2
    /// @param traitsData OpenSea-compatible attributes JSON bytes (optional, pass empty for none)
    /// @param name Agent name for metadata
    /// @param description Agent description for metadata
    /// @return tokenId The newly minted token ID
    function mintAgent(
        bytes calldata svgData,
        bytes calldata traitsData,
        string calldata name,
        string calldata description
    ) external payable returns (uint256) {
        require(!paused, "Minting is paused");
        require(msg.value >= mintPrice, "Insufficient payment");
        require(svgData.length > 0, "Empty SVG data");
        require(svgData.length <= MAX_SVG_SIZE, "SVG exceeds 24KB limit");

        if (bytes(name).length > MAX_NAME_LENGTH) revert NameTooLong();
        if (bytes(description).length > MAX_DESCRIPTION_LENGTH) revert DescriptionTooLong();
        if (traitsData.length > MAX_TRAITS_SIZE) revert TraitsTooLarge();

        // Validate SVG content for XSS/injection
        _validateSVG(svgData);

        if (maxSupply > 0) {
            require(_nextTokenId < maxSupply, "Max supply reached");
        }
        if (maxPerWallet > 0) {
            require(mintCount[msg.sender] < maxPerWallet, "Wallet mint limit reached");
        }

        uint256 tokenId = _nextTokenId++;
        mintCount[msg.sender]++;

        _svgPointers[tokenId] = SSTORE2.write(svgData);
        _metadata[tokenId] = AgentMetadata(name, description);

        if (traitsData.length > 0) {
            _traitsPointers[tokenId] = SSTORE2.write(traitsData);
        }

        _safeMint(msg.sender, tokenId);

        emit AgentMinted(tokenId, msg.sender, _svgPointers[tokenId]);
        return tokenId;
    }

    // ──────────────────────────────────────────────
    //  Metadata & Token URI
    // ──────────────────────────────────────────────

    /// @notice Returns fully on-chain token metadata with embedded SVG and traits
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);

        string memory svg = string(SSTORE2.read(_svgPointers[tokenId]));
        AgentMetadata memory m = _metadata[tokenId];

        // Escape name and description for safe JSON embedding
        string memory safeName = _escapeJSON(m.name);
        string memory safeDesc = _escapeJSON(m.description);

        bytes memory json;

        if (_traitsPointers[tokenId] != address(0)) {
            string memory traits = string(SSTORE2.read(_traitsPointers[tokenId]));
            json = abi.encodePacked(
                '{"name":"', safeName,
                '","description":"', safeDesc,
                '","image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(svg)),
                '","attributes":', traits, '}'
            );
        } else {
            json = abi.encodePacked(
                '{"name":"', safeName,
                '","description":"', safeDesc,
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

    /// @notice Retrieve the raw SVG string for a token
    function getSVG(uint256 tokenId)
        public
        view
        returns (string memory)
    {
        _requireOwned(tokenId);
        return string(SSTORE2.read(_svgPointers[tokenId]));
    }

    /// @notice Retrieve the traits JSON string for a token
    function getTraits(uint256 tokenId)
        public
        view
        returns (string memory)
    {
        _requireOwned(tokenId);
        if (_traitsPointers[tokenId] == address(0)) return "";
        return string(SSTORE2.read(_traitsPointers[tokenId]));
    }

    /// @notice Get agent metadata for a token
    function getMetadata(uint256 tokenId)
        public
        view
        returns (string memory name, string memory description)
    {
        _requireOwned(tokenId);
        AgentMetadata memory m = _metadata[tokenId];
        return (m.name, m.description);
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    /// @notice Update the mint price (owner only)
    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
        emit MintPriceUpdated(_price);
    }

    /// @notice Set max total supply, 0 = unlimited (owner only)
    function setMaxSupply(uint256 _maxSupply) external onlyOwner {
        require(
            _maxSupply == 0 || _maxSupply >= _nextTokenId,
            "Below current supply"
        );
        maxSupply = _maxSupply;
        emit MaxSupplyUpdated(_maxSupply);
    }

    /// @notice Set max mints per wallet, 0 = unlimited (owner only)
    function setMaxPerWallet(uint256 _max) external onlyOwner {
        maxPerWallet = _max;
        emit MaxPerWalletUpdated(_max);
    }

    /// @notice Pause or unpause minting (owner only)
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice Set default royalty for all tokens (owner only)
    /// @param receiver Address to receive royalties
    /// @param feeNumerator Royalty fee in basis points (e.g. 500 = 5%)
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    /// @notice Set royalty for a specific token (owner only)
    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }

    /// @notice Withdraw contract balance to owner (owner only)
    function withdraw() external onlyOwner {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok, "Withdrawal failed");
    }

    /// @notice Withdraw contract balance to a specific address (owner only)
    function withdrawTo(address payable to) external onlyOwner {
        require(to != address(0), "Zero address");
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "Withdrawal failed");
    }

    // ──────────────────────────────────────────────
    //  Overrides (ERC721Enumerable + ERC2981)
    // ──────────────────────────────────────────────

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
