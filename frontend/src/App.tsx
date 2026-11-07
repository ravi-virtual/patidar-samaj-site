import { Fragment, useEffect } from 'react';
import { useLocation, useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useLanguage } from './i18n';
import { useAppDispatch } from './store/hooks';
import { bootstrapAuth } from './store/slices/authSlice';
import { fetchSiteSettings } from './store/slices/siteSlice';

export default function App() {
  const dispatch = useAppDispatch();
  const language = useLanguage();
  useThemeEffect();

  // The sign-in page shows no organisation details, so it does not fetch them; they load as soon as
  // the user moves on to any other page.
  const onSignIn = useLocation().pathname === '/admin/login';

  // Once on load: restore the signed-in state (and the user's saved theme).
  useEffect(() => {
    void dispatch(bootstrapAuth());
  }, [dispatch]);

  // On load and whenever the language changes: fetch the organisation details (name, tagline,
  // address...) which the server returns in the chosen language.
  useEffect(() => {
    if (!onSignIn) void dispatch(fetchSiteSettings());
  }, [dispatch, language, onSignIn]);

  const element = useRoutes(routes);
  // Switching language re-mounts the page tree so every string and every request is redone in
  // the new language (an open form loses unsaved input, which is acceptable for a rare switch).
  return <Fragment key={language}>{element}</Fragment>;
}
