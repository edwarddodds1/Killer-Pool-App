import { useEffect } from 'react'
import type { RulesGameMode } from '../../../shared/rulesContent'
import { RULES_BY_MODE } from '../../../shared/rulesContent'

export type { RulesGameMode }

type RulesModalProps = {
  visible: boolean
  onClose: () => void
  gameMode: RulesGameMode
}

function HelpCircleIcon() {
  return (
    <svg className="rulesHelpBtn__icon" viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M9.75 9.25a2.35 2.35 0 1 1 4.1 1.6c-.65.68-1.35 1.05-1.35 2.15V14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="16.75" r="1" fill="currentColor" />
    </svg>
  )
}

export function RulesHelpIconButton({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="rulesHelpBtn"
      onClick={onPress}
      aria-label={label ?? 'How this mode works'}
      title={label ?? 'How this mode works'}
    >
      <HelpCircleIcon />
    </button>
  )
}

export function RulesModal({ visible, onClose, gameMode }: RulesModalProps) {
  const content = RULES_BY_MODE[gameMode]

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      className="rulesModalOverlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="rulesModalPanel card card--pool"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rulesModalHeader">
          <h2 id="rules-modal-title" className="rulesModalTitle">
            {content.title}
          </h2>
          <button type="button" className="rulesModalClose" onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ol className="rulesModalList">
          {content.rules.map((rule, index) => (
            <li key={index} className="rulesModalListItem">
              {rule}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn--primary rulesModalGotIt" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
