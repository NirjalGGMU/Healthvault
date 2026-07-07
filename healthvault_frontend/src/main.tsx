import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
      <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: { fontSize: '14px' },
              success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
              error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
      </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
