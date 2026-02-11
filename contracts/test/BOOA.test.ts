import { expect } from "chai";
import { ethers } from "hardhat";
import type { BOOA } from "../typechain-types";

describe("BOOA", function () {
  let contract: BOOA;
  let owner: any;
  let user: any;
  let user2: any;
  const mintPrice = ethers.parseEther("0.0042");
  const royaltyFee = 500;
  const testSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges"><path stroke="#000" d="M0 0h64"/></svg>';
  const testSVGBytes = ethers.toUtf8Bytes(testSVG);
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

  describe("Minting", function () {
    it("should mint with valid SVG and traits data", async function () {
      const tx = await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("should produce sequential token IDs", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(3);
      expect(await contract.ownerOf(0)).to.equal(user.address);
      expect(await contract.ownerOf(1)).to.equal(user.address);
      expect(await contract.ownerOf(2)).to.equal(user.address);
    });

    it("should revert with insufficient payment", async function () {
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: 0 })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should revert with empty SVG data", async function () {
      await expect(
        contract.connect(user).mintAgent("0x", testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Empty SVG data");
    });

    it("should emit AgentMinted event", async function () {
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice })
      ).to.emit(contract, "AgentMinted")
        .withArgs(0, user.address, (value: any) => typeof value === 'string');
    });

    it("should track mintCount per wallet", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      expect(await contract.mintCount(user.address)).to.equal(2);
      expect(await contract.mintCount(user2.address)).to.equal(0);
    });
  });

  describe("Traits", function () {
    it("should store and retrieve traits JSON", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const traits = await contract.getTraits(0);
      expect(traits).to.equal(testTraits);
    });

    it("should include attributes in tokenURI", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.attributes).to.be.an("array");
      expect(json.attributes[0].trait_type).to.equal("Creature");
      expect(json.attributes[0].value).to.equal("AI familiar");
    });

    it("should handle empty traits gracefully", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, "0x", { value: mintPrice });
      const traits = await contract.getTraits(0);
      expect(traits).to.equal("");
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.attributes).to.be.undefined;
    });
  });

  describe("Token URI", function () {
    beforeEach(async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });

      for (let i = 0; i < 3; i++) {
        const uri = await contract.tokenURI(i);
        const base64Json = uri.replace("data:application/json;base64,", "");
        const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
        expect(json.name).to.equal(`BOOA #${i}`);
      }
    });

    it("should contain original SVG when fully decoded", async function () {
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      const svgBase64 = json.image.replace("data:image/svg+xml;base64,", "");
      const decodedSVG = Buffer.from(svgBase64, "base64").toString();
      expect(decodedSVG).to.equal(testSVG);
    });

    it("should revert for non-existent token", async function () {
      await expect(contract.tokenURI(99)).to.be.reverted;
    });
  });

  describe("getSVG", function () {
    it("should return original SVG string", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const svg = await contract.getSVG(0);
      expect(svg).to.equal(testSVG);
    });
  });

  describe("Enumeration (ERC721Enumerable)", function () {
    beforeEach(async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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

  describe("Royalties (EIP-2981)", function () {
    it("should return correct default royalty info", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(ethers.parseEther("0.05"));
    });

    it("should allow owner to update default royalty", async function () {
      await contract.connect(owner).setDefaultRoyalty(user2.address, 1000);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(user2.address);
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("should allow owner to set per-token royalty", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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

  describe("Supply and wallet limits", function () {
    it("should enforce maxSupply", async function () {
      await contract.connect(owner).setMaxSupply(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Max supply reached");
    });

    it("should enforce maxPerWallet", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should allow different wallets when maxPerWallet is set", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(2);
    });

    it("should allow unlimited minting when limits are 0", async function () {
      for (let i = 0; i < 3; i++) {
        await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      }
      expect(await contract.totalSupply()).to.equal(3);
    });

    it("should not allow setting maxSupply below current supply", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(owner).setMaxSupply(1)
      ).to.be.revertedWith("Below current supply");
    });

    it("should allow setting maxSupply to 0 (unlimited) after mints", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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

  describe("Pause", function () {
    it("should prevent minting when paused", async function () {
      await contract.connect(owner).setPaused(true);
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("Minting is paused");
    });

    it("should allow minting after unpause", async function () {
      await contract.connect(owner).setPaused(true);
      await contract.connect(owner).setPaused(false);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter + gasUsed - balanceBefore).to.equal(mintPrice);
    });

    it("should allow owner to withdrawTo", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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

  describe("Security: SVG Sanitization", function () {
    it("should accept valid SVG", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should reject SVG with <script> tag", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <SCRIPT> tag (case-insensitive)", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with onload handler", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with onerror handler", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><image onerror="alert(1)" /></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with javascript: protocol", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <iframe>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.com"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <foreignObject>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <object>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><object data="evil.swf"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <embed>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><embed src="evil.swf"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with data:text/html URI", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<script>alert(1)</script>"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject data that does not start with <svg", async function () {
      const malicious = '<html><body>not svg</body></html>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWith("SVG must start with <svg");
    });

    it("should allow SVG with safe onclick in path data (not an attribute)", async function () {
      const safe = '<svg xmlns="http://www.w3.org/2000/svg"><text>the word onclick is ok here</text></svg>';
      await contract.connect(user).mintAgent(ethers.toUtf8Bytes(safe), testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });
  });

  describe("Security: Input Limits", function () {
    it("should reject traits exceeding 8KB", async function () {
      const oversizeTraits = ethers.toUtf8Bytes("x".repeat(8193));
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, oversizeTraits, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "TraitsTooLarge");
    });
  });

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
      // First do a real mint so mintCount becomes 1
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await expect(
        contract.connect(user).commitMint({ value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should enforce maxSupply on commitMint", async function () {
      await contract.connect(owner).setMaxSupply(1);
      // First do a real mint so _nextTokenId becomes 1
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("should produce correct tokenURI after revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      expect(json.description).to.equal("BOOA on-chain AI agent PFP");
    });

    it("should emit AgentMinted event on revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.emit(contract, "AgentMinted")
        .withArgs(0, user.address, (value: any) => typeof value === 'string');
    });

    it("should reject revealMint for already-revealed slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Already revealed");
    });

    it("should reject revealMint for invalid slot", async function () {
      await expect(
        contract.connect(user).revealMint(99, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject revealMint after deadline expires", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Commitment expired");
    });

    it("should track mintCount correctly via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      expect(await contract.mintCount(user.address)).to.equal(1);
    });

    it("should return commitment details via getCommitment", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const [timestamp, revealed] = await contract.getCommitment(user.address, 0);
      expect(timestamp).to.be.greaterThan(0);
      expect(revealed).to.be.false;
    });
  });

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

  describe("Security: SVG Injection via revealMint", function () {
    it("should reject <script> injection via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject onload handler via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject javascript: protocol via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <iframe> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.com"></iframe></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <foreignObject> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject></foreignObject></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject data:text/html via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<script>alert(1)</script>"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject non-SVG data via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<html><body>not svg</body></html>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWith("SVG must start with <svg");
    });

    it("should accept valid SVG via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });
  });

  describe("Security: Additional Attack Vectors via revealMint", function () {
    // ── Mixed Case Evasion ──
    it("should reject mixed-case <ScRiPt> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><ScRiPt>alert(1)</ScRiPt></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject uppercase <SCRIPT> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject mixed-case <IFrame> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><IFrame src="https://evil.com"></IFrame></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject uppercase <OBJECT> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><OBJECT data="evil.swf"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject uppercase <EMBED> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><EMBED src="evil.swf"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject mixed-case <ForeignObject> via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><ForeignObject></ForeignObject></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject mixed-case JAVASCRIPT: protocol via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><a href="JaVaScRiPt:alert(1)">x</a></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject mixed-case DATA:TEXT/HTML via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><image href="Data:Text/Html,<script>alert(1)</script>"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    // ── Event Handler Variants ──
    it("should reject onerror handler via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><image onerror="alert(1)"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject onmouseover handler via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg" onmouseover="alert(1)"><rect/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject onclick handler via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject onfocus handler via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect onfocus="alert(1)" tabindex="0"/></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject ONLOAD uppercase handler via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg" ONLOAD="alert(1)"></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    // ── Size Limits via revealMint ──
    it("should reject oversized SVG (>24KB) via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const bigSvg = '<svg xmlns="http://www.w3.org/2000/svg">' + "x".repeat(24577) + '</svg>';
      await expect(
        contract.connect(user).revealMint(0, ethers.toUtf8Bytes(bigSvg), testTraitsBytes)
      ).to.be.revertedWith("SVG exceeds 24KB limit");
    });

    it("should reject empty SVG via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(0, ethers.toUtf8Bytes(""), testTraitsBytes)
      ).to.be.revertedWith("Empty SVG data");
    });

    it("should reject oversized traits (>8KB) via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const bigTraits = ethers.toUtf8Bytes("x".repeat(8193));
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, bigTraits)
      ).to.be.revertedWithCustomError(contract, "TraitsTooLarge");
    });

    // ── Slot Manipulation ──
    it("should reject reveal of another user's slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      // user2 has no commitments, so slot 0 does not exist for user2
      await expect(
        contract.connect(user2).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject reveal with out-of-bounds slot index", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await expect(
        contract.connect(user).revealMint(1, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Invalid slot");
    });

    it("should reject double reveal of same slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Already revealed");
    });

    // ── Expired Commitment ──
    it("should reject reveal after 7 day deadline", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Commitment expired");
    });

    // ── SVG with BOM (Byte Order Mark) ──
    it("should handle SVG with UTF-8 BOM via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges"><path stroke="#000" d="M0 0h64"/></svg>';
      const svgBytes = ethers.toUtf8Bytes(svgStr);
      const combined = new Uint8Array(bom.length + svgBytes.length);
      combined.set(bom);
      combined.set(svgBytes, bom.length);
      // BOM is whitespace-stripped by _validateSVG, should work
      await contract.connect(user).revealMint(0, combined, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    // ── Null Bytes / Binary Injection ──
    it("should reject pure binary data via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const binary = new Uint8Array([0x00, 0x01, 0x02, 0xFF, 0xFE]);
      await expect(
        contract.connect(user).revealMint(0, binary, testTraitsBytes)
      ).to.be.revertedWith("SVG must start with <svg");
    });

    // ── Script with whitespace/newline evasion ──
    it("should reject <script> with newline before tag name via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      // This is <svg...><script> but with tag intact
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg">\n<script>alert(1)</script></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    // ── Multiple script tags ──
    it("should reject multiple nested dangerous elements via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const malicious = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><g><g><script>alert(1)</script></g></g></svg>');
      await expect(
        contract.connect(user).revealMint(0, malicious, testTraitsBytes)
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    // ── Traits JSON injection (try to break tokenURI JSON) ──
    it("should store traits with special JSON characters without breaking tokenURI", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      // Even if traits contain weird JSON, it's stored as-is and tokenURI wraps it
      const weirdTraits = ethers.toUtf8Bytes('[{"trait_type":"test","value":"val"}]');
      await contract.connect(user).revealMint(0, testSVGBytes, weirdTraits);
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      expect(json.attributes).to.deep.equal([{ trait_type: "test", value: "val" }]);
    });

    // ── Reclaim: someone else can't reclaim your slot ──
    it("should reject reclaimExpired for another user's slot", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      // user2 has no commitments
      await expect(
        contract.connect(user2).reclaimExpired(0)
      ).to.be.revertedWith("Invalid slot");
    });

    // ── Reveal after reclaim ──
    it("should reject reveal after slot was reclaimed", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);
      // Slot is now marked as revealed, can't reveal again
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Already revealed");
    });

    // ── Empty traits should work (no traits pointer) ──
    it("should allow revealMint with empty traits", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user).revealMint(0, testSVGBytes, ethers.toUtf8Bytes(""));
      expect(await contract.ownerOf(0)).to.equal(user.address);
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      expect(json.name).to.equal("BOOA #0");
      // No attributes key when traits are empty
      expect(json.attributes).to.be.undefined;
    });

    // ── SVG with <use> + xlink:href to external resource ──
    it("should accept SVG with <use> (no blocked element)", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const svgWithUse = ethers.toUtf8Bytes('<svg xmlns="http://www.w3.org/2000/svg"><use href="#myid"/></svg>');
      // <use> is not in the blocked list, so this should pass
      await contract.connect(user).revealMint(0, svgWithUse, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    // ── SVG that starts with whitespace ──
    it("should accept SVG with leading whitespace via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const svgWithSpaces = ethers.toUtf8Bytes('   \n\t<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
      await contract.connect(user).revealMint(0, svgWithSpaces, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    // ── SVG with <SVG (uppercase start) ──
    it("should accept uppercase <SVG via revealMint", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      const uppercaseSvg = ethers.toUtf8Bytes('<SVG xmlns="http://www.w3.org/2000/svg"><rect/></SVG>');
      await contract.connect(user).revealMint(0, uppercaseSvg, testTraitsBytes);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });
  });

  // ══════════════════════════════════════════════════════════
  // SECURITY AUDIT — Verify Fixes
  // ══════════════════════════════════════════════════════════

  describe("FIX #1: maxPerWallet enforced in commitMint and revealMint", function () {
    it("should block second commit when maxPerWallet=1 (pending commit counted)", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).commitMint({ value: mintPrice });
      // Second commit should fail — pending commit is counted
      await expect(
        contract.connect(user).commitMint({ value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should block revealMint when mintCount already at maxPerWallet", async function () {
      // First: direct mint to fill wallet limit
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      // Remove limit temporarily so user can commit
      await contract.connect(owner).setMaxPerWallet(0);
      await contract.connect(user).commitMint({ value: mintPrice });
      // Restore limit
      await contract.connect(owner).setMaxPerWallet(1);
      // Reveal should fail
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should allow commit after expired commit frees up a slot", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).commitMint({ value: mintPrice });

      // Wait for expiry
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await contract.connect(user).reclaimExpired(0);

      // Now user can commit again (expired commit no longer counted as pending)
      await contract.connect(user).commitMint({ value: mintPrice });
      expect(await contract.commitmentCount(user.address)).to.equal(2);
    });
  });

  describe("FIX #2: withdraw protects reserved funds", function () {
    it("should not allow withdrawing commit-reserved funds", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user2).commitMint({ value: mintPrice });

      // All funds are reserved — withdraw should fail
      await expect(
        contract.connect(owner).withdraw()
      ).to.be.revertedWith("No available funds");
    });

    it("should allow withdrawing only unreserved funds", async function () {
      // Direct mint creates unreserved revenue
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      // Commit creates reserved funds
      await contract.connect(user2).commitMint({ value: mintPrice });

      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(owner.address);

      // Only the direct mint revenue is withdrawable
      expect(balAfter + gasUsed - balBefore).to.equal(mintPrice);

      // Contract still holds reserved funds
      const contractBal = await ethers.provider.getBalance(await contract.getAddress());
      expect(contractBal).to.equal(mintPrice);
    });

    it("should release reserved funds after reveal", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      expect(await contract.reservedFunds()).to.equal(mintPrice);

      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
      expect(await contract.reservedFunds()).to.equal(0);

      // Now owner can withdraw
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
      // Even with a direct mint revenue withdrawn, commit funds are safe
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(owner).withdraw(); // only withdraws unreserved

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

      // Owner changes the price
      const newPrice = mintPrice / 2n;
      await contract.connect(owner).setMintPrice(newPrice);

      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      const balBefore = await ethers.provider.getBalance(user.address);
      const tx = await contract.connect(user).reclaimExpired(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user.address);

      // User gets back ORIGINAL mintPrice, not the new lower price
      const refunded = balAfter + gasUsed - balBefore;
      expect(refunded).to.equal(mintPrice);
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

      // User gets back original paid amount, not 0
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

      // User gets back the FULL amount they paid (including overpayment)
      expect(balAfter + gasUsed - balBefore).to.equal(overpay);
    });
  });

  describe("FIX #4: supply race condition (still possible but reclaim works)", function () {
    it("directMint can exhaust supply before revealMint but reclaim is safe", async function () {
      await contract.connect(owner).setMaxSupply(2);
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });

      // user's reveal fails
      await expect(
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Max supply reached");

      // But user can safely reclaim their funds
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
        contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes)
      ).to.be.revertedWith("Minting is paused");
    });

    it("should allow revealMint after unpause", async function () {
      await contract.connect(user).commitMint({ value: mintPrice });
      await contract.connect(owner).setPaused(true);
      await contract.connect(owner).setPaused(false);
      await contract.connect(user).revealMint(0, testSVGBytes, testTraitsBytes);
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

  describe("FIX #6: SVG sanitization now blocks dangerous tags", function () {
    it("should reject <style> tag", async function () {
      const withStyle = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><style>body{background:red}</style><rect/></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withStyle, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <STYLE> tag (case-insensitive)", async function () {
      const withStyle = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><STYLE>body{background:red}</STYLE><rect/></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withStyle, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <animate> tag", async function () {
      const withAnimate = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect><animate attributeName="width" from="0" to="100" dur="1s"/></rect></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withAnimate, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <set> tag", async function () {
      const withSet = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect><set attributeName="fill" to="red"/></rect></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withSet, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <image> tag", async function () {
      const withImage = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.com/track.png"/></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withImage, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <a> tag (phishing)", async function () {
      const withLink = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.com"><text>Click me</text></a></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withLink, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject <feImage> tag", async function () {
      const withFeImage = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feImage href="https://evil.com/exfil"/></filter><rect filter="url(#f)"/></svg>'
      );
      await expect(
        contract.connect(user).mintAgent(withFeImage, testTraitsBytes, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should still allow valid SVG with rect, path, text, g, defs, use", async function () {
      const safeSvg = ethers.toUtf8Bytes(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><rect/></clipPath></defs><g><path stroke="#000" d="M0 0h64"/><text>hello</text><use href="#c"/></g></svg>'
      );
      await contract.connect(user).mintAgent(safeSvg, testTraitsBytes, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });
  });

  describe("FIX #7: traits JSON injection prevented", function () {
    it("should reject traits that don't start with [", async function () {
      const maliciousTraits = ethers.toUtf8Bytes(
        '"},"injected_key":"injected_value","x":{"y":"z'
      );
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, maliciousTraits, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeTraits");
    });

    it("should reject traits with unbalanced braces", async function () {
      const badTraits = ethers.toUtf8Bytes('[{"trait_type":"test"}]}');
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, badTraits, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeTraits");
    });

    it("should accept valid traits JSON array", async function () {
      const validTraits = ethers.toUtf8Bytes('[{"trait_type":"Creature","value":"Fox"},{"trait_type":"Vibe","value":"chill"}]');
      await contract.connect(user).mintAgent(testSVGBytes, validTraits, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should accept empty traits", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, "0x", { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should accept empty array traits", async function () {
      const emptyArray = ethers.toUtf8Bytes('[]');
      await contract.connect(user).mintAgent(testSVGBytes, emptyArray, { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should allow traits with special characters inside strings", async function () {
      const specialChars = ethers.toUtf8Bytes('[{"trait_type":"test","value":"hello \\"world\\" }]"}]');
      await contract.connect(user).mintAgent(testSVGBytes, specialChars, { value: mintPrice });
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });

      await contract.connect(owner).setMaxSupply(0);

      for (let i = 0; i < 5; i++) {
        await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, { value: mintPrice });
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
});
