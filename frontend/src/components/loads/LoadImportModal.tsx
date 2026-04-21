import { useState, useRef } from 'react'
import client from '@/api/client'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onImported: () => void
}

interface ImportResult {
  batch_id: string
  total: number
  success: number
  failed: number
  results: Array<{
    row: number
    status: 'success' | 'failed'
    load_number?: number
    errors?: string[]
    data?: Record<string, string>
  }>
}

export default function LoadImportModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File|null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = () => {
    window.open('/api/v1/loads-import/template', '_blank')
  }

  const handleImport = () => {
    if (!file) { toast.error('Select a CSV file'); return }
    const fd = new FormData()
    fd.append('file', file)
    setUploading(true)
    client.post('/api/v1/loads-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(r => {
        setResult(r.data)
        if (r.data.success > 0) toast.success(`Imported ${r.data.success} load(s)`)
        if (r.data.failed > 0) toast.error(`${r.data.failed} row(s) failed`)
        if (r.data.success > 0) onImported()
      })
      .catch(e => toast.error(e.message))
      .finally(() => setUploading(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white rounded-xl shadow-2xl w-[700px] max-h-[85vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">Import Loads</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!result ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-blue-800 mb-2">📋 CSV Template</p>
                <p className="text-xs text-blue-700 mb-3">
                  Download the template, fill in your loads, then upload here. Brokers and drivers
                  are matched by <strong>exact name</strong>.
                </p>
                <button onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 text-xs font-semibold rounded hover:bg-blue-100">
                  ⬇ Download Template
                </button>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
                {file ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">{file.name}</p>
                    <p className="text-xs text-gray-500 mb-2">{(file.size / 1024).toFixed(1)} KB</p>
                    <button onClick={()=>setFile(null)} className="text-xs text-red-500 hover:underline">Remove</button>
                  </div>
                ) : (
                  <>
                    <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                    </svg>
                    <p className="text-sm text-gray-600 mb-2">Drop your CSV here or click to browse</p>
                    <button onClick={()=>fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded hover:bg-gray-50">
                      Choose File
                    </button>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}/>
              </div>

              <div className="text-xs text-gray-500">
                <p className="font-semibold mb-1">Expected columns:</p>
                <code className="block bg-gray-50 border border-gray-200 rounded p-2 text-[10px]">
                  load_number, broker_name, driver_name, rate,<br/>
                  pickup_city, pickup_state, pickup_zip, pickup_date,<br/>
                  delivery_city, delivery_state, delivery_zip, delivery_date,<br/>
                  po_number, notes
                </code>
              </div>
            </>
          ) : (
            <div>
              <div className="flex gap-4 mb-4">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-semibold">Success</p>
                  <p className="text-2xl font-bold text-green-700">{result.success}</p>
                </div>
                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-600 font-semibold">Failed</p>
                  <p className="text-2xl font-bold text-red-700">{result.failed}</p>
                </div>
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-600 font-semibold">Batch ID</p>
                  <p className="text-sm font-mono font-bold text-gray-700">{result.batch_id}</p>
                </div>
              </div>

              {result.results.filter(r => r.status === 'failed').length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Failed Rows</div>
                  <div className="max-h-60 overflow-y-auto">
                    {result.results.filter(r => r.status === 'failed').map((r,i)=>(
                      <div key={i} className="px-3 py-2 border-t border-red-100 text-xs">
                        <div className="font-semibold text-gray-700">Row {r.row}</div>
                        {r.errors?.map((err,ei)=>(
                          <div key={ei} className="text-red-600">• {err}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          {result ? (
            <button onClick={onClose} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-semibold">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm rounded font-medium">Cancel</button>
              <button onClick={handleImport} disabled={!file || uploading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-semibold disabled:opacity-50">
                {uploading ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
