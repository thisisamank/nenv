import type { ReactNode } from "react";

const PATHS = {
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3M16 7l3 3M14 9l2 2" /></>,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  repo: <><path d="M5 4h11l3 3v13H5z" /><path d="M9 4v5h6" /><path d="M9 14h6M9 17h4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></>,
  shield: <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  alert: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  chev: <path d="m9 6 6 6-6 6" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  trash: <path d="M4 7h16M10 3h4M6 7l1 14h10l1-14" />,
  restore: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></>,
  logout: <><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  branch: <><circle cx="6" cy="5.5" r="2" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7.5v9M18 10c0 4-6 3-11.2 7" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "icon" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
