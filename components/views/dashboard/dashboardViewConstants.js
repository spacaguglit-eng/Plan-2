export const FILLED_SLOT_CONFIGS = {
    filled: { statusColor: 'bg-green-50', borderColor: 'border-green-100', iconBg: 'bg-green-200', iconColor: 'text-green-700', isManual: false },
    reassigned: { statusColor: 'bg-blue-50', borderColor: 'border-blue-100', iconBg: 'bg-blue-200', iconColor: 'text-blue-700', isManual: false },
    manual: { statusColor: 'bg-indigo-50', borderColor: 'border-indigo-200', iconBg: 'bg-indigo-200', iconColor: 'text-indigo-700', isManual: true },
    outsourced: { statusColor: 'bg-amber-50', borderColor: 'border-amber-200', iconBg: 'bg-amber-200', iconColor: 'text-amber-800', isManual: false }
};

export const INITIAL_MANUAL_LINE_FORM = {
    shiftId: null,
    templateName: '',
    displayName: '',
    templateOptions: [],
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: ''
};
