import { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { routes } from './routes';
import { useThemeEffect } from './hooks/useThemeEffect';
import { useAppDispatch } from './store/hooks';
import { bootstrapAuth } from './store/slices/authSlice';
import { fetchSiteSettings } from './store/slices/siteSlice';

export default function App() {
  const dispatch = useAppDispatch();
  useThemeEffect();

  // Once on load: restore the signed-in state (and the user's saved theme) and fetch the
  // organisation details used by the header, footer and contact page.
  useEffect(() => {
    void dispatch(bootstrapAuth());
    void dispatch(fetchSiteSettings());
  }, [dispatch]);

  return useRoutes(routes);
}
