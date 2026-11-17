/**
 * Résout les images intégrées d'un corps de message (`<img src="cid:...">`)
 * vers l'URL réelle de la pièce jointe correspondante. Le backend renvoie le
 * HTML tel quel (il ne connaît pas la forme des URLs front) + la liste des
 * `cid` disponibles avec leur index de pièce jointe — cf.
 * services/msgParser.js.
 */
export function resolveCidImages(
  html: string,
  inlineImages: { contentId: string; index: number }[],
  urlFor: (index: number) => string
): string {
  if (!html || !inlineImages.length) return html
  let result = html
  for (const img of inlineImages) {
    const escaped = img.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`cid:${escaped}`, 'gi')
    result = result.replace(re, urlFor(img.index))
  }
  return result
}
