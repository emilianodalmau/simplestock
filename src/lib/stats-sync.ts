
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    doc, 
    setDoc, 
    serverTimestamp,
    Firestore
} from 'firebase/firestore';
import { WorkspaceStats } from '@/types/inventory';

export async function syncWorkspaceStats(firestore: Firestore, workspaceId: string) {
    if (!firestore || !workspaceId) return;

    const collectionPrefix = `workspaces/${workspaceId}`;
    
    // 1. Fetch all non-archived products
    const productsSnapshot = await getDocs(
        query(collection(firestore, `${collectionPrefix}/products`), where('isArchived', '!=', true))
    );
    const products = productsSnapshot.docs.map(doc => ({
        id: doc.id,
        minStock: doc.data().minStock || 0
    }));

    // 2. Fetch all inventory
    const inventorySnapshot = await getDocs(collection(firestore, `${collectionPrefix}/inventory`));
    const stockMap = new Map<string, number>();
    inventorySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const productId = data.productId;
        const qty = data.quantity || 0;
        stockMap.set(productId, (stockMap.get(productId) || 0) + qty);
    });

    // 3. Fetch pending requests
    const requestsSnapshot = await getDocs(
        query(collection(firestore, `${collectionPrefix}/stockMovements`), where('status', '==', 'pendiente'))
    );
    const pendingRequestsCount = requestsSnapshot.size;

    // 4. Calculate stock stats and update products with totalStock
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const statsDocRef = doc(firestore, `workspaces/${workspaceId}/metadata`, 'stats');
    
    for (const product of products) {
        const totalStock = stockMap.get(product.id) || 0;
        
        // Update product document with cached totalStock
        const productRef = doc(firestore, `${collectionPrefix}/products`, product.id);
        await setDoc(productRef, { totalStock }, { merge: true });

        if (totalStock <= 0) {
            outOfStockCount++;
        } else if (totalStock < product.minStock) {
            lowStockCount++;
        }
    }


    // 5. Update stats document
    const statsData: WorkspaceStats = {
        lowStockCount,
        outOfStockCount,
        pendingRequestsCount,
        lastUpdated: serverTimestamp()
    };

    await setDoc(statsDocRef, statsData);
    
    return statsData;
}
