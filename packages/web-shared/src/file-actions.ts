import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { downloadBlob } from './blob';

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(blob);
  });
}

export async function downloadOrShareFile(blob: Blob, fileName: string) {
  if (!Capacitor.isNativePlatform()) {
    downloadBlob(blob, fileName);
    return;
  }
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_') || 'download';
  const path = `aeg/${Date.now()}-${safeName}`;
  const data = await blobToBase64(blob);
  const file = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true
  });
  await Share.share({
    title: fileName,
    text: fileName,
    files: [file.uri],
    dialogTitle: '打开、保存或分享文件'
  });
}

export async function openOrShareFile(blob: Blob, fileName: string) {
  if (Capacitor.isNativePlatform()) {
    await downloadOrShareFile(blob, fileName);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
