import { defaultRules } from '../../shared/fidelity.js';
import type { Rule } from '../../shared/types.js';

export const RULES_KEY = 'difflens-rules';
export function readRules(storage: { getItem: (key: string) => string | null }): Rule[] {
  const saved = storage.getItem(RULES_KEY);
  const rules: Rule[] = saved === null ? defaultRules.map(rule => ({ ...rule })) : JSON.parse(saved);
  if (!Array.isArray(rules) || rules.some(rule => !rule || typeof rule.id !== 'string' || typeof rule.text !== 'string' || typeof rule.enabled !== 'boolean')) throw new Error('Invalid saved rules.');
  return rules;
}
