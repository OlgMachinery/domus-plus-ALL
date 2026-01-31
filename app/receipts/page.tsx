'use client';

import { useEffect, useState } from 'react';
import { Receipt, ReceiptItem } from '@/types/receipt';

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For demo purposes, using a default user_id
      // In production, this would come from authentication
      const userId = 'demo-user';
      
      const response = await fetch(`/api/domus-receipts?user_id=${userId}`);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch receipts');
      }
      
      setReceipts(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Recibos</h1>
          <p className="mt-2 text-gray-600">
            Gestión de recibos con extracción automática de datos
          </p>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando recibos...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchReceipts}
              className="mt-2 text-red-600 hover:text-red-800 underline"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {!loading && !error && receipts.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-600">No hay recibos disponibles</p>
          </div>
        )}

        {!loading && !error && receipts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedReceipt(receipt)}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {receipt.ai_extracted?.merchant || 'Recibo'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {receipt.ai_extracted?.date 
                          ? formatDate(receipt.ai_extracted.date)
                          : formatDate(receipt.created_at)
                        }
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">
                        {receipt.ai_extracted 
                          ? formatCurrency(receipt.ai_extracted.total)
                          : 'N/A'
                        }
                      </p>
                    </div>
                  </div>

                  {receipt.ai_extracted && receipt.ai_extracted.items.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-gray-700 mb-3">
                        Desglose de artículos ({receipt.ai_extracted.items.length})
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {receipt.ai_extracted.items.map((item: ReceiptItem, idx: number) => (
                          <div
                            key={idx}
                            className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0"
                          >
                            <div className="flex-1">
                              <span className="text-gray-900">{item.name}</span>
                              <span className="text-gray-500 ml-2">
                                x{item.quantity}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-gray-900 font-medium">
                                {formatCurrency(item.total)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {receipt.ai_extracted.subtotal && (
                        <div className="flex justify-between text-sm mt-3 pt-2 border-t">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="text-gray-900">
                            {formatCurrency(receipt.ai_extracted.subtotal)}
                          </span>
                        </div>
                      )}

                      {receipt.ai_extracted.tax && (
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-600">Impuestos:</span>
                          <span className="text-gray-900">
                            {formatCurrency(receipt.ai_extracted.tax)}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between font-semibold mt-2 pt-2 border-t">
                        <span>Total:</span>
                        <span className="text-blue-600">
                          {formatCurrency(receipt.ai_extracted.total)}
                        </span>
                      </div>
                    </div>
                  )}

                  {!receipt.ai_extracted && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-yellow-600">
                        ⚠️ No se pudo extraer información del recibo
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for detailed view */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Detalle del Recibo
                </h2>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedReceipt.image_url && (
                <div className="mb-6">
                  <img
                    src={selectedReceipt.image_url}
                    alt="Receipt"
                    className="w-full rounded-lg border"
                  />
                </div>
              )}

              {selectedReceipt.ai_extracted && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">
                      {selectedReceipt.ai_extracted.merchant || 'Comercio'}
                    </h3>
                    <p className="text-gray-600">
                      Fecha: {selectedReceipt.ai_extracted.date 
                        ? formatDate(selectedReceipt.ai_extracted.date)
                        : formatDate(selectedReceipt.created_at)
                      }
                    </p>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Artículos</h4>
                    <div className="space-y-2">
                      {selectedReceipt.ai_extracted.items.map((item: ReceiptItem, idx: number) => (
                        <div key={idx} className="flex justify-between py-2 border-b">
                          <div className="flex-1">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-gray-600">
                              {item.quantity} x {formatCurrency(item.price)}
                            </p>
                          </div>
                          <div className="text-right font-medium">
                            {formatCurrency(item.total)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 space-y-2 pt-4 border-t">
                      {selectedReceipt.ai_extracted.subtotal && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Subtotal:</span>
                          <span>{formatCurrency(selectedReceipt.ai_extracted.subtotal)}</span>
                        </div>
                      )}
                      {selectedReceipt.ai_extracted.tax && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Impuestos:</span>
                          <span>{formatCurrency(selectedReceipt.ai_extracted.tax)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-2 border-t">
                        <span>Total:</span>
                        <span className="text-blue-600">
                          {formatCurrency(selectedReceipt.ai_extracted.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
