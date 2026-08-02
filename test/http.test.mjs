import test from 'node:test';
import assert from 'node:assert/strict';
import { json, sendError } from '../src/lib/http.js';

test('helpers HTTP existem', () => {
  assert.equal(typeof json, 'function');
  assert.equal(typeof sendError, 'function');
});
