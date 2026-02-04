/** Цвета и градиенты для ProductionView (графики, простои по категориям). */

export const getCategoryColor = (category) => {
    const colors = [
        'bg-red-400', 'bg-pink-400', 'bg-purple-400', 'bg-indigo-400',
        'bg-blue-400', 'bg-cyan-400', 'bg-teal-400', 'bg-yellow-400',
        'bg-amber-400', 'bg-orange-400', 'bg-gray-400', 'bg-slate-400'
    ];
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export const CATEGORY_COLOR_HEX = {
    'bg-red-400': '#f87171',
    'bg-pink-400': '#f472b6',
    'bg-purple-400': '#c084fc',
    'bg-indigo-400': '#818cf8',
    'bg-blue-400': '#60a5fa',
    'bg-cyan-400': '#22d3ee',
    'bg-teal-400': '#2dd4bf',
    'bg-yellow-400': '#facc15',
    'bg-amber-400': '#fbbf24',
    'bg-orange-400': '#fb923c',
    'bg-gray-400': '#9ca3af',
    'bg-slate-400': '#94a3b8'
};

export const getCategoryColorHex = (category) => {
    const className = getCategoryColor(category);
    return CATEGORY_COLOR_HEX[className] || '#94a3b8';
};

export const buildConicGradient = (segments) => {
    if (!segments || segments.length === 0) return 'conic-gradient(#e2e8f0 0% 100%)';
    let current = 0;
    const parts = segments.map((seg) => {
        const start = current;
        const end = current + seg.percent;
        current = end;
        return `${seg.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
};
