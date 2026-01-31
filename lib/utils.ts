/**
 * Retry utility function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param delayMs Initial delay in milliseconds (default: 1000)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // Exponential backoff: delay * 2^attempt
        const waitTime = delayMs * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Standard API error response
 */
export function createErrorResponse(error: unknown, statusCode: number = 500) {
  const message = error instanceof Error ? error.message : 'An unknown error occurred';
  return new Response(
    JSON.stringify({ 
      error: message,
      success: false 
    }),
    { 
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Standard API success response
 */
export function createSuccessResponse(data: any, statusCode: number = 200) {
  return new Response(
    JSON.stringify({ 
      data,
      success: true 
    }),
    { 
      status: statusCode,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
