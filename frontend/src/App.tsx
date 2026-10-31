import { Fragment, useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
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

  // Once on load: restore the signed-in state (and the user's saved theme).
  useEffect(() => {
    void dispatch(bootstrapAuth());
  }, [dispatch]);

  // On load and whenever the language changes: fetch the organisation details (name, tagline,
  // address...) which the server returns in the chosen language.
  useEffect(() => {
    void dispatch(fetchSiteSettings());
  }, [dispatch, language]);

  const element = useRoutes(routes);
  // Switching language re-mounts the page tree so every string and every request is redone in
  // the new language (an open form loses unsaved input, which is acceptable for a rare switch).
  return <Fragment key={language}>{element}</Fragment>;
}
