export default ({ config }) => ({
  ...config,
  extra: {
    apiUrl: process.env.API_URL || 'http://192.168.1.24:8000',
  },
});
