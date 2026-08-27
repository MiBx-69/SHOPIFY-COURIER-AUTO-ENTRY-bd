import { RedxProvider } from "../src/services/courier/providers";
import type { NormalizedShipment } from "../src/types/domain";

async function run() {
  const provider = new RedxProvider();
  const config = {
    apiToken: "test_token_123",
    environment: "sandbox", // use sandbox url for test
    defaultWeightKg: "1.5",
    defaultInstruction: "Test Instruction"
  };

  const shipment: NormalizedShipment = {
    orderId: "ord-123",
    orderNumber: "1001",
    customerName: "John Doe",
    phone: "01711223344", // valid BD phone
    fullAddress: "Mirpur 10, Dhaka",
    city: "Dhaka",
    area: "Mirpur",
    codAmount: 1200
  };

  // Mock global fetch
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = input.toString();
    console.log("Mock fetch called with URL:", url);
    if (init && init.body) {
      console.log("Payload:", init.body);
    }
    
    if (url.includes("/no-area-parcels/subscribe")) {
      return new Response(JSON.stringify({ isError: false, message: "Subscribed successfully!" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (url.includes("/no-area-parcels")) {
      // simulate parcel creation
      return new Response(JSON.stringify({
        tracking_id: "REDX-TRK-999",
        parcel_id: "REDX-PRC-999"
      }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404 });
  };

  try {
    console.log("--- Testing Subscribe/TestConnection ---");
    await provider.testConnection(config);
    console.log("Subscribe test passed.");

    console.log("\n--- Testing Create Shipment ---");
    const result = await provider.createShipment(shipment, config, "idem-123");
    console.log("Shipment Result:", JSON.stringify(result, null, 2));
    
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    global.fetch = originalFetch;
  }
}

run();
