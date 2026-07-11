/**
 * 送 OCR 前的圖片壓縮:長邊縮到 1600px、轉 JPEG。
 * 手機原圖 3~8MB → 約 300~600KB,省 API 費用也避免 Proxy 請求超過大小上限。
 * 無法解碼的格式(部分瀏覽器的 HEIC)或 PDF 直接回傳原檔。
 */

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82
/** 已經夠小的 JPEG 不重壓,避免畫質無謂折損 */
const SKIP_BELOW_BYTES = 1_000_000

export async function compressImage(file: File): Promise<File> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && /jpe?g/i.test(file.type) && file.size <= SKIP_BELOW_BYTES) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
    })
  } finally {
    bitmap.close()
  }
}
