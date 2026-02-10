import { expect } from "chai";
import { ethers } from "hardhat";
import type { BOOA } from "../typechain-types";

describe("BOOA", function () {
  let contract: BOOA;
  let owner: any;
  let user: any;
  let user2: any;
  const mintPrice = ethers.parseEther("0.0042");
  const royaltyFee = 500; // 5%
  const testSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges"><path stroke="#000" d="M0 0h64"/></svg>';
  const testSVGBytes = ethers.toUtf8Bytes(testSVG);
  const testTraits = JSON.stringify([
    { trait_type: "Creature", value: "AI familiar" },
    { trait_type: "Vibe", value: "sharp and witty" },
    { trait_type: "Emoji", value: "\u{1F916}" },
{ trait_type: "Skill", value: "code analysis" },
    { trait_type: "Domain", value: "software engineering" },
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
      const tx = await contract.connect(user).mintAgent(
        testSVGBytes,
        testTraitsBytes,
        "TestAgent",
        "A test agent",
        { value: mintPrice }
      );
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      expect(await contract.totalSupply()).to.equal(1);
      expect(await contract.ownerOf(0)).to.equal(user.address);
    });

    it("should produce sequential token IDs", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent0", "First", { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent1", "Second", { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent2", "Third", { value: mintPrice });

      expect(await contract.totalSupply()).to.equal(3);
      expect(await contract.ownerOf(0)).to.equal(user.address);
      expect(await contract.ownerOf(1)).to.equal(user.address);
      expect(await contract.ownerOf(2)).to.equal(user.address);
    });

    it("should revert with insufficient payment", async function () {
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: 0 })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should revert with empty SVG data", async function () {
      await expect(
        contract.connect(user).mintAgent("0x", testTraitsBytes, "Agent", "Desc", { value: mintPrice })
      ).to.be.revertedWith("Empty SVG data");
    });

    it("should emit AgentMinted event", async function () {
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: mintPrice })
      ).to.emit(contract, "AgentMinted")
        .withArgs(0, user.address, (value: any) => typeof value === 'string');
    });

    it("should track mintCount per wallet", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "B", "D", { value: mintPrice });
      expect(await contract.mintCount(user.address)).to.equal(2);
      expect(await contract.mintCount(user2.address)).to.equal(0);
    });
  });

  describe("Traits", function () {
    it("should store and retrieve traits JSON", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: mintPrice });
      const traits = await contract.getTraits(0);
      expect(traits).to.equal(testTraits);
    });

    it("should include attributes in tokenURI", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "TestAgent", "A test agent", { value: mintPrice });
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());

      expect(json.attributes).to.be.an("array");
      expect(json.attributes[0].trait_type).to.equal("Creature");
      expect(json.attributes[0].value).to.equal("AI familiar");
    });

    it("should handle empty traits gracefully", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, "0x", "Agent", "Desc", { value: mintPrice });
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "TestAgent", "A test agent", { value: mintPrice });
    });

    it("should return valid data URI", async function () {
      const uri = await contract.tokenURI(0);
      expect(uri).to.match(/^data:application\/json;base64,/);
    });

    it("should contain correct metadata when decoded", async function () {
      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());

      expect(json.name).to.equal("TestAgent");
      expect(json.description).to.equal("A test agent");
      expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: mintPrice });
      const svg = await contract.getSVG(0);
      expect(svg).to.equal(testSVG);
    });
  });

  describe("getMetadata", function () {
    it("should return name and description", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "MyAgent", "My description", { value: mintPrice });
      const [name, description] = await contract.getMetadata(0);
      expect(name).to.equal("MyAgent");
      expect(description).to.equal("My description");
    });
  });

  describe("Enumeration (ERC721Enumerable)", function () {
    beforeEach(async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent0", "D", { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent1", "D", { value: mintPrice });
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, "Agent2", "D", { value: mintPrice });
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "D", { value: mintPrice });

      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);

      expect(receiver).to.equal(owner.address);
      // 5% of 1 ETH = 0.05 ETH
      expect(amount).to.equal(ethers.parseEther("0.05"));
    });

    it("should allow owner to update default royalty", async function () {
      await contract.connect(owner).setDefaultRoyalty(user2.address, 1000); // 10%
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "D", { value: mintPrice });

      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await contract.royaltyInfo(0, salePrice);

      expect(receiver).to.equal(user2.address);
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("should allow owner to set per-token royalty", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "D", { value: mintPrice });
      await contract.connect(owner).setTokenRoyalty(0, user2.address, 250); // 2.5%

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
      // ERC2981 interfaceId = 0x2a55205a
      expect(await contract.supportsInterface("0x2a55205a")).to.be.true;
    });

    it("should support ERC721 interface", async function () {
      // ERC721 interfaceId = 0x80ac58cd
      expect(await contract.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support ERC721Enumerable interface", async function () {
      // ERC721Enumerable interfaceId = 0x780e9d63
      expect(await contract.supportsInterface("0x780e9d63")).to.be.true;
    });
  });

  describe("Supply and wallet limits", function () {
    it("should enforce maxSupply", async function () {
      await contract.connect(owner).setMaxSupply(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
      await expect(
        contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, "B", "D", { value: mintPrice })
      ).to.be.revertedWith("Max supply reached");
    });

    it("should enforce maxPerWallet", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "B", "D", { value: mintPrice })
      ).to.be.revertedWith("Wallet mint limit reached");
    });

    it("should allow different wallets when maxPerWallet is set", async function () {
      await contract.connect(owner).setMaxPerWallet(1);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
      await contract.connect(user2).mintAgent(testSVGBytes, testTraitsBytes, "B", "D", { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(2);
    });

    it("should allow unlimited minting when limits are 0", async function () {
      for (let i = 0; i < 3; i++) {
        await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, `Agent${i}`, "D", { value: mintPrice });
      }
      expect(await contract.totalSupply()).to.equal(3);
    });

    it("should not allow setting maxSupply below current supply", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "B", "D", { value: mintPrice });
      await expect(
        contract.connect(owner).setMaxSupply(1)
      ).to.be.revertedWith("Below current supply");
    });

    it("should allow setting maxSupply to 0 (unlimited) after mints", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
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
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWith("Minting is paused");
    });

    it("should allow minting after unpause", async function () {
      await contract.connect(owner).setPaused(true);
      await contract.connect(owner).setPaused(false);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "A", "D", { value: mintPrice });
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: mintPrice });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(mintPrice);
    });

    it("should allow owner to withdrawTo", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: mintPrice });

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
        .to.emit(contract, "MintPriceUpdated")
        .withArgs(newPrice);
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
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", "Desc", { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should reject SVG with <script> tag", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <SCRIPT> tag (case-insensitive)", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with onload handler", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with onerror handler", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><image onerror="alert(1)" /></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with javascript: protocol", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <iframe>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.com"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <foreignObject>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <object>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><object data="evil.swf"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with <embed>", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><embed src="evil.swf"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject SVG with data:text/html URI", async function () {
      const malicious = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<script>alert(1)</script>"/></svg>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "UnsafeSVG");
    });

    it("should reject data that does not start with <svg", async function () {
      const malicious = '<html><body>not svg</body></html>';
      await expect(
        contract.connect(user).mintAgent(ethers.toUtf8Bytes(malicious), testTraitsBytes, "A", "D", { value: mintPrice })
      ).to.be.revertedWith("SVG must start with <svg");
    });

    it("should allow SVG with safe onclick in path data (not an attribute)", async function () {
      // "onclick" inside a text node is not dangerous, only as an attribute
      // But our validator checks for whitespace + "on" + letter + "=", so text content should pass
      const safe = '<svg xmlns="http://www.w3.org/2000/svg"><text>the word onclick is ok here</text></svg>';
      await contract.connect(user).mintAgent(ethers.toUtf8Bytes(safe), testTraitsBytes, "A", "D", { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });
  });

  describe("Security: JSON Escape", function () {
    it("should escape quotes in name for valid tokenURI JSON", async function () {
      const nameWithQuote = 'Agent "Evil"';
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, nameWithQuote, "Desc", { value: mintPrice });

      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      // The key test: JSON.parse must NOT throw — escaped quotes produce valid JSON
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      // After parsing, the value is unescaped back to the original
      expect(json.name).to.equal('Agent "Evil"');
    });

    it("should escape backslashes in description", async function () {
      const descWithBackslash = 'Path: C:\\Users\\test';
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", descWithBackslash, { value: mintPrice });

      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      // After parsing, backslashes are unescaped back to original
      expect(json.description).to.equal('Path: C:\\Users\\test');
    });

    it("should escape newlines in description", async function () {
      const descWithNewline = "Line1\nLine2";
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", descWithNewline, { value: mintPrice });

      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      // Must produce valid JSON (no parse error) — raw newlines would break JSON
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());
      // After parsing, \n is interpreted back to actual newline
      expect(json.description).to.equal("Line1\nLine2");
    });

    it("should handle clean strings without modification", async function () {
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Clean Name", "Clean description", { value: mintPrice });

      const uri = await contract.tokenURI(0);
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());

      expect(json.name).to.equal("Clean Name");
      expect(json.description).to.equal("Clean description");
    });
  });

  describe("Security: Input Limits", function () {
    it("should reject name exceeding 128 bytes", async function () {
      const longName = "A".repeat(129);
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, longName, "D", { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "NameTooLong");
    });

    it("should accept name at exactly 128 bytes", async function () {
      const maxName = "A".repeat(128);
      await contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, maxName, "D", { value: mintPrice });
      expect(await contract.totalSupply()).to.equal(1);
    });

    it("should reject description exceeding 1024 bytes", async function () {
      const longDesc = "B".repeat(1025);
      await expect(
        contract.connect(user).mintAgent(testSVGBytes, testTraitsBytes, "Agent", longDesc, { value: mintPrice })
      ).to.be.revertedWithCustomError(contract, "DescriptionTooLong");
    });

    it("should reject traits exceeding 8KB", async function () {
      const hugeTraits = ethers.toUtf8Bytes("[" + '{"trait_type":"x","value":"' + "y".repeat(200) + '"},'.repeat(50) + "]");
      // Only reject if > 8192 bytes
      if (hugeTraits.length <= 8192) {
        // Make it definitely exceed
        const oversizeTraits = ethers.toUtf8Bytes("x".repeat(8193));
        await expect(
          contract.connect(user).mintAgent(testSVGBytes, oversizeTraits, "Agent", "D", { value: mintPrice })
        ).to.be.revertedWithCustomError(contract, "TraitsTooLarge");
      }
    });
  });
});
