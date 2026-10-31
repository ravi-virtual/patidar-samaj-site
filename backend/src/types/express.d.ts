import type { Role, AccountStatusValue, ThemePreference } from '../config/constants';
import type { Permission } from '../config/permissions';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      name: string;
      email: string;
      role: Role;
      status: AccountStatusValue;
      permissions: Permission[];
      themePreference: ThemePreference;
      isAuthenticated: true;
    }

    interface AuthSession {
      id: string;
      csrfToken: string;
    }

    interface Request {
      user?: AuthUser;
      authSession?: AuthSession;
    }
  }
}

export {};
