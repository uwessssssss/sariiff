// The Sarif mark: two opposing arrows (currency exchange) on a navy tile.
// Same drawing as /public/icon.svg and the favicon — keep them in sync.
export function SarifMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="#0F172A" />
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.75"
      >
        <path d="M8 11.5h15M19 7.5l4 4-4 4" stroke="#FFFFFF" />
        <path d="M24 20.5H9M13 16.5l-4 4 4 4" stroke="#60A5FA" />
      </g>
    </svg>
  );
}
