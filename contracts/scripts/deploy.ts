import { ethers } from "hardhat";

async function main() {
  const mintPrice = ethers.parseEther("0.0001");
  const royaltyFee = 500; // 5% in basis points

  const [deployer] = await ethers.getSigners();

  console.log("Deploying BOOA...");
  console.log("Deployer:", deployer.address);
  console.log("Mint price:", ethers.formatEther(mintPrice), "ETH");
  console.log("Royalty:", royaltyFee / 100, "%");

  const factory = await ethers.getContractFactory("BOOA");
  const contract = await factory.deploy(mintPrice, deployer.address, royaltyFee);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("BOOA deployed to:", address);
  console.log("\nUpdate your .env with:");
  console.log(`NEXT_PUBLIC_BOOA_NFT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
