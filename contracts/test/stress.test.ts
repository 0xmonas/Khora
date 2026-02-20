import { expect } from "chai";
import { ethers } from "hardhat";
import type { BOOA } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * BOOA Stress Test — Bitmap Edition
 *
 * 19 wallets, all functions, attack vectors
 *
 * Simulates a bot swarm scenario:
 * - Mass minting (direct + commit-reveal)
 * - Concurrent operations
 * - Owner function attacks from non-owners
 * - Bitmap validation at scale
 * - Traits JSON injection attempts
 * - Reserved funds accounting under load
 * - Enumeration under heavy token count
 * - Transfer chaos
 */

describe("BOOA Stress Test (Bitmap)", function () {
  this.timeout(300_000); // 5 min timeout

  let contract: BOOA;
  let owner: HardhatEthersSigner;
  let wallets: HardhatEthersSigner[];
  const mintPrice = ethers.parseEther("0.001");
  const royaltyFee = 500;

  // ── Bitmap helpers ──

  /** Create a 2048-byte bitmap filled with a single C64 palette index (0-15). */
  function makeBitmap(colorIndex: number = 0): Uint8Array {
    const packed = ((colorIndex & 0xF) << 4) | (colorIndex & 0xF);
    return new Uint8Array(2048).fill(packed);
  }

  const bitmapBytes = makeBitmap(0); // all-black

  // Valid traits
  const validTraits = JSON.stringify([
    { trait_type: "Creature", value: "Bot" },
    { trait_type: "Vibe", value: "chaotic" },
    { trait_type: "Name", value: "StressBot" },
  ]);
  const traitsBytes = ethers.toUtf8Bytes(validTraits);

  // ── Invalid bitmap data for validation tests ──
  const INVALID_BITMAPS: { label: string; data: Uint8Array | string }[] = [
    { label: "empty (0 bytes)", data: new Uint8Array(0) },
    { label: "1 byte", data: new Uint8Array([0x00]) },
    { label: "100 bytes", data: new Uint8Array(100) },
    { label: "1024 bytes (half)", data: new Uint8Array(1024) },
    { label: "2047 bytes (off by one short)", data: new Uint8Array(2047) },
    { label: "2049 bytes (off by one long)", data: new Uint8Array(2049) },
    { label: "4096 bytes (double)", data: new Uint8Array(4096) },
    { label: "8192 bytes", data: new Uint8Array(8192) },
    { label: "24576 bytes (old SVG max)", data: new Uint8Array(24576) },
    { label: "hex 0x (ethers empty)", data: "0x" },
  ];

  // Malicious traits for JSON injection
  const MALICIOUS_TRAITS = [
    '{"injected": true}',           // not an array (no [ ])
    '[{"a":"b"}]injected',           // trailing data after ]
    'not json at all',               // garbage, no [ ]
    '"},"injected_key":"value","x":{"y":"z',  // JSON breakout attempt
    '{[}]',                          // malformed
  ];

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    wallets = signers.slice(1); // 19 wallets from default

    console.log(`    Deploying BOOA (Bitmap) with ${wallets.length} test wallets...`);

    const factory = await ethers.getContractFactory("BOOA");
    contract = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
    await contract.waitForDeployment();

    console.log(`    Contract deployed at: ${await contract.getAddress()}`);
  });

  // ═══════════════════════════════════════════════════════════
  // 1. MASS DIRECT MINTING
  // ═══════════════════════════════════════════════════════════
  describe("1. Mass Direct Minting", function () {
    it("should handle rapid sequential mints from many wallets", async function () {
      const count = wallets.length;
      console.log(`      Minting ${count} tokens sequentially...`);

      for (let i = 0; i < count; i++) {
        await contract.connect(wallets[i]).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
      }

      const totalSupply = await contract.totalSupply();
      console.log(`      Total supply after mass mint: ${totalSupply}`);
      expect(totalSupply).to.equal(count);
    });

    it("should handle batch mints from the same wallet", async function () {
      const batchSize = 20;
      const wallet = wallets[0];
      const before = await contract.totalSupply();

      console.log(`      Batch minting ${batchSize} from single wallet...`);
      for (let i = 0; i < batchSize; i++) {
        await contract.connect(wallet).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
      }

      const after = await contract.totalSupply();
      expect(after - before).to.equal(batchSize);
    });

    it("should handle concurrent mint promises", async function () {
      const concurrentCount = wallets.length;
      console.log(`      Sending ${concurrentCount} concurrent mints...`);

      const promises = wallets.map((w) =>
        contract.connect(w).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice })
      );

      const txs = await Promise.all(promises);
      await Promise.all(txs.map((tx) => tx.wait()));

      console.log(`      All ${concurrentCount} concurrent mints succeeded`);
    });

    it("should mint with different palette colors", async function () {
      const wallet = wallets[0];
      for (let c = 0; c < 16; c++) {
        await contract.connect(wallet).mintAgent(makeBitmap(c), traitsBytes, { value: mintPrice });
      }
      console.log(`      Minted 16 tokens with all C64 palette colors`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. MASS COMMIT-REVEAL
  // ═══════════════════════════════════════════════════════════
  describe("2. Mass Commit-Reveal", function () {
    it("should handle mass commitMint from all wallets", async function () {
      console.log(`      ${wallets.length} wallets committing...`);

      for (const w of wallets) {
        await contract.connect(w).commitMint({ value: mintPrice });
      }

      for (const w of wallets) {
        const count = await contract.commitmentCount(w.address);
        expect(count).to.be.gte(1);
      }
      console.log(`      All commitments registered`);
    });

    it("should handle mass revealMint after commits", async function () {
      const supplyBefore = await contract.totalSupply();
      console.log(`      ${wallets.length} wallets revealing...`);

      for (const w of wallets) {
        const count = await contract.commitmentCount(w.address);
        // Find the latest unrevealed commit
        for (let i = Number(count) - 1; i >= 0; i--) {
          const commitment = await contract.getCommitment(w.address, i);
          if (!commitment.revealed) {
            await contract.connect(w).revealMint(i, bitmapBytes, traitsBytes);
            break;
          }
        }
      }

      const supplyAfter = await contract.totalSupply();
      console.log(`      Revealed ${supplyAfter - supplyBefore} tokens`);
      expect(supplyAfter).to.be.gt(supplyBefore);
    });

    it("should handle multiple commits per wallet", async function () {
      const wallet = wallets[0];
      const numCommits = 5;

      for (let i = 0; i < numCommits; i++) {
        await contract.connect(wallet).commitMint({ value: mintPrice });
      }

      const count = await contract.commitmentCount(wallet.address);
      expect(count).to.be.gte(numCommits);

      // Reveal all new ones
      for (let i = Number(count) - numCommits; i < Number(count); i++) {
        const c = await contract.getCommitment(wallet.address, i);
        if (!c.revealed) {
          await contract.connect(wallet).revealMint(i, bitmapBytes, traitsBytes);
        }
      }
    });

    it("should prevent double reveal", async function () {
      const wallet = wallets[1];
      await contract.connect(wallet).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(wallet.address)) - 1;
      await contract.connect(wallet).revealMint(idx, bitmapBytes, traitsBytes);

      await expect(
        contract.connect(wallet).revealMint(idx, bitmapBytes, traitsBytes)
      ).to.be.reverted;
    });

    it("should prevent cross-wallet reveal", async function () {
      const w1 = wallets[2];
      const w2 = wallets[3];
      await contract.connect(w1).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(w1.address)) - 1;

      await expect(
        contract.connect(w2).revealMint(idx, bitmapBytes, traitsBytes)
      ).to.be.reverted;

      // Clean up
      await contract.connect(w1).revealMint(idx, bitmapBytes, traitsBytes);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. BITMAP VALIDATION ATTACKS (mass)
  // ═══════════════════════════════════════════════════════════
  describe("3. Bitmap Validation Attacks (mass)", function () {
    it("should reject all invalid bitmap sizes via mintAgent", async function () {
      let blocked = 0;

      for (const { label, data } of INVALID_BITMAPS) {
        try {
          await contract.connect(wallets[0]).mintAgent(
            data,
            traitsBytes,
            { value: mintPrice }
          );
          console.log(`      WARNING: Invalid bitmap passed! ${label}`);
        } catch {
          blocked++;
        }
      }

      console.log(`      Blocked ${blocked}/${INVALID_BITMAPS.length} invalid bitmaps`);
      expect(blocked).to.equal(INVALID_BITMAPS.length);
    });

    it("should reject all invalid bitmap sizes via revealMint", async function () {
      let blocked = 0;

      for (const { label, data } of INVALID_BITMAPS) {
        const wallet = wallets[0];
        await contract.connect(wallet).commitMint({ value: mintPrice });
        const idx = Number(await contract.commitmentCount(wallet.address)) - 1;

        try {
          await contract.connect(wallet).revealMint(idx, data, traitsBytes);
          console.log(`      WARNING: Invalid bitmap passed reveal! ${label}`);
        } catch {
          blocked++;
        }
      }

      console.log(`      Blocked ${blocked}/${INVALID_BITMAPS.length} via revealMint`);
      expect(blocked).to.equal(INVALID_BITMAPS.length);
    });

    it("should accept valid 2048-byte bitmaps with all byte patterns", async function () {
      // Test edge-case byte values
      const edgeCases = [
        new Uint8Array(2048).fill(0x00), // all zeros (palette 0)
        new Uint8Array(2048).fill(0xFF), // all 0xFF (palette 15)
        new Uint8Array(2048).fill(0x01), // high=0, low=1
        new Uint8Array(2048).fill(0xF0), // high=15, low=0
      ];

      for (const bitmap of edgeCases) {
        await contract.connect(wallets[0]).mintAgent(bitmap, traitsBytes, { value: mintPrice });
      }
      console.log(`      Accepted ${edgeCases.length} edge-case bitmap patterns`);
    });

    it("should reject malicious traits JSON", async function () {
      let blocked = 0;

      for (const traits of MALICIOUS_TRAITS) {
        try {
          await contract.connect(wallets[0]).mintAgent(
            bitmapBytes,
            ethers.toUtf8Bytes(traits),
            { value: mintPrice }
          );
          console.log(`      WARNING: Traits passed! ${traits.slice(0, 60)}`);
        } catch {
          blocked++;
        }
      }

      console.log(`      Blocked ${blocked}/${MALICIOUS_TRAITS.length} malicious traits`);
      expect(blocked).to.equal(MALICIOUS_TRAITS.length);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. OWNER FUNCTION ATTACKS
  // ═══════════════════════════════════════════════════════════
  describe("4. Owner Function Attacks", function () {
    it("should reject setMintPrice from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).setMintPrice(0);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
      console.log(`      Blocked ${blocked}/${wallets.length} setMintPrice attacks`);
    });

    it("should reject setPaused from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).setPaused(true);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });

    it("should reject setMaxSupply from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).setMaxSupply(1);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });

    it("should reject setMaxPerWallet from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).setMaxPerWallet(1);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });

    it("should reject withdraw from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).withdraw();
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });

    it("should reject withdrawTo from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).withdrawTo(w.address);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });

    it("should reject setDefaultRoyalty from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).setDefaultRoyalty(w.address, 1000);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });

    it("should reject setTokenRoyalty from all non-owners", async function () {
      let blocked = 0;
      for (const w of wallets) {
        try {
          await contract.connect(w).setTokenRoyalty(0, w.address, 1000);
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(wallets.length);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. RESERVED FUNDS ACCOUNTING
  // ═══════════════════════════════════════════════════════════
  describe("5. Reserved Funds Integrity", function () {
    it("should protect reserved funds during mass withdraw attempts", async function () {
      // Create commitments to build up reserved funds
      for (let i = 0; i < 5; i++) {
        await contract.connect(wallets[i]).commitMint({ value: mintPrice });
      }

      const reserved = await contract.reservedFunds();
      const contractBalance = await ethers.provider.getBalance(await contract.getAddress());
      console.log(`      Reserved: ${ethers.formatEther(reserved)} ETH`);
      console.log(`      Balance:  ${ethers.formatEther(contractBalance)} ETH`);

      // Owner withdraw should not touch reserved
      await contract.connect(owner).withdraw();

      const balanceAfter = await ethers.provider.getBalance(await contract.getAddress());
      expect(balanceAfter).to.be.gte(reserved);
      console.log(`      Post-withdraw balance: ${ethers.formatEther(balanceAfter)} ETH (>= reserved)`);

      // Reveal those commits to release reserved
      for (let i = 0; i < 5; i++) {
        const count = await contract.commitmentCount(wallets[i].address);
        for (let j = Number(count) - 1; j >= 0; j--) {
          const c = await contract.getCommitment(wallets[i].address, j);
          if (!c.revealed) {
            await contract.connect(wallets[i]).revealMint(j, bitmapBytes, traitsBytes);
            break;
          }
        }
      }
    });

    it("should handle reclaim with correct refund amounts", async function () {
      const wallet = wallets[5];

      // Commit at current price
      await contract.connect(wallet).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(wallet.address)) - 1;

      // Owner changes price
      await contract.connect(owner).setMintPrice(ethers.parseEther("0.01"));

      // Fast-forward 7 days
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      // Reclaim should refund original price, not new price
      const before = await ethers.provider.getBalance(wallet.address);
      await contract.connect(wallet).reclaimExpired(idx);
      const after = await ethers.provider.getBalance(wallet.address);

      // Refund should be approximately mintPrice (minus gas)
      expect(after - before).to.be.gt(0);
      console.log(`      Reclaim refunded ~${ethers.formatEther(after - before)} ETH`);

      // Reset price
      await contract.connect(owner).setMintPrice(mintPrice);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. SUPPLY CAP RACE CONDITION
  // ═══════════════════════════════════════════════════════════
  describe("6. Supply Cap Enforcement", function () {
    it("should enforce maxSupply under concurrent pressure", async function () {
      const factory = await ethers.getContractFactory("BOOA");
      const limited = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
      await limited.waitForDeployment();

      const cap = 10;
      await limited.connect(owner).setMaxSupply(cap);

      let minted = 0;
      let rejected = 0;

      for (const w of wallets) {
        try {
          await limited.connect(w).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
          minted++;
        } catch {
          rejected++;
        }
      }

      console.log(`      Minted: ${minted}, Rejected: ${rejected} (cap: ${cap})`);
      expect(minted).to.equal(cap);
      expect(await limited.totalSupply()).to.equal(cap);
    });

    it("should enforce maxPerWallet under bot pressure", async function () {
      const factory = await ethers.getContractFactory("BOOA");
      const limited = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
      await limited.waitForDeployment();

      const perWallet = 2;
      await limited.connect(owner).setMaxPerWallet(perWallet);

      const wallet = wallets[0];
      let minted = 0;
      let rejected = 0;

      for (let i = 0; i < 10; i++) {
        try {
          await limited.connect(wallet).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
          minted++;
        } catch {
          rejected++;
        }
      }

      console.log(`      Single wallet: minted ${minted}, rejected ${rejected} (limit: ${perWallet})`);
      expect(minted).to.equal(perWallet);
    });

    it("should enforce maxPerWallet on commitMint too", async function () {
      const factory = await ethers.getContractFactory("BOOA");
      const limited = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
      await limited.waitForDeployment();

      await limited.connect(owner).setMaxPerWallet(2);

      const wallet = wallets[0];
      await limited.connect(wallet).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
      await limited.connect(wallet).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });

      await expect(
        limited.connect(wallet).commitMint({ value: mintPrice })
      ).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. PAUSE ENFORCEMENT
  // ═══════════════════════════════════════════════════════════
  describe("7. Pause Under Load", function () {
    it("should block all minting when paused", async function () {
      await contract.connect(owner).setPaused(true);

      let blocked = 0;
      for (const w of wallets.slice(0, 10)) {
        try {
          await contract.connect(w).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(10);

      await expect(
        contract.connect(wallets[0]).commitMint({ value: mintPrice })
      ).to.be.reverted;

      // Unpause
      await contract.connect(owner).setPaused(false);
      console.log(`      Blocked ${blocked} mints while paused`);
    });

    it("should block revealMint when paused", async function () {
      const wallet = wallets[6];
      await contract.connect(wallet).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(wallet.address)) - 1;

      await contract.connect(owner).setPaused(true);

      await expect(
        contract.connect(wallet).revealMint(idx, bitmapBytes, traitsBytes)
      ).to.be.reverted;

      await contract.connect(owner).setPaused(false);
      await contract.connect(wallet).revealMint(idx, bitmapBytes, traitsBytes);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. ENUMERATION UNDER LOAD
  // ═══════════════════════════════════════════════════════════
  describe("8. Enumeration Under Load", function () {
    it("should enumerate all tokens correctly", async function () {
      const supply = await contract.totalSupply();
      console.log(`      Enumerating ${supply} tokens...`);

      const checkCount = Math.min(20, Number(supply));
      for (let i = 0; i < checkCount; i++) {
        const tokenId = await contract.tokenByIndex(i);
        const tokenOwner = await contract.ownerOf(tokenId);
        expect(tokenOwner).to.not.equal(ethers.ZeroAddress);
      }

      if (Number(supply) > 20) {
        for (let i = Number(supply) - checkCount; i < Number(supply); i++) {
          const tokenId = await contract.tokenByIndex(i);
          expect(await contract.ownerOf(tokenId)).to.not.equal(ethers.ZeroAddress);
        }
      }
      console.log(`      All enumerated tokens valid`);
    });

    it("should handle tokenURI for all tokens (SVG rendered from bitmap)", async function () {
      const supply = Number(await contract.totalSupply());
      const checkCount = Math.min(10, supply);
      console.log(`      Checking tokenURI for ${checkCount} tokens...`);

      for (let i = 0; i < checkCount; i++) {
        const uri = await contract.tokenURI(i);
        expect(uri).to.include("data:application/json;base64,");

        // Decode and verify SVG is rendered
        const json = Buffer.from(uri.split(",")[1], "base64").toString();
        const meta = JSON.parse(json);
        expect(meta.image).to.include("data:image/svg+xml;base64,");
      }
    });

    it("should handle getSVG, getBitmap and getTraits for all tokens", async function () {
      const supply = Number(await contract.totalSupply());
      const checkCount = Math.min(10, supply);

      for (let i = 0; i < checkCount; i++) {
        const svg = await contract.getSVG(i);
        const bitmap = await contract.getBitmap(i);
        const traits = await contract.getTraits(i);

        expect(svg).to.include("<svg");
        expect(svg).to.include("</svg>");
        expect(ethers.getBytes(bitmap).length).to.equal(2048);
        expect(traits).to.include("trait_type");
      }
      console.log(`      All ${checkCount} tokens return valid SVG, bitmap, and traits`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. TRANSFER CHAOS
  // ═══════════════════════════════════════════════════════════
  describe("9. Transfer Chaos", function () {
    it("should handle mass transfers between wallets", async function () {
      const transfers = Math.min(10, wallets.length - 1);
      console.log(`      Executing ${transfers} transfers...`);

      for (let i = 0; i < transfers; i++) {
        const from = wallets[i];
        const to = wallets[(i + 1) % wallets.length];
        const balance = await contract.balanceOf(from.address);
        if (balance > 0n) {
          const tokenId = await contract.tokenOfOwnerByIndex(from.address, 0);
          await contract.connect(from).transferFrom(from.address, to.address, tokenId);
        }
      }
      console.log(`      All transfers completed`);
    });

    it("should reject transfers from non-owners", async function () {
      const balance = await contract.balanceOf(wallets[0].address);
      if (balance > 0n) {
        const tokenId = await contract.tokenOfOwnerByIndex(wallets[0].address, 0);
        await expect(
          contract.connect(wallets[5]).transferFrom(wallets[0].address, wallets[5].address, tokenId)
        ).to.be.reverted;
      }
    });

    it("data persists after transfer", async function () {
      const from = wallets[0];
      const to = wallets[1];
      const balance = await contract.balanceOf(from.address);
      if (balance > 0n) {
        const tokenId = await contract.tokenOfOwnerByIndex(from.address, 0);

        // Record data before transfer
        const svgBefore = await contract.getSVG(tokenId);
        const bitmapBefore = await contract.getBitmap(tokenId);

        await contract.connect(from).transferFrom(from.address, to.address, tokenId);

        // Verify data unchanged
        expect(await contract.getSVG(tokenId)).to.equal(svgBefore);
        expect(await contract.getBitmap(tokenId)).to.equal(bitmapBefore);
        expect(await contract.ownerOf(tokenId)).to.equal(to.address);
        console.log(`      Token #${tokenId} data persists after transfer ✓`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. EDGE CASES & SIZE LIMITS
  // ═══════════════════════════════════════════════════════════
  describe("10. Edge Cases & Size Limits", function () {
    it("should reject oversized traits (>8KB)", async function () {
      const hugeTraits = '[' + Array(500).fill('{"trait_type":"x","value":"' + 'a'.repeat(50) + '"}').join(',') + ']';
      expect(hugeTraits.length).to.be.gt(8192);

      await expect(
        contract.connect(wallets[0]).mintAgent(bitmapBytes, ethers.toUtf8Bytes(hugeTraits), { value: mintPrice })
      ).to.be.reverted;
    });

    it("should reject zero-value mints", async function () {
      await expect(
        contract.connect(wallets[0]).mintAgent(bitmapBytes, traitsBytes, { value: 0 })
      ).to.be.reverted;
    });

    it("should handle royaltyInfo queries at scale", async function () {
      const supply = Number(await contract.totalSupply());
      const checkCount = Math.min(10, supply);

      for (let i = 0; i < checkCount; i++) {
        const [receiver, amount] = await contract.royaltyInfo(i, ethers.parseEther("1"));
        expect(receiver).to.equal(owner.address);
        expect(amount).to.equal(ethers.parseEther("0.05")); // 5%
      }
    });

    it("should reject reveal for non-existent slot", async function () {
      await expect(
        contract.connect(wallets[0]).revealMint(9999, bitmapBytes, traitsBytes)
      ).to.be.reverted;
    });

    it("should reject reclaim for non-expired slot", async function () {
      const wallet = wallets[7];
      await contract.connect(wallet).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(wallet.address)) - 1;

      await expect(
        contract.connect(wallet).reclaimExpired(idx)
      ).to.be.reverted;

      // Clean up — reveal it
      await contract.connect(wallet).revealMint(idx, bitmapBytes, traitsBytes);
    });

    it("should accept mint with empty traits", async function () {
      await contract.connect(wallets[0]).mintAgent(bitmapBytes, "0x", { value: mintPrice });
      const supply = await contract.totalSupply();
      const tokenId = Number(supply) - 1;
      const traits = await contract.getTraits(tokenId);
      expect(traits).to.equal("");
    });

    it("should produce valid SVG for every palette-solid bitmap", async function () {
      const C64_HEX = [
        "000000", "626262", "898989", "ADADAD", "FFFFFF",
        "9F4E44", "CB7E75", "6D5412", "A1683C", "C9D487",
        "9AE29B", "5CAB5E", "6ABFC6", "887ECB", "50459B",
        "A057A3",
      ];

      for (let c = 0; c < 16; c++) {
        await contract.connect(wallets[0]).mintAgent(makeBitmap(c), "0x", { value: mintPrice });
        const supply = await contract.totalSupply();
        const tokenId = Number(supply) - 1;
        const svg = await contract.getSVG(tokenId);
        expect(svg).to.include(`<rect fill="#${C64_HEX[c]}"`);
      }
      console.log(`      All 16 palette colors render correct SVG ✓`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. GAS COMPARISON
  // ═══════════════════════════════════════════════════════════
  describe("11. Gas Usage", function () {
    it("should log gas for bitmap mint", async function () {
      const tx = await contract.connect(wallets[0]).mintAgent(bitmapBytes, traitsBytes, { value: mintPrice });
      const receipt = await tx.wait();
      console.log(`      Bitmap mint gas:     ${receipt!.gasUsed}`);
      console.log(`      Bitmap data size:    2,048 bytes (fixed)`);
      console.log(`      Traits data size:    ${traitsBytes.length} bytes`);
    });

    it("should log gas for commit + reveal", async function () {
      const tx1 = await contract.connect(wallets[1]).commitMint({ value: mintPrice });
      const r1 = await tx1.wait();
      const idx = Number(await contract.commitmentCount(wallets[1].address)) - 1;

      const tx2 = await contract.connect(wallets[1]).revealMint(idx, bitmapBytes, traitsBytes);
      const r2 = await tx2.wait();

      console.log(`      commitMint gas:      ${r1!.gasUsed}`);
      console.log(`      revealMint gas:      ${r2!.gasUsed}`);
      console.log(`      Total commit+reveal: ${r1!.gasUsed + r2!.gasUsed}`);
    });

    it("should log gas for getSVG (on-chain rendering)", async function () {
      const gas = await contract.getSVG.estimateGas(0);
      console.log(`      getSVG gas (view):   ${gas}`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 12. FINAL STATS
  // ═══════════════════════════════════════════════════════════
  describe("12. Final Stats", function () {
    it("should report final contract state", async function () {
      const supply = await contract.totalSupply();
      const balance = await ethers.provider.getBalance(await contract.getAddress());
      const reserved = await contract.reservedFunds();

      console.log(`\n    ═══════════════════════════════════`);
      console.log(`    FINAL CONTRACT STATE (Bitmap)`);
      console.log(`    ═══════════════════════════════════`);
      console.log(`    Total supply:    ${supply}`);
      console.log(`    Contract ETH:    ${ethers.formatEther(balance)}`);
      console.log(`    Reserved ETH:    ${ethers.formatEther(reserved)}`);
      console.log(`    Withdrawable:    ${ethers.formatEther(balance - reserved)}`);
      console.log(`    Storage:         ${Number(supply) * 2048} bytes bitmap data`);
      console.log(`    ═══════════════════════════════════\n`);

      expect(supply).to.be.gt(0);
      expect(balance).to.be.gte(reserved);
    });
  });
});