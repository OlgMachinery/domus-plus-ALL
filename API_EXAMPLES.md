# API Usage Examples

## Complete Flow Example

### 1. Create a Receipt

**Request:**
```bash
curl -X POST http://localhost:3000/api/domus-receipts \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo-user",
    "image_url": "https://example.com/receipt.jpg"
  }'
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "demo-user",
    "image_url": "https://example.com/receipt.jpg",
    "ai_extracted": {
      "items": [
        {
          "name": "Milk",
          "quantity": 2,
          "price": 2.50,
          "total": 5.00
        },
        {
          "name": "Bread",
          "quantity": 1,
          "price": 3.00,
          "total": 3.00
        }
      ],
      "subtotal": 8.00,
      "tax": 1.60,
      "total": 9.60,
      "date": "2024-01-31",
      "merchant": "SuperMarket Inc"
    },
    "created_at": "2024-01-31T10:00:00.000Z",
    "updated_at": "2024-01-31T10:00:00.000Z"
  }
}
```

**Error Response (400 - Missing user_id):**
```json
{
  "success": false,
  "error": "user_id is required"
}
```

**Error Response (500 - OpenAI failure after retries):**
```json
{
  "success": false,
  "error": "Failed to parse receipt data: ..."
}
```

### 2. List All Receipts for a User

**Request:**
```bash
curl http://localhost:3000/api/domus-receipts?user_id=demo-user
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "demo-user",
      "image_url": "https://example.com/receipt1.jpg",
      "ai_extracted": {
        "items": [...],
        "total": 9.60,
        "merchant": "SuperMarket Inc"
      },
      "created_at": "2024-01-31T10:00:00.000Z",
      "updated_at": "2024-01-31T10:00:00.000Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "user_id": "demo-user",
      "image_url": "https://example.com/receipt2.jpg",
      "ai_extracted": {
        "items": [...],
        "total": 45.30,
        "merchant": "Electronics Store"
      },
      "created_at": "2024-01-30T15:30:00.000Z",
      "updated_at": "2024-01-30T15:30:00.000Z"
    }
  ]
}
```

### 3. Get a Specific Receipt

**Request:**
```bash
curl http://localhost:3000/api/domus-receipts/550e8400-e29b-41d4-a716-446655440000
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "demo-user",
    "image_url": "https://example.com/receipt.jpg",
    "ai_extracted": {
      "items": [
        {
          "name": "Milk",
          "quantity": 2,
          "price": 2.50,
          "total": 5.00
        }
      ],
      "total": 9.60
    },
    "created_at": "2024-01-31T10:00:00.000Z",
    "updated_at": "2024-01-31T10:00:00.000Z"
  }
}
```

### 4. Delete a Receipt

**Request:**
```bash
curl -X DELETE http://localhost:3000/api/domus-receipts/550e8400-e29b-41d4-a716-446655440000
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Receipt deleted successfully"
  }
}
```

## Error Scenarios & Retry Behavior

### Scenario 1: Temporary Network Failure

**What Happens:**
1. Initial request to OpenAI fails (network timeout)
2. System waits 1 second
3. Retry #1 succeeds
4. Receipt created successfully

**Console Output:**
```
Retry attempt 1/3 after 1000ms
Receipt created successfully
```

### Scenario 2: OpenAI Rate Limit

**What Happens:**
1. Initial request hits rate limit (429 error)
2. System waits 1 second
3. Retry #1 still rate limited
4. System waits 2 seconds
5. Retry #2 succeeds
6. Receipt created successfully

**Console Output:**
```
Retry attempt 1/3 after 1000ms
Retry attempt 2/3 after 2000ms
Receipt created successfully
```

### Scenario 3: Invalid Image URL

**What Happens:**
1. OpenAI cannot access the image (403/404)
2. All retries fail (image still inaccessible)
3. Error returned to user after 3 attempts

**Console Output:**
```
Retry attempt 1/3 after 1000ms
Retry attempt 2/3 after 2000ms
Retry attempt 3/3 after 4000ms
Error creating receipt: Failed to extract receipt data
```

**Response to User (500):**
```json
{
  "success": false,
  "error": "Failed to extract receipt data: Image not accessible"
}
```

## JavaScript/TypeScript Usage

### Frontend: Create Receipt

```typescript
async function createReceipt(imageUrl: string, userId: string) {
  try {
    const response = await fetch('/api/domus-receipts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        image_url: imageUrl,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('Receipt created:', result.data);
    return result.data;
  } catch (error) {
    console.error('Error creating receipt:', error);
    throw error;
  }
}
```

### Frontend: Fetch Receipts

```typescript
async function fetchReceipts(userId: string) {
  try {
    const response = await fetch(`/api/domus-receipts?user_id=${userId}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  } catch (error) {
    console.error('Error fetching receipts:', error);
    throw error;
  }
}
```

## Testing with curl

### Quick Test Script

```bash
#!/bin/bash

# Set variables
USER_ID="test-user-$(date +%s)"
IMAGE_URL="https://example.com/receipt.jpg"

echo "Creating receipt for user: $USER_ID"

# Create receipt
RESPONSE=$(curl -s -X POST http://localhost:3000/api/domus-receipts \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"image_url\": \"$IMAGE_URL\"
  }")

echo "Response: $RESPONSE"

# Extract receipt ID
RECEIPT_ID=$(echo $RESPONSE | jq -r '.data.id')

if [ "$RECEIPT_ID" != "null" ]; then
  echo "Created receipt ID: $RECEIPT_ID"
  
  # Fetch the receipt
  echo "Fetching receipt..."
  curl -s http://localhost:3000/api/domus-receipts/$RECEIPT_ID | jq '.'
  
  # List all receipts for user
  echo "Listing all receipts for user..."
  curl -s "http://localhost:3000/api/domus-receipts?user_id=$USER_ID" | jq '.'
else
  echo "Failed to create receipt"
fi
```

## Expected Timing

- **Without Retries**: ~2-5 seconds (OpenAI processing time)
- **With 1 Retry**: ~3-7 seconds (+ 1s wait)
- **With 2 Retries**: ~5-11 seconds (+ 1s + 2s wait)
- **With 3 Retries**: ~9-19 seconds (+ 1s + 2s + 4s wait)

## Rate Limits & Best Practices

### OpenAI Rate Limits (GPT-4o-mini)
- Check your tier limits at https://platform.openai.com/account/limits
- Default tier: ~3 requests per minute
- Recommendation: Queue uploads or implement client-side rate limiting

### Best Practices
1. Always provide publicly accessible image URLs
2. Use HTTPS URLs for security
3. Validate image formats before upload
4. Handle loading states in UI during retries
5. Show progress/retry indicators to users
6. Log errors for debugging
7. Implement proper authentication in production
