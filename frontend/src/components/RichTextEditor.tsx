import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Bold, Italic, List, ListOrdered, Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, attachmentFileUrl } from '../lib/api'

interface Props {
  value: string
  onChange: (html: string) => void
  onBlur?: () => void
  placeholder?: string
  /** Si fourni, active le copier/coller et l'insertion d'images (uploadées comme pièce jointe). */
  engagementId?: number
}

export default function RichTextEditor({ value, onChange, onBlur, placeholder, engagementId }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function uploadImage(file: File): Promise<string | null> {
    if (!engagementId) return null
    setUploading(true)
    try {
      const data = new FormData()
      data.append('file', file)
      const res = await api.post(`/engagements/${engagementId}/attachments`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return attachmentFileUrl(res.data.id)
    } catch {
      return null
    } finally {
      setUploading(false)
    }
  }

  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose-sm max-w-none min-h-[100px] px-3 py-2 text-sm focus:outline-none [&_p]:m-0 [&_ul]:my-1 [&_ol]:my-1 [&_img]:my-2 [&_img]:max-h-80 [&_img]:rounded-md',
        'data-placeholder': placeholder || '',
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || [])
        const imageItem = items.find((i) => i.type.startsWith('image/'))
        if (!imageItem || !engagementId) return false
        const file = imageItem.getAsFile()
        if (!file) return false
        event.preventDefault()
        uploadImage(file).then((url) => {
          if (url) view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src: url })))
        })
        return true
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onBlur: () => onBlur?.(),
  })

  // Resynchronise l'éditeur si la valeur change depuis l'extérieur (ex.
  // rechargement de la fiche) sans perdre le focus/curseur en cours d'édition.
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  async function pickImage(file: File | null) {
    if (!file || !editor) return
    const url = await uploadImage(file)
    if (url) editor.chain().focus().setImage({ src: url }).run()
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!editor) return null

  return (
    <div className="rounded-md border border-slate-300 focus-within:border-ville-blue">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        {engagementId && (
          <ToolbarButton active={false} onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ImageIcon size={14} />
          </ToolbarButton>
        )}
        {uploading && <span className="ml-1 text-xs text-slate-400">Envoi de l'image…</span>}
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => pickImage(e.target.files?.[0] || null)} className="hidden" />
      </div>
      <EditorContent editor={editor} />
      {engagementId && (
        <p className="border-t border-slate-100 px-3 py-1 text-xs text-slate-400">
          Astuce : collez directement une image (Ctrl+V) pour l'insérer.
        </p>
      )}
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1.5 disabled:opacity-40 ${active ? 'bg-ville-blue/15 text-ville-blue' : 'text-slate-500 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  )
}
