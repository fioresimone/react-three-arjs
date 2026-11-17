import { expect, test } from '@playwright/test';

test('finds the Hiro marker in a still image', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/image');
  await expect(page.getByTestId('marker-state')).toHaveText('Marker found', { timeout: 30_000 });
  await expect(page.getByTestId('error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('places GPS content with a simulated position', async ({ page }) => {
  await page.goto('/#/location');
  await expect(page.getByText('GPS 45.46420, 9.19000')).toBeVisible();
});
