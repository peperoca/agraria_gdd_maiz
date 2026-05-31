import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { login, register } from '../utils/api';

interface LoginProps {
  onLoggedIn: () => void;
}

export function Login({ onLoggedIn }: LoginProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.passwordsMismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        if (!email) {
          setError(t('auth.emailRequired'));
          setLoading(false);
          return;
        }
        await register(username, email, password);
      }
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.authFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-block bg-white rounded-2xl px-4 py-2 mb-3">
            <img src="/agraria-logo.png" alt="Agraria" className="h-8 w-auto" />
          </div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--tx)' }}>{t('auth.appTitle')}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--tx3)' }}>
            {t('auth.subtitle')}
          </p>
        </div>

        <div className="agraria-card">
          <div className="sec-label">{mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}</div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('auth.usernameLabel')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                className="agraria-input"
                autoFocus
                required
              />
            </div>

            {mode === 'register' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('auth.emailLabel')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  className="agraria-input"
                  required
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('auth.passwordLabel')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="agraria-input"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--tx2)' }}>{t('auth.confirmPasswordLabel')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  className="agraria-input"
                  required
                />
              </div>
            )}

            {error && (
              <div className="text-xs p-2.5 rounded-[var(--r)]" style={{ background: 'var(--db)', color: 'var(--dt)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="agraria-btn-primary w-full"
            >
              {loading ? t('auth.pleaseWait') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
            </button>
          </form>

          <div className="text-center mt-4 pt-3" style={{ borderTop: '0.5px solid var(--bdr)' }}>
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="text-xs font-medium bg-transparent border-none cursor-pointer"
              style={{ color: 'var(--blue)' }}
            >
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
