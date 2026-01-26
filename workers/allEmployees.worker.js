const normalizeName = (name) => {
    return String(name).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я]/g, '');
};

const matchNames = (name1, name2) => {
    if (!name1 || !name2) return false;
    const n1 = String(name1).toLowerCase().trim();
    const n2 = String(name2).toLowerCase().trim();
    if (normalizeName(n1) === normalizeName(n2)) return true;
    const parts1 = n1.split(/\s+/).filter(p => p.length > 0);
    const parts2 = n2.split(/\s+/).filter(p => p.length > 0);
    if (parts1.length === 0 || parts2.length === 0) return false;
    const surname1 = normalizeName(parts1[0]);
    const surname2 = normalizeName(parts2[0]);
    if (surname1 !== surname2) return false;
    if (parts1.length === 1 && parts2.length === 1) return true;
    const firstName1 = parts1.length >= 2 ? parts1[1].replace(/\./g, '').trim() : '';
    const firstName2 = parts2.length >= 2 ? parts2[1].trim() : '';
    const middleName1 = parts1.length >= 3 ? parts1[2].replace(/\./g, '').trim() : '';
    const middleName2 = parts2.length >= 3 ? parts2[2].trim() : '';
    let firstNameMatch = false;
    if (firstName1 && firstName2) {
        if ((firstName1.length === 1 && firstName2.length > 1) ||
            (firstName1.length > 1 && firstName2.length === 1) ||
            (firstName1[0] === firstName2[0])) {
            firstNameMatch = firstName1[0] === firstName2[0];
        }
    } else if (!firstName1 && !firstName2) {
        firstNameMatch = true;
    }
    let middleNameMatch = false;
    if (middleName1 && middleName2) {
        if ((middleName1.length === 1 && middleName2.length > 1) ||
            (middleName1.length > 1 && middleName2.length === 1) ||
            (middleName1[0] === middleName2[0])) {
            middleNameMatch = middleName1[0] === middleName2[0];
        }
    } else if (!middleName1 && !middleName2) {
        middleNameMatch = true;
    } else if ((!middleName1 && middleName2) || (middleName1 && !middleName2)) {
        middleNameMatch = true;
    }
    if (firstNameMatch) {
        if (middleName1 || middleName2) return middleNameMatch;
        return true;
    }
    if (firstName1 && firstName2 && firstName1[0] === firstName2[0]) {
        if (middleName1 && middleName2 && middleName1[0] === middleName2[0]) return true;
        if (!middleName1 && !middleName2) return true;
    }
    const n1Clean = normalizeName(n1);
    const n2Clean = normalizeName(n2);
    if (n1Clean.length > 8 && n2Clean.length > 8) {
        if (n1Clean.includes(n2Clean) || n2Clean.includes(n1Clean)) return true;
    }
    return false;
};

const cleanVal = (val) => String(val ?? '').trim();
const extractShiftNumber = (str) => (String(str).match(/\d+/) || [])[0] || null;

const isLineMatch = (planLine, rosterLine) => {
    if (!planLine || !rosterLine) return false;
    const p = String(planLine).toLowerCase().trim();
    const r = String(rosterLine).toLowerCase().trim();
    const pClean = p.replace(/[^a-zа-я0-9]/g, '');
    const rClean = r.replace(/[^a-zа-я0-9]/g, '');
    if (pClean === rClean) return true;
    if (pClean.length > 3 && rClean.length > 3) {
        if (pClean.includes(rClean) || rClean.includes(pClean)) return true;
    }
    const pNums = p.match(/\d+/g);
    const rNums = r.match(/\d+/g);
    if (pNums && rNums) {
        return pNums.some(pn => rNums.includes(pn));
    }
    return false;
};

const calculateHours = (entryTime, exitTime) => {
    if (!entryTime || !exitTime) return null;
    const parseTime = (timeStr) => {
        const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        return hours * 60 + minutes;
    };
    const entryMinutes = parseTime(entryTime);
    const exitMinutes = parseTime(exitTime);
    if (entryMinutes === null || exitMinutes === null) return null;
    let diffMinutes = exitMinutes - entryMinutes;
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return { hours, minutes, totalMinutes: diffMinutes };
};

