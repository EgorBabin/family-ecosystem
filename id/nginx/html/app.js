(async () => {
  const rememberInput = document.querySelector('#remember');
  const telegramSlot = document.querySelector('#telegram-slot');
  const yandexLink = document.querySelector('#yandex-link');
  const statusNode = document.querySelector('#status');
  const subtitleNode = document.querySelector('#subtitle');

  const searchParams = new URLSearchParams(window.location.search);
  const service = (searchParams.get('service') || 'gallery').toLowerCase();
  const errorCode = searchParams.get('error');

  const serviceNames = {
    gallery: 'gallery',
  };

  function setStatus(text, type = '') {
    statusNode.textContent = text || '';
    statusNode.className = ['status', type].filter(Boolean).join(' ');
  }

  function buildAuthQuery() {
    const params = new URLSearchParams();
    params.set('service', service);
    if (rememberInput.checked) {
      params.set('remember', '1');
    }
    return params;
  }

  function updateYandexHref() {
    yandexLink.href = `/api/yandex?${buildAuthQuery().toString()}`;
  }

  async function initTelegramWidget(botUsername) {
    telegramSlot.textContent = 'Telegram';
    if (!botUsername) {
      telegramSlot.textContent = 'Telegram временно недоступен';
      return;
    }

    const params = buildAuthQuery();
    let authUrl = `${window.location.origin}/api/telegram?${params.toString()}`;

    try {
      const stateResponse = await fetch(
        `/api/telegram/state?${params.toString()}`,
        {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );
      if (stateResponse.ok) {
        const data = await stateResponse.json();
        if (data?.state) {
          authUrl += `&state=${encodeURIComponent(data.state)}`;
        }
      }
    } catch (error) {
      console.debug('Failed to initialize telegram state', error);
    }

    telegramSlot.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-auth-url', authUrl);
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-request-access', 'write');
    telegramSlot.appendChild(script);
  }

  function showError(error) {
    const messages = {
      access_denied: 'Пользователь не найден в списке доступа или отключён.',
      oauth_state_invalid: 'Состояние входа не совпало. Начните авторизацию заново.',
      provider_error: 'Провайдер авторизации вернул ошибку. Повторите попытку.',
      telegram_hash_invalid: 'Telegram вернул неподписанные данные.',
      telegram_auth_date_invalid: 'Telegram передал устаревшую ссылку входа.',
      telegram_replayed: 'Эта попытка входа уже была использована.',
    };

    setStatus(
      messages[error] || 'Не удалось завершить вход. Повторите попытку.',
      'error',
    );
  }

  subtitleNode.textContent = `Вход для сервиса ${serviceNames[service] || service}.`;
  if (errorCode) {
    showError(errorCode);
  }

  rememberInput.addEventListener('change', () => {
    updateYandexHref();
    initTelegramWidget(config.telegramBotUsername).catch((error) => {
      console.debug('Telegram widget refresh failed', error);
    });
  });

  updateYandexHref();

  let config = { telegramBotUsername: '' };
  try {
    const response = await fetch('/api/config', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      config = data || {};
      config = data?.telegramBotUsername
        ? data
        : data?.payload || config;
    }
  } catch (error) {
    console.debug('Failed to fetch public config', error);
  }

  try {
    const response = await fetch('/api/check-session', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.authenticated) {
        setStatus('Активная сессия найдена. Перенаправляем в сервис.', 'success');
        window.location.replace(`/api/sso/continue?service=${encodeURIComponent(service)}`);
        return;
      }
    }
  } catch (error) {
    console.debug('Failed to check ID session', error);
  }

  await initTelegramWidget(config.telegramBotUsername);
})();
