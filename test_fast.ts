import https from "node:https";

const agent = new https.Agent({
  lookup: (hostname, options, callback) => {
    if (hostname === "ytzwqtrtoxntxuectfis.supabase.co") {
      // Return the healthy, fast Cloudflare IP 104.18.38.10
      return callback(null, "104.18.38.10", 4);
    }
    const dns = require("node:dns");
    return dns.lookup(hostname, options, callback);
  }
});

async function testFastLookup() {
  console.log("Testing fetch with custom DNS lookup...");
  const t0 = Date.now();
  try {
    const res = await fetch("https://ytzwqtrtoxntxuectfis.supabase.co/auth/v1/health", {
      // @ts-ignore
      dispatcher: undefined,
      headers: { "apikey": process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "" }
    });
    console.log("Native fetch status:", res.status, `in ${Date.now() - t0}ms`);
  } catch (e: any) {
    console.error("Native fetch error:", e.message, `in ${Date.now() - t0}ms`);
  }
}

testFastLookup();
