import { defineConfig, devices } from '@playwright/test';

/** Responsive targets from handoff §5 — the same journey must work at every size. */
const sizes = [
  { name: 'phone-360x800', viewport: { width: 360, height: 800 }, touch: true },
  { name: 'phone-393x852', viewport: { width: 393, height: 852 }, touch: true },
  { name: 'tablet-768x1024', viewport: { width: 768, height: 1024 }, touch: true },
  { name: 'laptop-1366x768', viewport: { width: 1366, height: 768 }, touch: false },
  { name: 'desktop-1920x1080', viewport: { width: 1920, height: 1080 }, touch: false },
];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: sizes.map((s) => ({
    name: s.name,
    use: {
      ...devices['Desktop Chrome'],
      viewport: s.viewport,
      hasTouch: s.touch,
      isMobile: false,
    },
  })),
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
