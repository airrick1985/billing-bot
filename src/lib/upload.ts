export type FileKind = 'invoice' | 'quote' | 'unknown'

export type VendorFile = {
  name: string
  relativePath: string
  size: number
  file: File
  kind: FileKind
}

export type VendorGroup = {
  folderName: string
  displayName: string
  index: number
  files: VendorFile[]
  hasInvoice: boolean
  hasQuote: boolean
}

export type BillingPeriod = {
  raw: string
  year?: number
  month?: number
}

export type ParsedUpload = {
  rootName: string
  period: BillingPeriod
  vendors: VendorGroup[]
  totalFiles: number
  skippedFiles: number
}

const ACCEPTED_EXT = /\.(jpe?g|png|webp|heic|heif|pdf)$/i

function classifyFile(filename: string): FileKind {
  const base = filename.replace(/\.[^.]+$/, '')
  if (/發票/.test(base)) return 'invoice'
  if (/報價單|請款單|估價單/.test(base)) return 'quote'
  return 'unknown'
}

export function parsePeriod(folderName: string): BillingPeriod {
  const m1 = folderName.match(/^(\d{4})年(\d{1,2})月$/)
  if (m1) return { raw: folderName, year: Number(m1[1]), month: Number(m1[2]) }

  const m2 = folderName.match(/^(\d{2,3})年(\d{1,2})月$/)
  if (m2) return { raw: folderName, year: Number(m2[1]) + 1911, month: Number(m2[2]) }

  const m3 = folderName.match(/^(\d{4})[-/](\d{1,2})$/)
  if (m3) return { raw: folderName, year: Number(m3[1]), month: Number(m3[2]) }

  return { raw: folderName }
}

function parseVendorName(folder: string): { displayName: string; index: number } {
  const m = folder.match(/^(.+?)-(\d+)$/)
  if (m) return { displayName: m[1], index: Number(m[2]) }
  return { displayName: folder, index: 1 }
}

export function parseFileList(files: File[]): ParsedUpload {
  const validFiles = files.filter((f) => {
    if (f.name.startsWith('.')) return false
    return ACCEPTED_EXT.test(f.name)
  })
  const skippedFiles = files.length - validFiles.length

  if (validFiles.length === 0) {
    return {
      rootName: '',
      period: { raw: '' },
      vendors: [],
      totalFiles: 0,
      skippedFiles,
    }
  }

  const firstPath = (validFiles[0].webkitRelativePath || validFiles[0].name).split('/')
  const rootName = firstPath[0]

  const byVendor = new Map<string, File[]>()
  for (const f of validFiles) {
    const parts = (f.webkitRelativePath || f.name).split('/')
    if (parts.length < 3) continue
    const vendor = parts[1]
    const bucket = byVendor.get(vendor) ?? []
    bucket.push(f)
    byVendor.set(vendor, bucket)
  }

  const vendors: VendorGroup[] = []
  for (const [folder, vfiles] of byVendor) {
    const { displayName, index } = parseVendorName(folder)
    const parsed: VendorFile[] = vfiles.map((file) => ({
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      size: file.size,
      file,
      kind: classifyFile(file.name),
    }))
    vendors.push({
      folderName: folder,
      displayName,
      index,
      files: parsed,
      hasInvoice: parsed.some((f) => f.kind === 'invoice'),
      hasQuote: parsed.some((f) => f.kind === 'quote'),
    })
  }

  vendors.sort((a, b) => {
    if (a.displayName !== b.displayName) {
      return a.displayName.localeCompare(b.displayName, 'zh-TW')
    }
    return a.index - b.index
  })

  return {
    rootName,
    period: parsePeriod(rootName),
    vendors,
    totalFiles: validFiles.length,
    skippedFiles,
  }
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej),
    )
    if (!batch.length) break
    all.push(...batch)
  }
  return all
}

async function entryToFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    )
    const relPath = entry.fullPath.replace(/^\//, '')
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relPath,
      configurable: true,
    })
    return [file]
  }
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await readAllEntries(dirReader)
    const nested = await Promise.all(entries.map(entryToFiles))
    return nested.flat()
  }
  return []
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items)
  const entries = items
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e)
  const nested = await Promise.all(entries.map(entryToFiles))
  return nested.flat()
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
