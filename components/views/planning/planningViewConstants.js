import { BarChart2, Package, Zap, Beaker, GitBranch, Replace } from 'lucide-react';

export const TRANSITION_RULES_VERSION = 'rules_sets_2026_01_27';
export const TRANSITION_PAGE_SIZE = 20;
export const CIP_FALLBACK_DURATION_MIN = 15;

export const tabItems = [
    { id: 'schedule', label: 'График', icon: BarChart2 },
    { id: 'products', label: 'База продуктов', icon: Package },
    { id: 'speeds', label: 'Скорости', icon: Zap },
    { id: 'cips', label: 'CIP', icon: Beaker },
    { id: 'transitions', label: 'Переходы', icon: GitBranch },
    { id: 'displacement', label: 'Вытеснения', icon: Replace }
];
