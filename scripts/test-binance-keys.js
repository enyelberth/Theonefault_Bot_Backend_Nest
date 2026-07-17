const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const hosts = [
  { name: 'TESTNET', base: 'https://testnet.binance.vision' },
  { name: 'PROD',    base: 'https://api.binance.com' },
];

const KEY_A = process.env.BINANCE_API_KEY || '';
const SECRET_A = process.env.BINANCE_API_SECRET || '';
const KEY_B = process.env.BINANCE_API_KEY2 || '';
const SECRET_B = process.env.BINANCE_API_SECRET2 || '';

const pairs = [
  { label: 'KEY(A) + SECRET(A)',  key: KEY_A, secret: SECRET_A },
  { label: 'KEY(A) + SECRET(B/2)', key: KEY_A, secret: SECRET_B },
  { label: 'KEY(B/2) + SECRET(A)', key: KEY_B, secret: SECRET_A },
  { label: 'KEY(B/2) + SECRET(B/2)', key: KEY_B, secret: SECRET_B },
];

const agent = new https.Agent({ rejectUnauthorized: false });

function sign(secret, qs) {
  return crypto.createHmac('sha256', secret).update(qs).digest('hex');
}

async function getServerTime(base) {
  const url = `${base}/api/v3/time`;
  return new Promise((resolve, reject) => {
    https.get(url, { agent }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j.serverTime);
        } catch (e) {
          reject(new Error(`serverTime parse: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function tryAccount(base, key, secret) {
  const t = await getServerTime(base);
  const qs = `timestamp=${t}&recvWindow=60000`;
  const sig = sign(secret, qs);
  const url = `${base}/api/v3/account?${qs}&signature=${sig}`;
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { agent, headers: { 'X-MBX-APIKEY': key } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 200); }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
  });
}

(async () => {
  console.log('KEY_A       :', KEY_A.slice(0, 10) + '...' + (KEY_A ? '(set)' : '(empty)'));
  console.log('SECRET_A    :', SECRET_A ? '(set)' : '(empty)');
  console.log('KEY_B (KEY2):', KEY_B.slice(0, 10) + '...' + (KEY_B ? '(set)' : '(empty)'));
  console.log('SECRET_B(2) :', SECRET_B ? '(set)' : '(empty)');
  console.log();

  for (const h of hosts) {
    console.log(`=== ${h.name}  (${h.base}) ===`);
    for (const p of pairs) {
      if (!p.key || !p.secret) {
        console.log(`  SKIP ${p.label} (missing)`);
        continue;
      }
      const r = await tryAccount(h.base, p.key, p.secret);
      const ok = r.status === 200;
      const code = r.body && r.body.code;
      const msg = r.body && r.body.msg;
      console.log(
        `  [${ok ? 'OK ' : 'FAIL'}] ${p.label} -> status=${r.status} code=${code ?? '-'} msg=${msg ?? '-'}`,
      );
    }
    console.log();
  }
})();
