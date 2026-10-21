import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import { sessionLost } from './store/slices/authSlice';
import { setSessionLostHandler } from './api/axiosInstance';
import App from './App';
import './index.css';

// If the server ends the session mid-use (expired, revoked, suspended), fall back to signed-out.
setSessionLostHandler(() => store.dispatch(sessionLost()));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
