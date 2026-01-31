"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type AccountsMe = {
  needs_setup?: boolean;
  family_id?: string;
  is_admin?: boolean;
  personal_account_id?: string;
  personal_balance?: number;
  family_account_id?: string | null;
  family_balance?: number;
};

type LedgerItem = {
  id: string;
  created_at: string;
  movement_type: "deposit" | "withdrawal" | "transfer_in" | "transfer_out";
  amount: number;
  balance_after: number;
  concept: string;
  status: string;
  reference_type?: string | null;
  reference_id?: string | null;
  evidence_url?: string | null;
};

type RecentReceipt = {
  id: string;
  file_name: string;
  file_path: string;
  receipt_date: string;
  amount: number | null;
};

type LedgerResponse = {
  account_id: string;
  balance: number;
  items: LedgerItem[];
};

type TransferResponse = {
  id?: string;
  transfer_id?: string;
  status?: string;
};

type LiabilityResponse = {
  id?: string;
  liability_id?: string;
  status?: string;
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

async function copyToClipboard(text: string) {
  const value = text.trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

function detailFromJson(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("detail" in body)) return null;
  const value = (body as { detail?: unknown }).detail;
  return typeof value === "string" && value.trim() ? value : null;
}

function parseRecentReceipts(body: unknown): RecentReceipt[] {
  if (!body || typeof body !== "object") return [];
  if (!("items" in body)) return [];
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const parsed: RecentReceipt[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : null;
    const fileName = typeof obj.file_name === "string" ? obj.file_name : null;
    const filePath = typeof obj.file_path === "string" ? obj.file_path : null;
    if (!id || !fileName || !filePath) continue;
    const receiptDate = typeof obj.receipt_date === "string" ? obj.receipt_date : "";
    const amount = typeof obj.amount === "number" && Number.isFinite(obj.amount) ? obj.amount : null;
    parsed.push({ id, file_name: fileName, file_path: filePath, receipt_date: receiptDate, amount });
  }

  return parsed;
}

export default function BankPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const [accounts, setAccounts] = useState<AccountsMe | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>("");

  const [transferFromId, setTransferFromId] = useState<string | null>(null);
  const [transferToId, setTransferToId] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState<number>(50);
  const [transferConcept, setTransferConcept] = useState<string>("Transferencia de prueba");
  const [lastTransferId, setLastTransferId] = useState<string>("");

  const [liabilityDebtorId, setLiabilityDebtorId] = useState<string | null>(null);
  const [liabilityCreditorId, setLiabilityCreditorId] = useState<string | null>(null);
  const [liabilityAmount, setLiabilityAmount] = useState<number>(10);
  const [liabilityConcept, setLiabilityConcept] = useState<string>("Pasivo de prueba");
  const [lastLiabilityId, setLastLiabilityId] = useState<string>("");

  const canUseFamily = useMemo(() => {
    return !!accounts?.is_admin && !!accounts?.family_account_id;
  }, [accounts]);

  async function loadAccounts() {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/domus-bank/accounts/me", { cache: "no-store" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }

    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      setError(detailFromJson(body) || "No se pudo cargar cuentas");
      return;
    }

    const accountsBody = body as AccountsMe;
    if (accountsBody?.needs_setup) {
      router.push("/setup");
      return;
    }

    setAccounts(accountsBody);

    const defaultAccountId = accountsBody?.is_admin
      ? accountsBody?.family_account_id || accountsBody?.personal_account_id
      : accountsBody?.personal_account_id;

    setSelectedAccountId(defaultAccountId || null);

    // Defaults for transfer/liabilities (keep it simple for testing)
    const personalId = accountsBody?.personal_account_id || null;
    const familyId = accountsBody?.family_account_id || null;

    setTransferFromId(
      (prev) => prev ?? (accountsBody?.is_admin ? familyId || personalId : personalId)
    );
    setTransferToId((prev) => prev ?? (accountsBody?.is_admin ? personalId : null));
    setLiabilityDebtorId((prev) => prev ?? personalId);
    setLiabilityCreditorId((prev) => prev ?? (accountsBody?.is_admin ? familyId : null));
  }

  async function loadLedger(accountId: string) {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/domus-bank/ledger?account_id=${encodeURIComponent(accountId)}`, {
      cache: "no-store",
    });
    if (res.status === 401) {
      router.push("/login");
      return;
    }

    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      setError(detailFromJson(body) || "No se pudo cargar ledger");
      return;
    }
    setLedger(body as LedgerResponse);
  }

  useEffect(() => {
    loadAccounts();
    (async () => {
      const res = await fetch("/api/domus-receipts/recent?limit=25", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setRecentReceipts([]);
        return;
      }
      const body = (await res.json().catch(() => null)) as unknown;
      setRecentReceipts(parseRecentReceipts(body));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadLedger(selectedAccountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  async function postMovement(kind: "deposit" | "withdrawal", amount: number) {
    if (!selectedAccountId) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/domus-bank/movements/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          amount,
          concept: kind === "deposit" ? "Depósito de prueba" : "Egreso de prueba",
          receipt_id: selectedReceiptId || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError(detailFromJson(body) || "No se pudo registrar movimiento");
        return;
      }

      setInfo("✅ Movimiento registrado.");
      await loadAccounts();
      await loadLedger(selectedAccountId);
    } finally {
      setLoading(false);
    }
  }

  async function openEvidence(evidencePathOrUrl: string) {
    const value = evidencePathOrUrl.trim();
    if (!value) return;
    if (/^https?:\/\//i.test(value)) {
      window.open(value, "_blank", "noopener,noreferrer");
      return;
    }

    const { data, error: signError } = await supabase.storage
      .from("domus-receipts")
      .createSignedUrl(value, 60);

    if (signError || !data?.signedUrl) {
      setError(`❌ No se pudo abrir evidencia: ${signError?.message ?? "unknown error"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function createTransfer() {
    if (!transferFromId || !transferToId) {
      setError("❌ Selecciona cuentas origen y destino");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/domus-bank/movements/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from_account_id: transferFromId,
          to_account_id: transferToId,
          amount: transferAmount,
          concept: transferConcept,
        }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError(detailFromJson(body) || "No se pudo crear transferencia");
        return;
      }

      const transferId = (body as TransferResponse)?.transfer_id || (body as TransferResponse)?.id;
      if (transferId) setLastTransferId(String(transferId));

      if (transferId) {
        setInfo(`👉 Transferencia creada (${String(transferId)}). Falta ACK para aplicar.`);
      } else {
        setInfo("👉 Transferencia creada. Falta ACK para aplicar.");
      }

      await loadAccounts();
      if (selectedAccountId) await loadLedger(selectedAccountId);
    } finally {
      setLoading(false);
    }
  }

  async function ackTransfer(id: string) {
    const transferId = id.trim();
    if (!transferId) {
      setError("❌ Pega el ID de la transferencia");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/domus-bank/transfers/${encodeURIComponent(transferId)}/ack`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = body?.detail || "No se pudo confirmar (ACK)";
        const d = String(detail).toLowerCase();
        if (d.includes("transfer") && d.includes("not found")) {
          setError("❌ transfer not found — pega el transfer_id devuelto por ‘Crear transferencia’.");
        } else {
          setError(`❌ ${detail}`);
        }
        return;
      }

      setInfo("✅ ACK registrado. La transferencia debe reflejarse ahora.");
      await loadAccounts();
      if (selectedAccountId) await loadLedger(selectedAccountId);
    } finally {
      setLoading(false);
    }
  }

  async function createLiability() {
    if (!liabilityDebtorId || !liabilityCreditorId) {
      setError("❌ Selecciona deudor y acreedor");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/domus-bank/liabilities/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          debtor_account_id: liabilityDebtorId,
          creditor_account_id: liabilityCreditorId,
          amount: liabilityAmount,
          concept: liabilityConcept,
        }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError(detailFromJson(body) || "No se pudo crear pasivo");
        return;
      }

      const liabilityId = (body as LiabilityResponse)?.liability_id || (body as LiabilityResponse)?.id;
      if (liabilityId) setLastLiabilityId(String(liabilityId));

      if (liabilityId) {
        setInfo(`✅ Pasivo creado (${String(liabilityId)}).`);
      } else {
        setInfo("✅ Pasivo creado.");
      }

      await loadAccounts();
      if (selectedAccountId) await loadLedger(selectedAccountId);
    } finally {
      setLoading(false);
    }
  }

  async function settleLiability(id: string) {
    const liabilityId = id.trim();
    if (!liabilityId) {
      setError("❌ Pega el ID del pasivo");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/domus-bank/liabilities/${encodeURIComponent(liabilityId)}/settle`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = body?.detail || "No se pudo liquidar pasivo";
        const d = String(detail).toLowerCase();
        if (d.includes("liability") && d.includes("not found")) {
          setError("❌ liability not found — pega el liability_id devuelto por ‘Crear pasivo’.");
        } else {
          setError(`❌ ${detail}`);
        }
        return;
      }

      setInfo("✅ Pasivo liquidado.");
      await loadAccounts();
      if (selectedAccountId) await loadLedger(selectedAccountId);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="title">Banco Domus</h1>

      {error ? <div className="callout callout-danger">{error}</div> : null}
      {info ? <div className="callout callout-info">{info}</div> : null}

      <section className="card">
        <div className="text-sm font-medium">Saldos</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="card-compact">
            <div className="text-sm">Personal</div>
            <div className="text-lg font-semibold">
              {accounts?.personal_balance ?? "-"}
            </div>
          </div>
          <div className="card-compact">
            <div className="text-sm">Familiar</div>
            <div className="text-lg font-semibold">
              {accounts?.is_admin ? (accounts?.family_balance ?? "-") : "(solo admin)"}
            </div>
          </div>
        </div>
      </section>

      {accounts ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              type="button"
              onClick={() => setSelectedAccountId(accounts.personal_account_id || null)}
              disabled={!accounts.personal_account_id}
            >
              Ver Personal
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setSelectedAccountId(accounts.family_account_id || null)}
              disabled={!canUseFamily}
            >
              Ver Familiar
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => postMovement("deposit", 100)}
              disabled={loading || !selectedAccountId}
            >
              Depósito de prueba +100
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => postMovement("withdrawal", 20)}
              disabled={loading || !selectedAccountId}
            >
              Egreso de prueba -20
            </button>
          </div>

          <div className="mt-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Adjuntar recibo (opcional)</span>
              <select
                className="select"
                value={selectedReceiptId}
                onChange={(e) => setSelectedReceiptId(e.target.value)}
                disabled={loading}
              >
                <option value="">(ninguno)</option>
                {recentReceipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.receipt_date ? `${r.receipt_date} — ` : ""}
                    {r.file_name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-400">
                Si no aparece, súbelo primero en /receipts.
              </span>
            </label>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="text-sm font-medium">Transferencias (pruebas)</div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Cuenta origen</span>
            <select
              className="select"
              value={transferFromId || ""}
              onChange={(e) => setTransferFromId(e.target.value || null)}
            >
              <option value="">(elige)</option>
              {accounts?.personal_account_id ? (
                <option value={accounts.personal_account_id}>Personal</option>
              ) : null}
              {accounts?.family_account_id ? (
                <option value={accounts.family_account_id}>Familiar</option>
              ) : null}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Cuenta destino</span>
            <select
              className="select"
              value={transferToId || ""}
              onChange={(e) => setTransferToId(e.target.value || null)}
            >
              <option value="">(elige)</option>
              {accounts?.personal_account_id ? (
                <option value={accounts.personal_account_id}>Personal</option>
              ) : null}
              {accounts?.family_account_id ? (
                <option value={accounts.family_account_id}>Familiar</option>
              ) : null}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Monto</span>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={transferAmount}
              onChange={(e) => setTransferAmount(Number(e.target.value) || 0)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Concepto</span>
            <input
              className="input"
              value={transferConcept}
              onChange={(e) => setTransferConcept(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            onClick={createTransfer}
            disabled={loading || !transferFromId || !transferToId}
          >
            Crear transferencia
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm">Transfer ID para ACK</span>
            <input
              className="input"
              placeholder="pega el UUID"
              value={lastTransferId}
              onChange={(e) => setLastTransferId(e.target.value)}
            />
            <span className="text-xs text-neutral-400">
              Usa el <span className="font-semibold">transfer_id</span> devuelto por “Crear transferencia”.
            </span>
          </label>
          <button
            className="btn mt-6 h-10"
            type="button"
            onClick={async () => {
              const ok = await copyToClipboard(lastTransferId);
              if (ok) setInfo("✅ Transfer ID copiado.");
              else setError("❌ No se pudo copiar.");
            }}
            disabled={loading || !lastTransferId.trim()}
          >
            Copiar
          </button>
          <button
            className="btn btn-primary mt-6 h-10"
            type="button"
            onClick={() => ackTransfer(lastTransferId)}
            disabled={loading || !lastTransferId.trim()}
          >
            RECIBIDO (ACK)
          </button>
        </div>
      </section>

      <section className="card">
        <div className="text-sm font-medium">Pasivos (pruebas)</div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Deudor</span>
            <select
              className="select"
              value={liabilityDebtorId || ""}
              onChange={(e) => setLiabilityDebtorId(e.target.value || null)}
            >
              <option value="">(elige)</option>
              {accounts?.personal_account_id ? (
                <option value={accounts.personal_account_id}>Personal</option>
              ) : null}
              {accounts?.family_account_id ? (
                <option value={accounts.family_account_id}>Familiar</option>
              ) : null}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Acreedor</span>
            <select
              className="select"
              value={liabilityCreditorId || ""}
              onChange={(e) => setLiabilityCreditorId(e.target.value || null)}
            >
              <option value="">(elige)</option>
              {accounts?.personal_account_id ? (
                <option value={accounts.personal_account_id}>Personal</option>
              ) : null}
              {accounts?.family_account_id ? (
                <option value={accounts.family_account_id}>Familiar</option>
              ) : null}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Monto</span>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={liabilityAmount}
              onChange={(e) => setLiabilityAmount(Number(e.target.value) || 0)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Concepto</span>
            <input
              className="input"
              value={liabilityConcept}
              onChange={(e) => setLiabilityConcept(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            type="button"
            onClick={createLiability}
            disabled={loading || !liabilityDebtorId || !liabilityCreditorId}
          >
            Crear pasivo
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm">Liability ID para liquidar</span>
            <input
              className="input"
              placeholder="pega el UUID"
              value={lastLiabilityId}
              onChange={(e) => setLastLiabilityId(e.target.value)}
            />
            <span className="text-xs text-neutral-400">
              Usa el <span className="font-semibold">liability_id</span> devuelto por “Crear pasivo”.
            </span>
          </label>
          <button
            className="btn mt-6 h-10"
            type="button"
            onClick={async () => {
              const ok = await copyToClipboard(lastLiabilityId);
              if (ok) setInfo("✅ Liability ID copiado.");
              else setError("❌ No se pudo copiar.");
            }}
            disabled={loading || !lastLiabilityId.trim()}
          >
            Copiar
          </button>
          <button
            className="btn btn-primary mt-6 h-10"
            type="button"
            onClick={() => settleLiability(lastLiabilityId)}
            disabled={loading || !lastLiabilityId.trim()}
          >
            Liquidar (settle)
          </button>
        </div>
      </section>

      <section className="card">
        <div className="text-sm font-medium">Ledger</div>
        <div className="mt-2 text-sm">
          Balance actual: <span className="font-semibold">{ledger?.balance ?? "-"}</span>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-b p-2">Fecha</th>
                <th className="border-b p-2">Tipo</th>
                <th className="border-b p-2">Monto</th>
                <th className="border-b p-2">Concepto</th>
                <th className="border-b p-2">Balance</th>
                <th className="border-b p-2">Evidencia</th>
              </tr>
            </thead>
            <tbody>
              {(ledger?.items || []).map((it) => (
                <tr key={it.id}>
                  <td className="border-b p-2">{formatTimestamp(it.created_at)}</td>
                  <td className="border-b p-2">{it.movement_type}</td>
                  <td className="border-b p-2">{it.amount}</td>
                  <td className="border-b p-2">{it.concept}</td>
                  <td className="border-b p-2">{it.balance_after}</td>
                  <td className="border-b p-2">
                    {it.evidence_url ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => openEvidence(String(it.evidence_url))}
                      >
                        Ver
                      </button>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {ledger?.items?.length === 0 ? (
                <tr>
                  <td className="p-2" colSpan={6}>
                    (sin movimientos)
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
