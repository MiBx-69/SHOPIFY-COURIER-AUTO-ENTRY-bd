export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { setGlobalDispatcher, Agent } = await import("undici");
      setGlobalDispatcher(
        new Agent({
          keepAliveTimeout: 10_000,
          keepAliveMaxTimeout: 30_000,
          headersTimeout: 15_000,
          bodyTimeout: 30_000,
          connect: {
            timeout: 10_000
          }
        })
      );
    } catch (err) {
      console.warn("Could not set global undici dispatcher:", err);
    }
  }
}
