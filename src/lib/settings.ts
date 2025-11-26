
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

// This function is intended to be run on the server, but not as a Server Action.
// It reads from the file system, which is a server-side operation.
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

// This function IS a Server Action, meant to be called from the client.
export async function updateSettings(formData: FormData) {
  'use server';
  const currentSettings = await getSettings();

  const newSettings: AppSettings = {
    appName: formData.get('appName') as string || currentSettings.appName,
    logoUrl: formData.get('logoUrl') as string,
  };

  await fs.writeFile(settingsFilePath, JSON.stringify(newSettings, null, 2));

  // Revalidate all paths to reflect the changes immediately
  revalidatePath('/', 'layout');
}
