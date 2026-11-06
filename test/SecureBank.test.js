const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Amounts are SBC cents (2 decimals): 100 = 1.00 SBC
const SBC = (n) => BigInt(Math.round(n * 100));
const AccountStatus = { None: 0n, Active: 1n, Suspended: 2n };
const TxType = { Deposit: 0n, Withdrawal: 1n, Transfer: 2n };
const FIRST_ACCOUNT = 1_000_000_001n;

async function deployFixture() {
  const [admin, alice, bob, charlie, outsider] = await ethers.getSigners();
  const bank = await ethers.deployContract("SecureBank");
  await bank.waitForDeployment();
  return { bank, admin, alice, bob, charlie, outsider };
}

/** Alice (account 1000000001, 500 SBC) and Bob (account 1000000002, 0 SBC) ready to bank. */
async function customersFixture() {
  const ctx = await deployFixture();
  const { bank, alice, bob } = ctx;
  await bank.connect(alice).registerCustomer("Alice");
  await bank.connect(alice).createAccount();
  await bank.connect(bob).registerCustomer("Bob");
  await bank.connect(bob).createAccount();
  await bank.connect(alice).deposit(SBC(500));
  return { ...ctx, aliceAcct: FIRST_ACCOUNT, bobAcct: FIRST_ACCOUNT + 1n };
}

