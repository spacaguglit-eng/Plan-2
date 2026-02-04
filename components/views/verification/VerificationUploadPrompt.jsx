import React from 'react';
import { FileCheck, Loader2 } from 'lucide-react';

export default function VerificationUploadPrompt({ fileRef, isLoading, onFileUpload }) {
    return (
        <div className="flex flex-col items-center justify-center h-full p-10">
            <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all text-slate-500"
            >
                <div className="bg-blue-100 p-4 rounded-full text-blue-600 mb-4">
                    <FileCheck size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Загрузить отчет СКУД</h3>
                <p className="text-sm max-w-xs text-center mb-6">
                    Загрузите файл .xls/.csv (выгрузка ЭНТ) для сверки фактических выходов с планом
                </p>
                <button type="button" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Выбрать файл'}
                </button>
                <input
                    type="file"
                    ref={fileRef}
                    onChange={onFileUpload}
                    className="hidden"
                    accept=".csv, .xls, .xlsx"
                />
            </div>
        </div>
    );
}
