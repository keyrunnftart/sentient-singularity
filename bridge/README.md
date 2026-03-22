# Sentient Singularity — Bridge

WebSocket bridge between the Base Sepolia auction contract and the animation.

---

## Quick Start — Test with Mock Bids (no contract needed)

```powershell
cd bridge
npm install
$env:MOCK="1"; node server.js
```

Open the animation at `http://localhost:3000` — a mock bid fires every 12 seconds.
Watch the HUD: bid count climbs, new mini black holes appear.
Press **B** in the animation at any time to fire an instant test bid manually.

---

## Live Mode — Real Auction on Base Sepolia

### Step 1 — Deploy the auction contract via rare-cli

```powershell
# Install rare-cli if not already installed
npm install -g @rareprotocol/rare-cli

# Deploy ERC-721 + auction on Base Sepolia (gas = 0)
rare-cli deploy --network base-sepolia --name "Sentient Singularity" --symbol "SS"
```

Copy the contract address from the output.

### Step 2 — Set environment variables

```powershell
$env:MOCK="0"
$env:INFURA_KEY="your_infura_key_here"
$env:AUCTION_ADDRESS="0xYourContractAddress"
node server.js
```

Or create a `.env` file:
```
MOCK=0
INFURA_KEY=your_infura_key_here
AUCTION_ADDRESS=0xYourContractAddress
```

### Step 3 — Start the animation

```powershell
cd ..
npx serve .
# Open http://localhost:3000
```

---

## How It Works

```
Base Sepolia Auction Contract
  ↓ eth_getLogs — NewBid events polled every 8s via Infura
Node.js Bridge (ws://localhost:3131)
  ↓ BID event → browser
Animation (index.html)
  ↓ New mini BH spawned (5% smaller, orbit 80 units wider)
  ↓ Memory spike (proportional to ETH amount, 8s decay)
  ↓ Tunnel hue shift (unique per bidder wallet hash)
  ↓ Cosmic era advances every 3 bids
  ↓ Color cycle speeds up to 1 min when 8 BHs reached
```

---

## Environment Variables

| Variable          | Default      | Description                        |
|-------------------|--------------|------------------------------------|
| `MOCK`            | `1`          | `1` = mock bids, `0` = live chain  |
| `INFURA_KEY`      | —            | Your Infura project key            |
| `AUCTION_ADDRESS` | —            | Deployed auction contract address  |
| `RPC_URL`         | Infura Base Sepolia | Full RPC URL override       |

---

## Keyboard Shortcuts (in animation)

| Key | Action                        |
|-----|-------------------------------|
| `B` | Fire instant test bid         |
| `H` | Toggle HUD overlay on/off     |