describe("SecureBank", function () {
  describe("Deployment", function () {
    it("sets the deployer as administrator", async function () {
      const { bank, admin } = await loadFixture(deployFixture);
      expect(await bank.admin()).to.equal(admin.address);
    });

    it("starts with empty statistics", async function () {
      const { bank } = await loadFixture(deployFixture);
      const stats = await bank.getStats();
      expect(stats.map((v) => v)).to.deep.equal([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
    });
  });

  describe("Customer registration", function () {
    it("registers a customer and emits CustomerRegistered", async function () {
      const { bank, alice } = await loadFixture(deployFixture);
      await expect(bank.connect(alice).registerCustomer("Alice"))
        .to.emit(bank, "CustomerRegistered")
        .withArgs(alice.address, 1n, "Alice", anyValue);

      const c = await bank.getCustomer(alice.address);
      expect(c.registered).to.equal(true);
      expect(c.customerId).to.equal(1n);
      expect(c.name).to.equal("Alice");
      expect(c.registeredAt).to.be.greaterThan(0n);
    });

    it("assigns sequential customer IDs", async function () {
      const { bank, alice, bob } = await loadFixture(deployFixture);
      await bank.connect(alice).registerCustomer("Alice");
      await bank.connect(bob).registerCustomer("Bob");
      expect((await bank.getCustomer(bob.address)).customerId).to.equal(2n);
    });

    it("rejects duplicate registration", async function () {
      const { bank, alice } = await loadFixture(deployFixture);
      await bank.connect(alice).registerCustomer("Alice");
      await expect(bank.connect(alice).registerCustomer("Alice again")).to.be.revertedWithCustomError(
        bank,
        "AlreadyRegistered"
      );
    });

    it("rejects an empty name", async function () {
      const { bank, alice } = await loadFixture(deployFixture);
      await expect(bank.connect(alice).registerCustomer("")).to.be.revertedWithCustomError(bank, "InvalidName");
    });

    it("rejects a name longer than 64 bytes", async function () {
      const { bank, alice } = await loadFixture(deployFixture);
      await expect(bank.connect(alice).registerCustomer("x".repeat(65))).to.be.revertedWithCustomError(
        bank,
        "InvalidName"
      );
    });

    it("prevents the administrator from registering as a customer", async function () {
      const { bank, admin } = await loadFixture(deployFixture);
      await expect(bank.connect(admin).registerCustomer("Admin")).to.be.revertedWithCustomError(
        bank,
        "AdminCannotBeCustomer"
      );
    });
  });

  describe("Account creation", function () {
    it("creates an active zero-balance account and emits AccountCreated", async function () {
      const { bank, alice } = await loadFixture(deployFixture);
      await bank.connect(alice).registerCustomer("Alice");
      await expect(bank.connect(alice).createAccount())
        .to.emit(bank, "AccountCreated")
        .withArgs(alice.address, FIRST_ACCOUNT, anyValue);

      const a = await bank.getAccount(alice.address);
      expect(a.accountNumber).to.equal(FIRST_ACCOUNT);
      expect(a.status).to.equal(AccountStatus.Active);
      expect(a.balance).to.equal(0n);
      expect(a.createdAt).to.be.greaterThan(0n);
      expect(await bank.accountCount()).to.equal(1n);
    });

    it("rejects account creation by an unregistered customer", async function () {
      const { bank, outsider } = await loadFixture(deployFixture);
      await expect(bank.connect(outsider).createAccount()).to.be.revertedWithCustomError(bank, "NotRegistered");
    });

    it("rejects a duplicate account", async function () {
      const { bank, alice } = await loadFixture(deployFixture);
      await bank.connect(alice).registerCustomer("Alice");
      await bank.connect(alice).createAccount();
      await expect(bank.connect(alice).createAccount()).to.be.revertedWithCustomError(bank, "AccountAlreadyExists");
    });

    it("resolves an account number to its owner", async function () {
      const { bank, bob, bobAcct } = await loadFixture(customersFixture);
      const [owner, name, status] = await bank.lookupAccount(bobAcct);
      expect(owner).to.equal(bob.address);
      expect(name).to.equal("Bob");
      expect(status).to.equal(AccountStatus.Active);
      await expect(bank.lookupAccount(999n)).to.be.revertedWithCustomError(bank, "AccountNotFound");
    });
  });

  describe("Deposit", function () {
    it("increases the balance and emits Deposited", async function () {
      const { bank, bob } = await loadFixture(customersFixture);
      await expect(bank.connect(bob).deposit(SBC(125.5)))
        .to.emit(bank, "Deposited")
        .withArgs(2n, bob.address, SBC(125.5), SBC(125.5), anyValue);
      expect(await bank.connect(bob).getMyBalance()).to.equal(SBC(125.5));
    });

    it("rejects a zero deposit", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).deposit(0)).to.be.revertedWithCustomError(bank, "InvalidAmount");
    });

    it("rejects a deposit above MAX_AMOUNT", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      const max = await bank.MAX_AMOUNT();
      await expect(bank.connect(alice).deposit(max + 1n)).to.be.revertedWithCustomError(bank, "InvalidAmount");
      await expect(bank.connect(alice).deposit(max)).to.not.be.reverted;
    });

    it("rejects a deposit into a suspended (inactive) account", async function () {
      const { bank, admin, alice, aliceAcct } = await loadFixture(customersFixture);
      await bank.connect(admin).suspendAccount(aliceAcct);
      await expect(bank.connect(alice).deposit(SBC(1))).to.be.revertedWithCustomError(bank, "AccountNotActive");
    });

    it("rejects a deposit from an unregistered address", async function () {
      const { bank, outsider } = await loadFixture(customersFixture);
      await expect(bank.connect(outsider).deposit(SBC(1))).to.be.revertedWithCustomError(bank, "NotRegistered");
    });

    it("rejects a deposit from a registered customer without an account", async function () {
      const { bank, charlie } = await loadFixture(customersFixture);
      await bank.connect(charlie).registerCustomer("Charlie");
      await expect(bank.connect(charlie).deposit(SBC(1))).to.be.revertedWithCustomError(bank, "NoAccount");
    });
  });

  describe("Withdrawal", function () {
    it("decreases the balance and emits Withdrawn", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).withdraw(SBC(120)))
        .to.emit(bank, "Withdrawn")
        .withArgs(2n, alice.address, SBC(120), SBC(380), anyValue);
      expect(await bank.connect(alice).getMyBalance()).to.equal(SBC(380));
    });

    it("allows withdrawing the entire balance", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await bank.connect(alice).withdraw(SBC(500));
      expect(await bank.connect(alice).getMyBalance()).to.equal(0n);
    });

    it("rejects insufficient balance with the available and requested amounts", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).withdraw(SBC(500.01)))
        .to.be.revertedWithCustomError(bank, "InsufficientBalance")
        .withArgs(SBC(500), SBC(500.01));
      expect(await bank.connect(alice).getMyBalance()).to.equal(SBC(500));
    });

    it("rejects a zero withdrawal", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).withdraw(0)).to.be.revertedWithCustomError(bank, "InvalidAmount");
    });

    it("rejects a withdrawal from a suspended account", async function () {
      const { bank, admin, alice, aliceAcct } = await loadFixture(customersFixture);
      await bank.connect(admin).suspendAccount(aliceAcct);
      await expect(bank.connect(alice).withdraw(SBC(1))).to.be.revertedWithCustomError(bank, "AccountNotActive");
    });
  });

  describe("Transfer", function () {
    it("moves funds atomically and emits Transferred", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).transfer(bobAcct, SBC(200)))
        .to.emit(bank, "Transferred")
        .withArgs(2n, alice.address, bob.address, SBC(200), anyValue);
      expect(await bank.connect(alice).getMyBalance()).to.equal(SBC(300));
      expect(await bank.connect(bob).getMyBalance()).to.equal(SBC(200));
    });

    it("keeps total holdings constant", async function () {
      const { bank, alice, bobAcct } = await loadFixture(customersFixture);
      const before = await bank.totalHoldings();
      await bank.connect(alice).transfer(bobAcct, SBC(99.99));
      expect(await bank.totalHoldings()).to.equal(before);
    });

    it("rejects insufficient balance", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).transfer(bobAcct, SBC(501)))
        .to.be.revertedWithCustomError(bank, "InsufficientBalance")
        .withArgs(SBC(500), SBC(501));
      expect(await bank.connect(bob).getMyBalance()).to.equal(0n);
    });

    it("rejects a non-existent recipient account", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).transfer(FIRST_ACCOUNT + 99n, SBC(1))).to.be.revertedWithCustomError(
        bank,
        "InvalidRecipient"
      );
    });

    it("rejects a zero transfer", async function () {
      const { bank, alice, bobAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).transfer(bobAcct, 0)).to.be.revertedWithCustomError(bank, "InvalidAmount");
    });

    it("rejects a self-transfer", async function () {
      const { bank, alice, aliceAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).transfer(aliceAcct, SBC(1))).to.be.revertedWithCustomError(
        bank,
        "SelfTransfer"
      );
    });

    it("rejects a transfer from a suspended sender account", async function () {
      const { bank, admin, alice, aliceAcct, bobAcct } = await loadFixture(customersFixture);
      await bank.connect(admin).suspendAccount(aliceAcct);
      await expect(bank.connect(alice).transfer(bobAcct, SBC(1))).to.be.revertedWithCustomError(
        bank,
        "AccountNotActive"
      );
    });

    it("rejects a transfer to a suspended recipient account", async function () {
      const { bank, admin, alice, bobAcct } = await loadFixture(customersFixture);
      await bank.connect(admin).suspendAccount(bobAcct);
      await expect(bank.connect(alice).transfer(bobAcct, SBC(1))).to.be.revertedWithCustomError(
        bank,
        "RecipientAccountNotActive"
      );
    });

    it("rejects a transfer from an unregistered sender", async function () {
      const { bank, outsider, bobAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(outsider).transfer(bobAcct, SBC(1))).to.be.revertedWithCustomError(
        bank,
        "NotRegistered"
      );
    });
  });

  describe("Administration", function () {
    it("lets the admin suspend and reactivate an account", async function () {
      const { bank, admin, alice, aliceAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(admin).suspendAccount(aliceAcct))
        .to.emit(bank, "AccountStatusChanged")
        .withArgs(aliceAcct, AccountStatus.Suspended, admin.address);
      expect((await bank.getAccount(alice.address)).status).to.equal(AccountStatus.Suspended);

      await expect(bank.connect(admin).reactivateAccount(aliceAcct))
        .to.emit(bank, "AccountStatusChanged")
        .withArgs(aliceAcct, AccountStatus.Active, admin.address);
      await expect(bank.connect(alice).deposit(SBC(1))).to.not.be.reverted;
    });

    it("preserves the balance while an account is suspended", async function () {
      const { bank, admin, alice, aliceAcct } = await loadFixture(customersFixture);
      await bank.connect(admin).suspendAccount(aliceAcct);
      expect((await bank.getAccount(alice.address)).balance).to.equal(SBC(500));
    });

    it("rejects a status change that does nothing", async function () {
      const { bank, admin, aliceAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(admin).reactivateAccount(aliceAcct)).to.be.revertedWithCustomError(
        bank,
        "StatusUnchanged"
      );
    });

    it("rejects a status change for an unknown account", async function () {
      const { bank, admin } = await loadFixture(customersFixture);
      await expect(bank.connect(admin).suspendAccount(123n)).to.be.revertedWithCustomError(bank, "AccountNotFound");
    });

    it("blocks ordinary users from admin write functions", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).suspendAccount(bobAcct)).to.be.revertedWithCustomError(bank, "NotAdmin");
      await expect(bank.connect(bob).reactivateAccount(bobAcct)).to.be.revertedWithCustomError(bank, "NotAdmin");
    });

    it("blocks ordinary users from admin views", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).getCustomerAddresses(0, 10)).to.be.revertedWithCustomError(bank, "NotAdmin");
      await expect(bank.connect(alice).getAllTransactions(0, 10)).to.be.revertedWithCustomError(bank, "NotAdmin");
    });

    it("lets the admin list customers with pagination", async function () {
      const { bank, admin, alice, bob } = await loadFixture(customersFixture);
      expect(await bank.connect(admin).getCustomerAddresses(0, 10)).to.deep.equal([alice.address, bob.address]);
      expect(await bank.connect(admin).getCustomerAddresses(1, 10)).to.deep.equal([bob.address]);
      expect(await bank.connect(admin).getCustomerAddresses(5, 10)).to.deep.equal([]);
    });

    it("reports accurate aggregate statistics", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      await bank.connect(alice).transfer(bobAcct, SBC(100));
      await bank.connect(bob).withdraw(SBC(40));
      const [customers, accounts, txs, deposits, withdrawals, transfers, volume, holdings] = await bank.getStats();
      expect([customers, accounts, txs, deposits, withdrawals, transfers]).to.deep.equal([2n, 2n, 3n, 1n, 1n, 1n]);
      expect(volume).to.equal(SBC(500 + 100 + 40));
      expect(holdings).to.equal(SBC(460));
    });
  });

  describe("Transaction history and records", function () {
    it("assigns sequential transaction IDs across all customers", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      await bank.connect(alice).transfer(bobAcct, SBC(10)); // id 2
      await bank.connect(bob).withdraw(SBC(5)); // id 3
      expect(await bank.getTransactionCount()).to.equal(3n);
      const t3 = await bank.connect(bob).getTransaction(3);
      expect(t3.id).to.equal(3n);
      expect(t3.txType).to.equal(TxType.Withdrawal);
    });

    it("stores complete, correct transaction records", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      const tx = await bank.connect(alice).transfer(bobAcct, SBC(42));
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const rec = await bank.connect(alice).getTransaction(2);
      expect(rec.txType).to.equal(TxType.Transfer);
      expect(rec.from).to.equal(alice.address);
      expect(rec.to).to.equal(bob.address);
      expect(rec.amount).to.equal(SBC(42));
      expect(rec.blockNumber).to.equal(BigInt(receipt.blockNumber));
      expect(rec.timestamp).to.equal(BigInt(block.timestamp));
    });

    it("records deposits with a zero sender and withdrawals with a zero recipient", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await bank.connect(alice).withdraw(SBC(1));
      const dep = await bank.connect(alice).getTransaction(1);
      const wd = await bank.connect(alice).getTransaction(2);
      expect(dep.from).to.equal(ethers.ZeroAddress);
      expect(dep.to).to.equal(alice.address);
      expect(wd.from).to.equal(alice.address);
      expect(wd.to).to.equal(ethers.ZeroAddress);
    });

    it("returns each customer's history newest first, including both sides of a transfer", async function () {
      const { bank, alice, bob, bobAcct } = await loadFixture(customersFixture);
      await bank.connect(alice).transfer(bobAcct, SBC(10)); // id 2
      await bank.connect(alice).withdraw(SBC(1)); // id 3

      const aliceHistory = await bank.connect(alice).getMyTransactions(0, 10);
      expect(aliceHistory.map((t) => t.id)).to.deep.equal([3n, 2n, 1n]);
      const bobHistory = await bank.connect(bob).getMyTransactions(0, 10);
      expect(bobHistory.map((t) => t.id)).to.deep.equal([2n]);
      expect(await bank.connect(alice).getMyTransactionCount()).to.equal(3n);
    });

    it("paginates a customer's history", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      for (let i = 0; i < 4; i++) await bank.connect(alice).deposit(SBC(1)); // ids 2..5
      const page = await bank.connect(alice).getMyTransactions(1, 2);
      expect(page.map((t) => t.id)).to.deep.equal([4n, 3n]);
    });

    it("lets the admin read all transactions newest first", async function () {
      const { bank, admin, alice, bobAcct } = await loadFixture(customersFixture);
      await bank.connect(alice).transfer(bobAcct, SBC(1));
      const all = await bank.connect(admin).getAllTransactions(0, 10);
      expect(all.map((t) => t.id)).to.deep.equal([2n, 1n]);
    });

    it("hides a transaction from unrelated customers", async function () {
      const { bank, charlie } = await loadFixture(customersFixture);
      await expect(bank.connect(charlie).getTransaction(1)).to.be.revertedWithCustomError(
        bank,
        "NotAuthorizedForTransaction"
      );
    });

    it("rejects unknown transaction IDs", async function () {
      const { bank, admin } = await loadFixture(customersFixture);
      await expect(bank.connect(admin).getTransaction(0)).to.be.revertedWithCustomError(bank, "TransactionNotFound");
      await expect(bank.connect(admin).getTransaction(99)).to.be.revertedWithCustomError(bank, "TransactionNotFound");
    });

    it("does not record a transaction when an operation reverts", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      await expect(bank.connect(alice).withdraw(SBC(10_000))).to.be.reverted;
      expect(await bank.getTransactionCount()).to.equal(1n);
    });

    it("emits events whose txId matches the stored record", async function () {
      const { bank, alice } = await loadFixture(customersFixture);
      const receipt = await (await bank.connect(alice).withdraw(SBC(3))).wait();
      const event = receipt.logs.map((l) => bank.interface.parseLog(l)).find((e) => e && e.name === "Withdrawn");
      const rec = await bank.connect(alice).getTransaction(event.args.txId);
      expect(rec.amount).to.equal(SBC(3));
    });
  });

  describe("Balance inquiry", function () {
    it("requires registration and an account", async function () {
      const { bank, outsider, charlie } = await loadFixture(customersFixture);
      await expect(bank.connect(outsider).getMyBalance()).to.be.revertedWithCustomError(bank, "NotRegistered");
      await bank.connect(charlie).registerCustomer("Charlie");
      await expect(bank.connect(charlie).getMyBalance()).to.be.revertedWithCustomError(bank, "NoAccount");
    });
  });
});
