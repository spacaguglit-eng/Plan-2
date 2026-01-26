import { cleanVal, extractShiftNumber, normalizeName, matchNames, isLineMatch, checkWorkerAvailability } from './utils.js';

const getSurnameNorm = (fullName) => {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  return normalizeName(first);
};

function buildDemandIndex(demandTable) {
  const headers = Array.isArray(demandTable?.[0]) ? demandTable[0] : [];
  const brigadesByDate = new Map();

  (demandTable || []).slice(1).forEach((row) => {
    let d = row?.[11];
    let dateStr = '';
    if (d instanceof Date) dateStr = d.toLocaleDateString('ru-RU');
    else if (typeof d === 'string') {
      const dateTry = new Date(d);
      if (!isNaN(dateTry.getTime())) dateStr = dateTry.toLocaleDateString('ru-RU');
      else dateStr = cleanVal(d);
    }
    if (!dateStr || dateStr.length < 5) return;

    const shiftType = cleanVal(row?.[13]);
    const brigadeRaw = cleanVal(row?.[14]);
    const shiftNum = extractShiftNumber(brigadeRaw);
    if (!shiftNum) return;

    if (!brigadesByDate.has(dateStr)) brigadesByDate.set(dateStr, {});
    const brigadesMap = brigadesByDate.get(dateStr);

    if (!brigadesMap[shiftNum]) brigadesMap[shiftNum] = { id: shiftNum, name: brigadeRaw, type: shiftType, activeLines: [] };

    for (let i = 15; i <= 26; i++) {
      const lineHeader = cleanVal(headers?.[i]);
      if (lineHeader && (parseInt(row?.[i]) || 0) > 0 && !brigadesMap[shiftNum].activeLines.includes(lineHeader)) {
        brigadesMap[shiftNum].activeLines.push(lineHeader);
      }
    }
  });

  return { headers, brigadesByDate };
}

