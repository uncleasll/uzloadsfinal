/** Where the phone is, if it says so within a few seconds. Never blocks the action. */
export function whereAmI(timeoutMs = 4000): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve(null)
    const done = (v: { lat: number; lng: number } | null) => { clearTimeout(t); resolve(v) }
    const t = setTimeout(() => done(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      p => done({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => done(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

/** Shrinks a camera photo before it goes into the outbox, so a week of POD photos does not fill the phone. */
export async function shrinkPhoto(file: File, maxSide = 1800, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1_500_000) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise(res => canvas.toBlob(b => res(b || file), 'image/jpeg', quality))
  } catch { return file }
}
