import pptxgen from 'pptxgenjs';

const normalizeHex = (hex) => String(hex || '').replace('#', '').toUpperCase();
const safeFilePart = (value) => String(value || '').replace(/[^\w.-]+/g, '_');
const clampNumber = (value, min, max, fallback) => {
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
};

export const generateProductionReportPptx = async ({ dates, lineSlides, lineDailySeries, lineTargets }) => {
    const sortedDates = [...dates].sort();
    const periodLabel = sortedDates.length === 1
        ? sortedDates[0]
        : `${sortedDates[0]}-${sortedDates[sortedDates.length - 1]}`;

    const totalPlan = lineSlides.reduce((sum, line) => sum + (line.plan || 0), 0);
    const totalFact = lineSlides.reduce((sum, line) => sum + (line.fact || 0), 0);
    const overallEfficiency = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
    const sortedLines = [...lineSlides].sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));

    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Production Dashboard';

    const titleColor = '1F2937';
    const subtitleColor = '475569';

    // Слайд 1: титульный
    let slide = pptx.addSlide();
    slide.addText('Отчёт по эффективности завода', {
        x: 0.7,
        y: 2.1,
        w: 11.9,
        h: 1,
        fontSize: 36,
        bold: true,
        color: titleColor,
        align: 'center'
    });
    slide.addText(`Период: ${periodLabel}`, {
        x: 0.7,
        y: 3.2,
        w: 11.9,
        h: 0.6,
        fontSize: 20,
        color: subtitleColor,
        align: 'center'
    });

    // Слайд 2: сводный
    slide = pptx.addSlide();
    slide.addText('Сводный показатель эффективности', {
        x: 0.6,
        y: 0.3,
        w: 12,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: titleColor
    });

    const pieData = [{
        name: 'OEE',
        labels: ['Выполнение', 'Отклонение'],
        values: [overallEfficiency, Math.max(0, 100 - overallEfficiency)]
    }];

    slide.addChart(pptx.ChartType.doughnut, pieData, {
        x: 0.7,
        y: 1.2,
        w: 4.3,
        h: 3.8,
        holeSize: 55,
        chartColors: ['16A34A', 'E2E8F0'],
        showLegend: false,
        dataLabelPosition: 'none'
    });
    slide.addText(`${overallEfficiency}%`, {
        x: 0.7,
        y: 2.55,
        w: 4.3,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: titleColor,
        align: 'center'
    });
    slide.addText('Выполнение плана', {
        x: 0.7,
        y: 3.1,
        w: 4.3,
        h: 0.4,
        fontSize: 14,
        color: subtitleColor,
        align: 'center'
    });

    const tableRows = [
        [
            { text: 'Линия', options: { bold: true, color: 'FFFFFF', fill: '1D4ED8' } },
            { text: 'Эффективность', options: { bold: true, color: 'FFFFFF', fill: '1D4ED8', align: 'center' } }
        ],
        ...sortedLines.map((line) => ([
            { text: line.line, options: { color: '334155' } },
            { text: `${line.efficiency || 0}%`, options: { color: '334155', align: 'center' } }
        ]))
    ];

    slide.addTable(tableRows, {
        x: 5.4,
        y: 1.1,
        w: 7.3,
        colW: [4.6, 2.7],
        rowH: 0.38,
        fontSize: 12,
        border: { type: 'solid', pt: 1, color: 'E2E8F0' }
    });

    // Слайды по линиям
    lineSlides.forEach((line) => {
        slide = pptx.addSlide();
        slide.addText(`Линия: ${line.line}`, {
            x: 0.6,
            y: 0.25,
            w: 12,
            h: 0.45,
            fontSize: 24,
            bold: true,
            color: titleColor
        });
        slide.addText(`Период: ${periodLabel}`, {
            x: 0.6,
            y: 0.75,
            w: 12,
            h: 0.3,
            fontSize: 14,
            color: subtitleColor
        });

        const efficiency = line.efficiency || 0;
        const efficiencyFill = efficiency >= 95 ? 'DCFCE7' : efficiency >= 80 ? 'FEF3C7' : 'FEE2E2';
        const efficiencyColor = efficiency >= 95 ? '16A34A' : efficiency >= 80 ? 'D97706' : 'DC2626';

        const metrics = [
            { label: 'План', value: line.plan || 0, fill: 'DBEAFE', color: '1D4ED8' },
            { label: 'Факт', value: line.fact || 0, fill: 'EDE9FE', color: '6D28D9' },
            { label: 'Эффективность', value: `${efficiency}%`, fill: efficiencyFill, color: efficiencyColor }
        ];

        metrics.forEach((metric, idx) => {
            const boxX = 0.6 + idx * 4.2;
            const boxW = 3.9;
            slide.addShape(pptx.ShapeType.roundRect, {
                x: boxX,
                y: 1.35,
                w: boxW,
                h: 0.9,
                fill: { color: metric.fill },
                line: { color: metric.fill }
            });
            slide.addText(metric.label, {
                x: boxX,
                y: 1.4,
                w: boxW,
                h: 0.3,
                fontSize: 12,
                color: metric.color,
                align: 'center'
            });
            slide.addText(typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value, {
                x: boxX,
                y: 1.7,
                w: boxW,
                h: 0.5,
                fontSize: 18,
                bold: true,
                color: metric.color,
                align: 'center'
            });
        });

        slide.addText('Графики временно отключены для отладки.', {
            x: 0.6,
            y: 2.8,
            w: 12,
            h: 0.4,
            fontSize: 12,
            color: subtitleColor
        });

        slide.addText('Pareto простоев (топ-5)', {
            x: 0.6,
            y: 4.8,
            w: 12,
            h: 0.4,
            fontSize: 16,
            bold: true,
            color: titleColor
        });

        const topDowntimes = (line.downtimeList || []).slice(0, 5);
        if (topDowntimes.length === 0) {
            slide.addText('Нет простоев для выбранной линии.', {
                x: 0.6,
                y: 5.3,
                w: 12,
                h: 0.4,
                fontSize: 14,
                color: subtitleColor
            });
            return;
        }

        const maxMinutes = Math.max(...topDowntimes.map(item => item.minutes || 0), 1);
        const labelX = 0.6;
        const labelW = 3.2;
        const barX = labelX + labelW + 0.2;
        const barMaxW = 6.6;
        const valueX = barX + barMaxW + 0.2;
        const barH = 0.26;
        const gap = 0.12;
        const startY = 5.3;

        topDowntimes.forEach((item, idx) => {
            const y = startY + idx * (barH + gap);
            const minutes = item.minutes || 0;
            const barW = (minutes / maxMinutes) * barMaxW;
            const color = normalizeHex(item.color || '94A3B8');

            slide.addText(item.category || 'Без категории', {
                x: labelX,
                y,
                w: labelW,
                h: barH,
                fontSize: 12,
                color: '334155'
            });
            slide.addShape(pptx.ShapeType.rect, {
                x: barX,
                y,
                w: Math.max(0.1, barW),
                h: barH,
                fill: { color },
                line: { color }
            });
            slide.addText(`${minutes} мин`, {
                x: valueX,
                y,
                w: 1.4,
                h: barH,
                fontSize: 12,
                color: subtitleColor
            });
        });
    });

    const fileName = `Отчет_эффективности_${safeFilePart(periodLabel)}.pptx`;
    await pptx.writeFile({ fileName });
};
