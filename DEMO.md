# Domus+ Demo Instructions

## Quick Setup for Demo

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Required values:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
   - `OPENAI_API_KEY`: Your OpenAI API key

3. **Set up Supabase database**:
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Run the SQL script from `supabase/schema.sql`

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Access the application**:
   - Homepage: http://localhost:3000
   - Receipts page: http://localhost:3000/receipts

## Testing the Features

### 1. View the Homepage
Navigate to http://localhost:3000 to see the landing page with feature overview.

### 2. Test Receipt Upload via API

Create a test receipt with a real receipt image URL:

```bash
curl -X POST http://localhost:3000/api/domus-receipts \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo-user",
    "image_url": "https://example.com/your-receipt-image.jpg"
  }'
```

**Note**: The image URL must be publicly accessible so OpenAI can analyze it.

### 3. View Receipts Page
Navigate to http://localhost:3000/receipts to see all receipts with their itemized breakdowns.

### 4. Test Retry Logic
The retry logic is automatically tested when:
- Network issues occur
- API rate limits are hit
- Temporary service outages happen

You can verify retry logs in the console output during development.

## Example Receipt Image URLs

For testing, you can use these publicly available receipt images:

1. **Sample grocery receipt**:
   ```
   https://images.unsplash.com/photo-1556742393-d75f468bfcb0?w=800
   ```

2. **Sample restaurant receipt** (you'll need to find one or upload your own to a CDN)

## API Endpoints Testing

### POST /api/domus-receipts
Create a new receipt:
```bash
curl -X POST http://localhost:3000/api/domus-receipts \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo-user",
    "image_url": "YOUR_IMAGE_URL"
  }'
```

### GET /api/domus-receipts?user_id=xxx
List all receipts for a user:
```bash
curl http://localhost:3000/api/domus-receipts?user_id=demo-user
```

### GET /api/domus-receipts/[id]
Get a specific receipt:
```bash
curl http://localhost:3000/api/domus-receipts/RECEIPT_ID
```

### DELETE /api/domus-receipts/[id]
Delete a receipt:
```bash
curl -X DELETE http://localhost:3000/api/domus-receipts/RECEIPT_ID
```

## Expected AI Extraction Format

The `ai_extracted` field in the database will contain:

```json
{
  "items": [
    {
      "name": "Product Name",
      "quantity": 2,
      "price": 5.99,
      "total": 11.98
    }
  ],
  "total": 15.48,
  "subtotal": 11.98,
  "tax": 3.50,
  "date": "2024-01-31",
  "merchant": "Store Name"
}
```

## Error Handling Features

The application includes:

1. **Automatic Retries**: Up to 3 attempts with exponential backoff
2. **Error Messages**: Clear error messages for debugging
3. **Validation**: Input validation on all endpoints
4. **Logging**: Detailed console logging for tracking issues

## Troubleshooting

### Build Errors
- Ensure all environment variables are set (even if empty strings for build)
- Run `npm run build` to test production build

### API Errors
- Check that Supabase credentials are correct
- Verify OpenAI API key is valid and has sufficient credits
- Ensure receipt image URLs are publicly accessible (CORS-enabled)

### No Data Showing
- Verify the database schema is created in Supabase
- Check browser console for JavaScript errors
- Ensure you're using `user_id: "demo-user"` for testing

## Production Deployment

Before deploying to production:

1. Set all environment variables in your hosting platform
2. Run `npm run build` to verify build succeeds
3. Implement proper authentication (currently uses demo user)
4. Update Supabase RLS policies to use real user IDs
5. Consider rate limiting on API endpoints
6. Add monitoring and error tracking (e.g., Sentry)
