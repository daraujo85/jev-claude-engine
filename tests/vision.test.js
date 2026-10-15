import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnthropicStream } from '../skills/jev-vision/vision.js';

test('parseAnthropicStream: extrai texto de deltas SSE', () => {
  const raw = [
    'event: message_start',
    'data: {"type":"message_start","message":{"role":"assistant"}}',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0}',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Olá "}}',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"mundo"}}',
    'event: message_stop',
    'data: {"type":"message_stop"}'
  ].join('\n');
  assert.equal(parseAnthropicStream(raw), 'Olá mundo');
});

test('parseAnthropicStream: ignora eventos sem delta de texto', () => {
  const raw = [
    'data: {"type":"ping"}',
    'data: {"type":"message_start"}',
    'data: {"type":"error","error":{"type":"api_error"}}'
  ].join('\n');
  assert.equal(parseAnthropicStream(raw), '');
});

test('parseAnthropicStream: para no message_stop', () => {
  const raw = [
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}',
    'data: {"type":"message_stop"}',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"B"}}'
  ].join('\n');
  assert.equal(parseAnthropicStream(raw), 'A');
});