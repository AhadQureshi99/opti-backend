# Backend Offline Sync System Documentation

## Overview

Backend endpoints that handle offline-first sync from React frontend. When users are offline, their changes are stored locally in IndexedDB. When they come online, the frontend sends all pending changes to these backend endpoints for processing and database updates.

---

## Sync Architecture

### Flow:

```
Frontend (Offline)
  ↓
Local IndexedDB (Dexie)
  ↓
Send to Backend (when online)
  ↓
Backend Sync Endpoints
  ↓
Process & Validate
  ↓
Save to MongoDB
  ↓
Return response to Frontend
```

---

## Endpoints

### 1. Add to Sync Queue

**POST** `/api/sync/add`

Add a single item to the sync queue.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**

```json
{
  "endpoint": "/api/expenses",
  "method": "POST",
  "data": {
    "amount": 100,
    "category": "Salary",
    "date": "2025-12-10T10:00:00Z",
    "description": "Monthly salary"
  },
  "deviceId": "device-123" // Optional - for conflict resolution
}
```

**Response:**

```json
{
  "message": "Item added to sync queue",
  "syncItem": {
    "_id": "sync-id",
    "userId": "user-id",
    "endpoint": "/api/expenses",
    "method": "POST",
    "status": "pending",
    "attempts": 0,
    "createdAt": "2025-12-10T10:00:00Z"
  }
}
```

---

### 2. Bulk Add to Sync Queue

**POST** `/api/sync/bulk`

Add multiple items to sync queue at once.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**

```json
{
  "items": [
    {
      "endpoint": "/api/expenses",
      "method": "POST",
      "data": { "amount": 100, "category": "Salary" },
      "deviceId": "device-123"
    },
    {
      "endpoint": "/api/orders",
      "method": "POST",
      "data": { "patientName": "John", "totalAmount": 5000 }
    }
  ]
}
```

**Response:**

```json
{
  "message": "Items added to sync queue",
  "count": 2
}
```

---

### 3. Get Pending Syncs

**GET** `/api/sync/pending`

Retrieve all pending sync items for the user (for debugging).

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "message": "Pending syncs retrieved",
  "count": 5,
  "syncs": [
    {
      "_id": "sync-1",
      "endpoint": "/api/expenses",
      "method": "POST",
      "data": { ... },
      "status": "pending",
      "attempts": 2,
      "error": null,
      "retryAt": "2025-12-10T10:05:00Z"
    }
  ]
}
```

---

### 4. Process Sync Queue

**POST** `/api/sync/process`

Trigger sync processing - processes all pending items for the user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "message": "Sync queue processed",
  "processed": 5,
  "successful": 4,
  "failed": 1
}
```

**What it does:**

1. Gets all pending syncs for user
2. Processes each in order (highest priority first)
3. Retries failed items with exponential backoff
4. Updates item status (completed/failed)
5. Returns summary

---

### 5. Clear Sync Queue

**DELETE** `/api/sync/clear`

Clear all pending syncs (for testing/debugging only).

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "message": "Sync queue cleared",
  "deletedCount": 10
}
```

---

## SyncQueue Model

**MongoDB Schema:**

```javascript
{
  _id: ObjectId,
  userId: ObjectId,           // User who created the sync
  endpoint: String,            // /api/expenses, /api/orders
  method: String,              // GET, POST, PUT, DELETE
  data: Mixed,                 // Request body/payload
  status: String,              // pending, processing, completed, failed
  attempts: Number,            // Number of retry attempts
  maxAttempts: Number,         // Max retries (default: 5)
  error: String,               // Error message if failed
  responseData: Mixed,         // Response from backend processing
  deviceId: String,            // Device identifier (optional)
  priority: Number,            // Higher priority syncs first
  retryAt: Date,               // When to retry next
  createdAt: Date,             // When item was created
  updatedAt: Date              // When item was last updated
}
```

---

## How Sync Processing Works

### 1. Incoming Sync Request

Frontend sends: `POST /api/sync/add` with expense data

### 2. Queue Storage

Item stored in `SyncQueue` collection with status=`pending`

### 3. Trigger Processing

Frontend calls: `POST /api/sync/process`

### 4. Processing Logic

For each pending item:

- Set status to `processing`
- Route to appropriate handler (expense/order/user)
- Validate data against model schema
- Save to MongoDB if valid
- Set status to `completed` if successful
- If failed: increment attempts, set next retry time, revert to `pending` (if < 5 attempts) or `failed` (if >= 5 attempts)

### 5. Response

Return summary:

```json
{
  "processed": 10, // Total items processed
  "successful": 9, // Successfully synced
  "failed": 1 // Failed to sync
}
```

---

## Retry Logic

**Exponential Backoff:**

- Attempt 1: Immediate
- Attempt 2: 5 seconds
- Attempt 3: 10 seconds
- Attempt 4: 20 seconds
- Attempt 5: 40 seconds
- Attempt 6+: 80 seconds (max)

**Max Attempts:** 5 retries (configurable via `maxAttempts` field)

After 5 failed attempts, item status changes to `failed` and is no longer retried automatically.

---

## Supported Operations

### Expenses

- **POST** - Create new expense
- **PUT** - Update existing expense
- **DELETE** - Delete expense

### Orders

- **POST** - Create new order
- **PUT** - Update existing order
- **DELETE** - Delete order

### Users

- **PUT** - Update user profile

---

## Example: Complete Offline Flow

### 1. User Goes Offline

User fills expense form while offline:

```javascript
// Frontend
await sendToSyncQueue("/api/expenses", "POST", {
  amount: 100,
  category: "Salary",
  date: "2025-12-10T10:00:00Z",
  description: "Monthly salary",
});
```

Backend stores in `SyncQueue` collection

### 2. Internet Returns

Frontend detects online and sends:

```javascript
// Frontend
await triggerBackendSync();
```

### 3. Backend Processes

```
GET all pending syncs for user
FOR EACH sync item:
  - Validate data
  - Create Expense in MongoDB
  - Update sync status to 'completed'
  - Return response
