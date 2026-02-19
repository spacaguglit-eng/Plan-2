/**
 * Сервис тестирования связи с 1С через REST/HTTP.
 * Пробует базовый URL и OData-эндпоинты.
 */

const STORAGE_KEY = 'onec_http_config';

/**
 * @param {string} url — базовый URL (например https://barinoff.corp.rarus-cloud.ru/erp)
 * @param {string} [user] — логин
 * @param {string} [password] — пароль
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
export async function test1cHttpConnection(url, user, password) {
    const base = (url || '').trim().replace(/\/+$/, '');
    if (!base) {
        return { ok: false, error: 'Укажите адрес 1С' };
    }
    let finalUrl = base;
    if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
    }
    const headers = {};
    if (user || password) {
        const token = btoa(unescape(encodeURIComponent((user || '') + ':' + (password || ''))));
        headers['Authorization'] = 'Basic ' + token;
    }
    headers['Accept'] = 'application/json, text/html, */*';
    const endpoints = [
        { url: finalUrl + '/odata/standard.odata/$metadata', label: 'OData' },
        { url: finalUrl + '/', label: 'базовый' }
    ];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    for (const ep of endpoints) {
        try {
            const r = await fetch(ep.url, {
                method: 'GET',
                headers,
                mode: 'cors',
                credentials: 'omit',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (r.ok) {
                clearTimeout(timeoutId);
                return { ok: true, message: `Сервер доступен (${ep.label}), HTTP ${r.status}` };
            }
            if (r.status === 401) {
                clearTimeout(timeoutId);
                return { ok: true, message: `Сервер достигнут (${ep.label}), требуется авторизация (HTTP 401)` };
            }
            if (r.status === 403) {
                clearTimeout(timeoutId);
                return { ok: true, message: `Сервер достигнут (${ep.label}), доступ запрещён (HTTP 403)` };
            }
        } catch (e) {
            clearTimeout(timeoutId);
            if (ep === endpoints[endpoints.length - 1]) {
                const msg = e?.message || String(e);
                let err = msg;
                if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                    err = 'CORS блокирует запрос (1С не отдаёт заголовки для браузера). Запустите приложение через Electron: npm run dev:electron — тогда запрос пойдёт из главного процесса и CORS не мешает.';
                } else if (msg.includes('timeout') || msg.includes('aborted')) {
                    err = 'Таймаут. Сервер не отвечает.';
                }
                return { ok: false, error: err };
            }
        }
    }
    return { ok: false, error: 'Не удалось установить связь' };
}

/**
 * @returns {{ url: string, user: string, password: string }}
 */
export function load1cHttpConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const o = JSON.parse(raw);
            return {
                url: o?.url || '',
                user: o?.user || '',
                password: o?.password || ''
            };
        }
    } catch (_) {}
    return { url: '', user: '', password: '' };
}

/**
 * @param {{ url?: string, user?: string, password?: string }} config
 */
export function save1cHttpConfig(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            url: config?.url || '',
            user: config?.user || '',
            password: config?.password || ''
        }));
    } catch (_) {}
}
