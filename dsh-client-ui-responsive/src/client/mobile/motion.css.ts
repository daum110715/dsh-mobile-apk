/**
 * Injected motion for the pinned Web UI.
 * Chromium 87: no :has(), :is(), :where(), @starting-style, linear(), or the individual
 * scale property. Live elements animate transform and opacity only.
 * Every rule requires html[data-dsh-motion] and can be dropped with data-dsh-motion-off.
 */

export const MOTION_CSS: string = `
@media (prefers-reduced-motion: no-preference) {
  html[data-dsh-motion]:not([data-dsh-motion-off~="press"]) button:not([data-side]):not([disabled]),
  html[data-dsh-motion]:not([data-dsh-motion-off~="press"]) [role="button"]:not([data-side]):not([disabled]),
  html[data-dsh-motion]:not([data-dsh-motion-off~="press"]) [role="menuitem"]:not([data-side]):not([disabled]) {
    transition: transform 160ms cubic-bezier(0.05, 0.7, 0.1, 1);
  }

  html[data-dsh-motion]:not([data-dsh-motion-off~="press"]) button:not([data-side]):not([disabled]):active,
  html[data-dsh-motion]:not([data-dsh-motion-off~="press"]) [role="button"]:not([data-side]):not([disabled]):active,
  html[data-dsh-motion]:not([data-dsh-motion-off~="press"]) [role="menuitem"]:not([data-side]):not([disabled]):active {
    transform: scale(0.97);
    transition-duration: 112ms;
    transition-timing-function: cubic-bezier(0.3, 0, 0.8, 0.15);
  }

  html[data-dsh-motion]:not([data-dsh-motion-off~="overlay"]) [data-dsh-shell-enter="pop"] {
    animation: dsh-shell-pop 240ms cubic-bezier(0.05, 0.7, 0.1, 1);
  }

  html[data-dsh-motion]:not([data-dsh-motion-off~="overlay"]) [data-dsh-shell-enter="fade"] {
    animation: dsh-shell-fade 240ms cubic-bezier(0.05, 0.7, 0.1, 1);
  }

  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(-n+8) {
    animation-name: dsh-shell-rise;
    animation-duration: 240ms;
    animation-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1);
    animation-fill-mode: backwards;
  }

  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(2) { animation-delay: 24ms; }
  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(3) { animation-delay: 48ms; }
  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(4) { animation-delay: 72ms; }
  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(5) { animation-delay: 96ms; }
  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(6) { animation-delay: 120ms; }
  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(7) { animation-delay: 144ms; }
  html[data-dsh-motion]:not([data-dsh-motion-off~="list"]) [data-dsh-shell-stagger] > :nth-child(8) { animation-delay: 168ms; }
}

@keyframes dsh-shell-pop {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: none; }
}

@keyframes dsh-shell-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes dsh-shell-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
`
