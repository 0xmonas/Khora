// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BOOAPixelArtValidator
 * @notice On-chain format enforcement for BOOA pixel art SVGs.
 *
 * Ensures every SVG submitted to the contract conforms to the BOOA pipeline
 * output format: C64 16-color palette, only <svg>/<rect>/<path> elements,
 * path commands restricted to M/h grid movements, no inline styles.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  INTEGRATION: Add these functions to BOOA.sol as internal,     │
 * │  then call _validatePixelArt(svgData) in mintAgent()           │
 * │  and revealMint() right after the existing _validateSVG().     │
 * │                                                                │
 * │  _validateSVG(svgData);        // existing XSS protection     │
 * │  _validatePixelArt(svgData);   // ← ADD THIS LINE             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Written as a standalone contract for testing. In production,
 * copy the internal functions directly into BOOA.sol.
 */
contract BOOAPixelArtValidator {

    error InvalidPixelArt();

    // ════════════════════════════════════════════════════════════════
    //  MAIN ENTRY POINT
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Validates that SVG bytes conform to BOOA pixel art format.
     * @dev Call after _validateSVG(). Four checks, each independent:
     *   1. Tag whitelist    — only <svg>, <rect>, <path> elements
     *   2. Palette colors   — every #color is from C64 16-color set
     *   3. Path commands    — d="..." contains only M, h, digits, spaces
     *   4. No style attr    — blocks inline CSS color/animation bypasses
     */
    function _validatePixelArt(bytes calldata data) internal pure {
        uint256 len = data.length;
        // State flags for path data scanning
        bool inPathData = false;

        for (uint256 i = 0; i < len; ) {
            uint8 b = uint8(data[i]);

            // ── Path data mode: only M, h, 0-9, space allowed ──
            if (inPathData) {
                if (b == 0x22) {
                    // Closing quote — exit path data mode
                    inPathData = false;
                    ++i;
                    continue;
                }
                // M (0x4D), h (0x68), 0-9 (0x30-0x39), space (0x20)
                if (
                    b == 0x4D || b == 0x68 ||
                    (b >= 0x30 && b <= 0x39) ||
                    b == 0x20
                ) {
                    ++i;
                    continue;
                }
                revert InvalidPixelArt(); // Invalid char in path data
            }

            // ── Check 1: Tag whitelist ──
            if (b == 0x3C) { // <
                i = _validateTag(data, i, len);
                continue;
            }

            // ── Check 2: Palette color ──
            if (b == 0x23) { // #
                i = _validateColor(data, i, len);
                continue;
            }

            // ── Check 3: Enter path data mode on d=" ──
            if (b == 0x64) { // 'd'
                if (i + 2 < len && uint8(data[i + 1]) == 0x3D && uint8(data[i + 2]) == 0x22) {
                    // d="  → enter path data mode
                    inPathData = true;
                    i += 3; // skip past d="
                    continue;
                }
            }

            // ── Check 4: Reject style attribute ──
            // Look for whitespace + "style" + optional whitespace + "="
            if (b == 0x73 || b == 0x53) { // s or S
                if (_isStyleAttribute(data, i, len)) {
                    revert InvalidPixelArt();
                }
            }

            ++i;
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  TAG WHITELIST
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Validates that a tag starting at `pos` is svg, rect, or path.
     * @return The index after the validated tag name.
     */
    function _validateTag(
        bytes calldata data,
        uint256 pos,
        uint256 len
    ) internal pure returns (uint256) {
        // pos points to '<'
        uint256 next = pos + 1;
        if (next >= len) revert InvalidPixelArt();

        uint8 b = uint8(data[next]);

        // ── Closing tag: </ ──
        if (b == 0x2F) {
            next++;
            if (next >= len) revert InvalidPixelArt();
            b = _lower(uint8(data[next]));

            // </svg>
            if (b == 0x73 && _matchTag(data, next, len, "svg")) return next + 3;
            // </rect>
            if (b == 0x72 && _matchTag(data, next, len, "rect")) return next + 4;
            // </path>
            if (b == 0x70 && _matchTag(data, next, len, "path")) return next + 4;

            revert InvalidPixelArt();
        }

        // ── Opening tag ──
        b = _lower(b);

        // <svg
        if (b == 0x73 && _matchTag(data, next, len, "svg")) return next + 3;
        // <rect
        if (b == 0x72 && _matchTag(data, next, len, "rect")) return next + 4;
        // <path
        if (b == 0x70 && _matchTag(data, next, len, "path")) return next + 4;

        revert InvalidPixelArt();
    }

    /**
     * @notice Matches a tag name and verifies the character AFTER the name
     *         is a valid tag delimiter (space, >, /, tab, newline, CR).
     *         This prevents <svgMalicious> from passing as <svg>.
     */
    function _matchTag(
        bytes calldata data,
        uint256 offset,
        uint256 len,
        string memory tag
    ) internal pure returns (bool) {
        bytes memory t = bytes(tag);
        uint256 tLen = t.length;
        if (offset + tLen > len) return false;

        for (uint256 i = 0; i < tLen; i++) {
            if (_lower(uint8(data[offset + i])) != uint8(t[i])) return false;
        }

        // Character after tag name must be a delimiter (or end of data)
        uint256 end = offset + tLen;
        if (end >= len) return true; // EOF is ok (edge case)

        uint8 a = uint8(data[end]);
        // space, >, /, tab, newline, CR
        return a == 0x20 || a == 0x3E || a == 0x2F ||
               a == 0x09 || a == 0x0A || a == 0x0D;
    }

    // ════════════════════════════════════════════════════════════════
    //  C64 PALETTE ENFORCEMENT
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Parses a hex color starting at `pos` (#RGB or #RRGGBB)
     *         and validates it against the C64 16-color palette.
     * @return The index after the parsed color.
     */
    function _validateColor(
        bytes calldata data,
        uint256 pos,
        uint256 len
    ) internal pure returns (uint256) {
        // pos points to '#'
        uint256 hexStart = pos + 1;

        // Count consecutive hex digits
        uint256 hexLen = 0;
        for (uint256 i = hexStart; i < len && hexLen < 6; i++) {
            if (_isHexDigit(uint8(data[i]))) {
                hexLen++;
            } else {
                break;
            }
        }

        uint24 color;

        if (hexLen == 3) {
            // #RGB → expand to #RRGGBB
            uint8 r = _hexVal(uint8(data[hexStart]));
            uint8 g = _hexVal(uint8(data[hexStart + 1]));
            uint8 bl = _hexVal(uint8(data[hexStart + 2]));
            color = (uint24(r) << 20) | (uint24(r) << 16) |
                    (uint24(g) << 12) | (uint24(g) << 8) |
                    (uint24(bl) << 4) | uint24(bl);
            if (!_isC64Color(color)) revert InvalidPixelArt();
            return hexStart + 3;

        } else if (hexLen == 6) {
            // #RRGGBB
            color = (uint24(_hexVal(uint8(data[hexStart]))) << 20) |
                    (uint24(_hexVal(uint8(data[hexStart + 1]))) << 16) |
                    (uint24(_hexVal(uint8(data[hexStart + 2]))) << 12) |
                    (uint24(_hexVal(uint8(data[hexStart + 3]))) << 8) |
                    (uint24(_hexVal(uint8(data[hexStart + 4]))) << 4) |
                    uint24(_hexVal(uint8(data[hexStart + 5])));
            if (!_isC64Color(color)) revert InvalidPixelArt();
            return hexStart + 6;

        } else {
            // Not a valid color format — reject
            revert InvalidPixelArt();
        }
    }

    /**
     * @notice Checks if a uint24 RGB value is one of the 16 C64 palette colors.
     * @dev Compiler optimizes this chain into efficient EQ+OR opcodes.
     *
     *   #000000  #626262  #898989  #ADADAD  #FFFFFF
     *   #9F4E44  #CB7E75  #6D5412  #A1683C  #C9D487
     *   #9AE29B  #5CAB5E  #6ABFC6  #887ECB  #50459B
     *   #A057A3
     */
    function _isC64Color(uint24 c) internal pure returns (bool) {
        return
            c == 0x000000 || c == 0x626262 || c == 0x898989 || c == 0xADADAD ||
            c == 0xFFFFFF || c == 0x9F4E44 || c == 0xCB7E75 || c == 0x6D5412 ||
            c == 0xA1683C || c == 0xC9D487 || c == 0x9AE29B || c == 0x5CAB5E ||
            c == 0x6ABFC6 || c == 0x887ECB || c == 0x50459B || c == 0xA057A3;
    }

    // ════════════════════════════════════════════════════════════════
    //  STYLE ATTRIBUTE REJECTION
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice Detects an inline style attribute: (whitespace)style(=)
     * @dev Checks that 's' at `pos` is preceded by whitespace and followed
     *      by "tyle" then optional whitespace then "=".
     */
    function _isStyleAttribute(
        bytes calldata data,
        uint256 pos,
        uint256 len
    ) internal pure returns (bool) {
        // Must be preceded by whitespace (attribute boundary)
        if (pos == 0) return false;
        uint8 prev = uint8(data[pos - 1]);
        if (prev != 0x20 && prev != 0x09 && prev != 0x0A && prev != 0x0D) return false;

        // Match "style" (case-insensitive)
        if (pos + 5 > len) return false;
        if (_lower(uint8(data[pos]))     != 0x73) return false; // s
        if (_lower(uint8(data[pos + 1])) != 0x74) return false; // t
        if (_lower(uint8(data[pos + 2])) != 0x79) return false; // y
        if (_lower(uint8(data[pos + 3])) != 0x6C) return false; // l
        if (_lower(uint8(data[pos + 4])) != 0x65) return false; // e

        // After "style", skip whitespace, then expect "="
        uint256 j = pos + 5;
        while (j < len) {
            uint8 c = uint8(data[j]);
            if (c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D) {
                j++;
                continue;
            }
            return c == 0x3D; // '='
        }
        return false;
    }

    // ════════════════════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════════════════════

    function _lower(uint8 b) internal pure returns (uint8) {
        if (b >= 0x41 && b <= 0x5A) return b + 0x20;
        return b;
    }

    function _isHexDigit(uint8 b) internal pure returns (bool) {
        return (b >= 0x30 && b <= 0x39) ||  // 0-9
               (b >= 0x41 && b <= 0x46) ||  // A-F
               (b >= 0x61 && b <= 0x66);    // a-f
    }

    function _hexVal(uint8 b) internal pure returns (uint8) {
        if (b >= 0x30 && b <= 0x39) return b - 0x30;
        if (b >= 0x41 && b <= 0x46) return b - 0x37; // A=10 → 0x41-0x37=0x0A
        if (b >= 0x61 && b <= 0x66) return b - 0x57; // a=10 → 0x61-0x57=0x0A
        revert InvalidPixelArt();
    }

    // ════════════════════════════════════════════════════════════════
    //  EXTERNAL TEST HARNESS
    // ════════════════════════════════════════════════════════════════

    /// @notice Public wrapper for testing. Not included in production BOOA.
    function validatePixelArt(bytes calldata data) external pure {
        _validatePixelArt(data);
    }

    /// @notice Public wrapper for color check testing.
    function isC64Color(uint24 c) external pure returns (bool) {
        return _isC64Color(c);
    }
}
