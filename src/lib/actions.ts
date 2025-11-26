
'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getSettings, type AppSettings } from './settings';

const settingsFilePath = path.join(
  process.cwd(),
  'src/lib/app-settings.json'
);

// This function IS a Server Action, meant to be called from the client.
export async function updateSettings(formData: FormData) {
  const currentSettings = await getSettings();

  const newSettings: AppSettings = {
    appName: (formData.get('appName') as string) || currentSettings.appName,
    logoUrl: formData.get('logoUrl') as string,
  };

  await fs.writeFile(settingsFilePath, JSON.stringify(newSettings, null, 2));

  // Revalidate all paths to reflect the changes immediately
  revalidatePath('/', 'layout');
}
