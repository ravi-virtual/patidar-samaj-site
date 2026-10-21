// The CSRF token lives only in memory (never localStorage / sessionStorage / cookies readable by
// scripts). A page reload loses it, and the app fetches a fresh one from GET /api/auth/me.
let csrfToken: string | null = null;

export const setCsrfToken = (token: string | null): void => {
  csrfToken = token;
};

export const getCsrfToken = (): string | null => csrfToken;
