'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';

export interface AppSettings {
  appName: string;
  logoUrl: string;
}

const settingsFilePath = path.join(
  process.cwd(),
  'src/lib/app-settings.json'
);

export async function getSettings(): Promise<AppSettings> {
  try {
    const fileContent = await fs.readFile(settingsFilePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    // If the file doesn't exist, return default settings
    return {
      appName: 'Inventario App',
      logoUrl: '',
    };
  }
}

export async function updateSettings(formData: FormData) {
  const currentSettings = await getSettings();

  const newSettings: AppSettings = {
    appName: formData.get('appName') as string || currentSettings.appName,
    logoUrl: formData.get('logoUrl') as string,
  };

  await fs.writeFile(settingsFilePath, JSON.stringify(newSettings, null, 2));

  // Revalidate all paths to reflect the changes immediately
  revalidatePath('/', 'layout');
}
