# Domus+ - Finanzas Familiares

Aplicación de gestión de finanzas familiares construida con Next.js, Supabase y OpenAI. Incluye un módulo avanzado de recibos con extracción automática de datos mediante OCR/IA.

## 🚀 Características

- **Gestión de Recibos**: Sube y gestiona recibos de forma centralizada
- **Extracción con IA**: OCR inteligente usando OpenAI Vision API para extraer:
  - Desglose itemizado de productos
  - Precios individuales y totales
  - Impuestos y subtotales
  - Fecha y comercio
- **Visualización de Breakdown**: Página dedicada `/receipts` que muestra el desglose completo de todos los recibos
- **Manejo Robusto de Errores**: Sistema de reintentos automáticos con backoff exponencial en todos los endpoints
- **Base de Datos**: Campo `ai_extracted` en Supabase para almacenar datos estructurados

## 📋 Requisitos Previos

- Node.js 18+ 
- Cuenta de Supabase
- API Key de OpenAI

## 🔧 Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/OlgMachinery/domus-plus-ALL.git
cd domus-plus-ALL
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:
```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon
SUPABASE_SERVICE_ROLE_KEY=tu_clave_service_role
OPENAI_API_KEY=tu_clave_openai
```

4. Configurar la base de datos en Supabase:
   - Ejecutar el SQL en `supabase/schema.sql` en el editor SQL de Supabase
   - Esto creará la tabla `receipts` con todos los índices y políticas necesarias

## 🏃‍♂️ Ejecución

Modo desarrollo:
```bash
npm run dev
```

Construir para producción:
```bash
npm run build
npm start
```

La aplicación estará disponible en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
domus-plus-ALL/
├── app/
│   ├── api/
│   │   └── domus-receipts/        # API endpoints con retry logic
│   │       ├── route.ts            # POST (crear) y GET (listar)
│   │       └── [id]/
│   │           └── route.ts        # GET y DELETE por ID
│   ├── receipts/
│   │   └── page.tsx                # Página de visualización de recibos
│   ├── layout.tsx                  # Layout principal
│   ├── page.tsx                    # Página de inicio
│   └── globals.css                 # Estilos globales
├── lib/
│   ├── supabase.ts                 # Cliente de Supabase
│   ├── ocr-service.ts              # Servicio de extracción con OpenAI
│   └── utils.ts                    # Utilidades (retry, error handling)
├── types/
│   └── receipt.ts                  # Tipos TypeScript
├── supabase/
│   └── schema.sql                  # Esquema de base de datos
└── .env.example                    # Variables de entorno de ejemplo
```

## 🔌 API Endpoints

### POST /api/domus-receipts
Crear un nuevo recibo con extracción automática de datos.

**Body:**
```json
{
  "user_id": "string",
  "image_url": "string"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "string",
    "image_url": "string",
    "ai_extracted": {
      "items": [...],
      "total": 0,
      "merchant": "string",
      "date": "ISO date"
    }
  }
}
```

### GET /api/domus-receipts?user_id=xxx
Obtener todos los recibos de un usuario.

### GET /api/domus-receipts/[id]
Obtener un recibo específico por ID.

### DELETE /api/domus-receipts/[id]
Eliminar un recibo.

## 🔄 Manejo de Errores y Reintentos

Todos los endpoints implementan:
- **Reintentos automáticos**: Hasta 3 intentos con backoff exponencial
- **Manejo de errores**: Respuestas consistentes con códigos HTTP apropiados
- **Logging**: Registro detallado de errores para debugging

Ejemplo de configuración de retry:
```typescript
await withRetry(
  async () => await operation(),
  3,        // maxRetries
  1000      // delayMs inicial
);
```

## 🎨 Interfaz de Usuario

### Página de Recibos (/receipts)
- Vista en grid de todos los recibos
- Desglose itemizado visible directamente en cada tarjeta
- Modal de detalle con imagen del recibo y breakdown completo
- Formato de moneda en EUR
- Indicadores visuales para recibos sin extracción exitosa
- Diseño responsive

## 🔒 Seguridad

- Row Level Security (RLS) habilitado en Supabase
- Variables de entorno para credenciales sensibles
- Validación de datos en API endpoints
- Service role solo usado en servidor

## 🛠️ Tecnologías

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Base de Datos**: Supabase (PostgreSQL)
- **IA/OCR**: OpenAI GPT-4o Vision API
- **Deploy**: Compatible con Vercel, Railway, etc.

## 📝 Notas

- El campo `ai_extracted` en la tabla `receipts` almacena un objeto JSON con toda la información extraída
- La extracción usa GPT-4o-mini para optimizar costos manteniendo buena precisión
- El sistema está diseñado para manejar fallos temporales de API mediante reintentos
- En producción, implementar autenticación real (actualmente usa usuario demo)
