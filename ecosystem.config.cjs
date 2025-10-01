module.exports = {
  apps: [
    {
      name: "backend",
      script: "npm",
      args: "start",
      env: {
        PORT: 5000,
        NODE_ENV: "production",
      },
    },
  ],
};
