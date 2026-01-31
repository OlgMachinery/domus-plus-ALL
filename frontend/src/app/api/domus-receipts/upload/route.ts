import Tesseract from "tesseract.js";
// Extraer texto con Tesseract
async function extractWithTesseract(dataUrl: string): Promise<string> {
  const { data } = await Tesseract.recognize(dataUrl, "spa");
  return data.text;
}

// Extraer campos con Vision y luego OCR exacto sobre cada campo
async function extractHybrid({ apiKey, model, dataUrl, debug }: { apiKey: string, model: string, dataUrl: string, debug?: boolean }) {
  let visionExtracted: Extracted | null = null;
  let visionRaw: any = null;
  let ocrText: string | null = null;
  let gptCleaned: Extracted | null = null;
  let debugInfo: any = {};
  try {
    // 1. Vision: obtener contexto y campos
    const visionRes = await extractWithAI({ apiKey, model, dataUrl, debug });
    visionExtracted = visionRes.extracted;
    visionRaw = visionRes;
    debugInfo.vision = visionExtracted;
  } catch (e) {
    debugInfo.visionError = e instanceof Error ? e.message : String(e);
  }
  // 2. OCR: leer todo el texto
  try {
    ocrText = await extractWithTesseract(dataUrl);
    debugInfo.ocrText = ocrText;
  } catch (e) {
    debugInfo.ocrError = e instanceof Error ? e.message : String(e);
  }
  // 3. GPT (texto): limpiar, validar y estructurar usando ambos resultados
  try {
    if (visionExtracted && ocrText) {
      // Prompt para GPT: combina visión y OCR para máxima precisión
      const gpt = new OpenAI({ apiKey });
      const prompt = `Eres un experto en validación de datos de recibos. Tienes dos fuentes: (1) Extracción IA (Vision), que entiende el contexto y estructura, y (2) OCR, que es exacto carácter por carácter.\n\nTu tarea:\n- Combina ambos resultados para obtener la máxima precisión.\n- Si hay conflicto en campos numéricos (total, tax, precios, cantidades, items), SIEMPRE prioriza el valor del OCR.\n- Usa Vision para contexto, merchant, fecha, moneda y estructura de items.\n- Si algún campo falta en Vision pero está en OCR, usa el de OCR.\n- Si algún campo falta en ambos, pon null.\n- Devuelve solo un objeto JSON válido con los campos: merchant, date (YYYY-MM-DD), currency, total, tax, items (array de { description, quantity, unit_price, total }), confidence.\n\nEjemplo de items:\n[ { "description": "Leche Entera 1L", "quantity": 3, "unit_price": 21.00, "total": 63.00 } ]\n\nExtracción Vision:\n${JSON.stringify(visionExtracted)}\n\nTexto OCR:\n${ocrText}`;
      const chat = await gpt.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: "Eres un validador y limpiador de recibos. Responde solo con JSON válido." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        stream: false,
      });
      const text = chat.choices?.[0]?.message?.content || "";
      const parsed = safeJsonParse(text);
      if (parsed && typeof parsed === "object") {
        gptCleaned = parsed as Extracted;
        debugInfo.gptCleaned = gptCleaned;
      }
    }
  } catch (e) {
    debugInfo.gptError = e instanceof Error ? e.message : String(e);
  }
  return { visionExtracted, ocrText, gptCleaned, debugInfo };
}

// Fallback: parsear líneas de artículos desde texto plano
function parseItemsFromText(text: string): Array<{ description: string, quantity: number|null, unit_price: number|null, total: number|null }> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items: any[] = [];
  // Regex ejemplo: "Leche Entera 1L x3 $63.00" o "Pan Bimbo 2 $40.80 $81.60"
  const itemRegex = /^(.+?)\s+x?(\d+)(?:\s*\$([\d.]+))?(?:\s*\$([\d.]+))?$/;
  for (const line of lines) {
    const match = line.match(itemRegex);
    if (match) {
      items.push({
        description: match[1],
        quantity: Number(match[2]) || null,
        unit_price: match[3] ? Number(match[3]) : null,
        total: match[4] ? Number(match[4]) : null,
      });
    }
  }
  return items;
}
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const NumberLike = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9,.-]/g, "").trim();
    if (!cleaned) return null;
    const normalized =
      cleaned.includes(",") && !cleaned.includes(".")
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().nullable());

