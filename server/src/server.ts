import "dotenv/config";
import app from "./app";
import { connectDatabase } from "./config/database";
import dns from "dns";

// Set the DNS server to use for resolving hostnames
dns.setServers(["1.1.1.1","8.8.8.8"]);

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();