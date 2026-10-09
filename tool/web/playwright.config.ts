import { defineConfig } from '@playwright/test';
import path from 'node:path';
const data = path.resolve('.e2e-data');
const env = {
  YMGA_WORKSPACE_DATA_DIR: path.join(data, 'workspaces'),
  YMGA_LICENSE_STORE_DIR: path.join(data, 'licenses'),
  YMGA_LICENSE_SECRET: 'fictional-e2e-secret',
  YMGA_LICENSE_ADMIN_USERNAME: 'admin',
  YMGA_LICENSE_ADMIN_PASSWORD: 'fictional-admin',
  YMGA_CLEAR_WORKSPACES_ON_STARTUP: 'false',
};
export default defineConfig({
  testDir: './e2e', expect: { timeout: 30_000 }, timeout: 120_000, workers: 1, fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: [
    { command: '../server/.venv/bin/python -m uvicorn app.main:app --app-dir ../server --host 127.0.0.1 --port 8001', url: 'http://127.0.0.1:8001/api/admin/settings/features', env, reuseExistingServer: false, timeout: 120_000 },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:8001' }, reuseExistingServer: false },
  ],
});
