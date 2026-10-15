import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PROVIDERS } from './types.js';

function getClaudeSettingsKey() {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return data?.env?.TYPESAFE_API_KEY || data?.env?.JEV_API_KEY || '';
    }
  } catch {
    // ignore
  }
  return '';
}

// JEV API key from ~/.jev/config.json (dashboard Settings) as a fallback
// when no env var is set. Fail-silent.
function getConfigKey() {
  try {
    const cfgPath = path.join(os.homedir(), '.jev', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      return data?.jev?.api_key || '';
    }
  } catch {
    // ignore
  }
  return '';
}

export function envKey() {
  return process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY || getConfigKey() || getClaudeSettingsKey();
}

export function resolveProviderConfig(options = {}) {
  // If explicitly mock or JEV_MOCK_MODE is enabled
  if (options.provider === PROVIDERS.MOCK || process.env.JEV_MOCK_MODE === '1' || process.env.JEV_MOCK_MODE === 'true') {
    return {
      provider: PROVIDERS.MOCK,
      endpoint: null,
      apiKey: 'mock-key',
      timeoutMs: options.timeoutMs || 1500
    };
  }

  // Explicit provider choice
  const explicitProvider = options.provider || process.env.JEV_PROVIDER;
  if (explicitProvider) {
    if (explicitProvider === PROVIDERS.OPENROUTER) {
      return {
        provider: PROVIDERS.OPENROUTER,
        endpoint: 'https://openrouter.ai/api/v1/systemone',
        apiKey: options.apiKey || process.env.OPENROUTER_API_KEY || '',
        timeoutMs: options.timeoutMs || 1500
      };
    }
    if (explicitProvider === PROVIDERS.VERCEL) {
      return {
        provider: PROVIDERS.VERCEL,
        endpoint: options.gatewayUrl || process.env.JEV_GATEWAY_URL || 'https://gateway.ai.cloudflare.com/v1/typesafe/systemone',
apiKey: options.apiKey || process.env.VERCEL_AI_GATEWAY_TOKEN || envKey() || '',
        timeoutMs: options.timeoutMs || 1500
      };
    }
    if (explicitProvider === PROVIDERS.TYPESAFE) {
      return {
        provider: PROVIDERS.TYPESAFE,
        endpoint: 'https://api.typesafe.ai/v1/systemone',
        apiKey: options.apiKey || envKey() || '',
        timeoutMs: options.timeoutMs || 1500
      };
    }
  }

  // 1. Gateway URL detection
  const gatewayUrl = options.gatewayUrl || process.env.JEV_GATEWAY_URL;
  if (gatewayUrl) {
    return {
      provider: PROVIDERS.VERCEL,
      endpoint: gatewayUrl,
      apiKey: options.apiKey || process.env.VERCEL_AI_GATEWAY_TOKEN || process.env.JEV_API_KEY || '',
      timeoutMs: options.timeoutMs || 1500
    };
  }

  // 2. Direct TYPESAFE_API_KEY or JEV_API_KEY (or from ~/.claude/settings.json)
  const typeSafeKey = options.apiKey || envKey();
  if (typeSafeKey) {
    return {
      provider: PROVIDERS.TYPESAFE,
      endpoint: 'https://api.typesafe.ai/v1/systemone',
      apiKey: typeSafeKey,
      timeoutMs: options.timeoutMs || 2500
    };
  }

  // 3. Fallback to OpenRouter if key is present
  if (process.env.OPENROUTER_API_KEY && !options.apiKey) {
    return {
      provider: PROVIDERS.OPENROUTER,
      endpoint: 'https://openrouter.ai/api/v1/systemone',
      apiKey: process.env.OPENROUTER_API_KEY,
      timeoutMs: options.timeoutMs || 1500
    };
  }

  // Default to TypeSafe
  return {
    provider: PROVIDERS.TYPESAFE,
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    apiKey: options.apiKey || '',
    timeoutMs: options.timeoutMs || 1500
  };
}
