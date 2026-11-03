/** Inline icons from the mockups. All are decorative unless a caller gives them a label. */

type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none">
    {children}
  </svg>
);
const line = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const MarkIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="4" cy="15" r="2" fill="currentColor" />
    <circle cx="10" cy="10" r="2" fill="currentColor" />
    <circle cx="16" cy="5" r="2" fill="currentColor" />
  </svg>
);
export const NewIcon = ({ size = 16, className }: P) => svg(size, className, <path d="M8 3.5v9M3.5 8h9" {...line} />);
export const MoreIcon = ({ size = 16, className }: P) =>
  svg(size, className, [3.5, 8, 12.5].map((cx) => <circle key={cx} cx={cx} cy="8" r="1.2" fill="currentColor" />));
export const SendIcon = ({ size = 16, className }: P) => svg(size, className, <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" {...line} strokeWidth={1.6} />);
export const StopIcon = ({ size = 16, className }: P) => svg(size, className, <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" />);
export const OutIcon = ({ size = 16, className }: P) =>
  svg(size, className, <path d="M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5 7.5 8.5" {...line} />);
export const ChevIcon = ({ size = 14, className }: P) => svg(size, className, <path d="m6 4 4 4-4 4" {...line} />);
export const DownIcon = ({ size = 14, className }: P) => svg(size, className, <path d="M8 3.5v9M4 8.5l4 4 4-4" {...line} />);
export const RedoIcon = ({ size = 14, className }: P) =>
  svg(size, className, <path d="M12.5 5.5H6a3 3 0 0 0 0 6h4.5M10 3l2.5 2.5L10 8" {...line} />);
export const InfoIcon = ({ size = 14, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={1.3} />
      <path d="M8 7.25v4" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      <circle cx="8" cy="5" r=".85" fill="currentColor" />
    </>,
  );
export const SyncIcon = ({ size = 16, className }: P) =>
  svg(
    size,
    className,
    <path d="M12.5 6.5A4.75 4.75 0 0 0 3.6 5.2M3.5 9.5a4.75 4.75 0 0 0 8.9 1.3M12.75 3v3.5h-3.5M3.25 13V9.5h3.5" {...line} strokeWidth={1.4} />,
  );
export const WarnIcon = ({ size = 16, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={1.5} />
      <path d="M8 4.75v3.75" {...line} />
      <circle cx="8" cy="11" r=".9" fill="currentColor" />
    </>,
  );
export const CopyIcon = ({ size = 14, className }: P) =>
  svg(
    size,
    className,
    <>
      <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth={1.4} />
      <path d="M10.5 3H4.5A1.5 1.5 0 0 0 3 4.5v6" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </>,
  );
export const SearchIcon = ({ size = 14, className }: P) =>
  svg(
    size,
    className,
    <>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth={1.5} />
      <path d="m10.25 10.25 3 3" {...line} />
    </>,
  );
