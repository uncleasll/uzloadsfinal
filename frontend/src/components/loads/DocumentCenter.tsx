import { useEffect, useRef, useState } from 'react'
import { FileText, UploadCloud, Download, Eye, Trash2, X, Check, Minus } from 'lucide-react'
import type { LoadDocument } from '@/types'
import { loadsApi } from '@/api/loads'
import client from '@/api/client'
import { documentKind, DOCUMENT_KINDS } from './documents'
import { formatDateTime } from '@/utils'
import toast from 'react-hot-toast'
import './LoadWorkspace.css'

type Props={loadId:number;documents:LoadDocument[];uploading:boolean;onUpload:(kind:string,file:File)=>Promise<void>;onDelete:(id:number)=>void}
export default function DocumentCenter({loadId,documents,uploading,onUpload,onDelete}:Props){
 const [kind,setKind]=useState<string>('Confirmation'),[drag,setDrag]=useState(false),[preview,setPreview]=useState<{url:string;name:string;image:boolean}|null>(null),[opening,setOpening]=useState<number|null>(null)
 const input=useRef<HTMLInputElement>(null)
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url)},[preview])
 const previewDoc=async(doc:LoadDocument)=>{setOpening(doc.id);try{const response=await client.get(`/api/v1/loads/${loadId}/documents/${doc.id}/download`,{responseType:'blob'});const blob=response.data as Blob;const name=doc.original_filename||doc.filename;const isImage=/\.(png|jpe?g|gif|webp)$/i.test(name),isPdf=/\.pdf$/i.test(name);if(!isImage&&!isPdf){toast.error('Preview supports PDF and images. Download this file to open it.');return}const typed=new Blob([blob],{type:isPdf?'application/pdf':/\.png$/i.test(name)?'image/png':/\.gif$/i.test(name)?'image/gif':/\.webp$/i.test(name)?'image/webp':'image/jpeg'});setPreview({url:URL.createObjectURL(typed),name,image:isImage})}catch(e){toast.error((e as Error).message)}finally{setOpening(null)}}
 const upload=async(files:FileList|null)=>{if(uploading||!files?.length)return;await onUpload(kind,files[0])}
 return <div className="load-doc-center">
  <div className="load-doc-heading"><div><h2>Load documents</h2><p>Keep the paperwork with the shipment. Upload signed delivery proof as POD.</p></div><a className="btn-secondary" href={loadsApi.getMergedDocumentsUrl(loadId)} target="_blank" rel="noreferrer">Merge documents</a></div>
  <div className="load-doc-checklist">{[['Confirmation','Rate confirmation'],['BOL','Bill of lading'],['POD','Signed POD']].map(([value,label])=>{const present=documents.some(d=>documentKind(d)===value);return <button key={value} className={present?'present':''} onClick={()=>setKind(value)} aria-pressed={kind===value}>{present?<Check size={15}/>:<Minus size={15}/>}<span>{label}<small>{present?'Attached':'Not attached'}</small></span></button>})}</div>
  <div className={`load-doc-upload ${drag?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void upload(e.dataTransfer.files)}}>
   <UploadCloud size={25}/><div><strong>{uploading?'Uploading document…':'Drop a document here'}</strong><p>Select its type, then drop a file or browse.</p></div><select aria-label="Document type" value={kind} onChange={e=>setKind(e.target.value)} disabled={uploading}>{DOCUMENT_KINDS.map(k=><option key={k} value={k}>{k==='Confirmation'?'Rate confirmation':k==='POD'?'Signed POD':k}</option>)}</select><button className="btn-primary" disabled={uploading} onClick={()=>input.current?.click()}>Browse files</button><input ref={input} aria-label="Upload document file" type="file" hidden disabled={uploading} onChange={e=>{void upload(e.target.files);e.target.value=''}}/>
  </div>
  <div className="load-doc-list">{documents.length===0?<div className="load-doc-empty"><FileText size={26}/><strong>No documents yet</strong><p>Start with the rate confirmation. Add BOL, signed POD and receipts as the load progresses.</p></div>:documents.map(doc=><div className="load-doc-row" key={doc.id}><FileText size={21}/><div className="load-doc-name"><strong title={doc.original_filename||doc.filename}>{doc.original_filename||doc.filename}</strong><small>{documentKind(doc)} · {formatDateTime(doc.uploaded_at)}{doc.file_size?` · ${Math.max(1,Math.round(doc.file_size/1024))} KB`:''}</small></div><div className="load-doc-actions"><button title="Preview document" aria-label={`Preview ${doc.original_filename||doc.filename}`} disabled={opening===doc.id} onClick={()=>void previewDoc(doc)}><Eye size={17}/></button><a title="Download document" aria-label={`Download ${doc.original_filename||doc.filename}`} href={loadsApi.getDocumentDownloadUrl(loadId,doc.id)} target="_blank" rel="noreferrer"><Download size={17}/></a><button title="Delete document" aria-label={`Delete ${doc.original_filename||doc.filename}`} onClick={()=>onDelete(doc.id)}><Trash2 size={16}/></button></div></div>)}</div>
  {preview&&<div className="load-preview" role="dialog" aria-modal="true" aria-label="Document preview" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPreview(null)}}}><header><strong>{preview.name}</strong><button autoFocus aria-label="Close document preview" onClick={()=>setPreview(null)}><X size={20}/></button></header>{preview.image?<img src={preview.url} alt={preview.name}/>:<iframe title={preview.name} src={preview.url}/>}</div>}
 </div>
}
