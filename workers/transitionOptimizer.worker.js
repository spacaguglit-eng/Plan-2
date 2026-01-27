const PRODUCT_PARSE_PATTERN = /^(?<type>Сироп|Нектар|Сок|Топпинг|Основа|Концентрат|Морс|Лимонад|Пюре|Переборка|соус|Тоник|Энергетический напиток|Напиток(?: с витаминами| тонизирующий)?)\s+(?<flavor>.+?)(?=\s+\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|\s+0,33|\s+ТМ\s*[«"]|\s*[-–—]\s*\d|\s*$)(?:\s+(?<volume>\d+(?:[,.]\d+)?\s*(?:л|кг|мл|г)|0,33))?(?:\s+(?:ПЭТ|ст|бут))?(?:\s+ТМ\s*[«"](?<brand>[^"»]+)[»"])?(?:\s*[-–—]\s*(?<qty>[\d\s]+)\s*шт)?/iu;

const extractTypeFlavor = (value) => {
    if (!value) return { type: '', flavor: '' };
    const match = String(value).match(PRODUCT_PARSE_PATTERN);
    if (!match?.groups?.type || !match?.groups?.flavor) {
        return { type: '', flavor: '' };
    }
    return {
        type: match.groups.type.trim(),
        flavor: match.groups.flavor.trim()
    };
};

const buildTransitionKey = (type, flavor) => (
    [type, flavor]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
);

const normalizeTransitionValue = (value) => {
    if (!value) return '';
    const { type, flavor } = extractTypeFlavor(value);
    const key = buildTransitionKey(type, flavor);
    return key || String(value).trim().toLowerCase();
};

const parseExceptions = (value) => {
    if (!value) return new Set();
    return new Set(
        String(value)
            .split(/[,;\n]+/)
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => normalizeTransitionValue(item))
            .filter(Boolean)
    );
};

const buildRuleMap = (transitions) => {
    const map = new Map();
    (transitions || []).forEach((row) => {
        if (!row?.productName) return;
        const key = normalizeTransitionValue(row.productName);
        if (!key) return;
        console.log('[Worker] Rule key:', key, '| baseCip:', row.baseCip);
        map.set(key, {
            baseCip: row.baseCip || 'cip1',
            exceptions: {
                cip1: parseExceptions(row.cip1),
                cip2: parseExceptions(row.cip2),
                cip3: parseExceptions(row.cip3)
            }
        });
    });
    console.log('[Worker] Total rules in map:', map.size);
    return map;
};

const getCipKeyForPair = (rule, toName) => {
    if (!rule) return 'cip1';
    if (rule.exceptions.cip1.has(toName)) return 'cip1';
    if (rule.exceptions.cip2.has(toName)) return 'cip2';
    if (rule.exceptions.cip3.has(toName)) return 'cip3';
    return rule.baseCip || 'cip1';
};

const buildCostMatrix = (products, transitions, cipDurations) => {
    const rules = buildRuleMap(transitions);
    const durations = {
        cip1: Number(cipDurations?.cip1 || 0),
        cip2: Number(cipDurations?.cip2 || 0),
        cip3: Number(cipDurations?.cip3 || 0)
    };
    console.log('[Worker] CIP durations:', durations);
    const missingRules = new Set();
    const n = products.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
            if (i === j) continue;
            const from = products[i];
            const to = products[j];
            const rule = rules.get(from);
            const toRule = rules.get(to);
            if (!rule || !toRule) {
                if (!rule && !missingRules.has(from)) {
                    missingRules.add(from);
                    console.warn('[Worker] Missing transition rule for product:', from);
                }
                if (!toRule && !missingRules.has(to)) {
                    missingRules.add(to);
                    console.warn('[Worker] Missing transition rule for product:', to);
                }
                // Не считаем переходы, если нет правил хотя бы для одного продукта
                matrix[i][j] = 0;
                continue;
            }
            const cipKey = getCipKeyForPair(rule, to);
            if (i < 3 && j < 3) {
                console.log(`[Worker] ${from} → ${to} | rule:`, rule ? 'found' : 'NOT FOUND', '| cip:', cipKey, '| duration:', durations[cipKey] || 0);
            }
            matrix[i][j] = durations[cipKey] || 0;
        }
    }
    return matrix;
};

