// Webテスト版の配置先に合わせて、画像や案内リンクの基準パスを設定する。
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_PUBLIC_WEB_TEST === 'true'
    ? process.env.EXPO_PUBLIC_WEB_BASE_PATH || '' : '';
  if (baseUrl && !/^\/[A-Za-z0-9_-]+$/.test(baseUrl)) {
    throw new Error('Webテスト版のbase pathは /repository-name の形式で指定してください。');
  }
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
