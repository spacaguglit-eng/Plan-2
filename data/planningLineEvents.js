/**
 * Единственный источник данных по событиям планирования (CIP и прочие).
 * Используется для расчёта кратчайшего пути и отображения на вкладке «CIP».
 */

export const PLANNING_EVENT_CATEGORIES = {
    cip1: 'CIP 1',
    cip2: 'CIP 2',
    cip3: 'CIP 3',
    perenaladka: 'Переналадка',
    smenaAssortimenta: 'Смена ассортимента',
    vytesnenie: 'Вытеснение'
};

/**
 * Приводит старые названия категорий в загруженных событиях к новым.
 * При загрузке состояния/плана со старыми именами (CIP1 (холодная вода), Переналадка формата и т.д.)
 * подставляет PLANNING_EVENT_CATEGORIES, чтобы getCipDuration и оптимизатор находили длительности.
 * @param {Array<{ category: string, durations?: object }>} events
 * @returns {Array<{ category: string, durations?: object }>}
 */
export function migrateLineEventsCategories(events) {
    if (!Array.isArray(events)) return [];
    return events.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const c = item.category;
        if (c == null || c === '') return item;
        let newCategory = null;
        if (/CIP\s*1/i.test(c) || /CIP1/i.test(c)) {
            newCategory = PLANNING_EVENT_CATEGORIES.cip1;
        } else if (/CIP\s*2/i.test(c) || /CIP2/i.test(c)) {
            newCategory = PLANNING_EVENT_CATEGORIES.cip2;
        } else if (/CIP\s*3/i.test(c) || /CIP3/i.test(c)) {
            newCategory = PLANNING_EVENT_CATEGORIES.cip3;
        } else if (/Переналадка/i.test(c)) {
            newCategory = PLANNING_EVENT_CATEGORIES.perenaladka;
        } else if (/Смена ассортимента/i.test(c)) {
            newCategory = PLANNING_EVENT_CATEGORIES.smenaAssortimenta;
        } else if (/Вытеснение/i.test(c)) {
            newCategory = PLANNING_EVENT_CATEGORIES.vytesnenie;
        }
        if (newCategory) return { ...item, category: newCategory };
        return item;
    });
}

export const DEFAULT_LINE_EVENTS = [
    {
        category: PLANNING_EVENT_CATEGORIES.smenaAssortimenta,
        durations: {
            'Линия 1': 15,
            'Линия 2': 15,
            'Линия 3': 15,
            'Линия 4': 15,
            'Линия 5 (Сиропы)': 15,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 15,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 15,
            'Линия 11 (Лимонады)': 15
        }
    },
    {
        category: PLANNING_EVENT_CATEGORIES.perenaladka,
        durations: {
            'Линия 1': 120,
            'Линия 2': 120,
            'Линия 3': 60,
            'Линия 4': 60,
            'Линия 5 (Сиропы)': 240,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 0,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 0,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: PLANNING_EVENT_CATEGORIES.cip1,
        durations: {
            'Линия 1': 40,
            'Линия 2': 40,
            'Линия 3': 40,
            'Линия 4': 150,
            'Линия 5 (Сиропы)': 20,
            'Линия 6 (Bag-in-Box)': 0,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 0,
            'Линия 9 (Пюре)': 0,
            'Линия 10 (ПЭТ)': 0,
            'Линия 11 (Лимонады)': 0
        }
    },
    {
        category: PLANNING_EVENT_CATEGORIES.cip2,
        durations: {
            'Линия 1': 240,
            'Линия 2': 240,
            'Линия 3': 240,
            'Линия 4': 240,
            'Линия 5 (Сиропы)': 240,
            'Линия 6 (Bag-in-Box)': 120,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 240,
            'Линия 9 (Пюре)': 240,
            'Линия 10 (ПЭТ)': 240,
            'Линия 11 (Лимонады)': 240
        }
    },
    {
        category: PLANNING_EVENT_CATEGORIES.cip3,
        durations: {
            'Линия 1': 300,
            'Линия 2': 300,
            'Линия 3': 300,
            'Линия 4': 300,
            'Линия 5 (Сиропы)': 300,
            'Линия 6 (Bag-in-Box)': 180,
            'Линия 7 (Топпинги)': 0,
            'Линия 8 (Соусы)': 300,
            'Линия 9 (Пюре)': 300,
            'Линия 10 (ПЭТ)': 300,
            'Линия 11 (Лимонады)': 300
        }
    },
    {
        category: PLANNING_EVENT_CATEGORIES.vytesnenie,
        durations: {
            'Линия 1': 30,
            'Линия 2': 30,
            'Линия 3': 30,
            'Линия 4': 30,
            'Линия 5 (Сиропы)': 30,
            'Линия 6 (Bag-in-Box)': 30,
            'Линия 7 (Топпинги)': 30,
            'Линия 8 (Соусы)': 30,
            'Линия 9 (Пюре)': 30,
            'Линия 10 (ПЭТ)': 30,
            'Линия 11 (Лимонады)': 30
        }
    }
];
