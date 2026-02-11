import { expect } from "chai";
import { ethers } from "hardhat";
import type { BOOA } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * E2E Healthy Mint & Withdraw Test
 *
 * Full lifecycle tests:
 * - Direct mint → verify SVG/traits/tokenURI on-chain → owner withdraw
 * - Commit → reveal → verify → owner withdraw
 * - Commit → expire → reclaim refund → owner withdraw
 * - Price change mid-flow → accounting stays correct
 * - Multiple mints → partial withdraw → more mints → full withdraw
 * - ETH balance tracking at every step
 */

describe("E2E: Healthy Mint & Withdraw", function () {
  let contract: BOOA;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;

  const mintPrice = ethers.parseEther("0.005");
  const royaltyFee = 500; // 5%

  const testSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges"><path stroke="#0A0A0A" d="M0 0h64M0 1h64"/></svg>';
  const svgBytes = ethers.toUtf8Bytes(testSVG);

  const makeTraits = (name: string, creature: string, vibe: string) =>
    ethers.toUtf8Bytes(JSON.stringify([
      { trait_type: "Name", value: name },
      { trait_type: "Creature", value: creature },
      { trait_type: "Vibe", value: vibe },
    ]));

  function getAddress() {
    return contract.getAddress();
  }

  async function contractBalance() {
    return ethers.provider.getBalance(await getAddress());
  }

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("BOOA");
    contract = (await factory.deploy(mintPrice, owner.address, royaltyFee)) as unknown as BOOA;
    await contract.waitForDeployment();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. DIRECT MINT → VERIFY → WITHDRAW
  // ═══════════════════════════════════════════════════════════
  describe("1. Direct Mint → Verify → Withdraw", function () {

    it("full lifecycle: mint, verify on-chain data, owner withdraws", async function () {
      const traits = makeTraits("Luna", "Phoenix", "elegant and fierce");

      // ── MINT ──
      console.log("      [1] Alice mints...");
      const tx = await contract.connect(alice).mintAgent(svgBytes, traits, { value: mintPrice });
      const receipt = await tx.wait();

      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(alice.address);
      expect(await contract.mintCount(alice.address)).to.equal(1);
      console.log(`      Gas used: ${receipt!.gasUsed}`);

      // ── VERIFY SVG ──
      console.log("      [2] Verifying SVG on-chain...");
      const svg = await contract.getSVG(0);
      expect(svg).to.equal(testSVG);

      // ── VERIFY TRAITS ──
      console.log("      [3] Verifying traits on-chain...");
      const traitsJson = await contract.getTraits(0);
      const parsed = JSON.parse(traitsJson);
      expect(parsed).to.be.an("array").with.length(3);
      expect(parsed[0].value).to.equal("Luna");
      expect(parsed[1].value).to.equal("Phoenix");
      expect(parsed[2].value).to.equal("elegant and fierce");

      // ── VERIFY TOKEN URI ──
      console.log("      [4] Verifying tokenURI...");
      const uri = await contract.tokenURI(0);
      expect(uri).to.match(/^data:application\/json;base64,/);

      // Decode and verify JSON
      const json = Buffer.from(uri.split(",")[1], "base64").toString();
      const metadata = JSON.parse(json);
      expect(metadata.name).to.equal("BOOA #0");
      expect(metadata.description).to.equal("BOOA on-chain AI agent PFP");
      expect(metadata.image).to.match(/^data:image\/svg\+xml;base64,/);
      expect(metadata.attributes).to.be.an("array").with.length(3);

      // Decode SVG from metadata
      const svgFromUri = Buffer.from(metadata.image.split(",")[1], "base64").toString();
      expect(svgFromUri).to.equal(testSVG);
      console.log("      SVG in tokenURI matches original ✓");

      // ── VERIFY ROYALTIES ──
      console.log("      [5] Verifying royalties...");
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(ethers.parseEther("0.05")); // 5%

      // ── OWNER WITHDRAW ──
      console.log("      [6] Owner withdraws...");
      const balBefore = await contractBalance();
      expect(balBefore).to.equal(mintPrice);
      expect(await contract.reservedFunds()).to.equal(0);

      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const wTx = await contract.connect(owner).withdraw();
      const wReceipt = await wTx.wait();
      const gasCost = wReceipt!.gasUsed * wReceipt!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      expect(await contractBalance()).to.equal(0);
      expect(ownerAfter - ownerBefore + gasCost).to.equal(mintPrice);
      console.log(`      Withdrawn: ${ethers.formatEther(mintPrice)} ETH ✓`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. COMMIT-REVEAL → VERIFY → WITHDRAW
  // ═══════════════════════════════════════════════════════════
  describe("2. Commit-Reveal → Verify → Withdraw", function () {

    it("full commit-reveal lifecycle with ETH tracking", async function () {
      const traits = makeTraits("Nyx", "Shadow Cat", "mysterious");

      // ── COMMIT ──
      console.log("      [1] Bob commits...");
      await contract.connect(bob).commitMint({ value: mintPrice });

      expect(await contract.reservedFunds()).to.equal(mintPrice);
      expect(await contractBalance()).to.equal(mintPrice);
      expect(await contract.commitmentCount(bob.address)).to.equal(1);

      const commitment = await contract.getCommitment(bob.address, 0);
      expect(commitment.revealed).to.equal(false);
      expect(commitment.timestamp).to.be.gt(0);
      console.log(`      Reserved: ${ethers.formatEther(await contract.reservedFunds())} ETH`);

      // Owner cannot withdraw reserved funds
      await expect(contract.connect(owner).withdraw()).to.be.revertedWith("No available funds");
      console.log("      Owner withdraw blocked (all funds reserved) ✓");

      // ── REVEAL ──
      console.log("      [2] Bob reveals...");
      await contract.connect(bob).revealMint(0, svgBytes, traits);

      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(bob.address);
      expect(await contract.reservedFunds()).to.equal(0);
      console.log(`      Reserved after reveal: ${ethers.formatEther(await contract.reservedFunds())} ETH`);

      // ── VERIFY DATA ──
      console.log("      [3] Verifying on-chain data...");
      expect(await contract.getSVG(0)).to.equal(testSVG);
      const parsed = JSON.parse(await contract.getTraits(0));
      expect(parsed[0].value).to.equal("Nyx");

      // Commitment should be marked as revealed
      const c2 = await contract.getCommitment(bob.address, 0);
      expect(c2.revealed).to.equal(true);

      // ── WITHDRAW ──
      console.log("      [4] Owner withdraws...");
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const r = await tx.wait();
      const gas = r!.gasUsed * r!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      expect(await contractBalance()).to.equal(0);
      expect(ownerAfter - ownerBefore + gas).to.equal(mintPrice);
      console.log(`      Withdrawn: ${ethers.formatEther(mintPrice)} ETH ✓`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. COMMIT → EXPIRE → RECLAIM
  // ═══════════════════════════════════════════════════════════
  describe("3. Commit → Expire → Reclaim Refund", function () {

    it("refunds correct amount after expiry", async function () {
      // ── COMMIT ──
      console.log("      [1] Carol commits...");
      await contract.connect(carol).commitMint({ value: mintPrice });
      expect(await contract.reservedFunds()).to.equal(mintPrice);

      // ── FAST-FORWARD 7 DAYS + 1 ──
      console.log("      [2] Fast-forwarding 7 days...");
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      // ── RECLAIM ──
      console.log("      [3] Carol reclaims...");
      const carolBefore = await ethers.provider.getBalance(carol.address);
      const tx = await contract.connect(carol).reclaimExpired(0);
      const r = await tx.wait();
      const gas = r!.gasUsed * r!.gasPrice;
      const carolAfter = await ethers.provider.getBalance(carol.address);

      const refund = carolAfter - carolBefore + gas;
      expect(refund).to.equal(mintPrice);
      console.log(`      Refunded: ${ethers.formatEther(refund)} ETH ✓`);

      // Reserved should be 0 now
      expect(await contract.reservedFunds()).to.equal(0);
      // Contract balance should be 0
      expect(await contractBalance()).to.equal(0);
      // No token minted
      expect(await contract.totalSupply()).to.equal(0);
      console.log("      No token minted, all funds returned ✓");
    });

    it("refunds original price even if price changed", async function () {
      const originalPrice = mintPrice;
      const newPrice = ethers.parseEther("0.05"); // 10x increase

      await contract.connect(carol).commitMint({ value: originalPrice });
      await contract.connect(owner).setMintPrice(newPrice);

      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      const carolBefore = await ethers.provider.getBalance(carol.address);
      const tx = await contract.connect(carol).reclaimExpired(0);
      const r = await tx.wait();
      const gas = r!.gasUsed * r!.gasPrice;
      const carolAfter = await ethers.provider.getBalance(carol.address);

      // Should refund original price, not new price
      expect(carolAfter - carolBefore + gas).to.equal(originalPrice);
      console.log(`      Refunded original price (${ethers.formatEther(originalPrice)} ETH) not new price (${ethers.formatEther(newPrice)} ETH) ✓`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. MIXED FLOW: MINTS + COMMITS + WITHDRAW
  // ═══════════════════════════════════════════════════════════
  describe("4. Mixed Flow: ETH Accounting", function () {

    it("tracks ETH correctly through complex multi-user flow", async function () {
      const p = mintPrice;

      // ── Alice direct mints ──
      console.log("      [1] Alice direct mints...");
      await contract.connect(alice).mintAgent(svgBytes, makeTraits("A1", "Cat", "calm"), { value: p });
      expect(await contractBalance()).to.equal(p);
      expect(await contract.reservedFunds()).to.equal(0);

      // ── Bob commits ──
      console.log("      [2] Bob commits...");
      await contract.connect(bob).commitMint({ value: p });
      expect(await contractBalance()).to.equal(p * 2n);
      expect(await contract.reservedFunds()).to.equal(p);

      // ── Owner partial withdraw (only Alice's mint is available) ──
      console.log("      [3] Owner partial withdraw...");
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx1 = await contract.connect(owner).withdraw();
      const r1 = await tx1.wait();
      const gas1 = r1!.gasUsed * r1!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      const withdrawn1 = ownerAfter - ownerBefore + gas1;
      expect(withdrawn1).to.equal(p); // Only Alice's mint, Bob's is reserved
      expect(await contractBalance()).to.equal(p); // Bob's reserved funds remain
      console.log(`      Withdrawn: ${ethers.formatEther(withdrawn1)} ETH (Bob's funds still reserved) ✓`);

      // ── Carol direct mints ──
      console.log("      [4] Carol direct mints...");
      await contract.connect(carol).mintAgent(svgBytes, makeTraits("C1", "Bird", "free"), { value: p });
      expect(await contractBalance()).to.equal(p * 2n); // Bob's reserved + Carol's mint

      // ── Bob reveals ──
      console.log("      [5] Bob reveals...");
      await contract.connect(bob).revealMint(0, svgBytes, makeTraits("B1", "Wolf", "wild"));
      expect(await contract.reservedFunds()).to.equal(0); // Released

      // ── Owner full withdraw ──
      console.log("      [6] Owner full withdraw...");
      const ownerBefore2 = await ethers.provider.getBalance(owner.address);
      const tx2 = await contract.connect(owner).withdraw();
      const r2 = await tx2.wait();
      const gas2 = r2!.gasUsed * r2!.gasPrice;
      const ownerAfter2 = await ethers.provider.getBalance(owner.address);

      const withdrawn2 = ownerAfter2 - ownerBefore2 + gas2;
      expect(withdrawn2).to.equal(p * 2n); // Bob's revealed + Carol's mint
      expect(await contractBalance()).to.equal(0);
      console.log(`      Withdrawn: ${ethers.formatEther(withdrawn2)} ETH ✓`);

      // ── VERIFY ALL TOKENS ──
      console.log("      [7] Verifying all 3 tokens...");
      expect(await contract.totalSupply()).to.equal(3);

      for (let i = 0; i < 3; i++) {
        const svg = await contract.getSVG(i);
        expect(svg).to.equal(testSVG);

        const uri = await contract.tokenURI(i);
        const json = Buffer.from(uri.split(",")[1], "base64").toString();
        const meta = JSON.parse(json);
        expect(meta.name).to.equal(`BOOA #${i}`);
        expect(meta.image).to.include("data:image/svg+xml;base64,");
      }

      // Token 0 = Alice, 1 = Carol (direct), 2 = Bob (reveal)
      expect(await contract.ownerOf(0)).to.equal(alice.address);
      expect(await contract.ownerOf(1)).to.equal(carol.address);
      expect(await contract.ownerOf(2)).to.equal(bob.address);
      console.log("      All tokens verified on-chain ✓");

      // ── TOTAL ETH ACCOUNTING ──
      const totalPaid = p * 3n;
      const totalWithdrawn = withdrawn1 + withdrawn2;
      expect(totalWithdrawn).to.equal(totalPaid);
      console.log(`\n      ACCOUNTING: Paid ${ethers.formatEther(totalPaid)} = Withdrawn ${ethers.formatEther(totalWithdrawn)} ✓`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. withdrawTo TEST
  // ═══════════════════════════════════════════════════════════
  describe("5. withdrawTo", function () {

    it("sends funds to specified address", async function () {
      await contract.connect(alice).mintAgent(svgBytes, makeTraits("X", "Y", "Z"), { value: mintPrice });

      const carolBefore = await ethers.provider.getBalance(carol.address);
      await contract.connect(owner).withdrawTo(carol.address);
      const carolAfter = await ethers.provider.getBalance(carol.address);

      expect(carolAfter - carolBefore).to.equal(mintPrice);
      expect(await contractBalance()).to.equal(0);
      console.log(`      withdrawTo sent ${ethers.formatEther(mintPrice)} ETH to Carol ✓`);
    });

    it("rejects zero address", async function () {
      await contract.connect(alice).mintAgent(svgBytes, makeTraits("X", "Y", "Z"), { value: mintPrice });
      await expect(
        contract.connect(owner).withdrawTo(ethers.ZeroAddress)
      ).to.be.revertedWith("Zero address");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. TRANSFER → VERIFY OWNERSHIP → tokenURI still works
  // ═══════════════════════════════════════════════════════════
  describe("6. Transfer & Post-Transfer Verification", function () {

    it("data persists after transfer", async function () {
      const traits = makeTraits("Transferred", "Dragon", "ancient");
      await contract.connect(alice).mintAgent(svgBytes, traits, { value: mintPrice });

      // Transfer Alice → Bob
      await contract.connect(alice).transferFrom(alice.address, bob.address, 0);
      expect(await contract.ownerOf(0)).to.equal(bob.address);
      expect(await contract.balanceOf(alice.address)).to.equal(0);
      expect(await contract.balanceOf(bob.address)).to.equal(1);

      // SVG and traits still accessible
      expect(await contract.getSVG(0)).to.equal(testSVG);
      const parsed = JSON.parse(await contract.getTraits(0));
      expect(parsed[0].value).to.equal("Transferred");

      // tokenURI still works
      const uri = await contract.tokenURI(0);
      expect(uri).to.include("data:application/json;base64,");
      console.log("      Data persists after transfer ✓");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. OVERPAYMENT HANDLING
  // ═══════════════════════════════════════════════════════════
  describe("7. Overpayment Handling", function () {

    it("accepts overpayment (extra goes to contract)", async function () {
      const overpay = ethers.parseEther("0.1"); // 20x mint price
      await contract.connect(alice).mintAgent(svgBytes, makeTraits("Rich", "Whale", "generous"), { value: overpay });

      expect(await contract.totalSupply()).to.equal(1);
      expect(await contractBalance()).to.equal(overpay);

      // Owner can withdraw full overpayment
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const r = await tx.wait();
      const gas = r!.gasUsed * r!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerAfter - ownerBefore + gas).to.equal(overpay);
      console.log(`      Overpaid ${ethers.formatEther(overpay)} ETH, owner withdrew all ✓`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. PRICE CHANGE MID-FLOW
  // ═══════════════════════════════════════════════════════════
  describe("8. Price Change Mid-Flow", function () {

    it("new mints use new price, reveals use committed price", async function () {
      const oldPrice = mintPrice;
      const newPrice = ethers.parseEther("0.01");

      // Alice mints at old price
      await contract.connect(alice).mintAgent(svgBytes, makeTraits("Old", "Cat", "calm"), { value: oldPrice });

      // Bob commits at old price
      await contract.connect(bob).commitMint({ value: oldPrice });

      // Owner changes price
      await contract.connect(owner).setMintPrice(newPrice);

      // Carol mints at new price
      await contract.connect(carol).mintAgent(svgBytes, makeTraits("New", "Dog", "happy"), { value: newPrice });

      // Carol can't mint at old (lower) price anymore
      await expect(
        contract.connect(carol).mintAgent(svgBytes, makeTraits("X", "Y", "Z"), { value: oldPrice })
      ).to.be.revertedWith("Insufficient payment");

      // Carol mints again at new price
      await contract.connect(carol).mintAgent(svgBytes, makeTraits("New2", "Fox", "sly"), { value: newPrice });

      // Bob reveals — this should work, he already paid at commit time
      await contract.connect(bob).revealMint(0, svgBytes, makeTraits("Bob", "Wolf", "wild"));

      expect(await contract.totalSupply()).to.equal(4); // Alice + Carol + Carol2 + Bob

      // Accounting
      const balance = await contractBalance();
      const reserved = await contract.reservedFunds();
      expect(reserved).to.equal(0); // all revealed
      console.log(`      Balance: ${ethers.formatEther(balance)} ETH, Reserved: ${ethers.formatEther(reserved)} ETH`);
      console.log(`      Price change mid-flow handled correctly ✓`);
    });
  });
});
