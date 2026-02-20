// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {SSTORE2} from "solady/src/utils/SSTORE2.sol";

contract BOOAv1 is ERC721Enumerable, ERC2981, Ownable {
    using Strings for uint256;

    uint256 private _nextTokenId;
    uint256 public mintPrice;
    uint256 public maxSupply;
    uint256 public maxPerWallet;
    bool public paused;

    uint256 public constant MAX_TRAITS_SIZE = 8192;
    uint256 public constant MAX_SVG_SIZE = 24576;

    mapping(uint256 => address) private _svgPointers;
    mapping(uint256 => address) private _traitsPointers;
    mapping(address => uint256) public mintCount;

    struct Commitment {
        uint256 timestamp;
        uint256 pricePaid;
        bool revealed;
    }

    mapping(address => Commitment[]) private _commitments;
    uint256 public constant REVEAL_DEADLINE = 7 days;

    uint256 public reservedFunds;

    event AgentMinted(uint256 indexed tokenId, address indexed minter, address svgPointer);
    event CommitMint(address indexed committer, uint256 indexed slotIndex);
    event MintPriceUpdated(uint256 newPrice);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event MaxPerWalletUpdated(uint256 newMaxPerWallet);
    event Paused(bool isPaused);

    error UnsafeSVG();
    error TraitsTooLarge();
    error UnsafeTraits();

    constructor(uint256 _mintPrice, address royaltyReceiver, uint96 royaltyFeeNumerator)
        ERC721("BOOA by Khora", "BOOA")
        Ownable(msg.sender)
    {
        mintPrice = _mintPrice;
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    // ── SVG Sanitization ──

    function _validateSVG(bytes calldata data) internal pure {
        uint256 len = data.length;
        uint256 start = 0;

        while (start < len) {
            uint8 b = uint8(data[start]);
            if (b == 0x20 || b == 0x09 || b == 0x0A || b == 0x0D || b == 0xEF || b == 0xBB || b == 0xBF) {
                start++;
            } else {
                break;
            }
        }

        require(
            start + 4 <= len &&
            uint8(data[start]) == 0x3C &&
            _toLower(uint8(data[start + 1])) == 0x73 &&
            _toLower(uint8(data[start + 2])) == 0x76 &&
            _toLower(uint8(data[start + 3])) == 0x67,
            "SVG must start with <svg"
        );

        for (uint256 i = start; i < len; i++) {
            uint8 b = _toLower(uint8(data[i]));

            if (b == 0x3C && i + 1 < len) {
                uint8 next = _toLower(uint8(data[i + 1]));
                // <script>
                if (next == 0x73 && i + 7 < len) {
                    if (_matchesLower(data, i + 1, "script")) revert UnsafeSVG();
                    if (_matchesLower(data, i + 1, "style")) revert UnsafeSVG();
                    // <set>
                    if (i + 4 < len && _matchesLower(data, i + 1, "set")) {
                        uint8 afterSet = i + 4 < len ? _toLower(uint8(data[i + 4])) : 0;
                        if (afterSet == 0x20 || afterSet == 0x3E || afterSet == 0x2F || afterSet == 0x09 || afterSet == 0x0A || afterSet == 0x0D) {
                            revert UnsafeSVG();
                        }
                    }
                }
                // <iframe>
                if (next == 0x69 && i + 7 < len) {
                    if (_matchesLower(data, i + 1, "iframe")) revert UnsafeSVG();
                }
                // <object>
                if (next == 0x6F && i + 7 < len) {
                    if (_matchesLower(data, i + 1, "object")) revert UnsafeSVG();
                }
                // <embed>
                if (next == 0x65 && i + 6 < len) {
                    if (_matchesLower(data, i + 1, "embed")) revert UnsafeSVG();
                }
                // <foreignobject>
                if (next == 0x66 && i + 14 < len) {
                    if (_matchesLower(data, i + 1, "foreignobject")) revert UnsafeSVG();
                    if (_matchesLower(data, i + 1, "feimage")) revert UnsafeSVG();
                }
                // <animate>, <a>
                if (next == 0x61 && i + 2 < len) {
                    // <animate> or <animatetransform> etc
                    if (i + 8 < len && _matchesLower(data, i + 1, "animate")) revert UnsafeSVG();
                    // <a> — check it's just <a followed by space/> not <animate etc
                    uint8 afterA = _toLower(uint8(data[i + 2]));
                    if (afterA == 0x20 || afterA == 0x3E || afterA == 0x09 || afterA == 0x0A || afterA == 0x0D) {
                        revert UnsafeSVG();
                    }
                }
                // <image>
                if (next == 0x69 && i + 6 < len) {
                    if (_matchesLower(data, i + 1, "image")) revert UnsafeSVG();
                }
            }

            // on* event handler detection
            if (b == 0x6F && i + 2 < len) {
                uint8 n = _toLower(uint8(data[i + 1]));
                if (n == 0x6E) {
                    uint8 charAfter = _toLower(uint8(data[i + 2]));
                    if (i > 0) {
                        uint8 prev = uint8(data[i - 1]);
                        if ((prev == 0x20 || prev == 0x09 || prev == 0x0A || prev == 0x0D || prev == 0x22 || prev == 0x27) &&
                            charAfter >= 0x61 && charAfter <= 0x7A) {
                            for (uint256 j = i + 3; j < len && j < i + 30; j++) {
                                uint8 jb = uint8(data[j]);
                                if (jb == 0x3D) revert UnsafeSVG();
                                if (jb == 0x20 || jb == 0x09 || jb == 0x0A || jb == 0x0D || jb == 0x3E || jb == 0x2F) break;
                            }
                        }
                    }
                }
            }

            if (b == 0x6A && i + 11 < len) {
                if (_matchesLower(data, i, "javascript:")) revert UnsafeSVG();
            }

            if (b == 0x64 && i + 14 < len) {
                if (_matchesLower(data, i, "data:text/html")) revert UnsafeSVG();
            }
        }
    }

    function _validateTraits(bytes calldata data) internal pure {
        if (data.length == 0) return;
        // Must start with [ and end with ]
        uint8 first = uint8(data[0]);
        uint8 last = uint8(data[data.length - 1]);
        if (first != 0x5B || last != 0x5D) revert UnsafeTraits(); // [ and ]

        // Scan for unescaped characters that could break JSON encapsulation
        // The traits are placed directly into JSON via abi.encodePacked.
        // We disallow raw `}` outside of the traits array context that could
        // close the parent JSON object. Specifically, we track bracket depth.
        uint256 braceDepth = 0;
        bool inString = false;
        bool escaped = false;
        for (uint256 i = 0; i < data.length; i++) {
            uint8 b = uint8(data[i]);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (b == 0x5C) { // backslash
                escaped = true;
                continue;
            }
            if (b == 0x22) { // double quote
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (b == 0x7B) braceDepth++;       // {
            if (b == 0x7D) {                    // }
                if (braceDepth == 0) revert UnsafeTraits();
                braceDepth--;
            }
        }
    }

    function _matchesLower(bytes calldata data, uint256 offset, string memory pattern) internal pure returns (bool) {
        bytes memory p = bytes(pattern);
        if (offset + p.length > data.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (_toLower(uint8(data[offset + i])) != uint8(p[i])) return false;
        }
        return true;
    }

    function _toLower(uint8 b) internal pure returns (uint8) {
        if (b >= 0x41 && b <= 0x5A) return b + 0x20;
        return b;
    }

    // ── Direct Minting ──

    function mintAgent(
        bytes calldata svgData,
        bytes calldata traitsData
    ) external payable returns (uint256) {
        require(!paused, "Minting is paused");
        require(msg.value >= mintPrice, "Insufficient payment");
        require(svgData.length > 0, "Empty SVG data");
        require(svgData.length <= MAX_SVG_SIZE, "SVG exceeds 24KB limit");
        if (traitsData.length > MAX_TRAITS_SIZE) revert TraitsTooLarge();
        _validateSVG(svgData);
        _validateTraits(traitsData);

        if (maxSupply > 0) {
            require(_nextTokenId < maxSupply, "Max supply reached");
        }
        if (maxPerWallet > 0) {
            require(mintCount[msg.sender] < maxPerWallet, "Wallet mint limit reached");
        }

        uint256 tokenId = _nextTokenId++;
        mintCount[msg.sender]++;

        _svgPointers[tokenId] = SSTORE2.write(svgData);
        if (traitsData.length > 0) {
            _traitsPointers[tokenId] = SSTORE2.write(traitsData);
        }

        _safeMint(msg.sender, tokenId);
        emit AgentMinted(tokenId, msg.sender, _svgPointers[tokenId]);
        return tokenId;
    }

    // ── Commit-Reveal Minting ──

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
        bytes calldata svgData,
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

        require(svgData.length > 0, "Empty SVG data");
        require(svgData.length <= MAX_SVG_SIZE, "SVG exceeds 24KB limit");
        if (traitsData.length > MAX_TRAITS_SIZE) revert TraitsTooLarge();
        _validateSVG(svgData);
        _validateTraits(traitsData);

        if (maxSupply > 0) {
            require(_nextTokenId < maxSupply, "Max supply reached");
        }
        if (maxPerWallet > 0) {
            require(mintCount[msg.sender] < maxPerWallet, "Wallet mint limit reached");
        }

        tokenId = _nextTokenId++;
        mintCount[msg.sender]++;

        _svgPointers[tokenId] = SSTORE2.write(svgData);
        if (traitsData.length > 0) {
            _traitsPointers[tokenId] = SSTORE2.write(traitsData);
        }

        _safeMint(msg.sender, tokenId);
        emit AgentMinted(tokenId, msg.sender, _svgPointers[tokenId]);
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
        external
        view
        returns (uint256 timestamp, bool revealed)
    {
        require(slotIndex < _commitments[account].length, "Invalid slot");
        Commitment memory c = _commitments[account][slotIndex];
        return (c.timestamp, c.revealed);
    }

    // ── Metadata & Token URI ──

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);

        string memory svg = string(SSTORE2.read(_svgPointers[tokenId]));
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

    function getSVG(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        return string(SSTORE2.read(_svgPointers[tokenId]));
    }

    function getTraits(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        if (_traitsPointers[tokenId] == address(0)) return "";
        return string(SSTORE2.read(_traitsPointers[tokenId]));
    }

    // ── Admin ──

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

    // ── Overrides ──

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
