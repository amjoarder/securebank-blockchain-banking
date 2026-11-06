# SecureBank

A blockchain banking prototype built with Solidity, Hardhat, React and ethers.js. Customers can register, open accounts, deposit, withdraw, transfer credits, inspect transaction history and print receipts. An administrator can inspect activity and suspend or reactivate accounts.

This is an educational local demo. Balances use simulated SecureBank Credits (SBC), and transaction fees use local test ETH. No real money is involved.

## Requirements

- Node.js 22.12 or newer and npm.
- Windows 10/11 for the complete benchmark suite, whose resource sampler uses PowerShell.
- Available local ports: 5303 (web app), 8603 (demo blockchain), 8613 (benchmark blockchain).

Install Node.js separately; portable runtimes and dependencies are excluded from this repository.

## Run locally

```sh
git clone https://github.com/amjoarder/securebank-blockchain-banking.git
cd securebank-blockchain-banking
npm run setup
npm run demo
```

Open **http://localhost:5303**. The demo starts the local blockchain, deploys the contract, seeds customers, builds the frontend and starts the web server. Press **Ctrl+C** to stop the processes it started.

On Windows, `a3.cmd` is an optional npm-script launcher. For example, use `.\a3.cmd demo` in PowerShell.

## Demo accounts

Use the account menu in the app; no wallet setup is required.

| Account | Role |
|---|---|
| Administrator | Contract administrator |
| Alice Rahman, Bob Hossain, Charlie Ahmed | Seeded customers |
| Diana Karim, Ethan Islam | New customers for registration |

The app uses unlocked Hardhat development accounts. Optional MetaMask mode connects to the same local chain (chain ID 31303). These accounts must never hold real assets.

## Commands

| Command | Purpose |
|---|---|
| `npm run setup` | Install root and frontend dependencies and compile Solidity |
| `npm run demo` | Start the complete demo |
| `npm test` | Run contract tests |
| `npm run build` | Build the React frontend |
| `npm run blockchain` | Start only the demo blockchain |
| `npm run deploy` | Deploy to the running demo blockchain and refresh the ABI |
| `npm run seed` | Seed demo customers and transactions |
| `npm run reset` | Reset, redeploy and reseed the demo chain |
| `npm run frontend` | Build and serve the frontend |
| `npm run status` | Inspect project ports and processes |
| `npm run stop` | Stop processes recorded by this project |
| `npm run test:gas` | Run contract tests with gas reporting |
| `npm run benchmark` | Generate performance measurements on a separate temporary chain |
| `npm run charts` | Regenerate charts from existing benchmark output |

The Performance page starts empty. Run `npm run benchmark` to generate its data and downloadable evidence files. Deployment records, benchmark results, compiled artifacts and frontend build output are generated locally and excluded from Git.

## Source layout

- `contracts/`: SecureBank Solidity contract.
- `frontend/`: React source, bundled contract ABI, fonts and other required assets.
- `config/`: Local network settings and demo account names.
- `scripts/`: Deployment, demo, web server, process management and benchmarking.
- `test/`: Smart-contract tests.
- `hardhat.config.js`: Solidity compiler and network configuration.

The bundled ABI supports frontend builds before deployment. Deployment refreshes it from the compiled contract. Reports, videos, screenshots, assignment documents, local runtimes and historical output are excluded.

## Troubleshooting

- Node.js missing: install Node.js, reopen the terminal and retry setup.
- Contract unavailable: run `npm run demo`, or run `npm run reset` with the demo chain already running.
- Port busy: use `npm run status` and close the process using that port, or adjust `config/network.json`.
- Frontend changed: rebuild with `npm run build`. The demo uses a production build served by Node.js.

This prototype is unaudited and intended for a private local development chain. Blockchain storage is public; access restrictions on contract methods do not make stored information confidential.
