// Texte brut à partir d'un contenu enrichi (description_avancement, etc.),
// pour un usage où le HTML ne peut pas s'afficher — une infobulle (title)
// notamment, qui rend les balises telles quelles sinon.
export function stripHtml(html: string | null | undefined, maxLength = 300): string {
  if (!html) return ''
  const text = html
    .replace(/<(p|div|br|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, '\n')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
