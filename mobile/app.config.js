export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.API_URL || 'https://bot.hallmarkingcentre.in/api',
  },
});