const validateFactEntry = (factEntry) => {
    if (!factEntry) return 'missing';
    if (factEntry.cleanTime) return 'ok';
    if (factEntry.entryTime && factEntry.exitTime) return 'ok';
    if (factEntry.entryTime && !factEntry.exitTime) return 'incomplete';
    if (!factEntry.entryTime && factEntry.exitTime) return 'incomplete';
    return 'missing';
};

const getShiftsFromSavedPlan = (planData, date) => {
    if (!planData || !planData.data) return [];
    const { rawTables, lineTemplates, manualAssignments } = planData.data;
    if (!rawTables?.demand || !Array.isArray(rawTables.demand)) return [];
    const demandData = rawTables.demand;
    const headers = Array.isArray(demandData[0]) ? demandData[0] : [];
    const brigadesMap = {};
    demandData.slice(1).forEach(row => {
        if (!row) return;
        let d = row[11];
        let dateStr = '';
        if (d instanceof Date) dateStr = d.toLocaleDateString('ru-RU');
        else if (typeof d === 'string') {
            const dateTry = new Date(d);
            if (!isNaN(dateTry.getTime())) dateStr = dateTry.toLocaleDateString('ru-RU');
            else dateStr = cleanVal(d);
        }
        if (dateStr !== date) return;
        const shiftType = cleanVal(row[13]);
        const brigadeRaw = cleanVal(row[14]);
        const shiftNum = extractShiftNumber(brigadeRaw);
        if (!shiftNum) return;
        if (!brigadesMap[shiftNum]) {
            brigadesMap[shiftNum] = { id: shiftNum, name: brigadeRaw, type: shiftType, activeLines: [] };
        }
        for (let i = 15; i <= 26; i++) {
            const lineHeader = cleanVal(headers[i]);
            if (lineHeader && (parseInt(row[i], 10) || 0) > 0 && !brigadesMap[shiftNum].activeLines.includes(lineHeader)) {
                brigadesMap[shiftNum].activeLines.push(lineHeader);
            }
        }
    });
    const shifts = [];
    Object.values(brigadesMap).forEach(brigade => {
        const lineTasks = [];
        brigade.activeLines.forEach(activeLineName => {
            const templateName = Object.keys(lineTemplates || {}).find(t => isLineMatch(activeLineName, t));
            const positions = templateName ? (lineTemplates[templateName] || []) : [];
            const tasksForLine = [];
            positions.forEach(pos => {
                const assignedNamesStr = pos?.roster?.[brigade.id];
                const assignedNamesList = assignedNamesStr
                    ? assignedNamesStr.split(/[,;\n/]+/).map(s => s.trim()).filter(s => s.length > 1)
                    : [];
                const totalSlots = Math.max(pos.count || 1, assignedNamesList.length);
                for (let i = 0; i < totalSlots; i++) {
                    const slotId = `${date}_${brigade.id}_${activeLineName}_${pos.role}_${i}`;
                    const currentWorkerName = assignedNamesList[i] || null;
                    const manual = manualAssignments?.[slotId];
                    let status = currentWorkerName ? 'filled' : 'vacancy';
                    if (manual) status = manual.type === 'vacancy' ? 'vacancy' : 'manual';
                    tasksForLine.push({
                        status,
                        roleTitle: pos.role,
                        slotId,
                        currentWorkerName,
                        assigned: manual || (status === 'filled' ? { name: currentWorkerName } : null)
                    });
                }
            });
            if (tasksForLine.length > 0) {
                lineTasks.push({ slots: tasksForLine, displayName: templateName || activeLineName });
            }
        });
        if (lineTasks.length > 0) {
            shifts.push({
                id: brigade.id,
                name: brigade.name,
                type: brigade.type,
                lineTasks
            });
        }
    });
    return shifts;
};

const hasBrigadeAssignment = (employee, brigadeId) => {
    if (!employee.events || employee.events.length === 0) return false;
    return employee.events.some(event => event.planInfo && event.planInfo.shiftId === brigadeId);
};

const hasFact = (employee) => {
    if (!employee.events || employee.events.length === 0) return false;
    return employee.events.some(event => event.factInfo !== null);
};

const matchesSearch = (employee, query) => {
    if (!query) return true;
    const searchLower = query.toLowerCase();
    return (
        employee.name.toLowerCase().includes(searchLower) ||
        employee.role.toLowerCase().includes(searchLower) ||
        employee.department.toLowerCase().includes(searchLower)
    );
};

const matchesRole = (employee, role) => {
    if (role === 'all') return true;
    return employee.role === role;
};

