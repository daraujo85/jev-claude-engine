#!/usr/bin/env node
/**
 * Installer & Configurator for JEV Hooks and Skills in Claude Code
 * Safely updates ~/.claude/settings.json and ~/.claude/skills/
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');

const PROJECT_DIR = '/Users/diegoaraujo/Documents/projects/jev-claude-engine';
const API_KEY = 'apikey_2222c29a1c601b834735b4aee35077bca6c1_8723740f5d7753ba3bb77ce2169978fff66cfb8ae484650d9e899b510679bc63';

function install() {
  console.log('🔧 [JEV INSTALLER]: Configurando hooks e skills no Claude Code...');

  if (!fs.existsSync(SETTINGS_FILE)) {
    console.error(`Erro: Arquivo ${SETTINGS_FILE} não encontrado.`);
    process.exit(1);
  }

  // Backup settings
  const backupFile = `${SETTINGS_FILE}.bak-${Date.now()}`;
  fs.copyFileSync(SETTINGS_FILE, backupFile);
  console.log(`📦 Backup criado em: ${backupFile}`);

  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));

  // 1. Configure environment variables
  settings.env = settings.env || {};
  settings.env.TYPESAFE_API_KEY = API_KEY;
  settings.env.JEV_API_KEY = API_KEY;
  console.log('🔑 Chaves TYPESAFE_API_KEY e JEV_API_KEY injetadas no env do Claude Code.');

  // 2. Configure Hooks
  settings.hooks = settings.hooks || {};

  // Remove boltcontext from PostToolUse
  if (Array.isArray(settings.hooks.PostToolUse)) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(entry => {
      const isBolt = (entry.hooks || []).some(h => (h.command || '').includes('boltcontext'));
      return !isBolt;
    });
    console.log('🗑️  Hook do BoltContext removido com sucesso de PostToolUse.');
  }

  // Add JEV Rule Guard in PreToolUse
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
  const hasRuleGuard = settings.hooks.PreToolUse.some(e =>
    (e.hooks || []).some(h => (h.command || '').includes('jev-rule-guard'))
  );
  if (!hasRuleGuard) {
    settings.hooks.PreToolUse.push({
      matcher: 'FileEdit|FileWrite|Write|Edit|replace_file_content|write_to_file',
      hooks: [
        {
          type: 'command',
          command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-rule-guard.js')}`
        }
      ]
    });
    console.log('🛡️  Hook JEV Anti-Hallucination Guard adicionado em PreToolUse.');
  }

  // Add JEV Test Verifier in PostToolUse
  settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
  const hasTestVerifier = settings.hooks.PostToolUse.some(e =>
    (e.hooks || []).some(h => (h.command || '').includes('jev-test-verifier'))
  );
  if (!hasTestVerifier) {
    settings.hooks.PostToolUse.push({
      matcher: 'FileEdit|FileWrite|Write|Edit|replace_file_content|write_to_file',
      hooks: [
        {
          type: 'command',
          command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-test-verifier.js')}`
        }
      ]
    });
    console.log('🧪 Hook JEV Test Coverage Verifier adicionado em PostToolUse.');
  }

  // Add JEV Skill Picker in UserPromptSubmit
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
  let userPromptHooks = settings.hooks.UserPromptSubmit;
  if (userPromptHooks.length > 0 && Array.isArray(userPromptHooks[0].hooks)) {
    const list = userPromptHooks[0].hooks;
    const hasPicker = list.some(h => (h.command || '').includes('jev-skill-picker'));
    if (!hasPicker) {
      list.push({
        type: 'command',
        command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-skill-picker.js')}`
      });
      console.log('🧠 Hook JEV Skill Picker adicionado em UserPromptSubmit.');
    }
  } else {
    settings.hooks.UserPromptSubmit.push({
      hooks: [
        {
          type: 'command',
          command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-skill-picker.js')}`
        }
      ]
    });
    console.log('🧠 Hook JEV Skill Picker adicionado em UserPromptSubmit.');
  }

  // Add JEV Fast Compaction in PreCompact
  settings.hooks.PreCompact = settings.hooks.PreCompact || [];
  const hasCompactor = settings.hooks.PreCompact.some(e =>
    (e.hooks || []).some(h => (h.command || '').includes('jev-fast-compact'))
  );
  if (!hasCompactor) {
    settings.hooks.PreCompact.push({
      hooks: [
        {
          type: 'command',
          command: `node ${path.join(PROJECT_DIR, 'hooks', 'jev-fast-compact.js')}`
        }
      ]
    });
    console.log('⚡ Hook JEV Fast Compaction adicionado em PreCompact.');
  }

  // Save settings.json
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  console.log(`✅ ${SETTINGS_FILE} atualizado com sucesso!`);

  // 3. Link skills into ~/.claude/skills/
  const skillsToLink = ['jev-discover', 'jev-explore', 'jev-review', 'jev-browser-test'];
  for (const s of skillsToLink) {
    const srcDir = path.join(PROJECT_DIR, 'skills', s);
    const destDir = path.join(SKILLS_DIR, s);
    if (!fs.existsSync(destDir)) {
      try {
        fs.symlinkSync(srcDir, destDir, 'dir');
        console.log(`🔗 Skill '${s}' vinculada em ~/.claude/skills/${s}`);
      } catch (e) {
        // Fallback to copy
        fs.cpSync(srcDir, destDir, { recursive: true });
        console.log(`📋 Skill '${s}' copiada para ~/.claude/skills/${s}`);
      }
    } else {
      console.log(`ℹ️  Skill '${s}' já presente em ~/.claude/skills/${s}`);
    }
  }

  console.log('\n🎉 [INSTALAÇÃO CONCLUÍDA]: O Claude Code agora conta com JEV Decision Engine ativo!');
}

install();
