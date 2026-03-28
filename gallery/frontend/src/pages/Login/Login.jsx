import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCheckSession } from '@/hooks/useCheckSession';
import { useTitle } from '@/hooks/useTitle';
import styles from './Login.module.css';

function buildIdLoginUrl() {
  const configuredUrl = import.meta.env.VITE_ID_PUBLIC_URL;
  if (configuredUrl) {
    const url = new URL(configuredUrl);
    url.searchParams.set('service', 'gallery');
    return url.toString();
  }

  if (typeof window === 'undefined') {
    return '/';
  }

  const hostParts = window.location.host.split('.');
  if (hostParts.length > 1) {
    hostParts[0] = 'id';
    const url = new URL(`${window.location.protocol}//${hostParts.join('.')}`);
    url.searchParams.set('service', 'gallery');
    return url.toString();
  }

  const url = new URL(`${window.location.protocol}//id.${window.location.host}`);
  url.searchParams.set('service', 'gallery');
  return url.toString();
}

export default function Login() {
  useTitle('Авторизация');

  const { authenticated, loading } = useCheckSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Подготавливаем вход...');
  const [error, setError] = useState('');
  const ticket = useMemo(
    () => new URLSearchParams(location.search).get('ticket'),
    [location.search],
  );
  const idLoginUrl = useMemo(() => buildIdLoginUrl(), []);

  useEffect(() => {
    if (!loading && authenticated && !ticket) {
      navigate('/', { replace: true });
    }
  }, [loading, authenticated, navigate, ticket]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    let active = true;
    let redirectTimer = null;

    if (ticket) {
      const receivedTicket = ticket;
      setStatus('Завершаем вход через ID...');
      setError('');

      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, location.pathname);
      }

      fetch('/api/auth/exchange', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket: receivedTicket }),
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              payload?.message || 'Не удалось завершить вход в галерею',
            );
          }
          if (!active) {
            return;
          }
          setStatus('Сессия галереи создана. Перенаправляем...');
          navigate('/', { replace: true });
        })
        .catch((exchangeError) => {
          if (!active) {
            return;
          }
          setError(exchangeError.message || 'Не удалось завершить вход');
          setStatus('');
        });

      return () => {
        active = false;
      };
    }

    if (!authenticated) {
      setStatus('Перенаправляем на поддомен ID...');
      setError('');
      redirectTimer = window.setTimeout(() => {
        window.location.replace(idLoginUrl);
      }, 250);
    }

    return () => {
      active = false;
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, [authenticated, idLoginUrl, loading, location.pathname, navigate, ticket]);

  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>gallery / auth</p>
      <h1 className={styles.title}>
        {ticket ? 'Завершение входа' : 'Переход в ID'}
      </h1>
      <p className={styles.description}>
        Галерея больше не авторизует пользователя напрямую. Вход происходит
        через отдельный поддомен ID, после чего галерея принимает только
        короткоживущий одноразовый билет.
      </p>
      {status && <p className={styles.status}>{status}</p>}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <a className={styles.link} href={idLoginUrl}>
          Открыть ID вручную
        </a>
        <button
          type="button"
          className={styles.button}
          onClick={() => window.location.replace(idLoginUrl)}
        >
          Перейти сейчас
        </button>
      </div>
    </section>
  );
}
