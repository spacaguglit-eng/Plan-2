export const parseTimeToMinutes = (value) => {
    if (!value || !String(value).includes(':')) return null;
    const [h, m] = String(value).split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(1439, h * 60 + m));
};

export const parseDateToDayIndex = (value) => {
    if (!value || !String(value).includes('.')) return null;
    const parts = String(value).split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    const utc = Date.UTC(year, month - 1, day);
    return Number.isFinite(utc) ? Math.floor(utc / 86400000) : null;
};

export const formatDayIndexToDate = (dayIndex) => {
    if (!Number.isFinite(dayIndex)) return '01.01.1970';
    const date = new Date(dayIndex * 86400000);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
};

export const dateToInputValue = (dateStr) => {
    if (!dateStr || !String(dateStr).includes('.')) return '';
    const parts = String(dateStr).split('.');
    const [d, m, y] = parts;
    if (!d || !m || !y) return '';
    return `${y}-${m}-${d}`;
};

export const normalizeInputDate = (value) => {
    if (!value || !String(value).includes('-')) return value;
    const [y, m, d] = String(value).split('-');
    if (!y || !m || !d) return value;
    return `${d}.${m}.${y}`;
};

export const buildAbsMinutes = (dateStr, timeStr) => {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null) return null;
    const minutes = parseTimeToMinutes(timeStr);
    return minutes == null ? null : dayIdx * 1440 + minutes;
};

export const addDaysToDate = (dateStr, days) => {
    const dayIdx = parseDateToDayIndex(dateStr);
    if (dayIdx == null || !Number.isFinite(days)) return dateStr;
    return formatDayIndexToDate(dayIdx + days);
};

export const getCompetenciesList = (competencies) => {
    if (!competencies) return [];
    return Array.isArray(competencies) ? competencies : Array.from(competencies);
};

export const hasCompetencyForRole = (worker, roleTitle) => {
    if (!worker?.competencies || !roleTitle) return false;
    const comps = worker.competencies;
    return (comps instanceof Set && comps.has(roleTitle)) || (Array.isArray(comps) && comps.includes(roleTitle));
};

export const hasAnyCompetencies = (competencies) => {
    if (!competencies) return false;
    return Array.isArray(competencies) ? competencies.length > 0 : competencies.size > 0;
};

const escapeHtml = (s) => {
    if (s == null) return '';
    const str = String(s);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

export const buildArrangementHtml = (shiftsData, selectedDate) => {
    if (!shiftsData || shiftsData.length === 0) return '';
    const rows = [];
    shiftsData.forEach((shift) => {
        (shift.lineTasks || []).forEach((task) => {
            (task.slots || []).forEach((slot) => {
                const name = slot.assigned?.name ?? slot.currentWorkerName ?? (slot.status === 'outsourced' ? 'Аутсорс' : '—');
                const role = slot.roleTitle || '—';
                const status = slot.status === 'outsourced' ? ' (аутсорс)' : slot.status === 'manual' ? ' (руч.)' : slot.status === 'reassigned' ? ' (авто)' : '';
                rows.push({
                    shift: `${shift.name || shift.id} · ${shift.type || ''}`,
                    line: task.displayName || '—',
                    role: role,
                    name: name,
                    status
                });
            });
        });
    });
    const tableRows = rows
        .map(
            (r) =>
                `<tr><td>${escapeHtml(r.shift)}</td><td>${escapeHtml(r.line)}</td><td>${escapeHtml(r.role)}</td><td>${escapeHtml(r.name)}</td><td class="muted">${escapeHtml(r.status)}</td></tr>`
        )
        .join('');
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Расстановка ${escapeHtml(selectedDate)}</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; margin: 1rem; color: #1e293b; }
h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
.muted { color: #64748b; font-size: 0.875rem; }
table { border-collapse: collapse; width: 100%; max-width: 900px; }
th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
th { background: #f1f5f9; font-weight: 600; font-size: 0.875rem; }
tr:nth-child(even) { background: #f8fafc; }
</style>
</head>
<body>
<h1>Расстановка на ${escapeHtml(selectedDate)}</h1>
<table>
<thead><tr><th>Смена</th><th>Линия</th><th>Роль</th><th>Сотрудник</th><th>Примечание</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>
</body>
</html>`;
};
