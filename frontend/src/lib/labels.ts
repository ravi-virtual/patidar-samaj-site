const roleLabels: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
};

export const roleLabel = (role: string): string => roleLabels[role] ?? role;
