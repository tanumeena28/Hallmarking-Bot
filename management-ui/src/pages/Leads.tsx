import React, { useEffect, useState } from 'react';
import API_URL from '../config';
import './Leads.css';

interface Lead {
  id: number;
  name: string;
  company: string;
  interest_type: string;
  captured_at: string;
  status: string;
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = () => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/admin/leads`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })


      .then(res => res.json())
      .then(data => setLeads(data))
      .catch(err => console.error("Failed to fetch leads:", err));
  };

  const handleStatusChange = (leadId, newStatus) => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    })
      .then(res => {
        if (res.ok) {
          fetchLeads(); // Refresh data
        }
      })
      .catch(err => console.error("Failed to update lead status:", err));
  };

  const handleExportCSV = () => {
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/admin/analytics/export-csv`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nch_query_logs.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => console.error("Failed to export CSV:", err));
  };

  return (
    <div className="leads-container">
      <header className="leads-header">
        <div>
          <h1>Leads Management</h1>
          <p>Track and manage potential clients</p>
        </div>
        <button className="export-btn" onClick={handleExportCSV}>Export CSV</button>
      </header>

      <div className="table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Interest Type</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => (
              <tr key={lead.id}>
                <td>{lead.name}</td>
                <td>{lead.company}</td>
                <td>{lead.interest_type}</td>
                <td>{new Date(lead.captured_at).toLocaleDateString()}</td>
                <td>
                  <select 
                    value={lead.status} 
                    onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                    className={`status-select status-${lead.status}`}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
