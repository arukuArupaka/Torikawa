import handlingSections from '../../shared/dataHandlingSections.json';

// These values are public and bundled by Expo. Never put credentials here.
export function publicHttpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function getPublicationInformation() {
  const form = process.env.EXPO_PUBLIC_SUPPORT_FORM_URL ?? '';
  const supportFormUrl = form.trim().length <= 2048 && !/[\u0000-\u001f\u007f]/.test(form)
    ? publicHttpsUrl(form) : null;
  // Optional legacy contact for Open Food Facts identification, not the support UI.
  const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';
  return {
    operator: process.env.EXPO_PUBLIC_OPERATOR_NAME?.trim() || null,
    privacyUrl: publicHttpsUrl(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL),
    supportFormUrl,
    supportEmail: /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? email : null,
  };
}

// The app and the exported web explanation use the same text.
export const dataHandlingSections: readonly { title: string; body: string }[] = handlingSections;
