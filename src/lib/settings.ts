
import fs from 'fs/promises';
import path from 'path';

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
