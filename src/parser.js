import * as XLSX from 'xlsx'

// Column indices in "Форма 2" (0-based)
export const COL = {
  NUM: 0,           // №
  CLASS: 1,         // Класс страхования
  HOLDER: 2,        // Страхователь
  BENEFICIARY: 3,   // Выгодоприобретатель
  POLICY: 4,        // Номер договора (полиса)
  DATE_START: 5,    // Дата начала
  DATE_END: 6,      // Дата окончания
  EVENT_DATE: 7,    // Дата события
  NOTIFY_DATE: 8,   // Дата уведомления
  CLAIM_AMT: 9,     // Размер заявленного убытка
  EXPENSE: 10,      // Сумма расходов
  REINSURER: 12,    // Наименование перестраховщика
  RZNU: 13,         // РЗНУ
  REINSURER_SHARE: 15, // Доля перестраховщика в заявленном
  KUS: 18,          // N КУСа — unique identifier
  STATUS: 44,       // Статус
}

const DATA_START_ROW = 5 // Row 6 in Excel (0-indexed)

function toNum(v) {
  if (v == null) return 0
  const n = Number(v)
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/**
 * Parse an .xls or .xlsx file and extract records from "Форма 2" sheet
 */
export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })

        // Find "Форма 2" sheet
        const sheetName = wb.SheetNames.find(
          (n) => n.toLowerCase().includes('форма 2') || n.toLowerCase().includes('форма2')
        )
        if (!sheetName) {
          reject(`Лист «Форма 2» не найден.\nНайденные листы: ${wb.SheetNames.join(', ')}`)
          return
        }

        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

        const records = []
        for (let i = DATA_START_ROW; i < raw.length; i++) {
          const r = raw[i]
          if (!r || !r[COL.POLICY]) continue

          const kus = String(r[COL.KUS] || '').trim()
          const policy = String(r[COL.POLICY] || '').trim()
          const key = kus || `${policy}_row${i}`

          records.push({
            key,
            rowNum: r[COL.NUM],
            classIns: r[COL.CLASS],
            holder: r[COL.HOLDER],
            beneficiary: r[COL.BENEFICIARY],
            policy,
            dateStart: r[COL.DATE_START],
            dateEnd: r[COL.DATE_END],
            eventDate: r[COL.EVENT_DATE],
            claimAmt: toNum(r[COL.CLAIM_AMT]),
            reinsurer: r[COL.REINSURER],
            rznu: toNum(r[COL.RZNU]),
            reinsurerShare: toNum(r[COL.REINSURER_SHARE]),
            kus,
            status: r[COL.STATUS],
          })
        }

        resolve(records)
      } catch (err) {
        reject(`Ошибка чтения файла: ${err.message}`)
      }
    }
    reader.onerror = () => reject('Не удалось прочитать файл')
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Compare two sets of records
 */
export function compareRecords(prevRecords, currRecords) {
  const currMap = new Map(currRecords.map((r) => [r.key, r]))
  const prevMap = new Map(prevRecords.map((r) => [r.key, r]))

  // 1) Disappeared — in prev, not in curr
  const disappeared = prevRecords.filter((r) => !currMap.has(r.key))

  // 2) Appeared — in curr, not in prev
  const appeared = currRecords.filter((r) => !prevMap.has(r.key))

  // 3) Changed РЗНУ or Доля перестраховщика
  const changed = []
  for (const prev of prevRecords) {
    const curr = currMap.get(prev.key)
    if (!curr) continue
    const rznuDiff = Math.abs(prev.rznu - curr.rznu) > 0.01
    const shareDiff = Math.abs(prev.reinsurerShare - curr.reinsurerShare) > 0.01
    if (rznuDiff || shareDiff) {
      changed.push({
        key: prev.key,
        kus: prev.kus,
        policy: prev.policy,
        holder: prev.holder,
        prevRznu: prev.rznu,
        currRznu: curr.rznu,
        diffRznu: Math.round((curr.rznu - prev.rznu) * 100) / 100,
        prevShare: prev.reinsurerShare,
        currShare: curr.reinsurerShare,
        diffShare: Math.round((curr.reinsurerShare - prev.reinsurerShare) * 100) / 100,
      })
    }
  }

  return { disappeared, appeared, changed }
}

/**
 * Generate and download an XLSX report
 */
export function downloadReport(disappeared, changed, prevLabel, currLabel) {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Disappeared
  const disappData = [
    [`Исчезнувшие полисы: были в «${prevLabel}», отсутствуют в «${currLabel}»`],
    [],
    ['№ КУСа', 'Номер полиса', 'Страхователь', 'Выгодоприобретатель', 'РЗНУ', 'Доля перестраховщика'],
    ...disappeared.map((d) => [d.kus, d.policy, d.holder, d.beneficiary, d.rznu, d.reinsurerShare]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(disappData)
  ws1['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 42 }, { wch: 42 }, { wch: 18 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Исчезнувшие полисы')

  // Sheet 2: Changed
  const changeData = [
    [`Расхождения: «${prevLabel}» → «${currLabel}»`],
    [],
    [
      '№ КУСа', 'Номер полиса', 'Страхователь',
      `РЗНУ (${prevLabel})`, `РЗНУ (${currLabel})`, 'Δ РЗНУ',
      `Доля перестр. (${prevLabel})`, `Доля перестр. (${currLabel})`, 'Δ Доля',
    ],
    ...changed.map((c) => [
      c.kus, c.policy, c.holder,
      c.prevRznu, c.currRznu, c.diffRznu,
      c.prevShare, c.currShare, c.diffShare,
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(changeData)
  ws2['!cols'] = [
    { wch: 14 }, { wch: 18 }, { wch: 42 },
    { wch: 18 }, { wch: 18 }, { wch: 16 },
    { wch: 22 }, { wch: 22 }, { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Расхождения')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Отчёт_сравнения_${currLabel.replace(/\./g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
