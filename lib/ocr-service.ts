import OpenAI from 'openai';
import { AIExtractedData } from '@/types/receipt';

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }
  return openaiInstance;
}

/**
 * Extract itemized receipt data from an image using OpenAI Vision API
 */
export async function extractReceiptData(imageUrl: string): Promise<AIExtractedData> {
  const openai = getOpenAI();
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this receipt image and extract the following information in JSON format:
            - items: array of {name, quantity, price, total} for each item
            - total: total amount
            - date: purchase date if available (ISO format)
            - merchant: store/merchant name if available
            - tax: tax amount if available
            - subtotal: subtotal before tax if available
            
            Return only valid JSON, no markdown or additional text.`
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            }
          }
        ]
      }
    ],
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from OpenAI');
  }

  // Parse the JSON response
  try {
    const extracted = JSON.parse(content);
    
    // Validate the structure
    if (!extracted.items || !Array.isArray(extracted.items)) {
      throw new Error('Invalid response structure: items array is required');
    }
    
    if (typeof extracted.total !== 'number') {
      throw new Error('Invalid response structure: total is required');
    }
    
    return extracted as AIExtractedData;
  } catch (error) {
    console.error('Failed to parse OpenAI response:', content);
    throw new Error(`Failed to parse receipt data: ${error}`);
  }
}
