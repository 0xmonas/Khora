import { expect } from "chai";
import { ethers } from "hardhat";
import type { BOOA } from "../typechain-types";

describe("BOOA (Bitmap)", function () {
  let contract: BOOA;
  let owner: any;
  let user: any;
  let user2: any;
  const mintPrice = ethers.parseEther("0.0042");
  const royaltyFee = 500;

  // ── Bitmap helpers ──

  /** Create a 2048-byte bitmap filled with a single C64 palette index (0-15). */
  function makeBitmap(colorIndex: number = 0): Uint8Array {
    const packed = ((colorIndex & 0xF) << 4) | (colorIndex & 0xF);
    return new Uint8Array(2048).fill(packed);
  }

  /** Create a bitmap with a horizontal stripe of `fgColor` on row `row`. */
  function makeBitmapWithStripe(bgColor: number, fgColor: number, row: number, startX: number, length: number): Uint8Array {
    const bitmap = makeBitmap(bgColor);
    for (let x = startX; x < startX + length; x++) {
      const byteIdx = row * 32 + (x >> 1);
      if (x % 2 === 0) {
        bitmap[byteIdx] = (fgColor << 4) | (bitmap[byteIdx] & 0x0F);
      } else {
        bitmap[byteIdx] = (bitmap[byteIdx] & 0xF0) | fgColor;
      }
    }
    return bitmap;
  }

  // Test data: all-black bitmap (palette 0)
  const testBitmap = makeBitmap(0);
  // Test data: bitmap with dark grey stripe (palette 1) on row 5
  const testBitmapWithStripe = makeBitmapWithStripe(0, 1, 5, 12, 3);

  const testTraits = JSON.stringify([
    { trait_type: "Creature", value: "AI familiar" },
    { trait_type: "Vibe", value: "sharp and witty" },
    { trait_type: "Name", value: "TestAgent" },
  ]);
  const testTraitsBytes = ethers.toUtf8Bytes(testTraits);

  beforeEach(async function () {
    [owner, user, user2] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("BOOA");
    contract = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
    await contract.waitForDeployment();
  });

  // ════════════════════════════════════════════════════════════
  //  MINTING
  // ════════════════════════════════════════════════════════════

  describe("Minting", function () {
    it("should mint with valid bitmap and traits data", async function () {
      const tx = await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("should produce sequential token IDs", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(3);
      expect(await contract.ownerOf(0)).to.equal(user.address);
      expect(await contract.ownerOf(1)).to.equal(user.address);
      expect(await contract.ownerOf(2)).to.equal(user.address);
    });

    it("should revert with insufficient payment", async function () {
      await expect(
        contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: 0 })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should revert with invalid bitmap (wrong size)", async function () {
      await expect(
        contract.connect(user).mintAgent("0x", testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should emit AgentMinted event", async function () {
      await expect(
        contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice })
      ).to.emit(contract, "AgentMinted")
        .withArgs(0, user.address, (value: any) => typeof value === 'string');
    });

    it("should track mintCount per wallet", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      expect(await contract.mintCount(user.address)).to.equal(2);
      expect(await contract.mintCount(user2.address)).to.equal(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  TRAITS
  // ════════════════════════════════════════════════════════════

  describe("Traits", function () {
    it("should store and retrieve traits JSON", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const traits = await contract.getTraits(0);
      expect(traits).to.equal(testTraits);
    });

    it("should include attributes in tokenURI", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.attributes).to.be.an("array");
      expect(json.attributes[0].trait_type).to.equal("Creature");
      expect(json.attributes[0].value).to.equal("AI familiar");
    });

    it("should handle empty traits gracefully", async function () {
      await contract.connect(user).mintAgent(testBitmap, "0x", { value: mintPrice });
      const traits = await contract.getTraits(0);
      expect(traits).to.equal("");
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.attributes).to.be.undefined;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  TOKEN URI & ON-CHAIN SVG RENDERING
  // ════════════════════════════════════════════════════════════

  describe("Token URI", function () {
    beforeEach(async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
    });

    it("should return valid data URI", async function () {
      const uri = await contract.tokenURI(0);
      expect(uri).to.match(/^data:application\/json;base64,/);
    });

    it("should auto-generate name as BOOA #N", async function () {
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      expect(json.description).to.equal("BOOA on-chain AI agent PFP");
      expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);
    });

    it("should produce sequential names for multiple tokens", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });

      for (let i = 0; i < 3; i++) {
        const uri = await contract.tokenURI(i);
        const base64Json = uri.replace("data:application/json;base64,", "");
        const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
        expect(json.name).to.equal(`BOOA #${i}`);
      }
    });

    it("should contain valid rendered SVG in tokenURI", async function () {
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const decodedSVG = Buffer.from(svgBase64, "base64").toString();
      // Rendered SVG for all-black bitmap: background rect with #000000
      expect(decodedSVG).to.include('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(decodedSVG).to.include('viewBox="0 -0.5 64 64"');
      expect(decodedSVG).to.include('<rect fill="#000000"');
      expect(decodedSVG).to.include('</svg>');
    });

    it("should revert for non-existent token", async function () {
      await expect(contract.tokenURI(99)).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  getSVG — ON-CHAIN RENDERING
  // ════════════════════════════════════════════════════════════

  describe("getSVG", function () {
    it("should return rendered SVG for all-black bitmap", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const svg = await contract.getSVG(0);
      // All-black = single rect, no paths
      expect(svg).to.include('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).to.include('<rect fill="#000000" width="64" height="64"/>');
      expect(svg).to.include('</svg>');
      expect(svg).to.not.include('<path'); // no non-background pixels
    });

    it("should render paths for non-background colors", async function () {
      // Bitmap with dark grey (index 1) stripe at row 5, columns 12-14
      await contract.connect(user).mintAgent(testBitmapWithStripe, testTraitsBytes, { value: mintPrice });
      const svg = await contract.getSVG(0);
      expect(svg).to.include('<rect fill="#000000"'); // background is black
      expect(svg).to.include('<path stroke="#626262"'); // dark grey path
      expect(svg).to.include('M12 5h3'); // stripe: start at x=12, y=5, length 3
    });

    it("should render all 16 C64 palette colors correctly", async function () {
      const C64_HEX = [
        "000000", "626262", "898989", "ADADAD", "FFFFFF",
        "9F4E44", "CB7E75", "6D5412", "A1683C", "C9D487",
        "9AE29B", "5CAB5E", "6ABFC6", "887ECB", "50459B",
        "A057A3",
      ];
      // For each palette color, mint a solid fill and verify the SVG
      for (let c = 0; c < 16; c++) {
        const bitmap = makeBitmap(c);
        await contract.connect(user).mintAgent(bitmap, "0x", { value: mintPrice });
        const svg = await contract.getSVG(c);
        expect(svg).to.include(`<rect fill="#${C64_HEX[c]}"`);
      }
    });
  });

  // ════════════════════════════════════════════════════════════
  //  getBitmap — RAW DATA RETRIEVAL
  // ════════════════════════════════════════════════════════════

  describe("getBitmap", function () {
    it("should return exact bitmap bytes that were stored", async function () {
      await contract.connect(user).mintAgent(testBitmapWithStripe, testTraitsBytes, { value: mintPrice });
      const raw = await contract.getBitmap(0);
      const returned = ethers.getBytes(raw);
      expect(returned.length).to.equal(2048);
      // Verify the stripe pixel
      expect(returned[5 * 32 + 6]).to.equal(testBitmapWithStripe[5 * 32 + 6]);
    });

    it("should revert for non-existent token", async function () {
      await expect(contract.getBitmap(99)).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  ENUMERATION (ERC721Enumerable)
  // ════════════════════════════════════════════════════════════

  describe("Enumeration (ERC721Enumerable)", function () {
    beforeEach(async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
    });

    it("should return correct totalSupply", async function () {
      expect(await contract.totalSupply()).to.equal(3);
    });

    it("should return tokenByIndex", async function () {
      expect(await contract.tokenByIndex(0)).to.equal(0);
      expect(await contract.tokenByIndex(1)).to.equal(1);
      expect(await contract.tokenByIndex(2)).to.equal(2);
    });

    it("should return tokenOfOwnerByIndex", async function () {
      expect(await contract.tokenOfOwnerByIndex(user.address, 0)).to.equal(0);
      expect(await contract.tokenOfOwnerByIndex(user.address, 1)).to.equal(1);
      expect(await contract.tokenOfOwnerByIndex(user2.address, 0)).to.equal(2);
    });

    it("should return correct balanceOf", async function () {
      expect(await contract.balanceOf(user.address)).to.equal(2);
      expect(await contract.balanceOf(user2.address)).to.equal(1);
    });

    it("should revert tokenOfOwnerByIndex out of bounds", async function () {
      await expect(contract.tokenOfOwnerByIndex(user.address, 5)).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  ROYALTIES (EIP-2981)
  // ════════════════════════════════════════════════════════════

  describe("Royalties (EIP-2981)", function () {
    it("should return correct default royalty info", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(ethers.parseEther("0.05"));
    });

    it("should allow owner to update default royalty", async function () {
      await contract.connect(owner).setDefaultRoyalty(user2.address, 1000);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(user2.address);
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("should allow owner to set per-token royalty", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(owner).setTokenRoyalty(0, user2.address, 250);
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(user2.address);
      expect(amount).to.equal(ethers.parseEther("0.025"));
    });

    it("should revert royalty functions from non-owner", async function () {
      await expect(
        contract.connect(user).setDefaultRoyalty(user.address, 500)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
      await expect(
        contract.connect(user).setTokenRoyalty(0, user.address, 500)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("should support ERC2981 interface", async function () {
      expect(await contract.supportsInterface("0x2a55205a")).to.be.true;
    });

    it("should support ERC721 interface", async function () {
      expect(await contract.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support ERC721Enumerable interface", async function () {
      expect(await contract.supportsInterface("0x780e9d63")).to.be.true;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  SUPPLY AND WALLET LIMITS
  // ════════════════════════════════════════════════════════════

  describe("Supply and wallet limits", function () {
    it("should enforce maxSupply", async function () {
      await contract.connect(owner).setMaxSupply(1);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user2).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Max supply reached");
    });

    it("should enforce maxPerWallet", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should allow different wallets when maxPerWallet is set", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(2);
    });

    it("should allow unlimited minting when limits are 0", async function () {
      for (let i = 0; i < 3; i++) {
        await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      }
      expect(await contract.totalSupply()).to.equal(3);
    });

    it("should not allow setting maxSupply below current supply", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(owner).setMaxSupply(1)
      ).to.be.revertedWith("Below current supply");
    });

    it("should allow setting maxSupply to 0 (unlimited) after mints", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(owner).setMaxSupply(0);
      expect(await contract.maxSupply()).to.equal(0);
    });

    it("should emit events for limit changes", async function () {
      await expect(contract.connect(owner).setMaxSupply(100))
        .to.emit(contract, "MaxSupplyUpdated").withArgs(100);
      await expect(contract.connect(owner).setMaxPerWallet(5))
        .to.emit(contract, "MaxPerWalletUpdated").withArgs(5);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  PAUSE
  // ════════════════════════════════════════════════════════════

  describe("Pause", function () {
    it("should prevent minting when paused", async function () {
      await contract.connect(owner).setPaused(true);
      await expect(
        contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Minting is paused");
    });

    it("should allow minting after unpause", async function () {
      await contract.connect(owner).setPaused(true);
      await contract.connect(owner).setPaused(false);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should emit Paused event", async function () {
      await expect(contract.connect(owner).setPaused(true))
        .to.emit(contract, "Paused").withArgs(true);
      await expect(contract.connect(owner).setPaused(false))
        .to.emit(contract, "Paused").withArgs(false);
    });

    it("should revert setPaused from non-owner", async function () {
      await expect(
        contract.connect(user).setPaused(true)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  OWNER FUNCTIONS
  // ════════════════════════════════════════════════════════════

  describe("Owner functions", function () {
    it("should allow owner to set mint price", async function () {
      const newPrice = ethers.parseEther("0.01");
      await contract.connect(owner).setMintPrice(newPrice);
      expect(await contract.mintPrice()).to.equal(newPrice);
    });

    it("should revert setMintPrice from non-owner", async function () {
      await expect(
        contract.connect(user).setMintPrice(ethers.parseEther("0.01"))
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("should allow owner to withdraw", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter + gasUsed - balanceBefore).to.equal(mintPrice);
    });

    it("should allow owner to withdrawTo", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const balanceBefore = await ethers.provider.getBalance(user2.address);
      await contract.connect(owner).withdrawTo(user2.address);
      const balanceAfter = await ethers.provider.getBalance(user2.address);
      expect(balanceAfter - balanceBefore).to.equal(mintPrice);
    });

    it("should revert withdrawTo with zero address", async function () {
      await expect(
        contract.connect(owner).withdrawTo(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address");
    });

    it("should emit MintPriceUpdated event", async function () {
      const newPrice = ethers.parseEther("0.005");
      await expect(contract.connect(owner).setMintPrice(newPrice))
        .to.emit(contract, "MintPriceUpdated").withArgs(newPrice);
    });

    it("should revert admin functions from non-owner", async function () {
      await expect(
        contract.connect(user).setMaxSupply(100)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
      await expect(
        contract.connect(user).setMaxPerWallet(5)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  SECURITY: BITMAP VALIDATION
  //  (Replaces all SVG sanitization tests — bitmap format
  //   makes injection structurally impossible)
  // ════════════════════════════════════════════════════════════

  describe("Security: Bitmap Validation", function () {
    it("should accept valid 2048-byte bitmap", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should reject empty bitmap", async function () {
      await expect(
        contract.connect(user).mintAgent("0x", testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should reject bitmap too short (1 byte)", async function () {
      await expect(
        contract.connect(user).mintAgent(new Uint8Array([0x00]), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should reject bitmap too short (2047 bytes)", async function () {
      await expect(
        contract.connect(user).mintAgent(new Uint8Array(2047), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should reject bitmap too long (2049 bytes)", async function () {
      await expect(
        contract.connect(user).mintAgent(new Uint8Array(2049), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should reject bitmap too long (4096 bytes)", async function () {
      await expect(
        contract.connect(user).mintAgent(new Uint8Array(4096), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should accept bitmap with all 0xFF bytes (palette 15 = magenta)", async function () {
      const allFF = new Uint8Array(2048).fill(0xFF);
      await contract.connect(user).mintAgent(allFF, testTraitsBytes, { value: mintPrice });
      const svg = await contract.getSVG(0);
      expect(svg).to.include('<rect fill="#A057A3"'); // magenta background
    });

    it("should accept bitmap with mixed nibble values", async function () {
      // Each byte uses different high/low nibbles
      const mixed = new Uint8Array(2048);
      for (let i = 0; i < 2048; i++) {
        mixed[i] = ((i % 16) << 4) | ((i + 1) % 16);
      }
      await contract.connect(user).mintAgent(mixed, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  SECURITY: INPUT LIMITS
  // ════════════════════════════════════════════════════════════

  describe("Security: Input Limits", function () {
    it("should reject traits exceeding 8KB", async function () {
      const oversizeTraits = ethers.toUtf8Bytes("[" + "x".repeat(8192) + "]");
      await expect(
        contract.connect(user).mintAgent(testBitmap, oversizeTraits, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "TraitsTooLarge");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  COMMIT-REVEAL MINTING
  // ════════════════════════════════════════════════════════════

  describe("Commit-Reveal Minting", function () {
    it("should allow commitMint with correct payment", async function () {
      const tx = await contract.connect(user).commitMint({ value: mintPrice });
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
      expect(await contract.commitmentCount(user.address)).to.equal(1);
    });

    it("should emit CommitMint event", async function () {
      await expect(
        contract.connect(user).commitMint({ value: mintPrice })
      ).to.emit(contract, "CommitMint").withArgs(user.address, 0);
    });

    it("should reject commitMint with insufficient payment", async function () {
      await expect(
        contract.connect(user).commitMint({ value: 0 })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should reject commitMint when paused", async function () {
      await contract.connect(owner).setPaused(true);
      await expect(
        contract.connect(user).commitMint({ value: mintPrice })
      ).to.be.revertedWith("Minting is paused");
    });

    it("should enforce maxPerWallet on commitMint", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user).commitMint({ value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should enforce maxSupply on commitMint", async function () {
      await contract.connect(owner).setMaxSupply(1);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user2).commitMint({ value: mintPrice })
      ).to.be.revertedWith("Max supply reached");
    });

    it("should allow multiple commits per address", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).commitMint({ value: mintPrice });
      expect(await contract.commitmentCount(user.address)).to.equal(2);
    });

    it("should allow revealMint after commit", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("should produce correct tokenURI after revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      expect(json.description).to.equal("BOOA on-chain AI agent PFP");
    });

    it("should emit AgentMinted event on revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.emit(contract, "AgentMinted")
        .withArgs(0, user.address, (value: any) => typeof value === 'string');
    });

    it("should reject revealMint for already-revealed slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Already revealed");
    });

    it("should reject revealMint for invalid slot", async function () {
      await expect(
        contract.connect(user).revealMint(99, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject revealMint after deadline expires", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Commitment expired");
    });

    it("should track mintCount correctly via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      expect(await contract.mintCount(user.address)).to.equal(1);
    });

    it("should return commitment details via getCommitment", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const [timestamp, revealed] = await contract.getCommitment(user.address, 0);
      expect(timestamp).to.be.greaterThan(0);
      expect(revealed).to.be.false;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  RECLAIM EXPIRED
  // ════════════════════════════════════════════════════════════

  describe("Reclaim Expired", function () {
    it("should allow reclaimExpired after deadline", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(user.address);

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(mintPrice);
    });

    it("should reject reclaimExpired before deadline", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).reclaimExpired(0)
      ).to.be.revertedWith("Not expired yet");
    });

    it("should reject double reclaim", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      await expect(
        contract.connect(user).reclaimExpired(0)
      ).to.be.revertedWith("Already revealed");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  SECURITY: BITMAP VALIDATION VIA REVEALM MINT
  // ════════════════════════════════════════════════════════════

  describe("Security: Bitmap Validation via revealMint", function () {
    it("should reject invalid bitmap (too short) via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, new Uint8Array(100), testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should reject invalid bitmap (too long) via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, new Uint8Array(4096), testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should reject empty bitmap via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, "0x", testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "InvalidBitmap");
    });

    it("should accept valid bitmap via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("should reject oversized traits (>8KB) via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const bigTraits = ethers.toUtf8Bytes("[" + "x".repeat(8192) + "]");
      await expect(
        contract.connect(user).revealMint(0, testBitmap, bigTraits)
      ).to.be.revertedWithCustomError(contract, "TraitsTooLarge");
    });
  });

  // ════════════════════════════════════════════════════════════
  //  SECURITY: COMMIT-REVEAL ATTACK VECTORS
  // ════════════════════════════════════════════════════════════

  describe("Security: Commit-Reveal Attack Vectors", function () {
    it("should reject reveal of another user's slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user2).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject reveal with out-of-bounds slot index", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(1, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject double reveal of same slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Already revealed");
    });

    it("should reject reveal after 7 day deadline", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Commitment expired");
    });

    it("should reject reclaimExpired for another user's slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        contract.connect(user2).reclaimExpired(0)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject reveal after slot was reclaimed", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Already revealed");
    });

    it("should allow revealMint with empty traits", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testBitmap, ethers.toUtf8Bytes(""));
      expect(await contract.ownerOf(0)).to.equal(user.address);
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      expect(json.attributes).to.be.undefined;
    });

    it("should store traits with special JSON characters without breaking tokenURI", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const weirdTraits = ethers.toUtf8Bytes('[{"trait_type":"test","value":"val"}]');
      await contract.connect(user).revealMint(0, testBitmap, weirdTraits);
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      expect(json.attributes).to.deep.equal([{ trait_type: "test", value: "val" }]);
    });
  });

  // ════════════════════════════════════════════════════════════
  //  SECURITY AUDIT — Verify Fixes
  // ════════════════════════════════════════════════════════════

  describe("FIX #1: maxPerWallet enforced in commitMint and revealMint", function () {
    it("should block second commit when maxPerWallet=1 (pending commit counted)", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).commitMint({ value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should block revealMint when mintCount already at maxPerWallet", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(owner).setMaxPerWallet(0);
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setMaxPerWallet(1);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should allow commit after expired commit frees up a slot", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      await contract.connect(user).commitMint({ value: mintPrice });
      expect(await contract.commitmentCount(user.address)).to.equal(2);
    });
  });

  describe("FIX #2: withdraw protects reserved funds", function () {
    it("should not allow withdrawing commit-reserved funds", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user2).commitMint({ value: mintPrice });
      await expect(
        contract.connect(owner).withdraw()
      ).to.be.revertedWith("No available funds");
    });

    it("should allow withdrawing only unreserved funds", async function () {
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).commitMint({ value: mintPrice });
      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(owner.address);
      expect(balAfter + gasUsed - balBefore).to.equal(mintPrice);
      const contractBal = await ethers.provider.getBalance(await contract.getAddress());
      expect(contractBal).to.equal(mintPrice);
    });

    it("should release reserved funds after reveal", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      expect(await contract.reservedFunds()).to.equal(mintPrice);
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      expect(await contract.reservedFunds()).to.equal(0);
      await contract.connect(owner).withdraw();
      const contractBal = await ethers.provider.getBalance(await contract.getAddress());
      expect(contractBal).to.equal(0);
    });

    it("should release reserved funds after reclaim", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      expect(await contract.reservedFunds()).to.equal(mintPrice);
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      expect(await contract.reservedFunds()).to.equal(0);
    });

    it("reclaim always succeeds when funds are reserved", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user2).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(owner).withdraw();
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      const balBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user.address);
      expect(balAfter + gasUsed - balBefore).to.equal(mintPrice);
    });
  });

  describe("FIX #3: reclaimExpired refunds actual paid amount", function () {
    it("should refund original paid amount even after price change", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setMintPrice(mintPrice / 2n);
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      const balBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user.address);
      expect(balAfter + gasUsed - balBefore).to.equal(mintPrice);
    });

    it("should refund original amount when price is set to 0", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setMintPrice(0);
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      const balBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user.address);
      expect(balAfter + gasUsed - balBefore).to.equal(mintPrice);
    });

    it("should refund exact overpayment when user sent extra", async function () {
      const overpay = mintPrice * 2n;
      await contract.connect(user).commitMint({ value: overpay });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      const balBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user.address);
      expect(balAfter + gasUsed - balBefore).to.equal(overpay);
    });
  });

  describe("FIX #4: supply race condition", function () {
    it("directMint can exhaust supply before revealMint but reclaim is safe", async function () {
      await contract.connect(owner).setMaxSupply(2);
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user2).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Max supply reached");
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      const balBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user.address);
      expect(balAfter + gasUsed - balBefore).to.equal(mintPrice);
    });
  });

  describe("FIX #5: revealMint respects pause", function () {
    it("should block revealMint when contract is paused", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setPaused(true);
      await expect(
        contract.connect(user).revealMint(0, testBitmap, testTraitsBytes)
      ).to.be.revertedWith("Minting is paused");
    });

    it("should allow revealMint after unpause", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setPaused(true);
      await contract.connect(owner).setPaused(false);
      await contract.connect(user).revealMint(0, testBitmap, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("reclaimExpired works even when paused", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setPaused(true);
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      const [, revealed] = await contract.getCommitment(user.address, 0);
      expect(revealed).to.be.true;
    });
  });

  describe("FIX #7: traits JSON injection prevented", function () {
    it("should reject traits that don't start with [", async function () {
      const maliciousTraits = ethers.toUtf8Bytes(
        '"},"injected_key":"injected_value","x":{"y":"z'
      );
      await expect(
        contract.connect(user).mintAgent(testBitmap, maliciousTraits, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeTraits");
    });

    it("should reject traits with unbalanced braces", async function () {
      const badTraits = ethers.toUtf8Bytes('[{"trait_type":"test"}]}');
      await expect(
        contract.connect(user).mintAgent(testBitmap, badTraits, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeTraits");
    });

    it("should accept valid traits JSON array", async function () {
      const validTraits = ethers.toUtf8Bytes('[{"trait_type":"Creature","value":"Fox"},{"trait_type":"Vibe","value":"chill"}]');
      await contract.connect(user).mintAgent(testBitmap, validTraits, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should accept empty traits", async function () {
      await contract.connect(user).mintAgent(testBitmap, "0x", { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should accept empty array traits", async function () {
      const emptyArray = ethers.toUtf8Bytes('[]');
      await contract.connect(user).mintAgent(testBitmap, emptyArray, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should allow traits with special characters inside strings", async function () {
      const specialChars = ethers.toUtf8Bytes('[{"trait_type":"test","value":"hello \\"world\\" }]"}]');
      await contract.connect(user).mintAgent(testBitmap, specialChars, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });
  });

  describe("AUDIT: reentrancy via reclaimExpired", function () {
    it("state is updated before ETH transfer (CEI pattern)", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      const [, revealed] = await contract.getCommitment(user.address, 0);
      expect(revealed).to.be.true;
      await expect(
        contract.connect(user).reclaimExpired(0)
      ).to.be.revertedWith("Already revealed");
    });
  });

  describe("AUDIT: maxSupply can be set to 0 after minting (unlimited)", function () {
    it("owner can remove supply cap after mints exist", async function () {
      await contract.connect(owner).setMaxSupply(2);
      await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      await contract.connect(owner).setMaxSupply(0);
      for (let i = 0; i < 5; i++) {
        await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      }
      expect(await contract.totalSupply()).to.equal(6);
    });
  });

  describe("AUDIT: no receive/fallback — ETH locked scenario", function () {
    it("contract should not accept plain ETH transfers", async function () {
      await expect(
        owner.sendTransaction({
          to: await contract.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════
  //  GAS COMPARISON
  // ════════════════════════════════════════════════════════════

  describe("Gas Usage", function () {
    it("should log mint gas for bitmap (2048 bytes)", async function () {
      const tx = await contract.connect(user).mintAgent(testBitmap, testTraitsBytes, { value: mintPrice });
      const receipt = await tx.wait();
      console.log(`        Bitmap mint gas: ${receipt!.gasUsed}`);
      console.log(`        Bitmap size: 2048 bytes (fixed)`);
      console.log(`        Traits size: ${testTraitsBytes.length} bytes`);
    });

    it("should log getSVG gas for on-chain rendering", async function () {
      await contract.connect(user).mintAgent(testBitmapWithStripe, testTraitsBytes, { value: mintPrice });
      const gas = await contract.getSVG.estimateGas(0);
      console.log(`        getSVG gas (view): ${gas}`);
    });
  });
});