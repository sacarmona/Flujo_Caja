import { getCurrentUser } from "@/lib/auth";
import { accountMatchesMovementType } from "@/lib/movements";
import { prisma } from "@/lib/prisma";
import { canManageReconciliation, matchBankRow, movementTypeForBankType } from "@/lib/reconciliation";
import {
  cancelImportBatchAction,
  confirmReconciliationAction,
  createMovementFromBankRowAction,
  discardBankMovementAction,
  loadCandidates,
  reverseReconciliationAction,
  uploadBankStatementAction
} from "./actions";
import { optionLabel } from "../movimientos/shared";
import { ErrorBanner } from "@/components/error-banner";
import { SavedBanner } from "@/components/saved-banner";
import { formatCurrency } from "@/lib/format";

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function getReferenceData(companyId: string) {
  const [accounts, businessUnits, projects, costCenters] = await Promise.all([
    prisma.accountingAccount.findMany({
      where: { companyId, isActive: true, allowMovements: true, deletedAt: null, children: { none: {} } },
      orderBy: [{ code: "asc" }]
    }),
    prisma.businessUnit.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] }),
    prisma.project.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] }),
    prisma.costCenter.findMany({ where: { companyId, isActive: true, deletedAt: null }, orderBy: [{ name: "asc" }] })
  ]);
  return { accounts, businessUnits, projects, costCenters };
}