const matchesBrigade = (employee, brigadeId) => {
    if (brigadeId === 'all') return true;
    return hasBrigadeAssignment(employee, brigadeId);
};

const matchesStatus = (employee, status) => {
    if (status === 'all') return true;
    switch (status) {
        case 'errors':
            return employee.errorCount > 0;
        case 'rv':
            return employee.rvCount > 0;
        case 'working':
            return employee.shiftsCount > 0;
        case 'idle':
            return employee.shiftsCount === 0 && !hasFact(employee);
        default:
            return true;
    }
};

const buildEmployeesWithStats = ({ workerRegistry, factData, savedPlans, allEmployees }) => {
    const operationalPlan = savedPlans?.find(p => p.type === 'Operational');
    const employeesMap = new Map();
    (workerRegistry || []).forEach(worker => {
        if (!worker || !worker.name) return;
        const normName = normalizeName(worker.name);
        employeesMap.set(normName, {
            name: worker.name,
            role: worker.role || 'Не указано',
            department: allEmployees?.[normName]?.department || '',
            shiftsCount: 0,
            rvCount: 0,
            errorCount: 0,
            hoursTotal: 0,
            events: []
        });
    });

    if (factData && typeof factData === 'object' && Object.keys(factData).length > 0) {
        Object.values(factData).forEach(dateData => {
            if (!dateData || typeof dateData !== 'object') return;
            Object.values(dateData).forEach(entry => {
                if (entry && entry.rawName) {
                    const normName = normalizeName(entry.rawName);
                    if (!employeesMap.has(normName)) {
                        employeesMap.set(normName, {
                            name: entry.rawName,
                            role: 'Не указано',
                            department: allEmployees?.[normName]?.department || '',
                            shiftsCount: 0,
                            rvCount: 0,
                            errorCount: 0,
                            hoursTotal: 0,
                            events: []
                        });
                    }
                }
            });
        });
    }

    if (!operationalPlan?.data) {
        if (factData && typeof factData === 'object' && Object.keys(factData).length > 0) {
            employeesMap.forEach((employee, normName) => {
                const events = [];
                let errorCount = 0;
                let totalMinutes = 0;
                Object.keys(factData).sort().forEach(date => {
                    let factEntry = factData[date]?.[normName];
                    if (!factEntry && factData[date]) {
                        Object.values(factData[date]).forEach(entry => {
                            if (entry && entry.rawName && matchNames(entry.rawName, employee.name)) {
                                factEntry = entry;
                            }
                        });
                    }
                    const factStatus = validateFactEntry(factEntry);
                    if (factStatus === 'incomplete') errorCount++;
                    let duration = null;
                    if (factEntry) {
                        const exitTime = factEntry.exitTime;
                        if (factEntry.entryTime && exitTime) {
                            duration = calculateHours(factEntry.entryTime, exitTime);
                            if (duration) totalMinutes += duration.totalMinutes;
                        }
                    }
                    events.push({
                        date,
                        planInfo: null,
                        factInfo: factEntry || null,
                        duration,
                        status: factStatus
                    });
                });
                employee.errorCount = errorCount;
                employee.hoursTotal = totalMinutes;
                employee.events = events;
            });
        }
        return Array.from(employeesMap.values());
    }

    const scheduleDates = operationalPlan.data.scheduleDates || [];
    const shiftsByDate = {};
    scheduleDates.forEach(date => {
        shiftsByDate[date] = getShiftsFromSavedPlan(operationalPlan, date);
    });

    employeesMap.forEach((employee, normName) => {
        const events = [];
        let shiftsCount = 0;
        let rvCount = 0;
        let errorCount = 0;
        let totalMinutes = 0;

        scheduleDates.forEach(date => {
            const shifts = shiftsByDate[date] || [];
            let hasPlanAssignment = false;
            let planInfo = null;

            shifts.forEach(shift => {
                shift.lineTasks.forEach(task => {
                    task.slots.forEach(slot => {
                        if ((slot.status === 'filled' || slot.status === 'manual' || slot.status === 'reassigned') && slot.assigned) {
                            const assignedName = slot.assigned.name;
                            if (normalizeName(assignedName) === normName || matchNames(assignedName, employee.name)) {
                                hasPlanAssignment = true;
                                const isRv = slot.assigned.type === 'external';
                                if (isRv) rvCount++;
                                else shiftsCount++;
                                planInfo = {
                                    shiftId: shift.id,
                                    shiftName: shift.name,
                                    lineName: task.displayName,
                                    role: slot.roleTitle,
                                    isRv
                                };
                            }
                        }
                    });
                });
            });

            let factEntry = factData?.[date]?.[normName];
            if (!factEntry && factData?.[date]) {
                const dateData = factData[date];
                Object.values(dateData).forEach(entry => {
                    if (entry && entry.rawName && matchNames(entry.rawName, employee.name)) {
                        factEntry = entry;
                    }
                });
            }
            const factStatus = validateFactEntry(factEntry);
            if (factStatus === 'incomplete') errorCount++;

            let duration = null;
            if (factEntry) {
                const exitTime = factEntry.exitTime;
                if (factEntry.entryTime && exitTime) {
                    duration = calculateHours(factEntry.entryTime, exitTime);
                    if (duration) totalMinutes += duration.totalMinutes;
                }
            }

            events.push({
                date,
                planInfo: hasPlanAssignment ? planInfo : null,
                factInfo: factEntry || null,
                duration,
                status: factStatus
            });
        });

        employee.shiftsCount = shiftsCount;
        employee.rvCount = rvCount;
        employee.errorCount = errorCount;
        employee.hoursTotal = totalMinutes;
        employee.events = events.sort((a, b) => {
            const [dA, mA] = a.date.split('.');
            const [dB, mB] = b.date.split('.');
            return new Date(2024, parseInt(mA, 10) - 1, parseInt(dA, 10)) - new Date(2024, parseInt(mB, 10) - 1, parseInt(dB, 10));
        });
    });

    return Array.from(employeesMap.values());
};

