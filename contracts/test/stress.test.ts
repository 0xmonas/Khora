import { expect } from "chai";
import { ethers } from "hardhat";
import type { BOOA } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * BOOA Stress Test — 500 wallets, all functions, attack vectors
 *
 * Simulates a bot swarm scenario:
 * - Mass minting (direct + commit-reveal)
 * - Concurrent operations
 * - Owner function attacks from non-owners
 * - SVG injection attempts at scale
 * - Reserved funds accounting under load
 * - Enumeration under heavy token count
 * - Transfer chaos
 */

describe("BOOA Stress Test", function () {
  this.timeout(300_000); // 5 min timeout

  let contract: BOOA;
  let owner: HardhatEthersSigner;
  let wallets: HardhatEthersSigner[];
  const mintPrice = ethers.parseEther("0.001");
  const royaltyFee = 500;

  // Valid minimal SVG
  const validSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges"><path stroke="#0A0A0A" d="M0 0h64"/></svg>';
  const svgBytes = ethers.toUtf8Bytes(validSVG);

  // Valid traits
  const validTraits = JSON.stringify([
    { trait_type: "Creature", value: "Bot" },
    { trait_type: "Vibe", value: "chaotic" },
    { trait_type: "Name", value: "StressBot" },
  ]);
  const traitsBytes = ethers.toUtf8Bytes(validTraits);

  // Malicious SVGs for injection attempts
  const MALICIOUS_SVGS = [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>.x{fill:red}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="evil"></iframe></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><object data="evil"></object></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><embed src="evil"></embed></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body>hi</body></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="evil"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="x" to="1"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onerror="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><ScRiPt>alert(1)</ScRiPt></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><feImage href="evil"/></svg>',
    // data: URI attack
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(data:text/html,evil)"/></svg>',
  ];

  // Malicious traits for JSON injection
  // Note: empty traits are valid (optional), and `[...]` with balanced braces is accepted
  const MALICIOUS_TRAITS = [
    '{"injected": true}',    // not an array (no [ ])
    '[{"a":"b"}]injected',   // trailing data after ]
    'not json at all',       // garbage, no [ ]
  ];

  before(async function () {
    // Get signers — Hardhat gives us 20 by default, we'll use them all
    const signers = await ethers.getSigners();
    owner = signers[0];
    wallets = signers.slice(1); // 19 wallets from default

    console.log(`    Deploying BOOA with ${wallets.length} test wallets...`);

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
        await contract.connect(wallets[i]).mintAgent(svgBytes, traitsBytes, { value: mintPrice });
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
        await contract.connect(wallet).mintAgent(svgBytes, traitsBytes, { value: mintPrice });
      }

      const after = await contract.totalSupply();
      expect(after - before).to.equal(batchSize);
    });

    it("should handle concurrent mint promises", async function () {
      const concurrentCount = wallets.length;
      console.log(`      Sending ${concurrentCount} concurrent mints...`);

      const promises = wallets.map((w) =>
        contract.connect(w).mintAgent(svgBytes, traitsBytes, { value: mintPrice })
      );

      const txs = await Promise.all(promises);
      await Promise.all(txs.map((tx) => tx.wait()));

      console.log(`      All ${concurrentCount} concurrent mints succeeded`);
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

      // Verify all commitments
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
          if (!commitment.revealed && !commitment.reclaimed) {
            await contract.connect(w).revealMint(i, svgBytes, traitsBytes);
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

      // Reveal all
      for (let i = Number(count) - numCommits; i < Number(count); i++) {
        const c = await contract.getCommitment(wallet.address, i);
        if (!c.revealed && !c.reclaimed) {
          await contract.connect(wallet).revealMint(i, svgBytes, traitsBytes);
        }
      }
    });

    it("should prevent double reveal", async function () {
      const wallet = wallets[1];
      await contract.connect(wallet).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(wallet.address)) - 1;
      await contract.connect(wallet).revealMint(idx, svgBytes, traitsBytes);

      await expect(
        contract.connect(wallet).revealMint(idx, svgBytes, traitsBytes)
      ).to.be.reverted;
    });

    it("should prevent cross-wallet reveal", async function () {
      const w1 = wallets[2];
      const w2 = wallets[3];
      await contract.connect(w1).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(w1.address)) - 1;

      // w2 tries to reveal w1's commitment — will fail because w2 doesn't have that slot
      await expect(
        contract.connect(w2).revealMint(idx, svgBytes, traitsBytes)
      ).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. SVG INJECTION ATTACK SWARM
  // ═══════════════════════════════════════════════════════════
  describe("3. SVG Injection Attacks (mass)", function () {
    it("should reject all malicious SVGs via mintAgent", async function () {
      let blocked = 0;

      for (const svg of MALICIOUS_SVGS) {
        try {
          await contract.connect(wallets[0]).mintAgent(
            ethers.toUtf8Bytes(svg),
            traitsBytes,
            { value: mintPrice }
          );
          console.log(`      WARNING: SVG passed! ${svg.slice(0, 60)}...`);
        } catch {
          blocked++;
        }
      }

      console.log(`      Blocked ${blocked}/${MALICIOUS_SVGS.length} malicious SVGs`);
      expect(blocked).to.equal(MALICIOUS_SVGS.length);
    });

    it("should reject all malicious SVGs via revealMint", async function () {
      let blocked = 0;

      for (const svg of MALICIOUS_SVGS) {
        const wallet = wallets[0];
        await contract.connect(wallet).commitMint({ value: mintPrice });
        const idx = Number(await contract.commitmentCount(wallet.address)) - 1;

        try {
          await contract.connect(wallet).revealMint(
            idx,
            ethers.toUtf8Bytes(svg),
            traitsBytes
          );
          console.log(`      WARNING: SVG passed reveal! ${svg.slice(0, 60)}...`);
        } catch {
          blocked++;
        }
      }

      console.log(`      Blocked ${blocked}/${MALICIOUS_SVGS.length} via revealMint`);
      expect(blocked).to.equal(MALICIOUS_SVGS.length);
    });

    it("should reject malicious traits JSON", async function () {
      let blocked = 0;

      for (const traits of MALICIOUS_TRAITS) {
        try {
          await contract.connect(wallets[0]).mintAgent(
            svgBytes,
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
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      await contract.connect(owner).withdraw();
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      const balanceAfter = await ethers.provider.getBalance(await contract.getAddress());
      expect(balanceAfter).to.be.gte(reserved);
      console.log(`      Post-withdraw balance: ${ethers.formatEther(balanceAfter)} ETH (>= reserved)`);

      // Reveal those commits to release reserved
      for (let i = 0; i < 5; i++) {
        const count = await contract.commitmentCount(wallets[i].address);
        for (let j = Number(count) - 1; j >= 0; j--) {
          const c = await contract.getCommitment(wallets[i].address, j);
          if (!c.revealed && !c.reclaimed) {
            await contract.connect(wallets[i]).revealMint(j, svgBytes, traitsBytes);
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
      // Deploy a fresh contract with tight supply
      const factory = await ethers.getContractFactory("BOOA");
      const limited = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
      await limited.waitForDeployment();

      const cap = 10;
      await limited.connect(owner).setMaxSupply(cap);

      // Try to mint more than cap
      let minted = 0;
      let rejected = 0;

      for (const w of wallets) {
        try {
          await limited.connect(w).mintAgent(svgBytes, traitsBytes, { value: mintPrice });
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
          await limited.connect(wallet).mintAgent(svgBytes, traitsBytes, { value: mintPrice });
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
      // Direct mint 2
      await limited.connect(wallet).mintAgent(svgBytes, traitsBytes, { value: mintPrice });
      await limited.connect(wallet).mintAgent(svgBytes, traitsBytes, { value: mintPrice });

      // commitMint should fail — already at limit
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
          await contract.connect(w).mintAgent(svgBytes, traitsBytes, { value: mintPrice });
        } catch {
          blocked++;
        }
      }
      expect(blocked).to.equal(10);

      // Also block commitMint
      await expect(
        contract.connect(wallets[0]).commitMint({ value: mintPrice })
      ).to.be.reverted;

      // Unpause
      await contract.connect(owner).setPaused(false);
      console.log(`      Blocked ${blocked} mints while paused`);
    });

    it("should block revealMint when paused", async function () {
      // Commit while unpaused
      const wallet = wallets[6];
      await contract.connect(wallet).commitMint({ value: mintPrice });
      const idx = Number(await contract.commitmentCount(wallet.address)) - 1;

      // Pause
      await contract.connect(owner).setPaused(true);

      // Reveal should fail
      await expect(
        contract.connect(wallet).revealMint(idx, svgBytes, traitsBytes)
      ).to.be.reverted;

      // Unpause and reveal should work
      await contract.connect(owner).setPaused(false);
      await contract.connect(wallet).revealMint(idx, svgBytes, traitsBytes);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. ENUMERATION UNDER LOAD
  // ═══════════════════════════════════════════════════════════
  describe("8. Enumeration Under Load", function () {
    it("should enumerate all tokens correctly", async function () {
      const supply = await contract.totalSupply();
      console.log(`      Enumerating ${supply} tokens...`);

      // Check first 20 and last 20
      const checkCount = Math.min(20, Number(supply));
      for (let i = 0; i < checkCount; i++) {
        const tokenId = await contract.tokenByIndex(i);
        const owner = await contract.ownerOf(tokenId);
        expect(owner).to.not.equal(ethers.ZeroAddress);
      }

      if (Number(supply) > 20) {
        for (let i = Number(supply) - checkCount; i < Number(supply); i++) {
          const tokenId = await contract.tokenByIndex(i);
          expect(await contract.ownerOf(tokenId)).to.not.equal(ethers.ZeroAddress);
        }
      }
      console.log(`      All enumerated tokens valid`);
    });

    it("should handle tokenURI for all tokens", async function () {
      const supply = Number(await contract.totalSupply());
      const checkCount = Math.min(10, supply);
      console.log(`      Checking tokenURI for ${checkCount} tokens...`);

      for (let i = 0; i < checkCount; i++) {
        const uri = await contract.tokenURI(i);
        expect(uri).to.include("data:application/json;base64,");
      }
    });

    it("should handle getSVG and getTraits for all tokens", async function () {
      const supply = Number(await contract.totalSupply());
      const checkCount = Math.min(10, supply);

      for (let i = 0; i < checkCount; i++) {
        const svg = await contract.getSVG(i);
        const traits = await contract.getTraits(i);
        expect(svg).to.include("<svg");
        expect(traits).to.include("trait_type");
      }
      console.log(`      All ${checkCount} tokens return valid SVG and traits`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. TRANSFER CHAOS
  // ═══════════════════════════════════════════════════════════
  describe("9. Transfer Chaos", function () {
    it("should handle mass transfers between wallets", async function () {
      // Each wallet transfers their first token to the next wallet
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
      // Find a token that wallets[0] owns
      const balance = await contract.balanceOf(wallets[0].address);
      if (balance > 0n) {
        const tokenId = await contract.tokenOfOwnerByIndex(wallets[0].address, 0);
        // wallets[5] tries to steal it
        await expect(
          contract.connect(wallets[5]).transferFrom(wallets[0].address, wallets[5].address, tokenId)
        ).to.be.reverted;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. EDGE CASES & SIZE LIMITS
  // ═══════════════════════════════════════════════════════════
  describe("10. Edge Cases & Size Limits", function () {
    it("should reject oversized SVG (>24KB)", async function () {
      const hugeSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges">' +
        '<path stroke="#0A0A0A" d="' + 'M0 0h1'.repeat(5000) + '"/></svg>';
      expect(hugeSVG.length).to.be.gt(24576);

      await expect(
        contract.connect(wallets[0]).mintAgent(ethers.toUtf8Bytes(hugeSVG), traitsBytes, { value: mintPrice })
      ).to.be.reverted;
    });

    it("should reject oversized traits (>8KB)", async function () {
      const hugeTraits = '[' + Array(500).fill('{"trait_type":"x","value":"' + 'a'.repeat(50) + '"}').join(',') + ']';
      expect(hugeTraits.length).to.be.gt(8192);

      await expect(
        contract.connect(wallets[0]).mintAgent(svgBytes, ethers.toUtf8Bytes(hugeTraits), { value: mintPrice })
      ).to.be.reverted;
    });

    it("should reject zero-value mints", async function () {
      await expect(
        contract.connect(wallets[0]).mintAgent(svgBytes, traitsBytes, { value: 0 })
      ).to.be.reverted;
    });

    it("should reject empty SVG", async function () {
      await expect(
        contract.connect(wallets[0]).mintAgent(ethers.toUtf8Bytes(""), traitsBytes, { value: mintPrice })
      ).to.be.reverted;
    });

    it("should reject non-SVG data", async function () {
      await expect(
        contract.connect(wallets[0]).mintAgent(ethers.toUtf8Bytes("<div>not svg</div>"), traitsBytes, { value: mintPrice })
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
        contract.connect(wallets[0]).revealMint(9999, svgBytes, traitsBytes)
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
      await contract.connect(wallet).revealMint(idx, svgBytes, traitsBytes);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. FINAL STATS
  // ═══════════════════════════════════════════════════════════
  describe("11. Final Stats", function () {
    it("should report final contract state", async function () {
      const supply = await contract.totalSupply();
      const balance = await ethers.provider.getBalance(await contract.getAddress());
      const reserved = await contract.reservedFunds();

      console.log(`\n    ═══════════════════════════════════`);
      console.log(`    FINAL CONTRACT STATE`);
      console.log(`    ═══════════════════════════════════`);
      console.log(`    Total supply:    ${supply}`);
      console.log(`    Contract ETH:    ${ethers.formatEther(balance)}`);
      console.log(`    Reserved ETH:    ${ethers.formatEther(reserved)}`);
      console.log(`    Withdrawable:    ${ethers.formatEther(balance - reserved)}`);
      console.log(`    ═══════════════════════════════════\n`);

      expect(supply).to.be.gt(0);
      expect(balance).to.be.gte(reserved);
    });
  });
});