function buildShiftsFromBrigadesMap({ targetDate, brigadesMap, lineTemplates, floaters, manualAssignments, workerRegistry, availabilityCache, autoReassignEnabled }) {
  if (!brigadesMap) return [];

  const getAvailabilityCached = (name) => {
    const k = `${name}|${targetDate}`;
    if (availabilityCache.has(k)) return availabilityCache.get(k);
    const v = checkWorkerAvailability(name, targetDate, workerRegistry);
    availabilityCache.set(k, v);
    return v;
  };

  return Object.values(brigadesMap).map((brigade) => {
    const shiftTypeLower = brigade.type ? String(brigade.type).toLowerCase() : '';
    const lineTasks = [];

    const allShiftWorkers = [];
    const workersById = new Map();
    const workersByNameHomeLine = new Map();

    Object.keys(lineTemplates || {}).forEach((lKey) => {
      (lineTemplates[lKey] || []).forEach((pos) => {
        const rawNames = pos?.roster?.[brigade.id];
        if (!rawNames) return;
        String(rawNames)
          .split(/[,;\n/]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1)
          .forEach((name) => {
            const avail = getAvailabilityCached(name);
            const worker = {
              name,
              role: pos.role,
              homeLine: lKey,
              id: `${name}_${brigade.id}`,
              isBusy: false,
              isAvailable: avail.available,
              statusReason: avail.reason,
            };
            allShiftWorkers.push(worker);
            workersById.set(worker.id, worker);
            workersByNameHomeLine.set(`${normalizeName(name)}|${lKey}`, worker);
          });
      });
    });

    const usedFloaterIds = new Set();
    Object.keys(manualAssignments || {}).forEach((key) => {
      if (key.startsWith(targetDate)) {
        const w = manualAssignments[key];
        if (w?.type !== 'vacancy') usedFloaterIds.add(w.originalId || w.id);
      }
    });

    (brigade.activeLines || []).forEach((activeLineName) => {
      const templateName = Object.keys(lineTemplates || {}).find((t) => isLineMatch(activeLineName, t));
      const positions = templateName ? lineTemplates[templateName] : [];
      const tasksForLine = [];

      if (positions.length > 0) {
        positions.forEach((pos) => {
          const assignedNamesStr = pos?.roster?.[brigade.id];
          const assignedNamesList = assignedNamesStr
            ? String(assignedNamesStr).split(/[,;\n/]+/).map((s) => s.trim()).filter((s) => s.length > 1)
            : [];

          const totalSlots = Math.max(pos.count, assignedNamesList.length);

          for (let i = 0; i < totalSlots; i++) {
            const slotId = `${targetDate}_${brigade.id}_${activeLineName}_${pos.role}_${i}`;
            const currentWorkerName = assignedNamesList[i] || null;
            let status = 'vacancy';

            if (currentWorkerName) {
              const wAvail = getAvailabilityCached(currentWorkerName);
              status = wAvail.available ? 'filled' : 'vacancy';
            }

            const manual = manualAssignments?.[slotId];
            if (manual) status = manual.type === 'vacancy' ? 'vacancy' : 'manual';

            if (status === 'filled' && currentWorkerName) {
              const wAvail = getAvailabilityCached(currentWorkerName);
              if (!wAvail.available) status = 'vacancy';
            }

            tasksForLine.push({
              status,
              roleTitle: pos.role,
              slotId,
              isManualVacancy: manualAssignments?.[slotId]?.type === 'vacancy',
              currentWorkerName,
              assigned: manual || (status === 'filled' ? { name: currentWorkerName } : null),
            });

            if (manual && manual.type !== 'vacancy' && manual.type !== 'floater') {
              const w = workersById.get(manual.originalId || manual.id);
              if (w) w.isBusy = true;
            } else if (!manual && status === 'filled' && currentWorkerName) {
              const w = workersByNameHomeLine.get(`${normalizeName(currentWorkerName)}|${templateName || ''}`);
              if (w) w.isBusy = true;
            }
          }
        });
      }

      lineTasks.push({ slots: tasksForLine, displayName: templateName || activeLineName });
    });

    const freeAgents = allShiftWorkers.filter((w) => !w.isBusy && w.isAvailable);
    
    // Автоподстановка работает только если включена
    if (autoReassignEnabled) {
      lineTasks.forEach((lt) => {
        lt.slots.forEach((slot) => {
          if (slot.status === 'vacancy' && !slot.isManualVacancy && freeAgents.length > 0) {
            let idx = freeAgents.findIndex((a) => a.role === slot.roleTitle);
            if (idx === -1) {
              idx = freeAgents.findIndex((a) => {
                const registryEntry = workerRegistry?.[a.name];
                return registryEntry && registryEntry.competencies?.has && registryEntry.competencies.has(slot.roleTitle);
              });
            }
            if (idx >= 0) {
              slot.status = 'reassigned';
              slot.assigned = freeAgents[idx];
              freeAgents[idx].isBusy = true;
              freeAgents.splice(idx, 1);
            }
          }
        });
      });
    }

    const baseFloaters = shiftTypeLower.includes('день') ? [...(floaters?.day || [])] : [...(floaters?.night || [])];
    const freeFloaters = baseFloaters.filter((f) => !usedFloaterIds.has(f.id));
    const totalRequired = lineTasks.reduce((sum, lt) => sum + lt.slots.length, 0);
    const filledSlots = lineTasks.reduce((sum, lt) => sum + lt.slots.filter((s) => s.status !== 'vacancy' && s.status !== 'unknown').length, 0);

    return {
      id: brigade.id,
      name: brigade.name,
      type: brigade.type,
      lineTasks,
      unassignedPeople: allShiftWorkers.filter((w) => !w.isBusy),
      floaters: freeFloaters,
      totalRequired,
      filledSlots,
    };
  });
}

