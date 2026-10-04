import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initializeCronJobs } from "./services/cron.service.js";
import socketService from "./services/socket.service.js";

const startServer = async () => {
  await connectDB();

  const httpServer = createServer(app);
  socketService.initialize(httpServer);
  initializeCronJobs();

  const port = process.env.PORT || 5000;
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${port}`);
  });

  return httpServer;
};

await startServer();
