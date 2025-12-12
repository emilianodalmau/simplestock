
'use server';

import fs from 'fs/promises';
import path from 'path';
import type { AppSettings } from '@/types/settings';
import { revalidatePath } from 'next/cache';

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
      appName: 'SIMPLESTOCK',
      logoUrl: '',
    };
  }
}

// This is the Server Action to update settings
export async function updateSettings(formData: FormData) {
  try {
    const newSettings = {
      appName: formData.get('appName') as string,
      logoUrl: formData.get('logoUrl') as string,
    };
    
    await fs.writeFile(settingsFilePath, JSON.stringify(newSettings, null, 2), 'utf-8');

    // Revalidate the path to ensure the new settings are picked up on next page load
    revalidatePath('/', 'layout');

    return { success: true, message: 'Settings updated successfully.' };
  } catch (error) {
    console.error('Failed to update settings:', error);
    return { success: false, message: 'Failed to update settings.' };
  }
}
