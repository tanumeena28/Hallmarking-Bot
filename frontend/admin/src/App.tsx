import { useState } from 'react';
import './index.css';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([
    { role: 'bot', content: 'Welcome to the NCH Bot Testing Interface. How can I assist you with BIS Regulations today?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Login State
  const [email, setEmail] = useState('admin@nch.in');
  const [password, setPassword] = useState('admin123');
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      // FastAPI expects OAuth2 form data (x-www-form-urlencoded)
      const formData = new URLSearchParams();
      formData.append('username', email); // OAuth2PasswordRequestForm uses 'username'
      formData.append('password', password);

      const response = await fetch('http://127.0.0.1:8000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await response.json();
      setToken(data.access_token);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !token) return;
    
    // Add user message
    const newMessages = [...messages, { role: 'user', content: inputText }];
    setMessages(newMessages);
    const queryText = inputText;
    setInputText('');
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/bot/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          message: queryText,
          session_id: 'web_test_session',
          platform: 'admin_dashboard'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from bot');
      }

      const data = await response.json();
      setMessages([...newMessages, { role: 'bot', content: data.reply }]);
    } catch (err: any) {
      setMessages([...newMessages, { role: 'bot', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // If not logged in, show Login Screen
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
        <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '40px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '1.8rem', fontWeight: '700' }}>NCH Admin</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '32px' }}>Sign in to access dashboard</p>
          
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-light)', color: 'white' }}
                required 
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-light)', color: 'white' }}
                required 
              />
            </div>
            
            {loginError && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{loginError}</p>}
            
            <button 
              type="submit" 
              style={{ padding: '14px', borderRadius: '8px', background: 'var(--accent-primary)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer', marginTop: '10px' }}
            >
              Sign In
            </button>
          </form>
          
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '24px' }}>
            Demo default: admin@nch.in / admin123
          </p>
        </div>
      </div>
    );
  }

  // Main Dashboard Layout (If logged in)
  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <h2>NCH Admin</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Enterprise Platform</p>
        </div>
        
        <nav className="nav-links">
          <a 
            href="#" 
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Analytics
          </a>
          <a 
            href="#" 
            className={`nav-link ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            💬 Bot Testing
          </a>
          <button 
            onClick={() => setToken(null)}
            style={{ marginTop: '20px', padding: '10px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', cursor: 'pointer' }}
          >
            Logout
          </button>
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
            <p style={{ fontWeight: '600', fontSize: '0.9rem' }}>Super Admin</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{email}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="animate-fade-in">
          <h1 style={{ fontSize: '2rem', fontWeight: '700' }}>
            {activeTab === 'dashboard' && 'Platform Analytics'}
            {activeTab === 'chat' && 'RAG Bot Testing'}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            Real-time insights from the NCH Hallmarking Bot.
          </p>
        </header>

        {activeTab === 'dashboard' && (
          <section className="metrics-grid animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="glass-panel">
              <div className="metric-label">Total Users</div>
              <div className="metric-value">1,204</div>
            </div>
            <div className="glass-panel">
              <div className="metric-label">Active Sessions (Today)</div>
              <div className="metric-value" style={{ color: 'var(--success)' }}>84</div>
            </div>
            <div className="glass-panel">
              <div className="metric-label">Queries Processed</div>
              <div className="metric-value">5,432</div>
            </div>
          </section>
        )}

        {activeTab === 'chat' && (
           <section className="animate-fade-in glass-panel" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
             <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {messages.map((msg, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      background: msg.role === 'bot' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.8)', 
                      padding: '16px', 
                      borderRadius: '12px', 
                      maxWidth: '80%',
                      alignSelf: msg.role === 'bot' ? 'flex-start' : 'flex-end',
                      border: msg.role === 'bot' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border-light)'
                    }}
                  >
                    <p style={{ color: 'white' }}>{msg.content}</p>
                  </div>
                ))}
                {loading && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '12px', maxWidth: '80%', alignSelf: 'flex-start' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Bot is typing...</p>
                  </div>
                )}
             </div>
             <div style={{ display: 'flex', gap: '12px', padding: '20px', borderTop: '1px solid var(--border-light)' }}>
                <input 
                  type="text" 
                  placeholder="Ask a question..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  style={{ flex: 1, padding: '16px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-light)', color: 'white' }}
                  disabled={loading}
                />
                <button 
                  onClick={handleSend}
                  style={{ padding: '16px 32px', borderRadius: '8px', background: 'var(--accent-primary)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
             </div>
           </section>
        )}
      </main>
    </div>
  );
}

export default App;
