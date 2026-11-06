// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title SecureBank
 * @notice Educational blockchain banking ledger for MSc Assignment 3.
 *         Balances are held in "SBC — SecureBank Credits", a simulated unit
 *         stored in cents (2 decimals: 1 SBC = 100 units). No real money is involved.
 * @dev The contract is the authoritative enforcement layer: every rule
 *      (registration, balances, status, admin rights) is checked here, not in the UI.
 *      The contract never sends Ether or calls other contracts, so there is no
 *      re-entrancy surface.
 */
contract SecureBank {
    // ─────────────────────────────── Types ───────────────────────────────

    enum AccountStatus {
        None, // account does not exist
        Active,
        Suspended
    }

    enum TxType {
        Deposit,
        Withdrawal,
        Transfer
    }

    struct Customer {
        uint64 customerId;
        uint64 registeredAt;
        bool registered;
        string name;
    }

    struct Account {
        uint64 accountNumber;
        uint64 createdAt;
        AccountStatus status;
        uint256 balance; // SBC cents
    }

    /// @dev Packed into 4 storage slots to keep write costs low.
    struct Transaction {
        uint64 id;
        TxType txType;
        uint64 timestamp;
        uint64 blockNumber;
        address from; // address(0) for deposits (cash in)
        address to; // address(0) for withdrawals (cash out)
        uint256 amount; // SBC cents
    }

    // ───────────────────────────── Constants ─────────────────────────────

    uint256 public constant MAX_NAME_LENGTH = 64;
    /// @notice Largest single operation: 1,000,000.00 SBC.
    uint256 public constant MAX_AMOUNT = 100_000_000;
    /// @notice Account numbers start after this base (first account = 1000000001).
    uint64 public constant ACCOUNT_NUMBER_BASE = 1_000_000_000;

    // ─────────────────────────────── State ───────────────────────────────

    address public immutable admin;

    mapping(address => Customer) private customers;
    address[] private customerList;

    mapping(address => Account) private accounts;
    mapping(uint64 => address) private accountOwner; // accountNumber => owner
    uint64 public accountCount;

    Transaction[] private transactions; // transaction id N is stored at index N-1
    mapping(address => uint64[]) private customerTxIds;

    uint64 public depositCount;
    uint64 public withdrawalCount;
    uint64 public transferCount;
    uint256 public totalVolume; // sum of all transaction amounts
    uint256 public totalHoldings; // sum of all customer balances currently held

    // ─────────────────────────────── Events ──────────────────────────────

    event CustomerRegistered(address indexed wallet, uint64 indexed customerId, string name, uint256 timestamp);
    event AccountCreated(address indexed owner, uint64 indexed accountNumber, uint256 timestamp);
    event Deposited(uint64 indexed txId, address indexed account, uint256 amount, uint256 newBalance, uint256 timestamp);
    event Withdrawn(uint64 indexed txId, address indexed account, uint256 amount, uint256 newBalance, uint256 timestamp);
    event Transferred(uint64 indexed txId, address indexed from, address indexed to, uint256 amount, uint256 timestamp);
    event AccountStatusChanged(uint64 indexed accountNumber, AccountStatus status, address indexed changedBy);

    // ─────────────────────────────── Errors ──────────────────────────────

    error NotAdmin();
    error AdminCannotBeCustomer();
    error AlreadyRegistered();
    error NotRegistered();
    error InvalidName();
    error AccountAlreadyExists();
    error NoAccount();
    error AccountNotActive();
    error InvalidAmount();
    error InsufficientBalance(uint256 available, uint256 requested);
    error InvalidRecipient();
    error RecipientAccountNotActive();
    error SelfTransfer();
    error AccountNotFound();
    error StatusUnchanged();
    error TransactionNotFound();
    error NotAuthorizedForTransaction();

    // ────────────────────────────── Modifiers ────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyRegistered() {
        if (!customers[msg.sender].registered) revert NotRegistered();
        _;
    }

    /// @dev Caller must be registered AND own an active account.
    modifier onlyActiveAccount() {
        if (!customers[msg.sender].registered) revert NotRegistered();
        AccountStatus status = accounts[msg.sender].status;
        if (status == AccountStatus.None) revert NoAccount();
        if (status != AccountStatus.Active) revert AccountNotActive();
        _;
    }

    modifier validAmount(uint256 amount) {
        if (amount == 0 || amount > MAX_AMOUNT) revert InvalidAmount();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────── Customer & account setup ────────────────────

    /// @notice Register the caller's wallet address as a bank customer.
    function registerCustomer(string calldata name) external {
        if (msg.sender == admin) revert AdminCannotBeCustomer();
        if (customers[msg.sender].registered) revert AlreadyRegistered();
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_NAME_LENGTH) revert InvalidName();

        uint64 customerId = uint64(customerList.length + 1);
        customers[msg.sender] = Customer({
            customerId: customerId,
            registeredAt: uint64(block.timestamp),
            registered: true,
            name: name
        });
        customerList.push(msg.sender);

        emit CustomerRegistered(msg.sender, customerId, name, block.timestamp);
    }

    /// @notice Open the caller's (single) banking account with a zero balance.
    function createAccount() external onlyRegistered {
        if (accounts[msg.sender].status != AccountStatus.None) revert AccountAlreadyExists();

        accountCount += 1;
        uint64 accountNumber = ACCOUNT_NUMBER_BASE + accountCount;
        accounts[msg.sender] = Account({
            accountNumber: accountNumber,
            createdAt: uint64(block.timestamp),
            status: AccountStatus.Active,
            balance: 0
        });
        accountOwner[accountNumber] = msg.sender;

        emit AccountCreated(msg.sender, accountNumber, block.timestamp);
    }

    // ───────────────────────── Banking operations ────────────────────────

    /// @notice Deposit simulated SBC credits (cash in) into the caller's account.
    function deposit(uint256 amount) external onlyActiveAccount validAmount(amount) {
        Account storage acct = accounts[msg.sender];
        acct.balance += amount;
        totalHoldings += amount;
        depositCount += 1;

        uint64 txId = _record(TxType.Deposit, address(0), msg.sender, amount);
        emit Deposited(txId, msg.sender, amount, acct.balance, block.timestamp);
    }

    /// @notice Withdraw SBC credits (cash out) from the caller's account.
    function withdraw(uint256 amount) external onlyActiveAccount validAmount(amount) {
        Account storage acct = accounts[msg.sender];
        if (acct.balance < amount) revert InsufficientBalance(acct.balance, amount);

        acct.balance -= amount;
        totalHoldings -= amount;
        withdrawalCount += 1;

        uint64 txId = _record(TxType.Withdrawal, msg.sender, address(0), amount);
        emit Withdrawn(txId, msg.sender, amount, acct.balance, block.timestamp);
    }

    /// @notice Transfer SBC credits from the caller's account to another customer's account.
    /// @param toAccountNumber The recipient's bank account number (e.g. 1000000002).
    function transfer(uint64 toAccountNumber, uint256 amount) external onlyActiveAccount validAmount(amount) {
        address recipient = accountOwner[toAccountNumber];
        if (recipient == address(0)) revert InvalidRecipient();
        if (recipient == msg.sender) revert SelfTransfer();
        if (accounts[recipient].status != AccountStatus.Active) revert RecipientAccountNotActive();

        Account storage sender = accounts[msg.sender];
        if (sender.balance < amount) revert InsufficientBalance(sender.balance, amount);

        // Both balance updates happen in one transaction: either both succeed or the whole call reverts.
        sender.balance -= amount;
        accounts[recipient].balance += amount;
        transferCount += 1;

        uint64 txId = _record(TxType.Transfer, msg.sender, recipient, amount);
        emit Transferred(txId, msg.sender, recipient, amount, block.timestamp);
    }

    // ─────────────────────────── Administration ──────────────────────────

    function suspendAccount(uint64 accountNumber) external onlyAdmin {
        _setStatus(accountNumber, AccountStatus.Suspended);
    }

    function reactivateAccount(uint64 accountNumber) external onlyAdmin {
        _setStatus(accountNumber, AccountStatus.Active);
    }

    // ─────────────────────────── Customer views ──────────────────────────

    function getCustomer(address wallet) external view returns (Customer memory) {
        return customers[wallet];
    }

    function getAccount(address wallet) external view returns (Account memory) {
        return accounts[wallet];
    }

    /// @notice Balance inquiry for the caller's own account.
    function getMyBalance() external view onlyRegistered returns (uint256) {
        if (accounts[msg.sender].status == AccountStatus.None) revert NoAccount();
        return accounts[msg.sender].balance;
    }

    /// @notice Resolve an account number to its owner and customer name (used to confirm a transfer recipient).
    function lookupAccount(uint64 accountNumber)
        external
        view
        returns (address owner, string memory name, AccountStatus status)
    {
        owner = accountOwner[accountNumber];
        if (owner == address(0)) revert AccountNotFound();
        return (owner, customers[owner].name, accounts[owner].status);
    }

    function getMyTransactionCount() external view returns (uint256) {
        return customerTxIds[msg.sender].length;
    }

    /// @notice The caller's transaction history, newest first, paginated.
    function getMyTransactions(uint256 offset, uint256 limit) external view returns (Transaction[] memory) {
        return _pageNewestFirst(customerTxIds[msg.sender], offset, limit);
    }

    /// @notice A single transaction; only its sender, recipient or the admin may read it.
    function getTransaction(uint64 txId) external view returns (Transaction memory txn) {
        if (txId == 0 || txId > transactions.length) revert TransactionNotFound();
        txn = transactions[txId - 1];
        if (msg.sender != admin && msg.sender != txn.from && msg.sender != txn.to) {
            revert NotAuthorizedForTransaction();
        }
    }

    // ──────────────────────────── Admin views ────────────────────────────

    function getStats()
        external
        view
        returns (
            uint256 customerCount,
            uint256 accountTotal,
            uint256 transactionCount,
            uint256 deposits,
            uint256 withdrawals,
            uint256 transfers,
            uint256 volume,
            uint256 bankHoldings
        )
    {
        return (
            customerList.length,
            accountCount,
            transactions.length,
            depositCount,
            withdrawalCount,
            transferCount,
            totalVolume,
            totalHoldings
        );
    }

    function getCustomerAddresses(uint256 offset, uint256 limit) external view onlyAdmin returns (address[] memory page) {
        uint256 end = _pageEnd(customerList.length, offset, limit);
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = customerList[i];
        }
    }

    /// @notice All transactions, newest first, paginated.
    function getAllTransactions(uint256 offset, uint256 limit) external view onlyAdmin returns (Transaction[] memory page) {
        uint256 total = transactions.length;
        uint256 end = _pageEnd(total, offset, limit);
        page = new Transaction[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = transactions[total - 1 - i];
        }
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _record(TxType txType, address from, address to, uint256 amount) private returns (uint64 txId) {
        txId = uint64(transactions.length + 1);
        transactions.push(
            Transaction({
                id: txId,
                txType: txType,
                timestamp: uint64(block.timestamp),
                blockNumber: uint64(block.number),
                from: from,
                to: to,
                amount: amount
            })
        );
        if (from != address(0)) customerTxIds[from].push(txId);
        if (to != address(0)) customerTxIds[to].push(txId);
        totalVolume += amount;
    }

    function _setStatus(uint64 accountNumber, AccountStatus newStatus) private {
        address owner = accountOwner[accountNumber];
        if (owner == address(0)) revert AccountNotFound();
        Account storage acct = accounts[owner];
        if (acct.status == newStatus) revert StatusUnchanged();
        acct.status = newStatus;
        emit AccountStatusChanged(accountNumber, newStatus, msg.sender);
    }

    function _pageEnd(uint256 total, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (offset >= total) return offset; // empty page
        uint256 end = offset + limit;
        return end > total ? total : end;
    }

    function _pageNewestFirst(uint64[] storage ids, uint256 offset, uint256 limit)
        private
        view
        returns (Transaction[] memory page)
    {
        uint256 total = ids.length;
        uint256 end = _pageEnd(total, offset, limit);
        page = new Transaction[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = transactions[ids[total - 1 - i] - 1];
        }
    }
}
