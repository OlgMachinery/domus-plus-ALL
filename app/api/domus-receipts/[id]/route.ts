import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { withRetry, createErrorResponse, createSuccessResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch receipt with retry logic
    const supabase = getServiceSupabase();
    const receipt = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from('receipts')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      },
      3,
      1000
    );

    return createSuccessResponse(receipt);
  } catch (error) {
    const { id } = await params;
    console.error(`Error fetching receipt ${id}:`, error);
    return createErrorResponse(error, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete receipt with retry logic
    const supabase = getServiceSupabase();
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('receipts')
          .delete()
          .eq('id', id);

        if (error) throw error;
      },
      3,
      1000
    );

    return createSuccessResponse({ message: 'Receipt deleted successfully' });
  } catch (error) {
    const { id } = await params;
    console.error(`Error deleting receipt ${id}:`, error);
    return createErrorResponse(error, 500);
  }
}
