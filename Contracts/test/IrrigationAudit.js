const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("IrrigationAudit", function () {
  it("emits Log on log() with correct args", async function () {
    const [signer] = await ethers.getSigners();
    const IrrigationAudit = await ethers.getContractFactory("IrrigationAudit");
    const c = await IrrigationAudit.deploy();
    await c.waitForDeployment();

    const zone = "zone-A";
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("snapshot"));

    await expect(c.log(dataHash, zone))
      .to.emit(c, "Log")
      .withArgs(dataHash, zone, anyValue, signer.address);
  });
});