const ExtractedSchema = z.object({
  merchant: z.string().nullable().optional(),
  date: z.string().nullable().optional(), // ideal: YYYY-MM-DD
  currency: z.string().nullable().optional(),
  total: NumberLike.nullable().optional(),
  tax: NumberLike.nullable().optional(),
  items: z
    .array(
      z.object({
        description: z.string().nullable().optional(),
        quantity: NumberLike.nullable().optional(),
        unit_price: NumberLike.nullable().optional(),
        total: NumberLike.nullable().optional(),
      })
    )
    .nullable()
    .optional(),
  confidence: NumberLike.nullable().optional(),
});

type Extracted = z.infer<typeof ExtractedSchema>;

type AiAttemptDebug = {
  attempt: "tools" | "json_schema" | "json_object" | "plain";
  model: string;
  responseId?: string;
  finishReason?: string | null;
  toolCalls?: number;
  toolName?: string | null;
  toolArgsPreview?: string | null;
  contentPreview?: string | null;
  usage?: unknown;
  parse: {
    toolArgsJson: boolean;
    toolArgsZod: boolean;
    contentJson: boolean;
    contentZod: boolean;
  };
};

class AiExtractionError extends Error {
  debug: { attempts: AiAttemptDebug[]; lastError: string | null };
  constructor(message: string, debug: { attempts: AiAttemptDebug[]; lastError: string | null }) {
    super(message);
    this.name = "AiExtractionError";
    this.debug = debug;
  }
}

function summarizeAttempts(attempts: AiAttemptDebug[], lastError: string | null): string {
  const last = attempts.length ? attempts[attempts.length - 1] : null;
  const parts: string[] = [];
  if (last) {
    parts.push(`último=${last.attempt}`);
    if (last.finishReason) parts.push(`finish=${last.finishReason}`);
    if (typeof last.toolCalls === "number") parts.push(`toolCalls=${last.toolCalls}`);
  }
  if (lastError) parts.push(`errorOpenAI=${lastError}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  const replacedSpaces = trimmed.replace(/\s+/g, "-");
  const safe = replacedSpaces.replace(/[^a-zA-Z0-9._-]/g, "");
  return safe || "file";
}

function safeJsonParse(text: string): unknown {
  let trimmed = text.trim();

  // Strip ```json / ``` fences if present
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline >= 0) {
      trimmed = trimmed.slice(firstNewline + 1);
    }
    const lastFence = trimmed.lastIndexOf("```");
    if (lastFence >= 0) {
      trimmed = trimmed.slice(0, lastFence);
    }
    trimmed = trimmed.trim();
  }

  const candidates: string[] = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    // Attempt direct parse
    try {
      return JSON.parse(candidate);
    } catch {
      // Attempt small repairs (common model mistakes)
      const repaired = candidate
        .replace(/,\s*([}\]])/g, "$1") // trailing commas
        .replace(/^\uFEFF/, "")
        .trim();
      try {
        return JSON.parse(repaired);
      } catch {
        // continue
      }
    }
  }

  return null;
}

