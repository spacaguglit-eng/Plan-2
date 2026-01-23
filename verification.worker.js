import { normalizeName, matchNames } from './utils.js';

const getSurnameNorm = (fullName) => {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  return normalizeName(first);
};

const buildDepartmentIndex = (allEmployeesData) => {
  const exact = new Map();
  const bySurname = new Map();

  Object.values(allEmployeesData || {}).forEach((emp) => {
    if (!emp?.name || !emp?.department) return;
    const normName = normalizeName(emp.name);
    exact.set(normName, emp.department);
    const surname = getSurnameNorm(emp.name);
    if (!bySurname.has(surname)) bySurname.set(surname, []);
    bySurname.get(surname).push({ name: emp.name, department: emp.department });
  });

  return { exact, bySurname };
};

const buildFactMap = (dayFact) => {
  const byNormKey = new Map();
  const byNormRawName = new Map();
  const bySurname = new Map();

  Object.entries(dayFact || {}).forEach(([key, value]) => {
    if (!value) return;
    const normKey = normalizeName(key);
    byNormKey.set(normKey, value);
    if (value.rawName) {
      const normRawName = normalizeName(value.rawName);
      byNormRawName.set(normRawName, value);
      const surname = getSurnameNorm(value.rawName);
      if (!bySurname.has(surname)) bySurname.set(surname, []);
      bySurname.get(surname).push(value);
    }
  });

  return { byNormKey, byNormRawName, bySurname };
};

const buildRegistryIndex = (workerRegistry) => {
  const byNorm = new Map();
  const bySurname = new Map();
  Object.values(workerRegistry || {}).forEach((worker) => {
    if (!worker?.name) return;
    const norm = normalizeName(worker.name);
    byNorm.set(norm, worker);
    const surname = getSurnameNorm(worker.name);
    if (!bySurname.has(surname)) bySurname.set(surname, []);
    bySurname.get(surname).push(worker);
  });
  return { byNorm, bySurname };
};

const formatFactTime = (factEntry) => {
  if (!factEntry) return '-';
  if (factEntry.hasOvernightShift && factEntry.nextDayExit) {
    return `${factEntry.entryTime} → ${factEntry.nextDayExit} (+1)`;
  }
  if (factEntry.hasOvernightShift) {
    return `Вход: ${factEntry.entryTime} (ночная)`;
  }
  if (factEntry.entryTime && !factEntry.exitTime) {
    return `Вход: ${factEntry.entryTime}`;
  }
  if (factEntry.entryTime && factEntry.exitTime) {
    return `${factEntry.entryTime} → ${factEntry.exitTime}`;
  }
  return factEntry.time || '-';
};

const resolveFactEntry = (planName, factMap) => {
  const normName = normalizeName(planName);
  let factEntry = factMap.byNormKey.get(normName) || factMap.byNormRawName.get(normName);
  if (factEntry) return factEntry;

  const surname = getSurnameNorm(planName);
  const candidates = factMap.bySurname.get(surname) || [];
  for (const candidate of candidates) {
    if (candidate?.rawName && matchNames(planName, candidate.rawName)) return candidate;
  }
  return null;
};

const buildComparisonResult = (payload) => {
  const { selectedDate, planEntries, dayFact, allEmployeesData, workerRegistry } = payload || {};
  if (!selectedDate || !dayFact) return { comparisonResult: [] };

  const factMap = buildFactMap(dayFact);
  const deptIndex = buildDepartmentIndex(allEmployeesData);
  const deptCache = new Map();
  const registryIndex = buildRegistryIndex(workerRegistry);

  const getDepartment = (name) => {
    const cacheKey = String(name || '');
    if (deptCache.has(cacheKey)) return deptCache.get(cacheKey);
    const norm = normalizeName(name);
    const exact = deptIndex.exact.get(norm);
    if (exact) {
      deptCache.set(cacheKey, exact);
      return exact;
    }
    const surname = getSurnameNorm(name);
    const candidates = deptIndex.bySurname.get(surname) || [];
    for (const emp of candidates) {
      if (matchNames(emp.name, name)) {
        deptCache.set(cacheKey, emp.department);
        return emp.department;
      }
    }
    deptCache.set(cacheKey, '');
    return '';
  };

  const result = [];
  const processedFactNames = new Set();
  const processedBySurname = new Map();
  const markProcessed = (rawName) => {
    const norm = normalizeName(rawName);
    processedFactNames.add(norm);
    const surname = getSurnameNorm(rawName);
    if (!processedBySurname.has(surname)) processedBySurname.set(surname, []);
    processedBySurname.get(surname).push(rawName);
  };

  (planEntries || []).forEach((entry) => {
    const planName = entry.name;
    const factEntry = resolveFactEntry(planName, factMap);
    if (factEntry?.rawName) markProcessed(factEntry.rawName);

    const status = !factEntry || !factEntry.cleanTime ? 'missing' : 'ok';
    const timeDisplay = formatFactTime(factEntry);
    const department = getDepartment(planName);

    result.push({
      name: planName,
      role: entry.role,
      shift: entry.shift,
      line: entry.line,
      plan: true,
      fact: !!(factEntry && factEntry.cleanTime),
      time: timeDisplay,
      status,
      details: entry.details,
      timeInfo: factEntry,
      department
    });
  });

  Object.values(dayFact || {}).forEach((entry) => {
    if (!entry?.rawName || !entry.cleanTime) return;
    const normName = normalizeName(entry.rawName);
    let wasProcessed = processedFactNames.has(normName);
    if (!wasProcessed) {
      const surname = getSurnameNorm(entry.rawName);
      const processedCandidates = processedBySurname.get(surname) || [];
      for (const processedName of processedCandidates) {
        if (matchNames(entry.rawName, processedName)) {
          wasProcessed = true;
          break;
        }
      }
    }

    if (!wasProcessed) {
      let regEntry = registryIndex.byNorm.get(normName);
      if (!regEntry) {
        const surname = getSurnameNorm(entry.rawName);
        const candidates = registryIndex.bySurname.get(surname) || [];
        for (const worker of candidates) {
          if (matchNames(worker.name, entry.rawName)) {
            regEntry = worker;
            break;
          }
        }
      }

      result.push({
        name: entry.rawName,
        role: regEntry ? regEntry.role : 'Неизвестно',
        shift: '-',
        line: '-',
        plan: false,
        fact: true,
        time: formatFactTime(entry),
        status: 'unexpected',
        details: regEntry,
        timeInfo: entry,
        department: getDepartment(entry.rawName)
      });
    }
  });

  return { comparisonResult: result };
};

self.onmessage = (e) => {
  const { requestId, payload } = e.data || {};
  try {
    const result = buildComparisonResult(payload);
    self.postMessage({ requestId, result });
  } catch (err) {
    self.postMessage({ requestId, error: err?.message || String(err) });
  }
};

