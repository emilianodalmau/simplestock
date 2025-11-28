'use server';

import { getAdminApp, getAuthenticatedUser } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { headers } from 'next/headers';
import type { StockMovement, UserProfile } from '@/types/inventory';

// Helper function to safely serialize Firestore Timestamps
function serializeMovements(
  docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
): StockMovement[] {
  return docs.map((doc) => {
    const data = doc.data();
    // Convert Firestore Timestamp to ISO string for serialization
    const createdAt = (data.createdAt as FirebaseFirestore.Timestamp).toDate().toISOString();
    return {
      ...data,
      id: doc.id,
      createdAt: createdAt, // This is now a string
    } as StockMovement;
  });
}

export async function getMyMovements(): Promise<{
  movements: StockMovement[];
  error: string | null;
}> {
  try {
    const user = await getAuthenticatedUser(headers());
    if (!user) {
      throw new Error(
        'No estás autenticado. Por favor, inicia sesión de nuevo.'
      );
    }
    
    // Fetch the user's profile to get their workspaceId
    const adminDb = (await getAdminApp()).firestore();
    const userDoc = await adminDb.collection('users').doc(user.uid).get();

    if (!userDoc.exists) {
        throw new Error("No se encontró tu perfil de usuario.");
    }
    const userProfile = userDoc.data() as UserProfile;

    if (userProfile.role !== 'solicitante') {
        throw new Error("No tienes permisos de 'solicitante' para ver esta página.");
    }

    if (!userProfile.workspaceId) {
        throw new Error("No estás asignado a un espacio de trabajo.");
    }

    // Now, query the movements using the Admin SDK
    const movementsSnapshot = await adminDb
      .collection(`workspaces/${userProfile.workspaceId}/stockMovements`)
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .get();
      
    if (movementsSnapshot.empty) {
      return { movements: [], error: null };
    }
    
    const movements = serializeMovements(movementsSnapshot.docs);

    return { movements, error: null };

  } catch (e: any) {
    console.error("Error fetching movements with Admin SDK:", e);
    return { movements: [], error: e.message || 'Ocurrió un error inesperado.' };
  }
}
