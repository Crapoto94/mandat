interface Props {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}

/** Interrupteur à bascule (on/off), pour les réglages à bascule instantanée. */
export default function ToggleSwitch({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-ville-blue' : 'bg-slate-300'
        }`}
      >
        <span
          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(4px)' }}
        />
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </button>
  )
}
