const REPORT_STYLES = `
:root {
    color-scheme: light;
}
* {
    box-sizing: border-box;
}
body {
    margin: 0;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #f4f5f7;
    color: #0f172a;
}
.report {
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: 32px;
}
.report__header {
    padding: 24px;
    border-radius: 20px;
    background: #111827;
    color: #f8fafc;
    margin-bottom: 24px;
    box-shadow: 0 30px 60px rgba(15, 23, 42, 0.3);
}
.report__header .report__title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
}
.report__header .report__meta {
    margin-top: 8px;
    font-size: 0.85rem;
    color: rgba(248, 250, 252, 0.8);
}
.report__meta-group {
    margin-top: 8px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}
.report__meta-chip {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.25);
    font-size: 0.8rem;
}
.report-section {
    margin-bottom: 24px;
    background: #ffffff;
    border-radius: 18px;
    padding: 24px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}
.report-section__header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
}
.report-section__title {
    font-size: 1.125rem;
    font-weight: 700;
    color: #0f172a;
}
.report-section__chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.report-section__chip {
    padding: 6px 10px;
    border-radius: 12px;
    background: #eef2ff;
    color: #4338ca;
    font-size: 0.8rem;
    font-weight: 600;
}
.report-section__summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
    font-size: 0.85rem;
    color: #475569;
}
.report-section__summary-item {
    background: #f8fafc;
    border-radius: 8px;
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
    font-size: 0.8rem;
}
.report-row {
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 8px;
    border: 1px solid #e5e7eb;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
}
.report-row--cip {
    background: #eef2ff;
    border-color: #c7d2fe;
}
.report-row__left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.report-row__index {
    font-size: 0.65rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #94a3b8;
}
.report-row__label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #0f172a;
}
.report-row__type {
    font-size: 0.75rem;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}
.report-row__meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.75rem;
    color: #475569;
}
.report-row__meta span {
    display: flex;
    justify-content: space-between;
}
.report-row__right {
.report-row__right {
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.75rem;
    color: #0f172a;
}
.report-row__duration {
    font-weight: 600;
    color: #2563eb;
}
.report__actions {
    margin-top: 40px;
    display: flex;
    justify-content: center;
}
.report__print {
    border: none;
    background: #111827;
    color: #f8fafc;
    border-radius: 999px;
    padding: 12px 24px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.95rem;
}
.report__print:hover {
    background: #0ea5e9;
}
@media print {
    body {
        background: #fff;
    }
    .report {
        padding: 0;
        box-shadow: none;
    }
    .report__header {
        box-shadow: none;
    }
    .report__actions,
    .report__print {
        display: none;
    }
}
`;

const escapeHtml = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const formatDurationText = (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return '—';
    return `${minutes} мин`;
};

const formatDateLabel = (value) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleString('ru-RU', {
        dateStyle: 'long',
        timeStyle: 'short'
    });
};

const createSectionHtml = (section) => {
    const summary = section.summary || {};
    return `
        <section class="report-section">
            <div class="report-section__header">
                <div class="report-section__title">${escapeHtml(section.line)}</div>
                <div class="report-section__chips">
                    <div class="report-section__chip">${escapeHtml(summary.date || '—')}</div>
                    <div class="report-section__chip">${formatDurationText(summary.totalDuration)}</div>
                </div>
            </div>
            <div class="report-section__summary">
                <div class="report-section__summary-item">Дата: ${escapeHtml(summary.date)}</div>
                <div class="report-section__summary-item">Начало: ${escapeHtml(summary.start)}</div>
                <div class="report-section__summary-item">Конец: ${escapeHtml(summary.end)}</div>
                <div class="report-section__summary-item">Продукты: ${formatDurationText(summary.productDuration)}</div>
                <div class="report-section__summary-item">CIP: ${formatDurationText(summary.cipDuration)}</div>
            </div>
            ${section.rows
                .map((row) => `
                    <div class="report-row ${row.kind === 'cip' ? 'report-row--cip' : ''}">
                        <div class="report-row__left">
                            <div class="report-row__index">${row.displayIndex.toString().padStart(2, '0')}</div>
                            <div class="report-row__label">${escapeHtml(row.label)}</div>
                            <div class="report-row__type">${row.kind === 'cip' ? 'CIP-событие' : 'Продукт'}</div>
                            <div class="report-row__meta">
                                <span><strong>Время:</strong> ${escapeHtml(row.start)} — ${escapeHtml(row.end)}</span>
                                <span><strong>Кол-во:</strong> ${escapeHtml(row.quantityLabel)}</span>
                            </div>
                        </div>
                        <div class="report-row__right">
                            <div class="report-row__duration">${escapeHtml(row.displayDuration)}</div>
                        </div>
                    </div>
                `)
                .join('')}
        </section>
    `;
};

const createReportHtml = (sections, metadata = {}) => {
    const title = escapeHtml(metadata.title || 'Отчет по очередности розлива');
    const lines = Array.isArray(metadata.lines) && metadata.lines.length > 0
        ? metadata.lines.map(escapeHtml).join(', ')
        : '—';
    const generatedAt = formatDateLabel(metadata.generatedAt);
    const headerMeta = metadata.description ? escapeHtml(metadata.description) : 'Сформировано автоматически';

    const content = sections.map(createSectionHtml).join('');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${REPORT_STYLES}</style>
</head>
<body>
    <div class="report">
        <header class="report__header">
            <p class="report__title">${title}</p>
            <p class="report__meta">${headerMeta}</p>
            <div class="report__meta-group">
                <span class="report__meta-chip">Линии: ${lines}</span>
                <span class="report__meta-chip">Сформировано: ${generatedAt}</span>
            </div>
        </header>
        ${content || '<p class="text-sm text-slate-500">Нет доступных данных для выбранных линий.</p>'}
        <div class="report__actions">
            <button class="report__print" onclick=\"window.print();\">Распечатать или сохранить PDF</button>
        </div>
    </div>
</body>
</html>`;
};

const openReportWindow = (html, options = {}) => {
    if (typeof window === 'undefined') return null;
    const win = window.open('', '_blank');
    if (!win) return null;
    win.document.write(html);
    win.document.close();
    win.focus();
    if (options.printOnOpen) {
        win.addEventListener('load', () => {
            setTimeout(() => {
                win.print();
            }, 250);
        });
    }
    return win;
};

export const openReportPreview = (sections, metadata) => {
    const html = createReportHtml(sections, metadata);
    return openReportWindow(html);
};

export const exportReportAsPdf = (sections, metadata) => {
    const html = createReportHtml(sections, metadata);
    return openReportWindow(html, { printOnOpen: true });
};
