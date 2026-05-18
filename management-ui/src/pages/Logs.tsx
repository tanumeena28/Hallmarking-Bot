import React, { useEffect, useState } from 'react';
import './Leads.css'; // Reuse table styles

interface Log {
  id: number;
  question: string;
  answer: string;
  language: string;
  intent: string;
  sentiment: string;
  feedback_rating?: number;
  platform: string;
  user_name: string;
  timestamp: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`http://${window.location.hostname}:8000/admin/logs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLogs(data);
        } else {
          console.error("Logs API did not return an array:", data);
          setLogs([]);
        }
      })
      .catch(err => console.error("Failed to fetch logs:", err));
  }, []);

  const filteredLogs = Array.isArray(logs) ? logs.filter(log => filter === 'all' || log.platform === filter) : [];


  return (
    <div className="leads-container">
      <header className="leads-header">
        <div>
          <h1>Chat Logs</h1>
          <p>View all interactions with the bot</p>
        </div>
        <div>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            style={{ 
              padding: '8px 12px', 
              borderRadius: '6px', 
              border: '1px solid #ccc',
              fontSize: '14px',
              backgroundColor: '#fff',
              color: '#000',
              cursor: 'pointer'
            }}
          >
            <option value="all" style={{ color: '#000' }}>All Platforms</option>
            <option value="app" style={{ color: '#000' }}>App (Web)</option>
            <option value="whatsapp" style={{ color: '#000' }}>WhatsApp</option>
          </select>

        </div>
      </header>

      <div className="table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Question</th>
              <th>Answer</th>
              <th>Platform</th>
              <th>Language</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => (
              <tr key={log.id}>
                <td>{log.user_name}</td>
                <td>{log.question}</td>
                <td>{log.answer}</td>
                <td>
                  <span className={`status-tag ${log.platform === 'whatsapp' ? 'converted' : 'new'}`}>
                    {log.platform}
                  </span>
                </td>
                <td>{log.language}</td>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
