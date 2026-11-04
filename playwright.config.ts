import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Claude Code runs commands with CLAUDECODE=1: there each test is one dot
  // and only failures print in full, so a run doesn't flood its context.
  // Vitest already switches to its minimal reporter on its own.
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : process.env.CLAUDECODE
      ? "dot"
      : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Every test starts as a device that already saw the welcome screen;
    // e2e/welcome.spec.ts opts out to cover the first use.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [{ name: "lista:welcome-seen", value: "e2e" }],
        },
      ],
    },
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
