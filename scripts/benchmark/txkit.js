/**
 * Low-level transaction helpers for the benchmark.
 *
 * JSON-RPC calls go through a minimal fetch-based client (HTTP keep-alive). ethers.js is used only to
 * ABI-encode calls and sign transactions locally, as a real wallet would. (ethers' JsonRpcProvider was
 * measured adding ~15 ms of request-scheduling delay per call on Windows, which would have distorted
 * latency figures — see docs/DEV_NOTES.md.)
 *
 * Nonces are managed explicitly per account, so parallel senders never collide.
 *
 * Timing points (performance.now(), sub-millisecond resolution):
 *   tPrep    before gas estimation and signing
 *   tSubmit  immediately before eth_sendRawTransaction
 *   tConfirm when eth_getTransactionReceipt first returns the mined receipt
 *
 *   prepMs     = tSubmit  − tPrep     (client-side preparation)
 *   latencyMs  = tConfirm − tSubmit   (submission → confirmed receipt: the reported transaction latency)
 */
const { HDNodeWallet } = require("ethers");

// Hardhat's public, well-known development mnemonic. These keys only control local test ETH.
const HARDHAT_DEV_MNEMONIC = "test test test test test test test test test test test junk";

class RpcClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
  }

  async call(method, params = []) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    const body = await res.json();
    if (body.error) {
      const err = new Error(`${method}: ${body.error.message}`);
      err.data = body.error.data;
      throw err;
    }
    return body.result;
  }
}

function deriveWallets(count) {
  const root = HDNodeWallet.fromPhrase(HARDHAT_DEV_MNEMONIC, undefined, "m/44'/60'/0'/0");
  return Array.from({ length: count }, (_, i) => root.deriveChild(i));
}

class NonceBook {
  constructor(rpc) {
    this.rpc = rpc;
    this.next = new Map();
  }
  async take(address) {
    if (!this.next.has(address)) this.next.set(address, Number(await this.rpc.call("eth_getTransactionCount", [address, "pending"])));
    const n = this.next.get(address);
    this.next.set(address, n + 1);
    return n;
  }
}

async function waitReceipt(rpc, hash, pollMs = 2) {
  for (;;) {
    const r = await rpc.call("eth_getTransactionReceipt", [hash]);
    if (r) return r;
    await new Promise((res) => setTimeout(res, pollMs));
  }
}

function parseReceipt(r) {
  const gasUsed = BigInt(r.gasUsed);
  const gasPrice = BigInt(r.effectiveGasPrice);
  return {
    hash: r.transactionHash,
    status: Number(r.status),
    blockNumber: Number(r.blockNumber),
    gasUsed,
    gasPrice,
    costWei: gasUsed * gasPrice,
    contractAddress: r.contractAddress,
  };
}

/** Builds and signs a contract call (or a deployment when `to` is omitted). Estimates gas unless given. */
async function signTx(rpc, wallet, { to, data, nonce, gasLimit, fees, chainId }) {
  const gas =
    gasLimit ?? BigInt(await rpc.call("eth_estimateGas", [{ from: wallet.address, ...(to ? { to } : {}), data }]));
  return wallet.signTransaction({
    type: 2,
    chainId,
    nonce,
    to,
    data,
    gasLimit: gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });
}

/** Prepare → sign → submit → wait for receipt, with timings. */
async function measuredSend(rpc, wallet, tx) {
  const tPrep = performance.now();
  const signed = await signTx(rpc, wallet, tx);
  const startedAt = Date.now();
  const tSubmit = performance.now();
  const hash = await rpc.call("eth_sendRawTransaction", [signed]);
  const receipt = parseReceipt(await waitReceipt(rpc, hash));
  const tConfirm = performance.now();
  return {
    ...receipt,
    startedAt,
    prepMs: tSubmit - tPrep,
    latencyMs: tConfirm - tSubmit,
    endToEndMs: tConfirm - tPrep,
  };
}

/** Submit an already-signed transaction and wait for its receipt. */
async function submitSigned(rpc, signed) {
  const tSubmit = performance.now();
  const hash = await rpc.call("eth_sendRawTransaction", [signed]);
  const receipt = parseReceipt(await waitReceipt(rpc, hash));
  return { ...receipt, latencyMs: performance.now() - tSubmit };
}


module.exports = { HARDHAT_DEV_MNEMONIC, RpcClient, deriveWallets, NonceBook, waitReceipt, parseReceipt, signTx, measuredSend, submitSigned };
