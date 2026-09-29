import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProviderConfig } from '../src/providers.js';
import { PROVIDERS } from '../src/types.js';

test('T3: resolveProviderConfig returns mock when JEV_MOCK_MODE=1', () => {
  const orig = process.env.JEV_MOCK_MODE;
  process.env.JEV_MOCK_MODE = '1';
  const config = resolveProviderConfig();
  assert.equal(config.provider, PROVIDERS.MOCK);
  process.env.JEV_MOCK_MODE = orig;
});

test('T3: resolveProviderConfig detects custom gateway URL', () => {
  const config = resolveProviderConfig({ gatewayUrl: 'https://my-gateway.workers.dev/v1' });
  assert.equal(config.provider, PROVIDERS.VERCEL);
  assert.equal(config.endpoint, 'https://my-gateway.workers.dev/v1');
});

test('T3: resolveProviderConfig defaults to TypeSafe Direct', () => {
  const orig = process.env.JEV_MOCK_MODE;
  delete process.env.JEV_MOCK_MODE;
  const config = resolveProviderConfig({ apiKey: 'sk-test' });
  assert.equal(config.provider, PROVIDERS.TYPESAFE);
  assert.equal(config.endpoint, 'https://api.typesafe.ai/v1/systemone');
  process.env.JEV_MOCK_MODE = orig;
});