const solveHeldKarp = (matrix) => {
    const n = matrix.length;
    const totalMask = 1 << n;
    const dp = Array.from({ length: totalMask }, () => Array(n).fill(Infinity));
    const parent = Array.from({ length: totalMask }, () => Array(n).fill(-1));

    for (let i = 0; i < n; i += 1) {
        dp[1 << i][i] = 0;
    }

    for (let mask = 1; mask < totalMask; mask += 1) {
        for (let last = 0; last < n; last += 1) {
            if (!(mask & (1 << last))) continue;
            const prevMask = mask ^ (1 << last);
            if (prevMask === 0) continue;
            for (let prev = 0; prev < n; prev += 1) {
                if (!(prevMask & (1 << prev))) continue;
                const cost = dp[prevMask][prev] + matrix[prev][last];
                if (cost < dp[mask][last]) {
                    dp[mask][last] = cost;
                    parent[mask][last] = prev;
                }
            }
        }
    }

    let bestCost = Infinity;
    let bestLast = 0;
    for (let i = 0; i < n; i += 1) {
        if (dp[totalMask - 1][i] < bestCost) {
            bestCost = dp[totalMask - 1][i];
            bestLast = i;
        }
    }

    const order = [];
    let mask = totalMask - 1;
    let last = bestLast;
    while (last !== -1) {
        order.push(last);
        const prev = parent[mask][last];
        mask ^= 1 << last;
        last = prev;
    }
    order.reverse();
    return { order, totalCost: bestCost };
};

const getPathCost = (matrix, order) => {
    let cost = 0;
    for (let i = 0; i < order.length - 1; i += 1) {
        cost += matrix[order[i]][order[i + 1]] || 0;
    }
    return cost;
};

const shuffleInPlace = (array) => {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const solveNearestNeighbor = (matrix, start) => {
    const n = matrix.length;
    const visited = new Set([start]);
    const order = [start];
    while (order.length < n) {
        const last = order[order.length - 1];
        let next = -1;
        let nextCost = Infinity;
        for (let i = 0; i < n; i += 1) {
            if (visited.has(i)) continue;
            const cost = matrix[last][i];
            if (cost < nextCost) {
                nextCost = cost;
                next = i;
            }
        }
        if (next === -1) break;
        visited.add(next);
        order.push(next);
    }
    return order;
};

const twoOptImprove = (matrix, initialOrder) => {
    const order = initialOrder.slice();
    const n = order.length;
    if (n < 4) return order;
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 50) {
        improved = false;
        iterations += 1;
        for (let i = 1; i < n - 2; i += 1) {
            for (let k = i + 1; k < n - 1; k += 1) {
                const a = order[i - 1];
                const b = order[i];
                const c = order[k];
                const d = order[k + 1];
                const current = (matrix[a][b] || 0) + (matrix[c][d] || 0);
                const swapped = (matrix[a][c] || 0) + (matrix[b][d] || 0);
                if (swapped < current) {
                    const reversed = order.slice(i, k + 1).reverse();
                    order.splice(i, k - i + 1, ...reversed);
                    improved = true;
                }
            }
        }
    }
    return order;
};

const threeOptImprove = (matrix, initialOrder, options = {}) => {
    const order = initialOrder.slice();
    const n = order.length;
    if (n < 6) return order;
    const iterations = Math.max(20, Number(options.iterations || 120));
    const deadlineMs = Number(options.deadlineMs || Infinity);
    let bestCost = getPathCost(matrix, order);

    const buildCandidate = (i, j, k, mode) => {
        const head = order.slice(0, i);
        const seg1 = order.slice(i, j);
        const seg2 = order.slice(j, k);
        const tail = order.slice(k);
        if (mode === 1) return head.concat(seg1.slice().reverse(), seg2, tail);
        if (mode === 2) return head.concat(seg1, seg2.slice().reverse(), tail);
        if (mode === 3) return head.concat(seg1.slice().reverse(), seg2.slice().reverse(), tail);
        if (mode === 4) return head.concat(seg2, seg1, tail);
        return null;
    };

    for (let t = 0; t < iterations; t += 1) {
        if (Date.now() > deadlineMs) break;
        const i = 1 + Math.floor(Math.random() * (n - 4));
        const j = i + 1 + Math.floor(Math.random() * (n - i - 3));
        const k = j + 1 + Math.floor(Math.random() * (n - j - 2));
        for (let mode = 1; mode <= 4; mode += 1) {
            const candidate = buildCandidate(i, j, k, mode);
            if (!candidate) continue;
            const candidateCost = getPathCost(matrix, candidate);
            if (candidateCost < bestCost) {
                bestCost = candidateCost;
                order.splice(0, order.length, ...candidate);
            }
        }
    }

    return order;
};