function previewText(value: string | null | undefined, max = 1200): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function toDataUrl(mime: string, bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${mime};base64,${base64}`;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m1 = v.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (m1) {
    const dd = m1[1];
    const mm = m1[2];
    const yyyy = m1[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const m2 = v.match(/^(\d{4})[\/\-.](\d{2})[\/\-.](\d{2})$/);
  if (m2) {
    const yyyy = m2[1];
    const mm = m2[2];
    const dd = m2[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

async function extractWithAI(params: {
  apiKey: string;
  model: string;
  dataUrl: string;
  debug?: boolean;
}): Promise<{ extracted: Extracted }> {
  const client = new OpenAI({ apiKey: params.apiKey });


  const system =
    "Eres un extractor de recibos. Responde únicamente con un objeto JSON válido. No uses markdown, no agregues texto extra. Si falta un dato, usa null. Siempre incluye el array 'items', aunque esté vacío. 'items' debe ser un array de objetos con los campos: description, quantity, unit_price, total. Si no hay artículos, devuelve un array vacío en items.";

  const user =
    "Extrae TODOS los artículos del ticket. Devuelve un objeto JSON con los siguientes campos: merchant (string o null), date (YYYY-MM-DD o null), currency (ej: MXN o null), total (número o null), tax (número o null), items (array de objetos con { description, quantity, unit_price, total }), confidence (0..1 o null). Ejemplo de items: [ { \"description\": \"Leche Entera 1L\", \"quantity\": 3, \"unit_price\": 21.00, \"total\": 63.00 }, { \"description\": \"Pan Integral Bimbo 670g\", \"quantity\": 2, \"unit_price\": 40.80, \"total\": 81.60 } ]. No uses markdown ni texto extra. Si falta un dato, usa null.";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: params.dataUrl, detail: "auto" } },
      ],
    },
  ];

  const baseRequest: ChatCompletionCreateParamsNonStreaming = {
    model: params.model,
    messages,
    temperature: 0,
    stream: false,
  };

  // Prefer function calling: avoids JSON formatting issues in message content
  const tools: ChatCompletionCreateParamsNonStreaming["tools"] = [
    {
      type: "function",
      function: {
        name: "extract_receipt",
        description: "Extrae datos de un recibo/factura desde una imagen.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            merchant: { type: ["string", "null"] },
            date: {
              type: ["string", "null"],
              description: "Fecha idealmente YYYY-MM-DD",
            },
            currency: { type: ["string", "null"] },
            total: { type: ["number", "string", "null"] },
            tax: { type: ["number", "string", "null"] },
            items: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  description: { type: "string" },
                  quantity: { type: ["number", "string", "null"] },
                  unit_price: { type: ["number", "string", "null"] },
                  total: { type: ["number", "string", "null"] },
                },
                required: ["description"],
              },
            },
            confidence: { type: ["number", "string", "null"] },
          },
        },
      },
    },
  ];

  async function tryCall(body: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> {
    return (await client.chat.completions.create(body)) as unknown as ChatCompletion;
  }

  function inspectResponse(resp: ChatCompletion): Omit<AiAttemptDebug, "attempt"> {
    const choice = resp.choices?.[0];
    const msg = choice?.message;
    const tool = msg?.tool_calls?.[0]?.function;
    const toolArgs = tool?.arguments ?? null;
    const content = msg?.content ?? null;

    const parsedTool = toolArgs ? safeJsonParse(toolArgs) : null;
    const toolJsonOk = Boolean(parsedTool);
    const toolZodOk = toolJsonOk ? ExtractedSchema.safeParse(parsedTool).success : false;

    const parsedContent = content ? safeJsonParse(content) : null;
    const contentJsonOk = Boolean(parsedContent);
    const contentZodOk = contentJsonOk ? ExtractedSchema.safeParse(parsedContent).success : false;

    return {
      model: resp.model ?? params.model,
      responseId: (resp as unknown as { id?: string }).id,
      finishReason: (choice as unknown as { finish_reason?: string | null })?.finish_reason ?? null,
      toolCalls: msg?.tool_calls?.length ?? 0,
      toolName: tool?.name ?? null,
      toolArgsPreview: previewText(toolArgs, 2000),
      contentPreview: previewText(content, 2000),
      usage: (resp as unknown as { usage?: unknown })?.usage,
      parse: {
        toolArgsJson: toolJsonOk,
        toolArgsZod: toolZodOk,
        contentJson: contentJsonOk,
        contentZod: contentZodOk,
      },
    };
  }

  function parseFromResponse(resp: ChatCompletion): { extracted: Extracted } | null {
    const first = resp.choices?.[0]?.message;
    const toolArgs = first?.tool_calls?.[0]?.function?.arguments;

    if (toolArgs) {
      const parsedTool = safeJsonParse(toolArgs);
      const validatedTool = ExtractedSchema.safeParse(parsedTool);
      if (validatedTool.success) return { extracted: validatedTool.data };
    }

    const text = first?.content ?? "";
    const parsed = safeJsonParse(text);
    const validated = ExtractedSchema.safeParse(parsed);
    if (validated.success) return { extracted: validated.data };

    return null;
  }

  // 1) Try tool-calling (preferred)
  const attempts: AiAttemptDebug[] = [];
  let lastError: string | null = null;
  let lastText = "";
  let lastToolArgs: string | null = null;
  try {
    const respTools = await tryCall({
      ...baseRequest,
      tools,
      tool_choice: { type: "function", function: { name: "extract_receipt" } },
    });

    const first = respTools.choices?.[0]?.message;
    lastText = first?.content ?? "";
    lastToolArgs = first?.tool_calls?.[0]?.function?.arguments ?? null;

    attempts.push({ attempt: "tools", ...inspectResponse(respTools) });
    const parsed = parseFromResponse(respTools);
    if (parsed) return { extracted: parsed.extracted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    lastError = msg;
    if (/image|vision|multimodal|does not support/i.test(msg)) {
      throw new AiExtractionError(
        `El modelo configurado (${params.model}) no soporta imágenes. Usa gpt-4o-mini o gpt-4o.${summarizeAttempts(attempts, lastError)}`,
        { attempts, lastError }
      );
    }
  }

  // 2) Retry forcing JSON message content
  try {
    const jsonSchemaFormat = {
      type: "json_schema",
      json_schema: {
        name: "extract_receipt",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            merchant: { type: ["string", "null"] },
            date: { type: ["string", "null"] },
            currency: { type: ["string", "null"] },
            total: { type: ["number", "string", "null"] },
            tax: { type: ["number", "string", "null"] },
            items: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  description: { type: "string" },
                  quantity: { type: ["number", "string", "null"] },
                  unit_price: { type: ["number", "string", "null"] },
                  total: { type: ["number", "string", "null"] },
                },
                // OpenAI strict JSON Schema requires required[] to include every key in properties.
                required: ["description", "quantity", "unit_price", "total"],
              },
            },
            confidence: { type: ["number", "string", "null"] },
          },
          // OpenAI strict JSON Schema requires required[] to include every key in properties.
          required: ["merchant", "date", "currency", "total", "tax", "items", "confidence"],
        },
      },
    };

    const respSchema = await tryCall({
      ...baseRequest,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response_format: jsonSchemaFormat as any,
    });
    const firstSchema = respSchema.choices?.[0]?.message;
    lastText = firstSchema?.content ?? lastText;
    lastToolArgs = firstSchema?.tool_calls?.[0]?.function?.arguments ?? lastToolArgs;
    attempts.push({ attempt: "json_schema", ...inspectResponse(respSchema) });
    const parsedSchema = parseFromResponse(respSchema);
    if (parsedSchema) return { extracted: parsedSchema.extracted };
  } catch (e) {
    lastError = e instanceof Error ? e.message : lastError;
  }

  try {
    const respJson = await tryCall({
      ...baseRequest,
      response_format: { type: "json_object" },
    });
    const first = respJson.choices?.[0]?.message;
    lastText = first?.content ?? lastText;
    lastToolArgs = first?.tool_calls?.[0]?.function?.arguments ?? lastToolArgs;
    attempts.push({ attempt: "json_object", ...inspectResponse(respJson) });
    const parsed = parseFromResponse(respJson);
    if (parsed) return { extracted: parsed.extracted };
  } catch (e) {
    lastError = e instanceof Error ? e.message : lastError;
  }

  // 3) Last resort
  try {
    const respPlain = await tryCall(baseRequest);
    const first = respPlain.choices?.[0]?.message;
    lastText = first?.content ?? lastText;
    lastToolArgs = first?.tool_calls?.[0]?.function?.arguments ?? lastToolArgs;
    attempts.push({ attempt: "plain", ...inspectResponse(respPlain) });
    const parsed = parseFromResponse(respPlain);
    if (parsed) return { extracted: parsed.extracted };
  } catch (e) {
    lastError = e instanceof Error ? e.message : lastError;
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("AI receipt extraction failed", {
      model: params.model,
      lastToolArgs: lastToolArgs ? lastToolArgs.slice(0, 300) : null,
      lastText: lastText ? lastText.slice(0, 300) : null,
    });
  }

  throw new AiExtractionError(
    `La IA no devolvió JSON válido (model: ${params.model}). Si la foto está clara, revisa OPENAI_MODEL_RECEIPTS (recomendado: gpt-4o).${summarizeAttempts(attempts, lastError)}`,
    { attempts, lastError }
  );
}

export async function POST(request: NextRequest) {
  try {
    const debug = request.nextUrl.searchParams.get("debug") === "1";
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Not authenticated", 401);
    }

    const profile = await supabase
      .from("domus_users")
      .select("id,family_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile.error) {
      return jsonError(profile.error.message, 400);
    }

    if (!profile.data?.family_id) {
      return jsonError("Needs setup", 400);
    }

    const form = await request.formData();
    const file = form.get("file");
    const note = typeof form.get("note") === "string" ? String(form.get("note")) : "";

    if (!(file instanceof File)) {
      return jsonError("Selecciona un archivo", 400);
    }

    if (!file.type || !file.type.startsWith("image/")) {
      return jsonError("Por ahora solo imágenes (no PDF)", 400);
    }

    if (file.size <= 0) {
      return jsonError("Archivo vacío", 400);
    }

    if (file.size > MAX_BYTES) {
      return jsonError("Archivo demasiado grande (máx 10MB)", 400);
    }

    const receiptId = crypto.randomUUID();
    const safeName = sanitizeFilename(file.name);
    const filePath = `family/${profile.data.family_id}/${receiptId}/${safeName}`;

    const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) {
      return jsonError("Missing env: OPENAI_API_KEY", 500);
    }

    const model = (process.env.OPENAI_MODEL_RECEIPTS ?? "gpt-4o").trim();

    // 1) IA primero (obligatorio)
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const dataUrl = toDataUrl(file.type, bytes);

    // Flujo híbrido Vision + OCR + GPT
    let extracted: Extracted | null = null;
    let debugHybrid: any = {};
    try {
      const hybrid = await extractHybrid({ apiKey, model, dataUrl, debug });
      debugHybrid = hybrid.debugInfo;
      // Prioridad: gptCleaned > visionExtracted > fallback parseItemsFromText(ocrText)
      if (hybrid.gptCleaned && typeof hybrid.gptCleaned === "object") {
        extracted = hybrid.gptCleaned;
      } else if (hybrid.visionExtracted && typeof hybrid.visionExtracted === "object") {
        extracted = hybrid.visionExtracted;
      } else if (hybrid.ocrText) {
        extracted = { items: parseItemsFromText(hybrid.ocrText) } as Extracted;
      }
    } catch (e) {
      debugHybrid.hybridError = e instanceof Error ? e.message : String(e);
    }
    if (!extracted) {
      if (debug) console.error("[Hybrid Extract Debug]", debugHybrid);
      return NextResponse.json({ ok: false, error: "No se pudo extraer información del recibo", debug: debugHybrid }, { status: 400 });
    }
    if (debug) console.log("[Hybrid Extract Debug]", debugHybrid);

    // 2) subir archivo a Storage
    const uploadRes = await supabase.storage
      .from("domus-receipts")
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadRes.error) {
      return jsonError(`Error subiendo archivo: ${uploadRes.error.message}`, 400);
    }

    const normalizedDate = normalizeDate(extracted.date);

    // 3) insertar en BD con campos extraídos
    const insertRes = await supabase
      .from("domus_receipts")
      .insert({
        id: receiptId,
        family_id: profile.data.family_id,
        uploaded_by: user.id,
        receipt_date: normalizedDate ?? new Date().toISOString().slice(0, 10),
        amount: extracted.total ?? null,
        merchant: extracted.merchant ?? null,
        note: note.trim() || null,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        ai_status: "done",
        ai_error: null,
        ai_updated_at: new Date().toISOString(),
        ai_extracted: extracted,
        extracted_total: extracted.total ?? null,
        extracted_currency: extracted.currency ?? null,
        extracted_date: normalizedDate,
        extracted_merchant: extracted.merchant ?? null,
      })
      .select(
        "id,created_at,receipt_date,amount,merchant,note,file_path,file_name,mime_type,size_bytes,ai_status,ai_updated_at,extracted_total,extracted_currency,extracted_date,extracted_merchant"
      )
      .maybeSingle();

    if (insertRes.error) {
      // best-effort cleanup
      await supabase.storage.from("domus-receipts").remove([filePath]);
      return jsonError(`Error guardando en BD: ${insertRes.error.message}`, 400);
    }

    return NextResponse.json(insertRes.data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
