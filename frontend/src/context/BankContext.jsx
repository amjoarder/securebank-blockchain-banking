import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, VoidSigner, getAddress, toBeHex } from "ethers";
import { bankContract, createRpcProvider, loadRuntime } from "../lib/chain";

const BankContext = createContext(null);
const POLL_MS = 2000;
const STORAGE_KEY = "a3.securebank.activeAccount";

const storage = {
  get: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: selection just is not remembered */
    }
  },
};

/**
 * status:
 *   loading | config-error | node-offline | wrong-network | not-deployed | ready
 * walletMode:
 *   demo      — unlocked local Hardhat accounts via JSON-RPC (default, zero configuration)
 *   metamask  — optional browser wallet
 */
export function BankProvider({ children }) {
  const providerRef = useRef(null);
  const [runtime, setRuntime] = useState(null);
  const [status, setStatus] = useState("loading");
  const [blockNumber, setBlockNumber] = useState(null);
  const [demoAccounts, setDemoAccounts] = useState([]);
  const [walletMode, setWalletMode] = useState("demo");
  const [demoAddress, setDemoAddress] = useState(() => storage.get(STORAGE_KEY));
  const [metaMask, setMetaMask] = useState({ address: null, chainId: null });
  const [adminAddress, setAdminAddress] = useState(null);
  const [profile, setProfile] = useState({ loaded: false });

  const network = runtime?.network;
  const deployment = runtime?.deployment;
  const contractAddress = status === "ready" ? deployment?.address : null;
  const activeAddress = walletMode === "metamask" ? metaMask.address : demoAddress;

  // ─── Health check: runtime config → node reachable → right chain → contract deployed ───
  const check = useCallback(async () => {
    let rt;
    try {
      rt = await loadRuntime();
    } catch {
      setStatus("config-error");
      return;
    }
    setRuntime((prev) =>
      prev && prev.deployment?.address === rt.deployment?.address && prev.deployment?.deployedAt === rt.deployment?.deployedAt
        ? prev
        : rt
    );
    if (!providerRef.current) providerRef.current = createRpcProvider(rt.network.chainId);
    const provider = providerRef.current;

    try {
      const chainId = Number(await provider.send("eth_chainId", []));
      if (chainId !== rt.network.chainId) return setStatus("wrong-network");
      setBlockNumber(Number(await provider.send("eth_blockNumber", [])));
      if (!rt.deployment || (await provider.getCode(rt.deployment.address)) === "0x") return setStatus("not-deployed");

      const accounts = await provider.send("eth_accounts", []);
      setDemoAccounts((prev) =>
        prev.length
          ? prev
          : rt.demo.accounts.map((a) => ({ ...a, address: getAddress(accounts[a.index]) }))
      );
      setStatus("ready");
    } catch {
      setStatus("node-offline");
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  // Default demo selection: remembered account if still valid, otherwise the first seeded customer.
  useEffect(() => {
    if (!demoAccounts.length) return;
    if (!demoAccounts.some((a) => a.address === demoAddress)) {
      setDemoAddress(demoAccounts.find((a) => a.seeded)?.address ?? demoAccounts[0].address);
    }
  }, [demoAccounts, demoAddress]);

  const readContract = useMemo(
    () => (contractAddress ? bankContract(contractAddress, providerRef.current) : null),
    [contractAddress]
  );

  /** Contract bound to a read-only signer so view functions see msg.sender = active account. */
  const viewContract = useMemo(
    () =>
      contractAddress && activeAddress
        ? bankContract(contractAddress, new VoidSigner(activeAddress, providerRef.current))
        : null,
    [contractAddress, activeAddress]
  );

  useEffect(() => {
    if (!readContract) return setAdminAddress(null);
    readContract.admin().then(setAdminAddress, () => setAdminAddress(null));
  }, [readContract]);

  // ─── Profile of the active account, refreshed on every new block ───
  const refreshProfile = useCallback(async () => {
    if (!readContract || !activeAddress) return setProfile({ loaded: false });
    try {
      const [customer, account] = await Promise.all([
        readContract.getCustomer(activeAddress),
        readContract.getAccount(activeAddress),
      ]);
      setProfile({
        loaded: true,
        address: activeAddress,
        registered: customer.registered,
        customerId: customer.customerId,
        name: customer.name,
        registeredAt: Number(customer.registeredAt),
        hasAccount: Number(account.status) !== 0,
        accountNumber: account.accountNumber,
        accountStatus: Number(account.status),
        createdAt: Number(account.createdAt),
        balance: account.balance,
      });
    } catch {
      setProfile({ loaded: false });
    }
  }, [readContract, activeAddress]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile, blockNumber]);

  // ─── Wallets ───
  const selectDemoAccount = useCallback((address) => {
    setWalletMode("demo");
    setDemoAddress(address);
    storage.set(STORAGE_KEY, address);
  }, []);

  const connectMetaMask = useCallback(async () => {
    if (!window.ethereum) throw new Error("MetaMask was not detected in this browser.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainId = Number(await window.ethereum.request({ method: "eth_chainId" }));
    setMetaMask({ address: getAddress(accounts[0]), chainId });
    setWalletMode("metamask");
  }, []);

  const disconnectMetaMask = useCallback(() => setWalletMode("demo"), []);

  useEffect(() => {
    if (walletMode !== "metamask" || !window.ethereum) return;
    const onAccounts = (accs) =>
      accs.length ? setMetaMask((m) => ({ ...m, address: getAddress(accs[0]) })) : setWalletMode("demo");
    const onChain = (id) => setMetaMask((m) => ({ ...m, chainId: Number(id) }));
    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged", onChain);
    };
  }, [walletMode]);

  /** Only runs when the user clicks the button — never changes MetaMask settings on its own. */
  const switchMetaMaskNetwork = useCallback(async () => {
    const chainIdHex = toBeHex(network.chainId);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (err) {
      if (err?.code !== 4902) throw err;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: network.networkName,
            rpcUrls: [`http://${network.rpcHost}:${network.rpcPort}`],
            nativeCurrency: { name: "Local Test Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    }
  }, [network]);

  const walletIssue =
    walletMode === "metamask" && network && metaMask.chainId !== network.chainId ? "metamask-wrong-network" : null;

  /** Signer used for state-changing transactions. */
  const getSigner = useCallback(async () => {
    if (walletMode === "metamask") return new BrowserProvider(window.ethereum).getSigner();
    if (!activeAddress) throw new Error("Select a demo account first.");
    return providerRef.current.getSigner(activeAddress);
  }, [walletMode, activeAddress]);

  const getWriteContract = useCallback(async () => bankContract(contractAddress, await getSigner()), [contractAddress, getSigner]);

  const activeDemoAccount = demoAccounts.find((a) => a.address === activeAddress);
  const isAdmin = Boolean(activeAddress && adminAddress && activeAddress === adminAddress);
  // Never expose the previous account's data while the newly selected account is still loading.
  const currentProfile = profile.address === activeAddress ? profile : { loaded: false };

  const value = {
    status,
    network,
    deployment,
    contractAddress,
    blockNumber,
    provider: providerRef.current,
    readContract,
    viewContract,
    getWriteContract,
    walletMode,
    walletIssue,
    demoAccounts,
    activeAddress,
    activeLabel: walletMode === "metamask" ? "MetaMask account" : activeDemoAccount?.name,
    selectDemoAccount,
    metaMask,
    connectMetaMask,
    disconnectMetaMask,
    switchMetaMaskNetwork,
    adminAddress,
    isAdmin,
    profile: currentProfile,
    refreshProfile,
    recheck: check,
    labelFor: (address) => demoAccounts.find((a) => a.address === address)?.name,
  };

  return <BankContext.Provider value={value}>{children}</BankContext.Provider>;
}

export function useBank() {
  const ctx = useContext(BankContext);
  if (!ctx) throw new Error("useBank must be used inside <BankProvider>");
  return ctx;
}
