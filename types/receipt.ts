export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface AIExtractedData {
  items: ReceiptItem[];
  total: number;
  date?: string;
  merchant?: string;
  tax?: number;
  subtotal?: number;
}

export interface Receipt {
  id: string;
  user_id: string;
  image_url: string;
  ai_extracted: AIExtractedData | null;
  created_at: string;
  updated_at: string;
}
