// ─────────────────────────────────────────────────────────────────────────────
//  Sentient Singularity — Bridge Server v2
//  Mock mode: full simulated auction with countdown + outbid + auction end
//  Live mode: polls Base Sepolia via Infura eth_getLogs every 8s
//
//  Usage:
//    $env:MOCK="1"; node server.js                          (mock — 30s auction, bid every 4s)
//    $env:MOCK="1"; $env:MOCK_DURATION="120"; node server.js (mock — 2min auction)
//    $env:MOCK="0"; $env:INFURA_KEY="xxx"; $env:AUCTION_ADDRESS="0x..."; node server.js
// ─────────────────────────────────────────────────────────────────────────────

const http      = require('http');
const https     = require('https');
const WebSocket = require('ws');

const MOCK              = process.env.MOCK !== '0';
const WS_PORT           = 3131;
const POLL_MS           = 8000;
const MOCK_BID_MS       = 4000;                        // bid every 4s in mock
const MOCK_AUCTION_SECS = parseInt(process.env.MOCK_DURATION) || 30; // default 30s
const RPC_URL           = process.env.RPC_URL
  || 'https://base-sepolia.infura.io/v3/' + (process.env.INFURA_KEY || '81be0c858a5f4612a7edbfb27935d707');
const AUCTION_ADDR      = (process.env.AUCTION_ADDRESS || '').toLowerCase();
const NEW_BID_TOPIC     = '0x3fab86a1207bdcfe3976d0d9df25f263d45ae8d7f8a0a663e17f21e4eb24c1c2';

let lastBlock        = 'latest';
let bidCount         = 0;
let currentTopBidder = null;
const clients        = new Set();

const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('listening', () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Sentient Singularity Bridge v2         ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`WS      : ws://localhost:${WS_PORT}`);
  console.log(`Mode    : ${MOCK ? `MOCK (${MOCK_AUCTION_SECS}s auction, bid every ${MOCK_BID_MS/1000}s)` : 'LIVE (Base Sepolia)'}`);
  if(!MOCK){
    console.log(`RPC     : ${RPC_URL.replace(/\/v3\/.+/, '/v3/***')}`);
    console.log(`Contract: ${AUCTION_ADDR || 'NOT SET — add $env:AUCTION_ADDRESS'}`);
  }
  console.log('\nAnimation shortcuts: B=bid  O=outbid  T=countdown  H=HUD\n');
});

wss.on('connection', ws => {
  clients.add(ws);
  console.log(`[Bridge] Client connected (${clients.size} total)`);
  ws.send(JSON.stringify({ type:'STATE', bidCount }));
  ws.on('close', () => { clients.delete(ws); console.log(`[Bridge] Client left (${clients.size} remaining)`); });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  let n = 0;
  for(const ws of clients) if(ws.readyState === WebSocket.OPEN){ ws.send(data); n++; }
  return n;
}

// ── RPC ───────────────────────────────────────────────────────────────────────
function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc:'2.0', id:1, method, params });
    const url  = new URL(RPC_URL);
    const lib  = url.protocol === 'https:' ? https : http;
    const req  = lib.request({
      hostname: url.hostname, path: url.pathname+url.search, method:'POST',
      headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    }, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(e);} });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function decodeNewBid(log) {
  try {
    const bidder  = '0x' + log.topics[1].slice(26);
    const data    = log.data.slice(2);
    const weiAmt  = BigInt('0x' + data.slice(64, 128));
    return { bidder, amount: (Number(weiAmt)/1e18).toFixed(4), tokenId: BigInt('0x'+data.slice(0,64)).toString() };
  } catch(e) { return null; }
}

