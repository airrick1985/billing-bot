import { useState } from 'react'
import type { MergeChoices, MergePlan } from '../lib/exportExcel'

type Props = {
  plan: MergePlan
  onConfirm: (choices: MergeChoices) => void
  onCancel: () => void
}

export default function MergeDialog({ plan, onConfirm, onCancel }: Props) {
  const [duplicateAction, setDuplicateAction] = useState<MergeChoices['duplicateAction']>('skip')
  const [monthAction, setMonthAction] = useState<MergeChoices['monthAction']>('merge')

  const hasDuplicates = plan.duplicates.length > 0
  const needsMonthDecision = plan.monthSheetExists
  const nothingToDecide = !hasDuplicates && !needsMonthDecision

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">附加到既有 Excel</h3>
            <p className="mt-1 text-xs text-slate-500 break-all">目標檔:{plan.filename}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          即將寫入 <b>{plan.newRows.length}</b> 列到 <code className="mx-1 rounded bg-white px-1">總表</code>
          {plan.monthSheetName && (
            <>
              與 <code className="mx-1 rounded bg-white px-1">{plan.monthSheetName}</code>
            </>
          )}
          。
        </div>

        {needsMonthDecision && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold text-slate-800">
              ⚠ 月份 sheet 已存在
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              <code className="rounded bg-slate-100 px-1">{plan.monthSheetName}</code>
              {' '}原本已有 {plan.existingMonthRowCount} 列。要如何處理?
            </p>
            <div className="mt-2 space-y-2">
              <ChoiceRow
                name="month"
                value="merge"
                checked={monthAction === 'merge'}
                onChange={() => setMonthAction('merge')}
                label="合併(推薦)"
                desc="保留原有列,追加新列;重複發票號依下方規則處理"
              />
              <ChoiceRow
                name="month"
                value="overwrite"
                checked={monthAction === 'overwrite'}
                onChange={() => setMonthAction('overwrite')}
                label="覆蓋該 sheet"
                desc={`刪除原有 ${plan.existingMonthRowCount} 列,只保留這次辨識的 ${plan.newRows.length} 列`}
                danger
              />
            </div>
          </section>
        )}

        {hasDuplicates && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold text-slate-800">
              ⚠ 發票號碼在總表已存在({plan.duplicates.length} 筆)
            </h4>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              {plan.duplicates.map((d) => (
                <li key={d.invoiceNo} className="flex items-center justify-between gap-2">
                  <code className="rounded bg-white px-1 font-mono">{d.invoiceNo}</code>
                  <span className="truncate text-slate-500">
                    新:{d.newVendor} / 舊:{d.existingVendor}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-2">
              <ChoiceRow
                name="dup"
                value="skip"
                checked={duplicateAction === 'skip'}
                onChange={() => setDuplicateAction('skip')}
                label="全部跳過(推薦)"
                desc="保留檔案中原有的那列,這次重複的就不寫入"
              />
              <ChoiceRow
                name="dup"
                value="overwrite"
                checked={duplicateAction === 'overwrite'}
                onChange={() => setDuplicateAction('overwrite')}
                label="全部覆蓋"
                desc="以這次辨識的資料取代檔案中相同發票號的列"
                danger
              />
            </div>
          </section>
        )}

        {nothingToDecide && (
          <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
            ✓ 沒有衝突,可直接寫入。
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ duplicateAction, monthAction })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            確認並下載
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-snug text-slate-400">
          ⓘ 瀏覽器無法直接寫回你電腦上的原檔,下載後請手動取代。檔名會維持「{plan.filename}」。
        </p>
      </div>
    </div>
  )
}

function ChoiceRow({
  name,
  value,
  checked,
  onChange,
  label,
  desc,
  danger,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  label: string
  desc: string
  danger?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition ${
        checked
          ? danger
            ? 'border-rose-300 bg-rose-50'
            : 'border-indigo-300 bg-indigo-50'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />
      <div>
        <div className={`font-medium ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{label}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
    </label>
  )
}
