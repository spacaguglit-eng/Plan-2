const escapeHtml = (value) => {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const safeFilePart = (value) => String(value || '').replace(/[^\w.-]+/g, '_');

const formatNumber = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return Math.round(numeric).toLocaleString('ru-RU');
};

const buildEfficiencyChartSvg = (series, targetValue) => {
    if (!series || series.length === 0) return '<div class="empty">Нет данных за период</div>';
    const chartWidth = 720;
    const chartHeight = 260;
    const padding = { top: 24, right: 24, bottom: 32, left: 44 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const maxValue = 120;
    const ticks = [0, 20, 40, 60, 80, 100, 120];
    const barWidth = plotWidth / Math.max(series.length, 1) * 0.6;

    const bars = series.map((item, idx) => {
        const efficiency = Number.isFinite(Number(item.efficiency)) ? Math.min(120, Math.max(0, Number(item.efficiency))) : 0;
        const x = padding.left + (plotWidth / Math.max(series.length, 1)) * idx + (plotWidth / Math.max(series.length, 1) - barWidth) / 2;
        const y = padding.top + plotHeight * (1 - efficiency / maxValue);
        const h = padding.top + plotHeight - y;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="#22c55e" />`;
    }).join('');

    const xLabels = series.map((item, idx) => {
        const label = escapeHtml(item.dayLabel ?? item.date ?? '');
        const x = padding.left + (plotWidth / Math.max(series.length, 1)) * idx + (plotWidth / Math.max(series.length, 1)) / 2;
        const y = padding.top + plotHeight + 18;
        return `<text x="${x.toFixed(2)}" y="${y}" text-anchor="middle" font-size="11" fill="#475569">${label}</text>`;
    }).join('');

    const yGrid = ticks.map((tick) => {
        const y = padding.top + plotHeight * (1 - tick / maxValue);
        return `
            <line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
            <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${tick}%</text>
        `;
    }).join('');

    const target = Math.max(0, Math.min(120, Number(targetValue)));
    const targetY = padding.top + plotHeight * (1 - target / maxValue);

    return `
        <svg width="100%" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Эффективность по дням">
            ${yGrid}
            <line x1="${padding.left}" y1="${targetY}" x2="${padding.left + plotWidth}" y2="${targetY}" stroke="#ef4444" stroke-width="3" />
            ${bars}
            ${xLabels}
        </svg>
    `;
};

const buildPlanFactChartSvg = (series) => {
    if (!series || series.length === 0) return '<div class="empty">Нет данных за период</div>';
    const chartWidth = 720;
    const chartHeight = 260;
    const padding = { top: 24, right: 24, bottom: 32, left: 60 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const maxValue = series.reduce((max, item) => {
        const plan = Number(item.plan) || 0;
        const fact = Number(item.fact) || 0;
        return Math.max(max, plan, fact);
    }, 1);
    const ticks = 5;
    const barGroupWidth = plotWidth / Math.max(series.length, 1);
    const barWidth = barGroupWidth * 0.28;

    const bars = series.map((item, idx) => {
        const plan = Number.isFinite(Number(item.plan)) ? Number(item.plan) : 0;
        const fact = Number.isFinite(Number(item.fact)) ? Number(item.fact) : 0;
        const planHeight = (plan / maxValue) * plotHeight;
        const factHeight = (fact / maxValue) * plotHeight;
        const baseX = padding.left + barGroupWidth * idx + (barGroupWidth - barWidth * 2) / 2;
        const planX = baseX + barWidth;
        const factX = baseX;
        const planY = padding.top + plotHeight - planHeight;
        const factY = padding.top + plotHeight - factHeight;
        return `
            <rect x="${factX.toFixed(2)}" y="${factY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${factHeight.toFixed(2)}" fill="#2563eb" />
            <rect x="${planX.toFixed(2)}" y="${planY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${planHeight.toFixed(2)}" fill="none" stroke="#ef4444" stroke-width="2" />
        `;
    }).join('');

    const xLabels = series.map((item, idx) => {
        const label = escapeHtml(item.dayLabel ?? item.date ?? '');
        const x = padding.left + barGroupWidth * idx + barGroupWidth / 2;
        const y = padding.top + plotHeight + 18;
        return `<text x="${x.toFixed(2)}" y="${y}" text-anchor="middle" font-size="11" fill="#475569">${label}</text>`;
    }).join('');

    const yGrid = Array.from({ length: ticks + 1 }, (_, i) => {
        const value = Math.round((maxValue / ticks) * i);
        const y = padding.top + plotHeight * (1 - i / ticks);
        return `
            <line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />
            <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${formatNumber(value)}</text>
        `;
    }).join('');

    return `
        <svg width="100%" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Выполнение плана">
            ${yGrid}
            ${bars}
            ${xLabels}
        </svg>
        <div class="legend-row">
            <span class="legend plan">План</span>
            <span class="legend fact">Факт</span>
        </div>
    `;
};

export const generateProductionReportHtml = ({ dates, lineSlides, lineDailySeries, lineTargets }) => {
    const sortedDates = [...dates].sort();
    const periodLabel = sortedDates.length === 1
        ? sortedDates[0]
        : `${sortedDates[0]}-${sortedDates[sortedDates.length - 1]}`;

    const totalPlan = lineSlides.reduce((sum, line) => sum + (line.plan || 0), 0);
    const totalFact = lineSlides.reduce((sum, line) => sum + (line.fact || 0), 0);
    const overallEfficiency = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

    const lineRows = lineSlides
        .slice()
        .sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0))
        .map((line) => `
            <tr>
                <td>${escapeHtml(line.line)}</td>
                <td>${formatNumber(line.plan)}</td>
                <td>${formatNumber(line.fact)}</td>
                <td>${formatNumber(line.efficiency)}%</td>
            </tr>
        `)
        .join('');

    const lineSections = lineSlides.map((line) => {
        const targetValue = Number.isFinite(Number(lineTargets?.[line.line]))
            ? Math.max(0, Math.min(100, Number(lineTargets[line.line])))
            : 85;
        const series = Array.isArray(lineDailySeries?.[line.line]) ? lineDailySeries[line.line] : [];
        const seriesRows = series.map((item) => `
            <tr>
                <td>${escapeHtml(item.dayLabel ?? item.date ?? '')}</td>
                <td>${formatNumber(item.plan)}</td>
                <td>${formatNumber(item.fact)}</td>
                <td>${formatNumber(item.efficiency)}%</td>
            </tr>
        `).join('');

        const downtimeRows = (line.downtimeList || []).slice(0, 5).map((item) => `
            <tr>
                <td>
                    <span class="color-dot" style="background:${escapeHtml(item.color || '#94a3b8')}"></span>
                    ${escapeHtml(item.category)}
                </td>
                <td>${formatNumber(item.minutes)} мин</td>
            </tr>
        `).join('');

        return `
            <section class="line-section">
                <h2>Линия: ${escapeHtml(line.line)}</h2>
                <div class="line-meta">Период: ${escapeHtml(periodLabel)}</div>
                <div class="metric-grid">
                    <div class="metric metric-plan">
                        <div class="metric-label">План</div>
                        <div class="metric-value">${formatNumber(line.plan)}</div>
                    </div>
                    <div class="metric metric-fact">
                        <div class="metric-label">Факт</div>
                        <div class="metric-value">${formatNumber(line.fact)}</div>
                    </div>
                    <div class="metric metric-eff">
                        <div class="metric-label">Эффективность</div>
                        <div class="metric-value">${formatNumber(line.efficiency)}%</div>
                        <div class="metric-sub">Цель: ${targetValue}%</div>
                    </div>
                </div>

                <div class="charts-grid">
                    <div class="block">
                        <div class="block-title">Общая эффективность оборудования, % (MTD: ${targetValue}%)</div>
                        ${buildEfficiencyChartSvg(series, targetValue)}
                    </div>

                    <div class="block">
                        <div class="block-title">Выполнение плана</div>
                        ${buildPlanFactChartSvg(series)}
                    </div>
                </div>

                <div class="block">
                    <details>
                        <summary class="block-title">Таблица по дням</summary>
                        ${series.length > 0 ? `
                            <table>
                                <thead>
                                    <tr>
                                        <th>День</th>
                                        <th>План</th>
                                        <th>Факт</th>
                                        <th>Эффективность</th>
                                    </tr>
                                </thead>
                                <tbody>${seriesRows}</tbody>
                            </table>
                        ` : `<div class="empty">Нет данных за период</div>`}
                    </details>
                </div>

                <div class="block">
                    <div class="block-title">Pareto простоев (топ-5)</div>
                    ${(line.downtimeList || []).length > 0 ? `
                        <table>
                            <thead>
                                <tr>
                                    <th>Причина</th>
                                    <th>Время</th>
                                </tr>
                            </thead>
                            <tbody>${downtimeRows}</tbody>
                        </table>
                    ` : `<div class="empty">Нет простоев</div>`}
                </div>
            </section>
        `;
    }).join('');

    const html = `
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Отчет эффективности ${escapeHtml(periodLabel)}</title>
    <style>
        body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; margin: 0; background: #f8fafc; }
        .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
        h1 { font-size: 28px; margin: 0 0 8px; }
        h2 { font-size: 20px; margin: 0 0 4px; }
        .subtitle { color: #64748b; margin-bottom: 16px; }
        .summary { background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .summary-card { background: #f8fafc; border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; }
        .summary-value { font-size: 22px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 13px; }
        th { background: #f1f5f9; font-weight: 600; }
        .line-section { background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px; margin-bottom: 20px; }
        .line-meta { color: #64748b; margin-bottom: 12px; }
        .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
        .metric { border-radius: 10px; padding: 12px; border: 1px solid #e2e8f0; }
        .metric-plan { background: #dbeafe; }
        .metric-fact { background: #ede9fe; }
        .metric-eff { background: #fee2e2; }
        .metric-label { font-size: 12px; color: #475569; margin-bottom: 6px; }
        .metric-value { font-size: 20px; font-weight: 700; }
        .metric-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
        .block { margin-top: 12px; }
        .block-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .charts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
        .charts-grid .block { margin-top: 0; }
        .charts-grid svg { height: 220px; }
        .empty { color: #94a3b8; font-size: 13px; padding: 8px 0; }
        .color-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
        .legend-row { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #64748b; }
        .legend { padding-left: 14px; position: relative; }
        .legend::before { content: ""; position: absolute; left: 0; top: 4px; width: 8px; height: 8px; border-radius: 2px; }
        .legend.plan::before { border: 2px solid #ef4444; background: transparent; box-sizing: border-box; }
        .legend.fact::before { background: #2563eb; }
        details > summary { cursor: pointer; list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
    </style>
    </head>
<body>
    <div class="container">
        <h1>Отчет по эффективности завода</h1>
        <div class="subtitle">Период: ${escapeHtml(periodLabel)}</div>
        <section class="summary">
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-label">Общий план</div>
                    <div class="summary-value">${formatNumber(totalPlan)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Общий факт</div>
                    <div class="summary-value">${formatNumber(totalFact)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Эффективность</div>
                    <div class="summary-value">${formatNumber(overallEfficiency)}%</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Линия</th>
                        <th>План</th>
                        <th>Факт</th>
                        <th>Эффективность</th>
                    </tr>
                </thead>
                <tbody>${lineRows}</tbody>
            </table>
        </section>
        ${lineSections}
    </div>
</body>
</html>
    `.trim();

    return {
        html,
        fileName: `Отчет_эффективности_${safeFilePart(periodLabel)}.html`
    };
};
