import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { Users, MessageSquare, Target, Activity } from 'lucide-react';
import './Dashboard.css';

const COLORS = ['#003087', '#FFD700', '#00C49F', '#FF8042', '#8884d8'];

export default function Dashboard() {
  const [summary, setSummary] = useState({
    total_users: 0,
    queries_today: 0,
    leads_today: 0,
    active_sessions_today: 0
  });
  const [queryVolume, setQueryVolume] = useState<any[]>([]);
  const [intentDist, setIntentDist] = useState<any[]>([]);
  const [topQuestions, setTopQuestions] = useState<any[]>([]);
  const [sentimentTrend, setSentimentTrend] = useState<any[]>([]);


  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    fetch('http://localhost:8000/admin/analytics/summary', { headers })
      .then(res => res.json())
      .then(data => setSummary(data))
      .catch(err => console.error("Failed to fetch summary:", err));

    fetch('http://localhost:8000/admin/analytics/query-volume', { headers })
      .then(res => res.json())
      .then(data => { if(Array.isArray(data)) setQueryVolume(data); })
      .catch(err => console.error("Failed to fetch query volume:", err));


    fetch('http://localhost:8000/admin/analytics/intent-distribution', { headers })
      .then(res => res.json())
      .then(data => { if(Array.isArray(data)) setIntentDist(data); })
      .catch(err => console.error("Failed to fetch intent dist:", err));


    fetch('http://localhost:8000/admin/analytics/top-questions', { headers })
      .then(res => res.json())
      .then(data => { if(Array.isArray(data)) setTopQuestions(data); })
      .catch(err => console.error("Failed to fetch top questions:", err));


    fetch('http://localhost:8000/admin/analytics/sentiment-trend', { headers })
      .then(res => res.json())
      .then(data => { if(Array.isArray(data)) setSentimentTrend(data); })
      .catch(err => console.error("Failed to fetch sentiment trend:", err));

  }, []);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Analytics Dashboard</h1>
        <p>Real-time insights and monitoring</p>
      </header>

      {/* Summary Cards */}
      <div className="summary-grid">
        <Card title="Total Users" value={summary.total_users} icon={<Users size={24} />} />
        <Card title="Queries Today" value={summary.queries_today} icon={<MessageSquare size={24} />} />
        <Card title="Leads Today" value={summary.leads_today} icon={<Target size={24} />} />
        <Card title="Active Sessions" value={summary.active_sessions_today} icon={<Activity size={24} />} />
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Chart 1: Query Volume */}
        <div className="chart-card">
          <h2>Query Volume (Last 30 Days)</h2>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={queryVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Line type="monotone" dataKey="count" stroke="#003087" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Intent Distribution */}
        <div className="chart-card">
          <h2>Intent Distribution</h2>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={intentDist} dataKey="count" nameKey="intent" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>
                  {intentDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Top Questions */}
        <div className="chart-card">
          <h2>Top Questions (This Week)</h2>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topQuestions} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis type="number" stroke="#666" />
                <YAxis dataKey="question" type="category" width={120} stroke="#666" tickFormatter={(tick) => tick.length > 15 ? tick.substring(0, 15) + '...' : tick} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="count" fill="#FFD700" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Sentiment Trend */}
        <div className="chart-card">
          <h2>Sentiment Trend (Last 30 Days)</h2>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sentimentTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend />
                <Bar dataKey="positive" stackId="a" fill="#00C49F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="neutral" stackId="a" fill="#9e9e9e" />
                <Bar dataKey="negative" stackId="a" fill="#FF8042" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, icon }) {
  return (
    <div className="summary-card">
      <div className="card-content">
        <p className="card-title">{title}</p>
        <p className="card-value">{value}</p>
      </div>
      <div className="card-icon">
        {icon}
      </div>
    </div>
  );
}
