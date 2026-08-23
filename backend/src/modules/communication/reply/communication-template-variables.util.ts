export function normalizeTemplateVariables(
  variables: Record<string, string> | undefined | null,
): Record<string, string> {
  if (!variables) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== 'string') continue;
    out[key] = value.trim();
  }
  return out;
}

export function listRequiredTemplateVariableKeys(
  variableSchema: Record<string, unknown> | null | undefined,
): string[] {
  if (!variableSchema || typeof variableSchema !== 'object') return [];
  return Object.keys(variableSchema).filter((key) => key.trim().length > 0);
}

export function validateTemplateVariables(
  variableSchema: Record<string, unknown> | null | undefined,
  variables: Record<string, string>,
): { valid: boolean; missing: string[] } {
  const required = listRequiredTemplateVariableKeys(variableSchema);
  const missing = required.filter((key) => !variables[key]?.trim());
  return { valid: missing.length === 0, missing };
}

export function renderTemplateBodyPreview(
  bodyTemplate: string,
  variables: Record<string, string>,
): string {
  let out = bodyTemplate;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

export function orderTemplateVariables(
  variableSchema: Record<string, unknown> | null | undefined,
  variables: Record<string, string>,
): Record<string, string> {
  const ordered: Record<string, string> = {};
  for (const key of listRequiredTemplateVariableKeys(variableSchema)) {
    ordered[key] = variables[key] ?? '';
  }
  for (const [key, value] of Object.entries(variables)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}
