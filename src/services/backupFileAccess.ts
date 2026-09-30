import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { checkBackupSize } from './backupLimits';

export async function readBackupText(uri: string): Promise<string> {
  const file = new File(uri);
  checkBackupSize(file.size);
  return file.text();
}

export async function shareJsonFile(contents: string, filename: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('この端末ではファイル共有を利用できません。');
  const file = new File(Paths.cache, filename);
  file.write(contents);
  await Sharing.shareAsync(file.uri, { dialogTitle: title, mimeType: 'application/json', UTI: 'public.json' });
}
