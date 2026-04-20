
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
    
    const products = productsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as any));

    // 2. Fetch all inventory for simple products
    const inventorySnapshot = await getDocs(collection(firestore, `${collectionPrefix}/inventory`));
    const simpleStockMap = new Map<string, number>();
    inventorySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const productId = data.productId;
        const qty = data.quantity || 0;
        simpleStockMap.set(productId, (simpleStockMap.get(productId) || 0) + qty);
    });

    // 3. First pass: Update SIMPLE products and build a lookup for combos
    const productStockMap = new Map<string, number>();
    
    for (const product of products) {
        if (product.productType !== 'COMBO') {
            const totalStock = simpleStockMap.get(product.id) || 0;
            productStockMap.set(product.id, totalStock);
        }
    }

    // 4. Second pass: Calculate COMBO stock and update all products
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const product of products) {
        let totalStock = 0;
        if (product.productType === 'COMBO') {
            const components = product.components || [];
            if (components.length === 0) {
                totalStock = 0;
            } else {
                // Total stock for combo is the minimum of kits we can make
                const kits = components.map((comp: any) => {
                    const available = productStockMap.get(comp.productId) || 0;
                    return Math.floor(available / comp.quantity);
                });
                totalStock = Math.min(...kits);
            }
        } else {
            totalStock = productStockMap.get(product.id) || 0;
        }

        let stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
        if (totalStock <= 0) {
            stockStatus = 'out-of-stock';
            outOfStockCount++;
        } else if (totalStock < (product.minStock || 0)) {
            stockStatus = 'low-stock';
            lowStockCount++;
        }

        const productRef = doc(firestore, `${collectionPrefix}/products`, product.id);
        const updateData: any = { 
            totalStock, 
            stockStatus 
        };
        
        // Ensure componentIds exists for combos
        if (product.productType === 'COMBO' && (!product.componentIds || product.componentIds.length === 0)) {
            updateData.componentIds = (product.components || []).map((c: any) => c.productId);
        }

        await setDoc(productRef, updateData, { merge: true });
    }

    // 5. Fetch pending requests
    const requestsSnapshot = await getDocs(
        query(collection(firestore, `${collectionPrefix}/stockMovements`), where('status', '==', 'pendiente'))
    );
    const pendingRequestsCount = requestsSnapshot.size;

    // 6. Update stats document
    const statsDocRef = doc(firestore, `workspaces/${workspaceId}/metadata`, 'stats');
    const statsData: WorkspaceStats = {
        lowStockCount,
        outOfStockCount,
        pendingRequestsCount,
        lastUpdated: serverTimestamp()
    };

    await setDoc(statsDocRef, statsData);
    
    return statsData;
}
