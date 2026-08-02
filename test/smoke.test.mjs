import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText } from '../src/lib/tiktok.js';

test('normaliza texto para pesquisa', () => {
  assert.equal(normalizeSearchText('Republicações TECCA'), 'republicacoes tecca');
});