const solveHeuristicTimed = (matrix, options = {}) => {
    const n = matrix.length;
    const timeBudgetMs = Math.max(100, Number(options.timeBudgetMs || 2000));
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const startTime = Date.now();
    const deadlineMs = startTime + timeBudgetMs;
    let lastProgress = 0;
    let best = { order: [], totalCost: Infinity };

    const reportProgress = (force = false) => {
        if (!onProgress) return;
        const elapsed = Date.now() - startTime;
        const progress = Math.min(0.95, elapsed / timeBudgetMs);
        if (force || progress - lastProgress >= 0.02) {
            lastProgress = progress;
            onProgress({ progress });
        }
    };

    const evaluate = (order) => {
        const improved = twoOptImprove(matrix, order);
        const withThreeOpt = threeOptImprove(matrix, improved, {
            iterations: Math.max(40, Math.floor(n * 4)),
            deadlineMs
        });
        const cost = getPathCost(matrix, withThreeOpt);
        if (cost < best.totalCost) {
            best = { order: withThreeOpt, totalCost: cost };
        }
    };

    for (let start = 0; start < n; start += 1) {
        evaluate(solveNearestNeighbor(matrix, start));
        reportProgress();
        if (Date.now() - startTime > timeBudgetMs) return best;
    }

    const baseOrder = Array.from({ length: n }, (_, idx) => idx);
    while (Date.now() - startTime <= timeBudgetMs) {
        const randomOrder = shuffleInPlace(baseOrder.slice());
        evaluate(randomOrder);
        reportProgress();
    }

    if (onProgress) onProgress({ progress: 1 });
    return best;
};

const resolveOptimization = (matrix, algorithm, timeBudgetMs, onProgress) => {
    const n = matrix.length;
    const algo = String(algorithm || 'auto').trim();
    if (algo === 'heldKarp') return solveHeldKarp(matrix);
    if (algo === 'heuristic') {
        return solveHeuristicTimed(matrix, { timeBudgetMs, onProgress });
    }
    if (n <= 10) return solveHeldKarp(matrix);
    return solveHeuristicTimed(matrix, { timeBudgetMs, onProgress });
};

self.onmessage = (event) => {
    const { type, payload } = event.data || {};
    const products = payload?.products || [];
    const transitions = payload?.transitions || [];
    const cipDurations = payload?.cipDurations || {};
    const timeBudgetMs = payload?.timeBudgetMs;
    const algorithm = payload?.algorithm;
    if (!type) return;
    if (!Array.isArray(products) || products.length === 0) {
        self.postMessage({ type: 'result', payload: { order: [], totalCost: 0 } });
        return;
    }
    const normalizedProducts = products.map(name => normalizeTransitionValue(name));
    const matrix = buildCostMatrix(normalizedProducts, transitions, cipDurations);
    if (type === 'compare') {
        const heldKarp = solveHeldKarp(matrix);
        const heuristic = solveHeuristicTimed(matrix, {
            timeBudgetMs,
            onProgress: (data) => {
                const payload = typeof data === 'number'
                    ? { progress: data }
                    : { progress: data?.progress ?? 0, nodesExplored: data?.nodesExplored };
                self.postMessage({ type: 'progress', payload });
            }
        });
        const heldKarpOrder = heldKarp.order.map(index => normalizedProducts[index]).filter(Boolean);
        const heuristicOrder = heuristic.order.map(index => normalizedProducts[index]).filter(Boolean);
        self.postMessage({
            type: 'compare',
            payload: {
                heldKarp: { ...heldKarp, order: heldKarpOrder },
                heuristic: { ...heuristic, order: heuristicOrder }
            }
        });
        return;
    }
    if (type === 'optimize') {
        const result = resolveOptimization(
            matrix,
            algorithm,
            timeBudgetMs,
            (data) => {
                const payload = typeof data === 'number'
                    ? { progress: data }
                    : { progress: data?.progress ?? 0, nodesExplored: data?.nodesExplored };
                self.postMessage({ type: 'progress', payload });
            }
        );
        const orderNames = result.order.map(index => normalizedProducts[index]).filter(Boolean);
        self.postMessage({ type: 'result', payload: { order: orderNames, totalCost: result.totalCost } });
    }
};
