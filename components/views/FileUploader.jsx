import React from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';

const FileUploader = () => {
    const {
        fileInputRef,
        processExcelFile,
        loading,
        restoring,
        error,
        file
    } = useData();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 w-full">
            <div className="w-full max-w-lg space-y-8 text-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Управление сменами</h1>
                    <p className="text-slate-500">Загрузите файл для расчета</p>
                </div>
                {restoring ? (
                    <div className="flex flex-col items-center justify-center p-10 gap-4">
                        <Loader2 className="animate-spin text-blue-500" size={40} />
                        <p className="text-slate-500 text-sm font-medium">Проверка данных...</p>
                    </div>
                ) : (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-2xl p-10 cursor-pointer transition-all shadow-xl shadow-blue-900/5 group"
                        style={{ position: 'relative', minHeight: '200px' }}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => processExcelFile(e.target.files[0])}
                            className="hidden"
                            accept=".xlsx, .xls"
                            style={{ display: 'none', visibility: 'hidden', position: 'absolute', width: 0, height: 0 }}
                        />
                        <div className="flex flex-col items-center gap-4">
                            {loading ? (
                                <Loader2 className="animate-spin text-blue-600" size={48} />
                            ) : (
                                <div className="bg-blue-100 p-5 rounded-full text-blue-600 group-hover:scale-110 transition-transform">
                                    <Upload size={40} />
                                </div>
                            )}
                            <div>
                                <p className="text-xl font-bold text-slate-700">{file ? file.name : 'Нажмите для загрузки'}</p>
                                {!file && <p className="text-slate-400 mt-2">.xlsx файл</p>}
                            </div>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center justify-center gap-2 text-sm">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileUploader;
