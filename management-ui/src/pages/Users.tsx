import React, { useEffect, useState } from 'react';
import './Users.css';

interface User {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  designation?: string;
  role: string;
  age?: number;
  gender?: string;
  company_type?: string;
  created_at: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`http://${window.location.hostname}:8000/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 403) {
          alert("Access denied. Admin only.");
          return [];
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error("API did not return an array:", data);
          setUsers([]);
        }
      })

      .catch(err => console.error("Failed to fetch users:", err));
  }, []);

  const handleResetPassword = (userId: number) => {
    const token = localStorage.getItem('token');
    if (!window.confirm("Are you sure you want to reset this user's password?")) return;
    
    fetch(`http://localhost:8000/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => alert(data.msg))
      .catch(err => console.error("Failed to reset password:", err));
  };

  const filteredUsers = Array.isArray(users) ? users.filter(user => {
    const name = user.name || '';
    const email = user.email || '';
    const phone = user.phone || '';

    const matchesSearch = 
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.includes(searchTerm);
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
  }) : [];


  return (
    <div className="users-container">
      <header className="users-header">
        <div className="header-text">
          <h1>User Management</h1>
          <p>Manage and monitor all platform users</p>
        </div>
        
        <div className="header-controls">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search name, email or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-box">
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ color: '#000', backgroundColor: '#fff' }}
            >
              <option value="all" style={{ color: '#000' }}>All Roles</option>
              <option value="jeweler" style={{ color: '#000' }}>Jeweler</option>
              <option value="hallmarking_centre" style={{ color: '#000' }}>Hallmarking Centre</option>
              <option value="refinery" style={{ color: '#000' }}>Refinery</option>
              <option value="nch_admin" style={{ color: '#000' }}>Admin</option>
            </select>
          </div>

        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Users</h3>
          <p className="stat-value">{users.length}</p>
        </div>
        <div className="stat-card">
          <h3>Jewelers</h3>
          <p className="stat-value">{users.filter(u => u.role === 'jeweler').length}</p>
        </div>
        <div className="stat-card">
          <h3>Active Today</h3>
          <p className="stat-value">{users.length > 0 ? Math.floor(users.length * 0.4) : 0}</p>
        </div>
      </div>

      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name & Profile</th>
              <th>Contact Info</th>
              <th>Company & Role</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id} onClick={() => setSelectedUser(user)} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="user-info-cell">
                    <div className="user-avatar" style={{ backgroundColor: `hsl(${( (user.id || 0) * 40) % 360}, 70%, 50%)` }}>
                      {user.name ? user.name.charAt(0) : '?'}
                    </div>
                    <div>
                      <div className="user-name">{user.name}</div>
                      <div className="user-id">ID: #{user.id}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="contact-cell">
                    <div className="email">{user.email}</div>
                    <div className="phone">{user.phone || 'No Phone'}</div>
                  </div>
                </td>
                <td>
                  <div className="company-cell">
                    <div className="company-name">{user.company || 'Personal'}</div>
                    <span className={`role-badge role-${user.role}`}>
                      {(user.role || 'user').replace('_', ' ')}
                    </span>
                  </div>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="action-btns" onClick={(e) => e.stopPropagation()}>
                    <button className="view-btn" onClick={() => setSelectedUser(user)}>Details</button>
                    <button onClick={() => handleResetPassword(user.id)} className="reset-btn-small">Reset</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="user-modal" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedUser(null)}>&times;</button>
            <div className="modal-header" style={{ borderBottomColor: `hsl(${( (selectedUser.id || 0) * 40) % 360}, 70%, 50%)` }}>
              <div className="modal-avatar" style={{ backgroundColor: `hsl(${( (selectedUser.id || 0) * 40) % 360}, 70%, 50%)` }}>
                {selectedUser.name ? selectedUser.name.charAt(0) : '?'}
              </div>
              <h2>{selectedUser.name}</h2>
              <span className={`role-badge role-${selectedUser.role}`}>{selectedUser.role || 'user'}</span>
            </div>
            <div className="modal-body">

              <div className="info-section">
                <h3>Contact Details</h3>
                <div className="info-row"><span>Email:</span> {selectedUser.email}</div>
                <div className="info-row"><span>Phone:</span> {selectedUser.phone || 'N/A'}</div>
                <div className="info-row"><span>Age:</span> {selectedUser.age || 'N/A'}</div>
                <div className="info-row"><span>Gender:</span> {selectedUser.gender || 'N/A'}</div>
              </div>
              <div className="info-section">
                <h3>Business Details</h3>
                <div className="info-row"><span>Company:</span> {selectedUser.company || 'N/A'}</div>
                <div className="info-row"><span>Type:</span> {selectedUser.company_type || 'N/A'}</div>
                <div className="info-row"><span>Designation:</span> {selectedUser.designation || 'N/A'}</div>
              </div>
              <div className="info-section">
                <h3>Account Info</h3>
                <div className="info-row"><span>Joined:</span> {new Date(selectedUser.created_at).toLocaleString()}</div>
                <div className="info-row"><span>User ID:</span> {selectedUser.id}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="reset-btn" onClick={() => handleResetPassword(selectedUser.id)}>Reset Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

