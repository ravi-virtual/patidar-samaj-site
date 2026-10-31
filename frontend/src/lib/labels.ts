import { t } from '../i18n';

const roleLabels: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
};

export const roleLabel = (role: string): string => t(roleLabels[role] ?? role);