RETURN summary
```

### 4. Frontend Receives Confirmation

```json
{
  "message": "Sync queue processed",
  "processed": 1,
  "successful": 1,
  "failed": 0
}
```

Frontend updates UI, clears local queue, refreshes data.

---

## Error Handling

### If Backend Fails:

- Save error message in `SyncQueue.error`
- Increment `attempts`
- Calculate next `retryAt` time
- Set status back to `pending` (if attempts < 5)

### If Item Fails 5 Times:

- Set status to `failed`
- Item is NOT auto-retried
- Admin can review failed syncs and manually investigate

### Check Failed Items:

```javascript
// In backend console
db.syncqueues.find({ status: "failed" });
```

---

## Testing

### 1. Test with cURL

Add to sync queue:

```bash
curl -X POST http://localhost:5000/api/sync/add \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/api/expenses",
    "method": "POST",
    "data": { "amount": 100, "category": "Salary" }
  }'
```

Process sync:

```bash
curl -X POST http://localhost:5000/api/sync/process \
  -H "Authorization: Bearer <token>"
```

Get pending:

```bash
curl -X GET http://localhost:5000/api/sync/pending \
  -H "Authorization: Bearer <token>"
```

### 2. Test with Postman

1. Set auth token in headers
2. Create sync items via `/api/sync/add`
3. Call `/api/sync/process` to trigger sync
4. Check MongoDB for created expenses/orders
5. Call `/api/sync/pending` to verify status

---

## Monitoring & Debugging

### Check Sync Queue Status

```javascript
// Backend console
const pending = await db.syncqueues.countDocuments({ status: "pending" });
const failed = await db.syncqueues.countDocuments({ status: "failed" });
console.log(`Pending: ${pending}, Failed: ${failed}`);
```

### View Failed Items

```javascript
const failed = await db.syncqueues.find({ status: "failed" }).toArray();
console.table(failed);
```

### Retry Failed Item

```javascript
await db.syncqueues.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "pending", attempts: 0 } }
);
```

### Clear Queue (Testing Only)

```bash
curl -X DELETE http://localhost:5000/api/sync/clear \
  -H "Authorization: Bearer <token>"
```

---

## Performance Considerations

- **Batch Processing:** Max 50 items processed per `/sync/process` call
- **Indexes:** `userId`, `status`, `endpoint` indexed for fast queries
- **Priority:** Higher priority syncs processed first
- **Rate Limiting:** Not implemented - add rate limiting middleware if needed
- **Database Size:** Monitor `syncQueue` collection size, clean up completed items periodically

### Cleanup Old Syncs (Optional)

```javascript
// Delete completed syncs older than 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
await db.syncqueues.deleteMany({
  status: "completed",
  updatedAt: { $lt: thirtyDaysAgo },
});
```

---

## Frontend Integration

Use `src/utils/syncClient.js` to interact with these endpoints:

```javascript
import {
  sendToSyncQueue,
  triggerBackendSync,
  getPendingSyncsFromBackend,
  initializeBackendSync,
} from "../utils/syncClient";

// Initialize auto-sync on app load
useEffect(() => {
  initializeBackendSync(30000); // Sync every 30 seconds
}, []);

// Manually sync when needed
const handleSync = async () => {
  try {
    const result = await triggerBackendSync();
    console.log("Sync result:", result);
  } catch (error) {
    console.error("Sync failed:", error);
  }
};
```

---

## Security

✅ All endpoints require authentication
✅ Users can only sync their own data
✅ Data validated before saving
✅ Timestamps tracked for audit
✅ Error messages sanitized

---

## Next Steps

- [ ] Implement conflict resolution for concurrent edits
- [ ] Add compression for large payloads
- [ ] Implement differential sync
- [ ] Add webhooks for sync events
- [ ] Create admin dashboard to view sync queue
- [ ] Implement automatic cleanup of old completed syncs
- [ ] Add metrics/analytics for sync performance
