import React from 'react';
import { Factory, FileUp, Search, Filter, X, ChevronDown, Check } from 'lucide-react';

export default function ProductionHeader({
    fileInputRef,
    handleFileChange,
    filterProduct,
    setFilterProduct,
    filterLine,
    setFilterLine,
    filterDate,
    setFilterDate,
    activeTab,
    uniqueLines,
    uniqueDates,
    uniqueDowntimeTypes,
    excludedDowntimeTypes,
    setExcludedDowntimeTypes,
    isDowntimeSelectorOpen,
    setIsDowntimeSelectorOpen,
    downtimeSelectorRef,
    flatRows,
    filteredRows,
}) {
    return (
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                        <Factory size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Производство</h2>
                        <div className="text-xs text-slate-500">
                            Записей: {filteredRows.length} {filteredRows.length !== flatRows.length && `из ${flatRows.length}`}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                    >
                        <FileUp size={16} />
                        Загрузить Excel
                    </button>
                </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={handleFileChange} />
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder={activeTab === 'production' ? 'Поиск по продукту...' : 'Поиск по простою...'}
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {filterProduct && (
                        <button type="button" onClick={() => setFilterProduct('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={16} />
                        </button>
                    )}
                </div>
                <div className="relative">
                    <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                        value={filterLine}
                        onChange={(e) => setFilterLine(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                    >
                        <option value="">Все линии</option>
                        {uniqueLines.map(line => <option key={line} value={line}>{line}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                    >
                        <option value="">Все даты</option>
                        {uniqueDates.length > 0 ? uniqueDates.map(date => <option key={date} value={date}>{date}</option>) : <option value="" disabled>Нет доступных дат</option>}
                    </select>
                </div>
                {activeTab === 'production' && uniqueDowntimeTypes.length > 0 && (
                    <div className="relative w-full" ref={downtimeSelectorRef}>
                        <button
                            type="button"
                            onClick={() => setIsDowntimeSelectorOpen((prev) => !prev)}
                            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[250px] flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Filter size={16} className="text-slate-400" />
                                <span className="text-left">
                                    {excludedDowntimeTypes.size > 0 ? `Исключено: ${excludedDowntimeTypes.size} вид(ов)` : 'Виды простоев, не влияющие на план'}
                                </span>
                            </div>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDowntimeSelectorOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDowntimeSelectorOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                <div className="p-2">
                                    {uniqueDowntimeTypes.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-slate-500 text-center">Нет доступных видов простоев</div>
                                    ) : (
                                        uniqueDowntimeTypes.map(type => {
                                            const isSelected = excludedDowntimeTypes.has(type);
                                            return (
                                                <label key={type} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer rounded transition-colors">
                                                    <div className={`flex-shrink-0 w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                                        {isSelected && <Check size={12} className="text-white" />}
                                                    </div>
                                                    <span className="text-sm text-slate-700 flex-1">{type}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            const newSet = new Set(excludedDowntimeTypes);
                                                            if (e.target.checked) newSet.add(type);
                                                            else newSet.delete(type);
                                                            setExcludedDowntimeTypes(newSet);
                                                        }}
                                                        className="hidden"
                                                    />
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
