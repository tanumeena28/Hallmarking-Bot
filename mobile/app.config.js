export default ({ config }) => ({
  ...config,
  extra: {
    apiUrl: process.env.API_URL || 'http://10.62.214.74:8000',
  },
});
