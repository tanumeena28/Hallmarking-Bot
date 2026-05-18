import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Target, Settings, LogOut, ClipboardList } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <img src="/vite.svg" alt="Logo" className="sidebar-logo" />
        <h2>NCH Admin</h2>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/leads" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Target size={20} />
          <span>Leads</span>
        </NavLink>
        <NavLink to="/users" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Users size={20} />
          <span>Users</span>
        </NavLink>
        <NavLink to="/logs" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <ClipboardList size={20} />
          <span>Chat Logs</span>
        </NavLink>

        <NavLink to="/knowledge" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <ClipboardList size={20} />
          <span>Knowledge Base</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>

          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="logout-btn">
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