self.onmessage = (e) => {
    const { requestId, payload } = e.data || {};
    if (!payload) return;
    const { workerRegistry, factData, savedPlans, allEmployees, search, filterRole, filterBrigade, filterStatus } = payload;

    const employeesWithStats = buildEmployeesWithStats({
        workerRegistry,
        factData,
        savedPlans,
        allEmployees
    });

    const allRolesSet = new Set();
    employeesWithStats.forEach(emp => {
        if (emp.role && emp.role !== 'Не указано') allRolesSet.add(emp.role);
    });
    const allRoles = Array.from(allRolesSet).sort();

    const roles = {};
    const brigades = { '1': 0, '2': 0, '3': 0, '4': 0 };
    const statuses = { errors: 0, rv: 0, working: 0, idle: 0 };
    const baseList = employeesWithStats.filter(emp => matchesSearch(emp, search));

    const listForRoles = baseList.filter(emp => (
        matchesBrigade(emp, filterBrigade) && matchesStatus(emp, filterStatus)
    ));
    listForRoles.forEach(emp => {
        if (emp.role && emp.role !== 'Не указано') {
            roles[emp.role] = (roles[emp.role] || 0) + 1;
        }
    });

    const listForBrigades = baseList.filter(emp => (
        matchesRole(emp, filterRole) && matchesStatus(emp, filterStatus)
    ));
    ['1', '2', '3', '4'].forEach(brigadeId => {
        brigades[brigadeId] = listForBrigades.filter(emp => matchesBrigade(emp, brigadeId)).length;
    });

    const listForStatuses = baseList.filter(emp => (
        matchesRole(emp, filterRole) && matchesBrigade(emp, filterBrigade)
    ));
    statuses.errors = listForStatuses.filter(emp => matchesStatus(emp, 'errors')).length;
    statuses.rv = listForStatuses.filter(emp => matchesStatus(emp, 'rv')).length;
    statuses.working = listForStatuses.filter(emp => matchesStatus(emp, 'working')).length;
    statuses.idle = listForStatuses.filter(emp => matchesStatus(emp, 'idle')).length;

    const total = baseList.filter(emp => (
        matchesRole(emp, filterRole) &&
        matchesBrigade(emp, filterBrigade) &&
        matchesStatus(emp, filterStatus)
    )).length;

    const filteredEmployees = employeesWithStats.filter(emp => (
        matchesSearch(emp, search) &&
        matchesRole(emp, filterRole) &&
        matchesBrigade(emp, filterBrigade) &&
        matchesStatus(emp, filterStatus)
    ));

    self.postMessage({
        requestId,
        result: {
            employeesWithStats,
            allRoles,
            filterCounts: { roles, brigades, statuses, total },
            filteredEmployees
        }
    });
};
