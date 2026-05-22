import React, { useEffect, useState } from 'react';
import API_URL from '../config';
import './Knowledge.css';
import { Upload, FileText, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

interface KnowledgeFile {
  name: string;
  size: number;
  type: string;
}

export default function Knowledge() {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = () => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/admin/knowledge-files`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setFiles(data);
      })
      .catch(err => console.error("Failed to fetch files:", err));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    
    setUploading(true);
    setStatus(null);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/admin/upload-knowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', msg: data.msg });
        fetchFiles();
      } else {
        setStatus({ type: 'error', msg: data.detail || 'Upload failed' });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: 'Network error' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) return;
    
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/admin/knowledge-files/${filename}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchFiles();
        setStatus({ type: 'success', msg: 'File deleted and database updated.' });
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="knowledge-container">
      <header className="knowledge-header">
        <h1>Knowledge Base</h1>
        <p>Upload PDFs or CSVs to train your bot</p>
      </header>

      {status && (
        <div className={`status-banner ${status.type}`}>
          {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{status.msg}</span>
        </div>
      )}

      <div className="upload-section">
        <label className={`upload-card ${uploading ? 'uploading' : ''}`}>
          <input type="file" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.csv,.txt" />
          <Upload size={40} />
          <h3>{uploading ? 'Processing & Training...' : 'Click to Upload Document'}</h3>
          <p>Support PDF, CSV and Text files (Max 10MB)</p>
          {uploading && <div className="progress-bar-ind"></div>}
        </label>
      </div>

      <div className="files-grid">
        <h2>Ingested Documents</h2>
        {files.length === 0 ? (
          <div className="no-files">No documents uploaded yet.</div>
        ) : (
          <div className="file-list">
            {files.map(file => (
              <div key={file.name} className="file-item">
                <div className="file-icon">
                  <FileText size={24} />
                </div>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">{file.type.toUpperCase()} • {formatSize(file.size)}</span>
                </div>
                <button className="delete-file-btn" onClick={() => handleDelete(file.name)}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
