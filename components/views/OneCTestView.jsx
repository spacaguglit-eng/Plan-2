import React, { useState, useEffect } from 'react';
import { Plug, CheckCircle, XCircle, Loader2, Globe, Wifi, Send } from 'lucide-react';
import { test1cHttpConnection, load1cHttpConfig, save1cHttpConfig } from '../../services/onecHttpService';

const OneCTestView = () => {
    const [httpResult, setHttpResult] = useState(null);
    const [httpLoading, setHttpLoading] = useState(false);
    const [httpUrl, setHttpUrl] = useState('');
    const [httpUser, setHttpUser] = useState('');
    const [httpPassword, setHttpPassword] = useState('');
    const [saveConfig, setSaveConfig] = useState(false);
    const [queryPath, setQueryPath] = useState('odata/standard.odata/$metadata');
    const [queryResult, setQueryResult] = useState(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [metadataCollections, setMetadataCollections] = useState([]);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataRawSnippet, setMetadataRawSnippet] = useState('');

    const isElectron = typeof window !== 'undefined' && window.electronAPI;

    useEffect(() => {
        const cfg = load1cHttpConfig();
        setHttpUrl(cfg.url || '');
        setHttpUser(cfg.user || '');
        setHttpPassword(cfg.password || '');
    }, []);

    const handleLoadMetadata = async () => {
        if (!isElectron || !window.electronAPI?.onecExecuteRequest) {
            setMetadataCollections(['Ошибка: запустите приложение через npm run dev:electron']);
            return;
        }
        if (!httpUrl.trim()) {
            setMetadataCollections(['Укажите адрес 1С в поле выше']);
            return;
        }
        setMetadataLoading(true);
        setMetadataCollections([]);
        setMetadataRawSnippet('');
        try {
            const res = await window.electronAPI.onecExecuteRequest(httpUrl, httpUser, httpPassword, 'odata/standard.odata/$metadata');
            if (res.ok && res.body) {
                const body = res.body.trim();
                let sets = [];
                if (body.startsWith('{')) {
                    try {
                        const j = JSON.parse(body);
                        const ec = j?.value?.[0] || j?.$EntityContainer;
                        if (ec && Array.isArray(ec)) sets = ec.filter(x => x.Name).map(x => x.Name);
                        else if (j?.value) sets = j.value.map(x => x.name || x.Name).filter(Boolean);
                    } catch (_) {}
                } else {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(body, 'text/xml');
                    const parseErr = doc.querySelector('parsererror');
                    if (parseErr) {
                        setMetadataCollections(['Ошибка разбора XML']);
                        setMetadataRawSnippet(body.slice(0, 800));
                        return;
                    }
                    const all = doc.getElementsByTagName('*');
                    sets = Array.from(all)
                        .filter(el => el.localName === 'EntitySet' || el.localName === 'EntityType')
                        .map(el => el.getAttribute('Name'))
                        .filter(Boolean);
                    if (sets.length === 0) {
                        sets = Array.from(all)
                            .filter(el => (el.getAttribute('Name') || '').match(/^(Документ|Справочник|Регистр|Catalog|Document)_/i))
                            .map(el => el.getAttribute('Name'))
                            .filter(Boolean);
                    }
                    if (sets.length === 0) {
                        const withName = [...new Set(Array.from(all).map(el => el.getAttribute('Name')).filter(Boolean))].sort();
                        if (withName.length > 0) {
                            sets = withName;
                        }
                    }
                }
                if (sets.length === 0) {
                    setMetadataRawSnippet(body.slice(0, 1500));
                    setMetadataCollections(['Коллекции не найдены. Показать фрагмент ответа ниже.']);
                } else {
                    setMetadataCollections([...new Set(sets)].sort());
                }
            } else {
                setMetadataCollections(['Ошибка: HTTP ' + (res.error || '') + (res.body ? ' — ' + String(res.body).slice(0, 150) : '')]);
            }
        } catch (e) {
            setMetadataCollections(['Ошибка: ' + String(e?.message || e)]);
        } finally {
            setMetadataLoading(false);
        }
    };

    const handleExecuteQuery = async () => {
        if (!isElectron || !window.electronAPI?.onecExecuteRequest) {
            setQueryResult({ ok: false, error: 'Запрос доступен только в Electron. Запустите npm run dev:electron.' });
            return;
        }
        if (!httpUrl.trim()) {
            setQueryResult({ ok: false, error: 'Укажите адрес 1С выше' });
            return;
        }
        setQueryLoading(true);
        setQueryResult(null);
        if (saveConfig) {
            save1cHttpConfig({ url: httpUrl, user: httpUser, password: httpPassword });
        }
        try {
            const res = await window.electronAPI.onecExecuteRequest(httpUrl, httpUser, httpPassword, queryPath);
            setQueryResult(res);
        } catch (e) {
            setQueryResult({ ok: false, error: String(e?.message || e) });
        } finally {
            setQueryLoading(false);
        }
    };

    const handleHttpTest = async () => {
        setHttpLoading(true);
        setHttpResult(null);
        if (saveConfig) {
            save1cHttpConfig({ url: httpUrl, user: httpUser, password: httpPassword });
        }
        try {
            let res;
            if (isElectron && window.electronAPI?.onecTestHttpConnection) {
                res = await window.electronAPI.onecTestHttpConnection(httpUrl, httpUser, httpPassword);
            } else {
                res = await test1cHttpConnection(httpUrl, httpUser, httpPassword);
            }
            setHttpResult(res);
        } catch (e) {
            setHttpResult({ ok: false, error: String(e?.message || e) });
        } finally {
            setHttpLoading(false);
        }
    };

    const ResultBlock = ({ result }) => (
        result && (
            <div
                className={`p-4 rounded-lg border flex items-start gap-3 ${
                    result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}
            >
                {result.ok ? (
                    <CheckCircle size={24} className="text-green-600 shrink-0 mt-0.5" />
                ) : (
                    <XCircle size={24} className="text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                    {result.ok ? (
                        <>
                            <p className="font-semibold text-green-800">Связь установлена</p>
                            <p className="text-sm text-green-700 mt-1">{result.message || result.connector}</p>
                        </>
                    ) : (
                        <>
                            <p className="font-semibold text-red-800">Ошибка</p>
                            <p className="text-sm text-red-700 mt-1">{result.error}</p>
                        </>
                    )}
                </div>
            </div>
        )
    );

    return (
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-xl border border-slate-200 shadow-sm space-y-10">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Plug size={24} className="text-slate-600" />
                Тест связи с 1С
            </h2>

            {/* REST/HTTP — работает везде */}
            <section>
                <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Globe size={18} />
                    REST/HTTP (облако, тонкий клиент)
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                    Подключение к 1С через веб. Укажите базовый URL (например,
                    <code className="mx-1 bg-slate-100 px-1 rounded">https://barinoff.corp.rarus-cloud.ru/erp</code>) и при необходимости логин/пароль.
                </p>
                {!isElectron && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        <strong>Важно:</strong> в браузере 1С блокирует запросы (CORS). Тест HTTP работает только при запуске через <code className="bg-amber-100 px-1 rounded">npm run dev:electron</code>.
                    </div>
                )}
                <div className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Адрес 1С</label>
                        <input
                            type="text"
                            value={httpUrl}
                            onChange={(e) => setHttpUrl(e.target.value)}
                            placeholder="https://сервер/база"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Пользователь</label>
                            <input
                                type="text"
                                value={httpUser}
                                onChange={(e) => setHttpUser(e.target.value)}
                                placeholder="Опционально"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
                            <input
                                type="password"
                                value={httpPassword}
                                onChange={(e) => setHttpPassword(e.target.value)}
                                placeholder="Опционально"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={saveConfig}
                            onChange={(e) => setSaveConfig(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Сохранить настройки (URL, логин, пароль)
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleHttpTest}
                            disabled={httpLoading || !httpUrl.trim()}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {httpLoading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Проверка…
                                </>
                            ) : (
                                <>
                                    <Wifi size={18} />
                                    Проверить HTTP
                                </>
                            )}
                        </button>
                    </div>
                    <ResultBlock result={httpResult} />
                </div>
            </section>

            {/* Запрос к 1С */}
            {isElectron && (
                <section className="pt-6 border-t border-slate-200">
                    <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Send size={18} />
                        Запрос к 1С
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Укажите путь OData или полный URL. Используются адрес и учётные данные из формы выше.
                    </p>
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 items-center">
                            <button
                                type="button"
                                onClick={handleLoadMetadata}
                                disabled={metadataLoading || !httpUrl.trim()}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
                            >
                                {metadataLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                                Загрузить коллекции из $metadata
                            </button>
                            {metadataCollections.length > 0 && (
                                <span className="text-xs text-slate-500">
                                    Найдено: {metadataCollections.length}
                                </span>
                            )}
                        </div>
                        {metadataCollections.length > 0 && (
                            (metadataCollections.length === 1 && /^(Ошибка|Укажите|Коллекции)/i.test(metadataCollections[0])) ? (
                                <div className="space-y-2">
                                    <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
                                        {metadataCollections[0]}
                                    </p>
                                    {metadataRawSnippet && (
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-slate-600 hover:text-slate-800">Фрагмент ответа сервера</summary>
                                            <pre className="mt-2 p-2 bg-slate-100 rounded overflow-auto max-h-48 whitespace-pre-wrap break-words">
                                                {metadataRawSnippet}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            ) : (
                                <div className="max-h-40 overflow-auto border border-slate-200 rounded-lg p-2 bg-slate-50">
                                    <p className="text-xs font-medium text-slate-600 mb-2">Доступные коллекции (клик — вставить путь):</p>
                                    <div className="flex flex-wrap gap-1">
                                        {metadataCollections.map((name) => (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => setQueryPath('odata/standard.odata/' + name)}
                                                className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-300"
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Путь или URL</label>
                            <input
                                type="text"
                                value={queryPath}
                                onChange={(e) => setQueryPath(e.target.value)}
                                placeholder="odata/standard.odata/Справочник_Номенклатура?$top=10"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleExecuteQuery}
                            disabled={queryLoading || !httpUrl.trim() || !queryPath.trim()}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {queryLoading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Выполняю…
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Выполнить запрос
                                </>
                            )}
                        </button>
                        {queryResult && (
                            <div className={`rounded-lg border p-4 ${queryResult.ok ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
                                {queryResult.ok ? (
                                    <>
                                        <p className="text-sm font-semibold text-slate-700 mb-2">Ответ (HTTP {queryResult.status})</p>
                                        <pre className="text-xs font-mono bg-white border border-slate-200 rounded p-3 max-h-80 overflow-auto whitespace-pre-wrap break-words">
                                            {(() => {
                                                try {
                                                    const parsed = JSON.parse(queryResult.body);
                                                    return JSON.stringify(parsed, null, 2);
                                                } catch (_) {
                                                    return queryResult.body || '(пусто)';
                                                }
                                            })()}
                                        </pre>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm font-semibold text-red-800">Ошибка: {queryResult.error}</p>
                                        {queryResult.body && (
                                            <pre className="text-xs font-mono mt-2 bg-red-50 p-2 rounded max-h-32 overflow-auto">
                                                {queryResult.body}
                                            </pre>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}

        </div>
    );
};

export default OneCTestView;
