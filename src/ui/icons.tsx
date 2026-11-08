/** Pictogrammes géométriques, trait 2 px. */
const S = (props: { children: preact.ComponentChildren; size?: number }) => (
  <svg viewBox="0 0 24 24" width={props.size ?? 20} height={props.size ?? 20} fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {props.children}
  </svg>
);

export const IPlus = () => (
  <S>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IMinus = () => (
  <S>
    <path d="M5 12h14" />
  </S>
);
export const ICheck = () => (
  <S>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </S>
);
export const IClose = () => (
  <S>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IChevron = () => (
  <svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M6 3l5 5-5 5" />
  </svg>
);
export const IUp = () => (
  <S>
    <path d="M6 14l6-6 6 6" />
  </S>
);
export const IDown = () => (
  <S>
    <path d="M6 10l6 6 6-6" />
  </S>
);
export const IArrow = () => (
  <S>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </S>
);
export const IBack = () => (
  <S>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </S>
);
/** Réglages : trois couloirs avec curseurs */
export const ISettings = () => (
  <S>
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="9" cy="7" r="1.8" fill="currentColor" />
    <circle cx="15" cy="12" r="1.8" fill="currentColor" />
    <circle cx="7" cy="17" r="1.8" fill="currentColor" />
  </S>
);
/** Programme : grille éditoriale */
export const IProgram = () => (
  <S>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 10h16M10 10v10" />
  </S>
);
/** Aujourd'hui : soleil géométrique / cible */
export const IToday = () => (
  <S>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </S>
);
/** Carnet : pages lignées */
export const IBook = () => (
  <S>
    <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </S>
);
export const ISwap = () => (
  <S>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </S>
);
export const ISkip = () => (
  <S>
    <path d="M5 6l7 6-7 6M14 6v12" />
  </S>
);
export const IList = () => (
  <S>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3" />
  </S>
);
export const ITrash = () => (
  <S>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
  </S>
);
