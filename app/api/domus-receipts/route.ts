import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { extractReceiptData } from '@/lib/ocr-service';
import { withRetry, createErrorResponse, createSuccessResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image_url, user_id } = body;

    if (!image_url) {
      return createErrorResponse(new Error('image_url is required'), 400);
    }

    if (!user_id) {
      return createErrorResponse(new Error('user_id is required'), 400);
    }

    // Extract receipt data with retry logic
    const aiExtracted = await withRetry(
      async () => await extractReceiptData(image_url),
      3,
      1000
    );

    // Save to database with retry logic
    const supabase = getServiceSupabase();
    const receipt = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from('receipts')
          .insert({
            user_id,
            image_url,
            ai_extracted: aiExtracted,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      3,
      1000
    );

    return createSuccessResponse(receipt, 201);
  } catch (error) {
    console.error('Error creating receipt:', error);
    return createErrorResponse(error, 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return createErrorResponse(new Error('user_id is required'), 400);
    }

    // Fetch receipts with retry logic
    const supabase = getServiceSupabase();
    const receipts = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from('receipts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
      },
      3,
      1000
    );

    return createSuccessResponse(receipts);
  } catch (error) {
    console.error('Error fetching receipts:', error);
    return createErrorResponse(error, 500);
  }
}
