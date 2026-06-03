export function formatVariableLabel(name: string): string {
  return name.split("_").filter(Boolean).join(" ");
}

export function formatVariableHelperText(
  name: string,
  required: boolean,
  defaultValue: string | number | boolean | null,
): string {
  const envKey = `\`${name}\``;

  if (required) {
    return `Required environment variable ${envKey}.`;
  }

  if (defaultValue === null) {
    return `Optional. Leave blank to use platform defaults for ${envKey}.`;
  }

  return `Optional. Default: ${String(defaultValue)} (${envKey}).`;
}
