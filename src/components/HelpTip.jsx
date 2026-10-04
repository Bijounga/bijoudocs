import React from 'react'
import Icon from './icons.jsx'

// A small "?" that shows its explanation in the themed tooltip — used in
// place of always-visible paragraphs of help text.
export default function HelpTip({ text, className }) {
  return (
    <span className={'help-tip' + (className ? ' ' + className : '')} title={text} aria-label={text}>
      <Icon name="help" size={13} />
    </span>
  )
}
