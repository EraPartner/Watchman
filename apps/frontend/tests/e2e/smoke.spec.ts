import { test, expect } from '@playwright/test';

test('app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toBeAttached();
  await expect(page).toHaveTitle(/watchman/i);
});