async function pollBids() {
  if(!AUCTION_ADDR) return;
  try {
    const blockRes = await rpcCall('eth_blockNumber', []);
    const cur = blockRes.result;
    const logsRes = await rpcCall('eth_getLogs', [{
      fromBlock: lastBlock==='latest'?cur:lastBlock, toBlock:'latest',
      address: AUCTION_ADDR, topics: [NEW_BID_TOPIC]
    }]);
    if(logsRes.error){ console.error('[Bridge] RPC:', logsRes.error.message); return; }
    for(const log of (logsRes.result||[])){
      const bid = decodeNewBid(log); if(!bid) continue;
      bidCount++;
      const prev = currentTopBidder;
      currentTopBidder = bid.bidder;
      console.log(`[Bridge] BID #${bidCount} — ${bid.amount} ETH from ${bid.bidder.slice(0,10)}…`);
      broadcast({ type:'BID', bidCount, wallet:bid.bidder, amount:bid.amount, tokenId:bid.tokenId, previousBidder:prev });
      if(prev && prev.toLowerCase()!==bid.bidder.toLowerCase())
        broadcast({ type:'OUTBID', wallet:prev });
    }
    if((logsRes.result||[]).length>0){
      const l=logsRes.result[logsRes.result.length-1];
      lastBlock='0x'+(parseInt(l.blockNumber,16)+1).toString(16);
    } else lastBlock=cur;
  } catch(e) { console.error('[Bridge] Poll error:', e.message); }
}

// ── Mock Auction ──────────────────────────────────────────────────────────────
const MOCK_WALLETS = [
  '0xA1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0',
  '0xDeAdBeEf0000111122223333444455556666777788',
  '0x1234567890abcdef1234567890abcdef12345678',
  '0xCafe0000Babe1111Face2222Dead3333Beef4444',
  '0x0000111122223333444455556666777788889999',
  '0xFFFF0000FFFF1111FFFF2222FFFF3333FFFF4444',
  '0xc0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
  '0x7E57C0DE0000000000000000000000000000000E',
];
const MOCK_AMOUNTS = [0.10, 0.25, 0.15, 0.50, 0.33, 0.75, 0.20, 1.00];
let mockIdx = 0, mockSecondsLeft = MOCK_AUCTION_SECS, auctionEnded = false;

function sendMockBid() {
  if(auctionEnded) return;
  const wallet = MOCK_WALLETS[mockIdx % MOCK_WALLETS.length];
  const amount = MOCK_AMOUNTS[mockIdx % MOCK_AMOUNTS.length].toFixed(2);
  const prev   = currentTopBidder;
  bidCount++; mockIdx++;
  currentTopBidder = wallet;
  console.log(`[Bridge] MOCK BID #${bidCount} — ${amount} ETH from ${wallet.slice(0,10)}…`);
  broadcast({ type:'BID', bidCount, wallet, amount, tokenId:'1', previousBidder:prev });
  // After bid 3: outbid fires on alternating bids for drama
  if(prev && prev.toLowerCase()!==wallet.toLowerCase() && bidCount>3 && mockIdx%2===0){
    console.log(`[Bridge] MOCK OUTBID — ${prev.slice(0,10)}… imploding`);
    broadcast({ type:'OUTBID', wallet:prev });
  }
}

function startMockAuction() {
  console.log(`[Bridge] Mock auction: ${MOCK_AUCTION_SECS}s | First bid in 3s | Bids every ${MOCK_BID_MS/1000}s\n`);
  // First bid after 3s, then every MOCK_BID_MS
  setTimeout(()=>{
    sendMockBid();
    const t = setInterval(()=>{ if(auctionEnded){clearInterval(t);return;} sendMockBid(); }, MOCK_BID_MS);
  }, 3000);

  // Countdown — tick every second
  const tick = setInterval(()=>{
    if(auctionEnded){ clearInterval(tick); return; }
    mockSecondsLeft--;
    // Broadcast every 10s and final 30s every second
    if(mockSecondsLeft%10===0 || mockSecondsLeft<=30)
      broadcast({ type:'TICK', secondsLeft:mockSecondsLeft });
    if(mockSecondsLeft<=30 && mockSecondsLeft>0)
      process.stdout.write(`\r[Bridge] ⏱  ${mockSecondsLeft}s remaining   `);
    if(mockSecondsLeft<=0){
      auctionEnded=true; clearInterval(tick);
      console.log(`\n[Bridge] ⚡ AUCTION ENDED — winner: ${(currentTopBidder||'none').slice(0,12)}…`);
      broadcast({ type:'AUCTION_END', winner:currentTopBidder, finalBidCount:bidCount });
    }
  }, 1000);

  // Broadcast initial TICK so animation shows countdown immediately
  broadcast({ type:'TICK', secondsLeft:mockSecondsLeft });
}

if(MOCK){ startMockAuction(); }
else { pollBids(); setInterval(pollBids, POLL_MS); }

process.on('SIGINT', ()=>{ console.log('\n[Bridge] Shutting down…'); wss.close(()=>process.exit(0)); });

