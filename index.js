const fs = require("fs");
const ethers = require("ethers");
const axios = require("axios");

// Load private keys langsung dari file .env
let privateKeys;
try {
  privateKeys = fs.readFileSync(".env", "utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#")); // Abaikan baris kosong & komentar
} catch (err) {
  console.error("❌ Gagal membaca file .env:", err.message);
  process.exit(1);
}

if (privateKeys.length === 0) {
  console.error("❌ Tidak ada private key ditemukan di .env");
  process.exit(1);
}

// Load proxies (opsional)
let proxies = [];
try {
  proxies = fs.readFileSync("proxies.txt", "utf-8")
    .split("\n")
    .map(p => p.trim())
    .filter(Boolean);
} catch (e) {
  console.log("⚠️ Tidak ada file proxy, lanjut tanpa proxy.");
}

async function getProxyAgent(proxy) {
  const { HttpsProxyAgent } = require("https-proxy-agent");
  return new HttpsProxyAgent("http://" + proxy);
}

async function claimFaucet(wallet, proxy) {
  try {
    const address = await wallet.getAddress();
    console.log(`[➤] Wallet: ${address}`);

    const payload = {
      address,
      signature: await wallet.signMessage(address),
    };

    const loginRes = await axios({
      method: "POST",
      url: "https://faucet.pharos.shuttleone.network/api/claim/login",
      data: payload,
      ...(proxy && { httpsAgent: await getProxyAgent(proxy) }),
    });

    const jwt = loginRes.data.token;

    await axios({
      method: "POST",
      url: "https://faucet.pharos.shuttleone.network/api/claim/claim",
      headers: { Authorization: `Bearer ${jwt}` },
      ...(proxy && { httpsAgent: await getProxyAgent(proxy) }),
    });

    console.log("[✓] Faucet berhasil diklaim.\n");

  } catch (err) {
    console.error("[!] Gagal klaim faucet:", err.response?.data || err.message);
  }
}

async function performCheckIn(wallet, proxy) {
  try {
    const address = await wallet.getAddress();

    const payload = {
      address,
      signature: await wallet.signMessage(address),
    };

    const loginRes = await axios({
      method: "POST",
      url: "https://pharos.shuttleone.network/api/auth/login",
      data: payload,
      ...(proxy && { httpsAgent: await getProxyAgent(proxy) }),
    });

    const token = loginRes.data.token;

    await axios({
      method: "POST",
      url: "https://pharos.shuttleone.network/api/quest/checkin",
      headers: { Authorization: `Bearer ${token}` },
      ...(proxy && { httpsAgent: await getProxyAgent(proxy) }),
    });

    console.log("[✓] Check-in berhasil.\n");

  } catch (err) {
    console.error("[!] Gagal check-in:", err.response?.data || err.message);
  }
}

async function countdown(minutes) {
  let secs = minutes * 60;
  while (secs > 0) {
   process.stdout.write(`\r⏳ Menunggu ${Math.floor(secs / 3600)}j ${Math.floor((secs % 3600) / 60)}m ${secs % 60}s... `);
    await new Promise(res => setTimeout(res, 1000));
    secs--;
  }
  console.log("\n");
}

(async () => {
  const provider = new ethers.providers.JsonRpcProvider("https://rpc.pharos.shuttleone.network");

  while (true) {
    for (let i = 0; i < privateKeys.length; i++) {
      const proxy = proxies[i % proxies.length] || null;
      if (proxy) console.log(`[✓] Menggunakan proxy: ${proxy}`);

      const wallet = new ethers.Wallet(privateKeys[i], provider);

      await claimFaucet(wallet, proxy);
      await performCheckIn(wallet, proxy);
    }

    console.log("⏲️ Semua wallet selesai. Menunggu 24 jam...\n");
    await countdown(24 * 60); // 24 jam
  }
})();
