// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {DynamicBufferLib} from "solady/src/utils/DynamicBufferLib.sol";
import {IBOOARenderer} from "./interfaces/IBOOARenderer.sol";
import {IBOOAStorage} from "./interfaces/IBOOAStorage.sol";

/// @title BOOARenderer
/// @notice On-chain SVG renderer + tokenURI builder. Reads from BOOAStorage.
contract BOOARenderer is IBOOARenderer, Ownable {
    using Strings for uint256;
    using DynamicBufferLib for DynamicBufferLib.DynamicBuffer;

    IBOOAStorage public dataStore;

    // C64 16-color palette (RGB, 48 bytes)
    bytes private constant PALETTE =
        hex"000000626262898989ADADADFFFFFF"
        hex"9F4E44CB7E756D5412A1683CC9D487"
        hex"9AE29B5CAB5E6ABFC6887ECB50459B"
        hex"A057A3";

    constructor(address _dataStore) Ownable(msg.sender) {
        dataStore = IBOOAStorage(_dataStore);
    }

    function setDataStore(address _dataStore) external onlyOwner {
        dataStore = IBOOAStorage(_dataStore);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes memory bitmap = dataStore.getImageData(tokenId);
        require(bitmap.length > 0, "No image data");

        bytes memory traitsData = dataStore.getTraits(tokenId);
        string memory svg = renderSVG(bitmap);
        string memory svgBase64 = Base64.encode(bytes(svg));

        DynamicBufferLib.DynamicBuffer memory buf;
        buf.p('{"name":"BOOA #', bytes(tokenId.toString()),
               '","description":"BOOA on-chain AI agent PFP","image":"data:image/svg+xml;base64,',
               bytes(svgBase64), '"');

        if (traitsData.length > 0) {
            buf.p(',"attributes":');
            buf.p(traitsData);
        }

        buf.p('}');

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(buf.data)
        );
    }

    function renderSVG(bytes memory bitmap) public pure returns (string memory) {
        require(bitmap.length == 2048, "Invalid bitmap");

        uint16[16] memory counts;
        for (uint256 i; i < 2048; ++i) {
            uint8 b = uint8(bitmap[i]);
            counts[b >> 4]++;
            counts[b & 0x0F]++;
        }
        uint8 bgColor;
        uint16 maxCount;
        for (uint8 c; c < 16; ++c) {
            if (counts[c] > maxCount) {
                maxCount = counts[c];
                bgColor = c;
            }
        }

        DynamicBufferLib.DynamicBuffer memory buf;
        buf.p('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges">');
        buf.p('<rect fill="#', bytes(_colorHex(bgColor)), '" width="64" height="64"/>');

        for (uint8 color; color < 16; ++color) {
            if (color == bgColor || counts[color] == 0) continue;
            bytes memory pathData = _buildPathData(bitmap, color);
            if (pathData.length > 0) {
                buf.p('<path stroke="#', bytes(_colorHex(color)), '" d="', pathData, '"/>');
            }
        }

        buf.p('</svg>');
        return string(buf.data);
    }

    function _buildPathData(bytes memory bitmap, uint8 color) internal pure returns (bytes memory) {
        DynamicBufferLib.DynamicBuffer memory buf;

        for (uint256 y; y < 64; ++y) {
            uint256 rowOffset = y * 32;
            uint256 x;
            while (x < 64) {
                if (_getPixel(bitmap, rowOffset, x) != color) {
                    ++x;
                    continue;
                }
                uint256 runStart = x;
                while (x < 64 && _getPixel(bitmap, rowOffset, x) == color) {
                    ++x;
                }
                uint256 runLen = x - runStart;
                buf.p('M', bytes(runStart.toString()), ' ', bytes(y.toString()), 'h', bytes(runLen.toString()));
            }
        }

        return buf.data;
    }

    function _getPixel(bytes memory bitmap, uint256 rowOffset, uint256 x) internal pure returns (uint8) {
        uint8 b = uint8(bitmap[rowOffset + (x >> 1)]);
        return (x & 1 == 0) ? (b >> 4) : (b & 0x0F);
    }

    function _colorHex(uint8 index) internal pure returns (string memory) {
        uint256 offset = uint256(index) * 3;
        bytes memory hex6 = new bytes(6);
        for (uint256 i; i < 3; ++i) {
            uint8 val = uint8(PALETTE[offset + i]);
            hex6[i * 2] = _hexChar(val >> 4);
            hex6[i * 2 + 1] = _hexChar(val & 0x0F);
        }
        return string(hex6);
    }

    function _hexChar(uint8 v) internal pure returns (bytes1) {
        return v < 10 ? bytes1(v + 0x30) : bytes1(v + 0x37);
    }
}
