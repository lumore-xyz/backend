declare global {
  namespace NodeJS {
    NODE_ENV: "development" | "production";
    PORT: string;
    MONGODB_URI: string;
  }
}

export {};
