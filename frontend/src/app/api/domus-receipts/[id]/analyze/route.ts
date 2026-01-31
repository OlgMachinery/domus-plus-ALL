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

function pickImageMime(mime: string | null): string | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return mime;
  return null;
}

function toDataUrl(mime: string, bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${mime};base64,${base64}`;
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
    try {
      return JSON.parse(candidate);
    } catch {
      const repaired = candidate
        .replace(/,\s*([}\]])/g, "$1")
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const debug = request.nextUrl.searchParams.get("debug") === "1";
    const { id } = await context.params;
    if (!id) return jsonError("Missing id", 400);

    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonError("Not authenticated", 401);
    }

    const receiptRes = await supabase
      .from("domus_receipts")
      .select(
        "id,family_id,uploaded_by,file_path,file_name,mime_type,ai_status,ai_error"
      )
      .eq("id", id)
      .maybeSingle();

    if (receiptRes.error) {
      return jsonError(receiptRes.error.message, 400);
    }

    if (!receiptRes.data) {
      return jsonError("Receipt not found", 404);
    }

    // Descarga el archivo desde Storage (respeta policies)
    const mime = pickImageMime(receiptRes.data.mime_type ?? null);
    if (!mime) {
      return jsonError(
        "Por ahora la IA soporta solo imágenes (no PDF).",
        400
      );
    }

    const download = await supabase.storage
      .from("domus-receipts")
      .download(receiptRes.data.file_path);

    if (download.error) {
      return jsonError(download.error.message, 400);
    }

    const ab = await download.data.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const dataUrl = toDataUrl(mime, bytes);

    const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) {
      return jsonError("Missing env: OPENAI_API_KEY", 500);
    }

    const model = (process.env.OPENAI_MODEL_RECEIPTS ?? "gpt-4o").trim();
    const client = new OpenAI({ apiKey });

    const system =
      "Eres un extractor de recibos. Responde únicamente con un objeto JSON válido. " +
      "No uses markdown, no agregues texto extra. Si falta un dato, usa null.";

    const userPrompt =
      "Extrae: merchant, date (YYYY-MM-DD), currency (ej: MXN), total, tax, items (opcional), confidence (0..1).";

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
        ],
      },
    ];

    const baseRequest: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      temperature: 0,
      stream: false,
    };

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
        model: resp.model ?? model,
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

    function parseFromResponse(resp: ChatCompletion)
      : { extracted: z.infer<typeof ExtractedSchema>; raw: { text: string; tool: string | null } } | null {
      const first = resp.choices?.[0]?.message;
      const toolArgs = first?.tool_calls?.[0]?.function?.arguments ?? null;
      const text = first?.content ?? "";

      if (toolArgs) {
        const parsedTool = safeJsonParse(toolArgs);
        const validatedTool = ExtractedSchema.safeParse(parsedTool);
        if (validatedTool.success) {
          return { extracted: validatedTool.data, raw: { text, tool: toolArgs } };
        }
      }

      const parsed = safeJsonParse(text);
      const validated = ExtractedSchema.safeParse(parsed);
      if (validated.success) {
        return { extracted: validated.data, raw: { text, tool: toolArgs } };
      }

      return null;
    }

    let extracted: z.infer<typeof ExtractedSchema> | null = null;
    let rawText = "";
    let rawTool: string | null = null;
    let lastText = "";
    let lastToolArgs: string | null = null;
    let lastAiError: string | null = null;
    const attempts: AiAttemptDebug[] = [];

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
      if (parsed) {
        extracted = parsed.extracted;
        rawText = parsed.raw.text;
        rawTool = parsed.raw.tool;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI error";
      lastAiError = msg;
      if (/image|vision|multimodal|does not support/i.test(msg)) {
        const friendly = `El modelo configurado (${model}) no soporta imágenes. Usa gpt-4o.`;
        await supabase
          .from("domus_receipts")
          .update({
            ai_status: "error",
            ai_error: friendly,
            ai_updated_at: new Date().toISOString(),
            ai_extracted: { raw: lastText, tool: lastToolArgs ?? null },
          })
          .eq("id", id);
        return jsonError(friendly, 400);
      }
    }

    if (!extracted) {
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
                    required: ["description", "quantity", "unit_price", "total"],
                  },
                },
                confidence: { type: ["number", "string", "null"] },
              },
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
        if (parsedSchema) {
          extracted = parsedSchema.extracted;
          rawText = parsedSchema.raw.text;
          rawTool = parsedSchema.raw.tool;
        }
      } catch (e) {
        lastAiError = e instanceof Error ? e.message : lastAiError;
      }
    }

    if (!extracted) {
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
        if (parsed) {
          extracted = parsed.extracted;
          rawText = parsed.raw.text;
          rawTool = parsed.raw.tool;
        }
      } catch (e) {
        lastAiError = e instanceof Error ? e.message : lastAiError;
      }
    }

    if (!extracted) {
      try {
        const respPlain = await tryCall(baseRequest);
        const first = respPlain.choices?.[0]?.message;
        lastText = first?.content ?? lastText;
        lastToolArgs = first?.tool_calls?.[0]?.function?.arguments ?? lastToolArgs;
        attempts.push({ attempt: "plain", ...inspectResponse(respPlain) });
        const parsed = parseFromResponse(respPlain);
        if (parsed) {
          extracted = parsed.extracted;
          rawText = parsed.raw.text;
          rawTool = parsed.raw.tool;
        }
      } catch (e) {
        lastAiError = e instanceof Error ? e.message : lastAiError;
      }
    }

    const validated = extracted ? ({ success: true as const, data: extracted } as const) : ({ success: false as const } as const);
    const text = rawText;
    const toolArgs = rawTool;

    if (!validated.success) {
      const last = attempts.length ? attempts[attempts.length - 1] : null;
      const extra = last
        ? ` Último intento=${last.attempt}, finish=${last.finishReason ?? "?"}, toolCalls=${last.toolCalls ?? 0}.`
        : "";
      const extraErr = lastAiError ? ` ErrorOpenAI=${lastAiError}.` : "";

      const msg =
        `La IA no devolvió JSON válido (model: ${model}). Si la imagen está clara, revisa OPENAI_MODEL_RECEIPTS (recomendado: gpt-4o).${extra}${extraErr}`;
      await supabase
        .from("domus_receipts")
        .update({
          ai_status: "error",
          ai_error: msg,
          ai_updated_at: new Date().toISOString(),
          ai_extracted: {
            raw: text || lastText,
            tool: toolArgs ?? lastToolArgs ?? null,
            ai_error: lastAiError,
            model,
            attempts,
          },
        })
        .eq("id", id);

      // Always return debug payload (requested) so it's visible in the normal flow.
      return NextResponse.json(
        {
          detail: msg,
          debug: {
            model,
            lastAiError,
            attempts,
          },
        },
        { status: 400 }
      );
    }

    const extractedData = validated.data;

    // Best-effort: parse date
    const dateValue = normalizeDate(extractedData.date);

    const updateRes = await supabase
      .from("domus_receipts")
      .update({
        ai_status: "done",
        ai_error: null,
        ai_updated_at: new Date().toISOString(),
        ai_extracted: extractedData,
        extracted_total: extractedData.total ?? null,
        extracted_currency: extractedData.currency ?? null,
        extracted_date: dateValue,
        extracted_merchant: extractedData.merchant ?? null,
      })
      .eq("id", id)
      .select(
        "id,ai_status,ai_updated_at,extracted_total,extracted_currency,extracted_date,extracted_merchant,ai_extracted"
      )
      .maybeSingle();

    if (updateRes.error) {
      return jsonError(updateRes.error.message, 400);
    }

    return NextResponse.json(updateRes.data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