export default async function ConciliacionPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const canManage = canManageReconciliation(user.role);
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { companyId: user.companyId, isActive: true, deletedAt: null },
    orderBy: [{ name: "asc" }]
  });

  const latestBatch = await prisma.bankImportBatch.findFirst({
    where: { companyId: user.companyId },
    orderBy: { uploadedAt: "desc" },
    include: {
      bankAccount: true,
      bankMovements: {
        orderBy: { date: "desc" },
        include: {
          reconciliation: {
            include: {
              movement: { include: { payments: true } },
              confirmedBy: true,
              payment: true
            }
          }
        }
      }
    }
  });

  let candidates: Awaited<ReturnType<typeof loadCandidates>> = [];
  if (latestBatch && latestBatch.bankMovements.length > 0) {
    const dates = latestBatch.bankMovements.map((row) => row.date.getTime());
    candidates = await loadCandidates(user.companyId, latestBatch.bankAccountId, new Date(Math.min(...dates)), new Date(Math.max(...dates)));
  }

  const referenceData = canManage ? await getReferenceData(user.companyId) : null;

  const pendingRows = (latestBatch?.bankMovements ?? []).filter((row) => !row.reconciliation?.confirmed && !row.reconciliation?.reversed);
  const resolvedRows = (latestBatch?.bankMovements ?? []).filter((row) => row.reconciliation?.confirmed || row.reconciliation?.reversed);

  return (
    <section className="max-w-5xl space-y-8">
      <SavedBanner />
      <ErrorBanner />
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-normal text-adentu-ink">Conciliacion bancaria</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Sube la cartola de la cuenta corriente (copiada/pegada o descargada directo del banco, ambos formatos se reconocen automaticamente) para
          revisar los movimientos de la semana, confirmar los que ya estan registrados como Pagado/Cobrado y crear los que falten.
        </p>
      </div>

      {!canManage ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Tu rol {user.role} solo permite revisar conciliaciones ya realizadas. Solo ADMIN y FINANCE pueden subir cartolas y confirmar.
        </p>
      ) : (
        <form action={uploadBankStatementAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Cuenta bancaria</span>
            <select className="rounded-md border border-slate-300 px-2 py-2 text-sm" defaultValue={bankAccounts[0]?.id} name="bankAccountId" required>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Cartola (XLSX, copiada o descargada del banco)</span>
            <input accept=".xlsx" className="rounded-md border border-slate-300 px-2 py-2 text-sm" name="file" required type="file" />
          </label>
          <button className="rounded-md bg-adentu-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-adentu-teal" type="submit">
            Importar cartola
          </button>
        </form>
      )}

      {!latestBatch ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Aun no se ha importado ninguna cartola.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Ultima cartola importada: <strong>{latestBatch.fileName}</strong> ({latestBatch.bankAccount.name}), {formatDate(latestBatch.uploadedAt)}.
              Pendientes por revisar: {pendingRows.length}. Ya conciliadas: {resolvedRows.length}.
            </p>
            {canManage && pendingRows.length > 0 ? (
              <form action={cancelImportBatchAction}>
                <input name="batchId" type="hidden" value={latestBatch.id} />
                <button className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50" type="submit">
                  Cancelar importacion completa ({pendingRows.length} fila{pendingRows.length === 1 ? "" : "s"} pendiente{pendingRows.length === 1 ? "" : "s"})
                </button>
              </form>
            ) : null}
          </div>

          <div className="space-y-4">
            {pendingRows.map((row) => {
              const live = matchBankRow(row, candidates);
              const expectedType = movementTypeForBankType(row.type);
              const matchingAccounts = referenceData?.accounts.filter((account) => accountMatchesMovementType(account.type, expectedType)) ?? [];

              return (
                <div className="rounded-lg border border-slate-200 bg-white p-4" key={row.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-adentu-ink">{row.description || "(sin descripcion)"}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(row.date)} · {row.type === "CARGO" ? "Cargo (egreso)" : "Abono (ingreso)"} · {row.reference ? `Doc. ${row.reference}` : "Sin N° documento"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`text-sm font-semibold ${row.type === "CARGO" ? "text-red-700" : "text-emerald-700"}`}>
                        {formatCurrency(Number(row.amount))}
                      </p>
                      {canManage ? (
                        <form action={discardBankMovementAction}>
                          <input name="reconciliationId" type="hidden" value={row.reconciliation?.id} />
                          <button className="text-xs font-semibold text-slate-500 underline hover:text-red-700" type="submit">
                            Descartar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  {live.matchLevel === "HIGH" && live.movementId ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-emerald-50 p-3 text-sm">
                      <p className="text-emerald-800">
                        Coincide con: <strong>{live.candidates[0]?.description}</strong> ({formatDate(live.candidates[0]?.projectedDate ?? row.date)})
                      </p>
                      {canManage ? (
                        <form action={confirmReconciliationAction}>
                          <input name="reconciliationId" type="hidden" value={row.reconciliation?.id} />
                          <input name="movementId" type="hidden" value={live.movementId} />
                          <button className="rounded-md bg-adentu-teal px-3 py-1.5 text-xs font-semibold text-white" type="submit">
                            Confirmar Pagado/Cobrado
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}

                  {live.matchLevel === "POSSIBLE" ? (
                    <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="mb-2">Hay {live.candidates.length} movimiento(s) con el mismo monto pendiente, pero la fecha no coincide exacto. Elige cual corresponde:</p>
                      {canManage ? (
                        <form action={confirmReconciliationAction} className="flex flex-wrap items-end gap-2">
                          <input name="reconciliationId" type="hidden" value={row.reconciliation?.id} />
                          <select className="rounded-md border border-amber-300 px-2 py-1.5 text-sm" defaultValue={live.movementId ?? ""} name="movementId" required>
                            <option disabled value="">
                              Selecciona un movimiento
                            </option>
                            {live.candidates.map((candidate) => (
                              <option key={candidate.movementId} value={candidate.movementId}>
                                {candidate.description} · {formatDate(candidate.projectedDate)}
                              </option>
                            ))}
                          </select>
                          <button className="rounded-md bg-adentu-teal px-3 py-1.5 text-xs font-semibold text-white" type="submit">
                            Conciliar con este movimiento
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}

                  {live.matchLevel === "NONE" ? (
                    <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="mb-2">No existe ningun movimiento pendiente con ese monto. Crealo y quedara directamente Pagado/Cobrado.</p>
                      {canManage && referenceData ? (
                        <form action={createMovementFromBankRowAction} className="grid gap-2 sm:grid-cols-2">
                          <input name="reconciliationId" type="hidden" value={row.reconciliation?.id} />
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Cuenta contable</span>
                            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" name="accountingAccountId" required>
                              {matchingAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {optionLabel(account.code, account.name)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Unidad de negocio</span>
                            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" name="businessUnitId" required>
                              {referenceData.businessUnits.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Proyecto (opcional)</span>
                            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" defaultValue="" name="projectId">
                              <option value="">Sin proyecto</option>
                              {referenceData.projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="mb-1 block text-slate-600">Centro de costo (opcional)</span>
                            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" defaultValue="" name="costCenterId">
                              <option value="">Sin centro de costo</option>
                              {referenceData.costCenters.map((costCenter) => (
                                <option key={costCenter.id} value={costCenter.id}>
                                  {optionLabel(costCenter.code, costCenter.name)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="sm:col-span-2">
                            <button className="rounded-md bg-adentu-blue px-3 py-1.5 text-xs font-semibold text-white" type="submit">
                              Crear y marcar Pagado/Cobrado
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {pendingRows.length === 0 ? <p className="text-sm text-slate-500">No quedan filas pendientes por revisar en esta cartola.</p> : null}
          </div>

          {resolvedRows.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-semibold text-adentu-ink">
                <span className="inline-flex items-center gap-2">
                  <span className="text-adentu-blue transition-transform group-open:rotate-90">▶</span>
                  Ver {resolvedRows.length} fila(s) ya conciliadas o revertidas
                </span>
              </summary>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-adentu-mist">
                      <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Descripcion</th>
                      <th className="px-3 py-2 text-right font-semibold text-adentu-ink">Monto</th>
                      <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Estado</th>
                      <th className="px-3 py-2 text-left font-semibold text-adentu-ink">Movimiento conciliado</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedRows.map((row) => (
                      <tr className="border-t border-slate-200" key={row.id}>
                        <td className="px-3 py-2 text-slate-600">{formatDate(row.date)}</td>
                        <td className="px-3 py-2 text-slate-600">{row.description}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(Number(row.amount))}</td>
                        <td className="px-3 py-2">
                          {row.reconciliation?.reversed ? (
                            <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Revertida</span>
                          ) : (
                            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Conciliada</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.reconciliation?.movement?.description ?? "-"}</td>
                        <td className="px-3 py-2">
                          {canManage && row.reconciliation?.confirmed && !row.reconciliation?.reversed ? (
                            <form action={reverseReconciliationAction}>
                              <input name="reconciliationId" type="hidden" value={row.reconciliation.id} />
                              <button className="text-xs font-semibold text-red-700 underline" type="submit">
                                Revertir
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
