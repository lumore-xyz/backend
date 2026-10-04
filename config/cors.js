const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://10.0.2.2:5000",
  "https://lumore.xyz",
  "https://www.lumore.xyz",
];

const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  ...defaultAllowedOrigins,
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()),
].filter(Boolean));

export const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);

    try {
      const parsed = new URL(origin);
      if (parsed.protocol === "https:" && parsed.hostname.endsWith(".lumore.xyz")) {
        return callback(null, true);
      }
    } catch {
      // Reject malformed origins below.
    }
    console.warn(`[cors] Blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  credentials: true,
  optionsSuccessStatus: 204,
};