function buildChessTable(payload) {
  const { scheduleDates, demand, lineTemplates, floaters, manualAssignments, workerRegistry: rawWorkerRegistry, factData, autoReassignEnabled } = payload;
  const dates = Array.isArray(scheduleDates) ? scheduleDates : [];
  if (!demand || dates.length === 0) return null;

  // Restore competencies Set for reassignment logic
  const workerRegistry = {};
  Object.entries(rawWorkerRegistry || {}).forEach(([k, v]) => {
    workerRegistry[k] = { ...v, competencies: new Set(v?.competencies || []) };
  });

  const demandIndex = buildDemandIndex(demand);
  const availabilityCache = new Map();
  const shiftsByDate = new Map();
  dates.forEach((dateStr) => {
    shiftsByDate.set(
      dateStr,
      buildShiftsFromBrigadesMap({
        targetDate: dateStr,
        brigadesMap: demandIndex.brigadesByDate.get(dateStr),
        lineTemplates,
        floaters,
        manualAssignments,
        workerRegistry,
        availabilityCache,
        autoReassignEnabled
      })
    );
  });

  // --- Build workers list ---
  const workerMeta = new Map();
  Object.keys(lineTemplates || {}).forEach((lineKey) => {
    (lineTemplates[lineKey] || []).forEach((pos) => {
      const roster = pos?.roster || {};
      Object.entries(roster).forEach(([bId, val]) => {
        if (!val) return;
        String(val)
          .split(/[,;\n/]+/)
          .map((n) => n.trim())
          .filter((n) => n.length > 1)
          .forEach((name) => {
            if (!workerMeta.has(name)) {
              workerMeta.set(name, { name, role: pos.role, homeLine: lineKey, homeBrigades: new Set(), category: 'staff', sortShift: 99 });
            }
            const w = workerMeta.get(name);
            w.homeBrigades.add(bId);
            w.sortShift = Math.min(w.sortShift, parseInt(bId) || 99);
          });
      });
    });
  });

  (floaters?.day || []).forEach((f) => {
    if (!f?.name) return;
    if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Д', homeBrigades: new Set(), category: 'floater_day', sortShift: 100 });
  });
  (floaters?.night || []).forEach((f) => {
    if (!f?.name) return;
    if (!workerMeta.has(f.name)) workerMeta.set(f.name, { name: f.name, role: 'Подсобник', homeLine: 'Резерв Н', homeBrigades: new Set(), category: 'floater_night', sortShift: 101 });
  });

  const workers = Array.from(workerMeta.values()).sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));
  const workerLookupByNorm = new Map();
  const workersBySurname = new Map();
  workers.forEach((w) => {
    const norm = normalizeName(w.name);
    workerLookupByNorm.set(norm, w);
    const surname = getSurnameNorm(w.name);
    if (!workersBySurname.has(surname)) workersBySurname.set(surname, []);
    workersBySurname.get(surname).push(w);
  });

  // --- Facts index ---
  const factLookupByDate = new Map();
  const factBySurnameByDate = new Map();
  if (factData) {
    Object.entries(factData).forEach(([date, dateData]) => {
      const dateMap = new Map();
      const surnameMap = new Map();
      Object.values(dateData || {}).forEach((factEntry) => {
        if (!factEntry) return;
        const rawName = factEntry.rawName || '';
        const norm = normalizeName(rawName);
        if (norm) dateMap.set(norm, factEntry);
        const surname = getSurnameNorm(rawName);
        if (!surnameMap.has(surname)) surnameMap.set(surname, []);
        surnameMap.get(surname).push(factEntry);
      });
      factLookupByDate.set(date, dateMap);
      factBySurnameByDate.set(date, surnameMap);
    });
  }

  const resolveFactEntry = (dateStr, workerName) => {
    const dateMap = factLookupByDate.get(dateStr);
    if (!dateMap) return null;
    const normName = normalizeName(workerName);
    const exact = dateMap.get(normName);
    if (exact) return exact;
    const surname = getSurnameNorm(workerName);
    const surnameMap = factBySurnameByDate.get(dateStr);
    const candidates = surnameMap?.get(surname) || [];
    for (const candidate of candidates) {
      if (candidate?.rawName && matchNames(workerName, candidate.rawName)) return candidate;
    }
    return null;
  };

  // --- Add unexpected workers ---
  if (factData) {
    const unexpectedWorkersMap = new Map();
    dates.forEach((date) => {
      const surnameMap = factBySurnameByDate.get(date);
      if (!surnameMap) return;
      surnameMap.forEach((entries) => {
        entries.forEach((factEntry) => {
          if (!factEntry?.rawName) return;
          if (!factEntry.cleanTime) return;
          const factNormName = normalizeName(factEntry.rawName);
          if (workerLookupByNorm.has(factNormName)) return;

          const surname = getSurnameNorm(factEntry.rawName);
          const candidates = workersBySurname.get(surname) || [];
          let foundInPlan = false;
          for (const w of candidates) {
            if (matchNames(w.name, factEntry.rawName)) { foundInPlan = true; break; }
          }
          if (foundInPlan) return;

          if (!unexpectedWorkersMap.has(factNormName)) {
            const regEntry = rawWorkerRegistry?.[factEntry.rawName] || null;
            unexpectedWorkersMap.set(factNormName, {
              name: factEntry.rawName,
              role: regEntry?.role || 'Неизвестно',
              homeLine: 'Вне плана',
              homeBrigades: new Set(),
              category: 'unexpected',
              sortShift: 102,
              cells: {},
            });
          }
        });
      });
    });

    if (unexpectedWorkersMap.size > 0) {
      unexpectedWorkersMap.forEach((w) => workers.push(w));
      workers.sort((a, b) => (a.category === 'staff' ? a.sortShift - b.sortShift : 10) || a.name.localeCompare(b.name));
    }
  }

  // --- Fill cells ---
  workers.forEach((w) => { w.cells = {}; });

  const getAvailabilityCached = (name, dateStr) => {
    const k = `${name}|${dateStr}`;
    if (availabilityCache.has(k)) return availabilityCache.get(k);
    const v = checkWorkerAvailability(name, dateStr, workerRegistry);
    availabilityCache.set(k, v);
    return v;
  };

  dates.forEach((date) => {
    const shiftsOnDate = shiftsByDate.get(date) || [];
    const workingWorkers = new Map();
    const idleWorkers = new Map();

    shiftsOnDate.forEach((shift) => {
      const isNight = String(shift.type || '').toLowerCase().includes('ночь');
      const shiftCode = isNight ? 'Н' : 'Д';
      shift.lineTasks.forEach((task) => {
        task.slots.forEach((slot) => {
          if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
            const wName = slot.assigned.name;
            if (slot.assigned.type === 'external') {
              workingWorkers.set(wName, { code: 'РВ', brigadeId: shift.id, isRv: true });
            } else {
              const current = workingWorkers.get(wName);
              const code = current && current.code !== shiftCode && !current.isRv ? 'Д/Н' : shiftCode;
              workingWorkers.set(wName, { code, brigadeId: shift.id });
            }
          }
        });
      });
      shift.unassignedPeople.forEach((p) => { if (p.isAvailable) idleWorkers.set(p.name, shift.id); });
      shift.floaters.forEach((f) => idleWorkers.set(f.name, shift.id));
    });

    workers.forEach((worker) => {
      let text = '';
      let color = 'bg-white';
      let brigadeId = null;
      let verificationStatus = null;

      const avail = getAvailabilityCached(worker.name, date);
      if (!avail.available) {
        if (avail.type === 'vacation') { text = 'О'; color = 'bg-emerald-50 text-emerald-700 border-emerald-200'; }
        else if (avail.type === 'sick') { text = 'Б'; color = 'bg-amber-50 text-amber-700 border-amber-200'; }
        else if (avail.type === 'fired') { text = 'У'; color = 'bg-slate-200 text-slate-500'; }
      } else if (workingWorkers.has(worker.name)) {
        const workData = workingWorkers.get(worker.name);
        text = workData.code;
        brigadeId = workData.brigadeId;
        if (text === 'Д') color = 'bg-green-100 text-green-800 border-green-200 font-bold';
        else if (text === 'Н') color = 'bg-blue-100 text-blue-800 border-blue-200 font-bold';
        else if (text === 'Д/Н') color = 'bg-teal-100 text-teal-800 border-teal-200 font-bold';
        else if (text === 'РВ') color = 'bg-orange-100 text-orange-700 border-orange-200 font-bold';

        const factEntry = resolveFactEntry(date, worker.name);
        if (factEntry) {
          if (factEntry.cleanTime) {
            verificationStatus = 'ok';
            if (!color.includes('ring-')) color = color.replace(/border-\\w+-\\d+/g, '').trim() + ' ring-2 ring-green-500';
          } else {
            verificationStatus = 'missing';
            if (!color.includes('ring-')) color = color.replace(/border-\\w+-\\d+/g, '').trim() + ' ring-2 ring-red-500';
          }
        }
      } else if (idleWorkers.has(worker.name)) {
        text = '—';
        color = 'bg-yellow-100 text-yellow-800 border-yellow-200 font-bold';
        brigadeId = idleWorkers.get(worker.name);

        const factEntry = resolveFactEntry(date, worker.name);
        if (factEntry) {
          if (factEntry.cleanTime) {
            verificationStatus = 'unassigned';
          } else {
            verificationStatus = 'missing';
            if (!color.includes('ring-')) color = color.replace(/border-\\w+-\\d+/g, '').trim() + ' ring-2 ring-red-500';
          }
        }
      } else {
        const factEntry = resolveFactEntry(date, worker.name);
        if (factEntry && factEntry.cleanTime) {
          verificationStatus = 'unexpected';
          text = '!';
          color = 'bg-orange-50 text-orange-700 border-orange-200 font-bold';
        }
      }

      worker.cells[date] = { text, color, brigadeId, verificationStatus };
    });
  });

  // Serialize Set for structured clone
  const workersOut = workers.map((w) => ({
    ...w,
    homeBrigades: Array.from(w.homeBrigades || []),
  }));

  return { dates, workers: workersOut };
}

self.onmessage = (e) => {
  const { requestId, payload } = e.data || {};
  try {
    const result = buildChessTable(payload);
    self.postMessage({ requestId, result });
  } catch (err) {
    self.postMessage({ requestId, error: err?.message || String(err) });
  }
};

