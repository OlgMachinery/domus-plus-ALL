import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Domus+
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Gestión de Finanzas Familiares con IA
          </p>
          
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6">Características</h2>
            
            <div className="grid gap-6 text-left">
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">📱 Gestión de Recibos</h3>
                <p className="text-gray-600">
                  Sube imágenes de tus recibos y extrae automáticamente la información
                </p>
              </div>
              
              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">🤖 Extracción con IA</h3>
                <p className="text-gray-600">
                  OCR inteligente que identifica artículos, precios y totales
                </p>
              </div>
              
              <div className="border-l-4 border-purple-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">📊 Desglose Detallado</h3>
                <p className="text-gray-600">
                  Visualiza el breakdown completo de cada recibo con todos los items
                </p>
              </div>
              
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">🔄 Manejo de Errores</h3>
                <p className="text-gray-600">
                  Sistema robusto con reintentos automáticos en caso de fallos
                </p>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href="/receipts"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Ver Recibos
              </Link>
            </div>
          </div>

          <div className="mt-8 text-sm text-gray-500">
            <p>Powered by Next.js + Supabase + OpenAI</p>
          </div>
        </div>
      </div>
    </div>
  );
}
