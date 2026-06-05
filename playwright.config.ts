import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm.cmd run server",
      url: "http://localhost:3001/socket.io/socket.io.js",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm.cmd run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
