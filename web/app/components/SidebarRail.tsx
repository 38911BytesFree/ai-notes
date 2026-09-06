import { Link, useLocation } from "react-router";
import type { UserProfile } from "~/services/notes-api.server";
import { CATEGORIES } from "~/components/CategoryChips";

interface SidebarRailProps {
  user: UserProfile;
  totalNotes?: number;
  selectedCategory?: string;
  onSelectCategory?: (cat?: string) => void;
  onNewNote?: () => void;
  onSignOut?: () => void;
  collapsed?: boolean;
}

export function SidebarRail({
  user,
  totalNotes,
  selectedCategory,
  onSelectCategory,
  onNewNote,
  onSignOut,
  collapsed = false,
}: SidebarRailProps) {
  const location = useLocation();
  const isHome = location.pathname === "/app" && !selectedCategory;

  // Extract initials for the avatar (e.g. "MK" or first letters of email/name)
  const initials = (user.display_name || user.email || "User")
    .split(/[\s@._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 flex flex-col items-center justify-between py-4 border-r border-[#222228] bg-[#121216] select-none h-screen sticky top-0 z-20">
        <div className="flex flex-col items-center space-y-5">
          {/* Logo Icon */}
          <Link
            to="/app"
            title="Notes Home"
            className="w-8 h-8 rounded-lg bg-[#1e1e26] border border-[#2b2b36] flex items-center justify-center text-zinc-200 hover:text-white hover:bg-[#252530] transition-colors"
          >
            <span className="text-xs text-indigo-400 font-bold">✦</span>
          </Link>

          {/* New Note Button */}
          {onNewNote && (
            <button
              type="button"
              onClick={onNewNote}
              title="New note (N)"
              className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-xs transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          )}

          {/* Quick Icons */}
          <Link
            to="/app"
            title="All notes"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isHome
                ? "bg-[#22222d] text-indigo-400"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1c24]"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </Link>

          <Link
            to="/feed"
            title="Public Feed"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1c24] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          </Link>
        </div>

        {/* User initials circle */}
        <Link
          to="/app/settings"
          title={user.email}
          className="w-8 h-8 rounded-full bg-[#272732] border border-[#373746] text-xs font-semibold text-zinc-200 flex items-center justify-center hover:border-indigo-400 transition-colors"
        >
          {initials}
        </Link>
      </aside>
    );
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col justify-between py-4 px-3 border-r border-[#222228] bg-[#121216] select-none h-screen sticky top-0 z-20 hidden md:flex">
      <div className="space-y-4 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1 pb-1">
          <Link to="/app" className="flex items-center space-x-2.5 text-zinc-100 font-medium text-sm tracking-tight hover:text-white">
            <span className="w-5 h-5 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs">
              ✦
            </span>
            <span className="font-semibold text-base tracking-tight">Notes</span>
          </Link>
        </div>

        {/* New Note Button */}
        {onNewNote && (
          <button
            type="button"
            onClick={onNewNote}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1e1e26] hover:bg-[#272733] border border-[#2c2c38] text-zinc-200 text-sm font-medium transition-colors shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-indigo-400 group-hover:rotate-90 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>New note</span>
            </div>
            <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-[#15151c] text-zinc-400 border border-[#2b2b38] font-mono">
              N
            </kbd>
          </button>
        )}

        {/* Primary Navigation */}
        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => onSelectCategory?.(undefined)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
              isHome
                ? "bg-[#20202a] text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#181820]"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              <span>All notes</span>
            </div>
            {totalNotes !== undefined && (
              <span className="text-xs text-zinc-500 font-mono">{totalNotes}</span>
            )}
          </button>

          <Link
            to="/feed"
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-[#181820] transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              <span>Public Feed</span>
            </div>
          </Link>

          <Link
            to="/app/connect"
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-[#181820] transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <span>Connect</span>
            </div>
          </Link>
        </nav>

        {/* Collections / Categories Section */}
        <div className="pt-2">
          <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Collections
          </div>
          <div className="space-y-0.5">
            {CATEGORIES.slice(0, 8).map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onSelectCategory?.(active ? undefined : cat)}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left cursor-pointer ${
                    active
                      ? "bg-[#20202a] text-indigo-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-[#181820]"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-indigo-400" : "bg-zinc-600"}`} />
                  <span className="truncate">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="pt-3 border-t border-[#222228] flex items-center justify-between px-1">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[#252533] border border-[#353545] text-xs font-semibold text-zinc-200 flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="truncate">
            <div className="text-xs font-medium text-zinc-200 truncate">
              {user.display_name || user.email.split("@")[0]}
            </div>
            <div className="text-[10px] text-zinc-500 truncate">{user.email}</div>
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <Link
            to="/app/settings"
            title="Settings"
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f28] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f28] transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
