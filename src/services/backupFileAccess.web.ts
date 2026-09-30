import { checkBackupSize } from './backupLimits';
export async function readBackupText(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('選択したファイルを読み込めませんでした。');
  const blob = await response.blob();
  checkBackupSize(blob.size);
  return blob.text();
}

export async function shareJsonFile(contents: string, filename: string, _title: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
