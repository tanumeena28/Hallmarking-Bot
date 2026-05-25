export default ({ config }) => ({
  ...config,
  extra: {
    apiUrl: process.env.API_URL || 'https://hallmarking-backend.onrender.com',
  },
});
