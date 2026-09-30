import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG, loadConfig, saveConfig, resetConfig, configPath, isEnabled } from '../src/jev-config.js';

test('T14: configPath points to ~/.jev/config.json', () => {
  const p = configPath();
  assert.ok(p.endsWith(path.join('.jev', 'config.json')));
});

test('T14: loadConfig returns defaults when no file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jevcfg-'));
  process.env.JEV_CONFIG_DIR = dir;
  const cfg = loadConfig();
  assert.equal(cfg.hooks['jev-rule-guard'].enabled, true);
  assert.equal(cfg.hooks['jev-rule-guard'].confidence_threshold, 0.80);
  assert.equal(cfg.skills['jev-explore'].batch_size, 20);
  delete process.env.JEV_CONFIG_DIR;
});

test('T14: saveConfig persists merged config and can be reloaded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jevcfg-'));
  process.env.JEV_CONFIG_DIR = dir;
  const saved = saveConfig({ hooks: { 'jev-rule-guard': { confidence_threshold: 0.60 } } });
  assert.equal(saved.hooks['jev-rule-guard'].confidence_threshold, 0.60);
  // non-touched keys keep defaults
  assert.equal(saved.skills['jev-review'].confidence_threshold, 0.50);
  // reload
  const loaded = loadConfig();
  assert.equal(loaded.hooks['jev-rule-guard'].confidence_threshold, 0.60);
  delete process.env.JEV_CONFIG_DIR;
});

test('T14: resetConfig restores defaults on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jevcfg-'));
  process.env.JEV_CONFIG_DIR = dir;
  saveConfig({ hooks: { 'jev-skill-picker': { enabled: false } } });
  resetConfig();
  const loaded = loadConfig();
  assert.equal(loaded.hooks['jev-skill-picker'].enabled, true);
  delete process.env.JEV_CONFIG_DIR;
});

test('T14: isEnabled reads flag for hook/skill', () => {
  const cfg = loadConfig();
  assert.equal(isEnabled(cfg, 'hooks', 'jev-rule-guard'), true);
  assert.equal(isEnabled(cfg, 'skills', 'jev-discover'), true);
  assert.equal(isEnabled(cfg, 'hooks', 'nonexistent'), undefined || false);
});

test('T14: corrupt config falls back to defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jevcfg-'));
  process.env.JEV_CONFIG_DIR = dir;
  fs.writeFileSync(path.join(dir, 'config.json'), '{ not valid json', 'utf-8');
  const cfg = loadConfig();
  assert.equal(cfg.hooks['jev-rule-guard'].enabled, true);
  delete process.env.JEV_CONFIG_DIR;
});