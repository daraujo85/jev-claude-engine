import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectComments, stripComments, cleanFileComments } from '../src/comment-cleaner.js';

test('detectComments: detects single-line and multi-line comments in JS/TS', () => {
  const code = `
    // single line
    const x = 10;
    /* multi line
       comment */
    const y = 20;
  `;
  const result = detectComments(code, 'file.ts');
  assert.equal(result.hasComments, true);
  assert.equal(result.count, 2);
  assert.equal(result.locations[0].type, 'single-line');
  assert.equal(result.locations[1].type, 'multi-line');
});

test('detectComments: does NOT treat comments inside strings as comments', () => {
  const code = `
    const str1 = "http://example.com // not a comment";
    const str2 = '/* also not a comment */';
    const str3 = \`// nor this \${1 + 2}\`;
  `;
  const result = detectComments(code, 'file.js');
  assert.equal(result.hasComments, false);
  assert.equal(result.count, 0);
});

test('detectComments: detects HTML, script and style comments in Vue files', () => {
  const vueCode = `
    <template>
      <!-- HTML comment in template -->
      <button>Click</button>
    </template>
    <script setup lang="ts">
      // Script comment
      const count = 0;
    </script>
    <style scoped>
      /* CSS comment */
      button { color: blue; }
    </style>
  `;
  const result = detectComments(vueCode, 'App.vue');
  assert.equal(result.hasComments, true);
  assert.equal(result.count, 3);
  assert.equal(result.locations[0].type, 'html-comment');
  assert.equal(result.locations[1].type, 'single-line');
  assert.equal(result.locations[2].type, 'multi-line');
});

test('stripComments: strips comments while preserving line count and code structure', () => {
  const code = `
    const a = 1; // remove me
    /* multi line
       block comment */
    const b = 2;
  `;
  const initialLines = code.split('\n').length;
  const { cleanCode, strippedCount } = stripComments(code, 'file.ts', { preserveLineCount: true });
  assert.equal(strippedCount, 2);
  assert.equal(cleanCode.includes('remove me'), false);
  assert.equal(cleanCode.includes('block comment'), false);
  assert.equal(cleanCode.includes('const a = 1;'), true);
  assert.equal(cleanCode.includes('const b = 2;'), true);
  assert.equal(cleanCode.split('\n').length, initialLines);
});

test('cleanFileComments: cleans a file on disk and reports changes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-comment-test-'));
  const testFile = path.join(tmpDir, 'Service.java');
  fs.writeFileSync(testFile, 'public class Service {\n  // Java comment\n  public int run() {\n    return 1;\n  }\n}\n', 'utf-8');

  const result1 = cleanFileComments(testFile);
  assert.equal(result1.changed, true);
  assert.equal(result1.strippedCount, 1);

  const updatedContent = fs.readFileSync(testFile, 'utf-8');
  assert.equal(updatedContent.includes('// Java comment'), false);
  assert.equal(updatedContent.includes('public int run()'), true);

  // Running second time should report no change
  const result2 = cleanFileComments(testFile);
  assert.equal(result2.changed, false);
  assert.equal(result2.strippedCount, 0);

  fs.rmSync(tmpDir, { recursive: true });
});
