import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, nextTheme, THEME_KEY } from '../../src/ui/theme.js';

test('preferência salva tem prioridade sobre o sistema', () => {
  assert.equal(resolveTheme('claro', true), 'claro');
  assert.equal(resolveTheme('escuro', false), 'escuro');
});
test('sem preferência salva (ou valor inválido) segue o sistema', () => {
  assert.equal(resolveTheme(null, true), 'escuro');
  assert.equal(resolveTheme(null, false), 'claro');
  assert.equal(resolveTheme('lixo', true), 'escuro');
});
test('alternância e chave própria', () => {
  assert.equal(nextTheme('claro'), 'escuro'); assert.equal(nextTheme('escuro'), 'claro');
  assert.equal(THEME_KEY, 'itasul-tema');
});
