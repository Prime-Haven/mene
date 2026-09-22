/**
 * One shared password policy for every account type in Mene:
 * church administrators, staff and leaders.
 */
export type PasswordCheck = { label: string; met: boolean };

export function passwordChecks(value: string): PasswordCheck[] {
  return [
    { label: "8 to 16 characters", met: value.length >= 8 && value.length <= 16 },
    { label: "A capital letter", met: /[A-Z]/.test(value) },
    { label: "A small letter", met: /[a-z]/.test(value) },
    { label: "A number", met: /[0-9]/.test(value) },
    { label: "A symbol like ! ? @ #", met: /[^A-Za-z0-9]/.test(value) },
  ];
}

export function passwordIsStrong(value: string): boolean {
  return passwordChecks(value).every((check) => check.met);
}

export function passwordStrength(value: string): number {
  const met = passwordChecks(value).filter((check) => check.met).length;
  return Math.round((met / 5) * 100);
}

export const PASSWORD_RULE_TEXT =
  "Use 8 to 16 characters with a capital letter, a small letter, a number and a symbol.";
