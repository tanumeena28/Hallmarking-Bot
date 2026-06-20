const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.port === '5173' || window.location.port === '3000'
    ? `http://${window.location.hostname}:8000`
    : `${window.location.protocol}//${window.location.host}/api`);

export default API_URL;
