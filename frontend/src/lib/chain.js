import { Contract, JsonRpcProvider, Network, ZeroAddress } from "ethers";
import abi from "../generated/SecureBank.abi.json";

export const ABI = abi;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

/** Network config, demo account roster and the current deployment record (null if never deployed). */
export async function loadRuntime() {
  const [network, demo, deployment] = await Promise.all([
    fetchJson("/runtime/network.json"),
    fetchJson("/runtime/demo-accounts.json"),
    fetchJson("/runtime/deployment.json"),
  ]);
  if (!network || !demo) throw new Error("Runtime configuration is unavailable. Is `a3 demo` running?");
  return { network, demo, deployment };
}

/** Read provider for the Assignment 3 node, proxied same-origin through /rpc. */
export function createRpcProvider(chainId) {
  return new JsonRpcProvider(`${window.location.origin}/rpc`, Network.from(chainId), {
    staticNetwork: true,
    pollingInterval: 250,
    batchMaxCount: 1,
    batchStallTime: 0,
  });
}

export const bankContract = (address, runner) => new Contract(address, ABI, runner);

/** Map application transaction ID → blockchain transaction hash, using the contract's events. */
export async function fetchTxHashes(contract, fromBlock, account) {
  const f = contract.filters;
  const queries = account
    ? [f.Deposited(null, account), f.Withdrawn(null, account), f.Transferred(null, account), f.Transferred(null, null, account)]
    : [f.Deposited(), f.Withdrawn(), f.Transferred()];
  const results = await Promise.all(queries.map((q) => contract.queryFilter(q, fromBlock ?? 0)));
  const map = new Map();
  for (const log of results.flat()) map.set(log.args.txId.toString(), log.transactionHash);
  return map;
}

/** Normalises the Solidity Transaction struct into a plain object. */
export function toTxRecord(t) {
  return {
    id: t.id.toString(),
    txType: Number(t.txType),
    timestamp: Number(t.timestamp),
    blockNumber: Number(t.blockNumber),
    from: t.from === ZeroAddress ? null : t.from,
    to: t.to === ZeroAddress ? null : t.to,
    amount: t.amount,
  };
}
