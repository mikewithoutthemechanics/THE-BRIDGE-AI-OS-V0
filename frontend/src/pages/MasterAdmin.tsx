import { useMemo } from 'react';
import { useAuth } from '../contexts/AppContext';
import {
  ADMIN_GROUPS,
  ROLE_ORDER,
  REGISTRY_VERSION,
  type Role,
} from '../generated/admin-groups';

// ADMIN_GROUPS is codegen'd from public/nav-routes.js at predev/prebuild.
// Single source of truth: that .js file. Never edit src/generated/ by hand.

function canSee(requiredRole: Role | undefined, userRole: Role): boolean {
  if (requiredRole === null || requiredRole === undefined) return true;
  if (!userRole) return false;
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(requiredRole);
}

export default function MasterAdmin() {
  const { user } = useAuth();
  const role = (user?.role ?? null) as Role;

  const visibleGroups = useMemo(
    () =>
      ADMIN_GROUPS
        .filter((g) => canSee(g.role, role))
        .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.role ?? g.role, role)) }))
        .filter((g) => g.items.length > 0),
    [role],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-slate-700/50">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
              Master Admin Hub
            </h1>
            <p className="text-slate-400 text-sm mt-2 max-w-xl">
              Central access to every admin panel, intelligence dashboard, audit surface, and system control.
              Gated to admins and superadmins.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-500 border border-slate-700/60 rounded-md px-3 py-1.5 bg-slate-900/60">
            user: <span className="text-cyan-300">{user?.email ?? '—'}</span> · role:{' '}
            <span className="text-cyan-300">{role ?? 'none'}</span> · reg:{' '}
            <span className="text-cyan-300">{REGISTRY_VERSION}</span>
          </div>
        </header>

        {visibleGroups.length === 0 ? (
          <div className="mt-10 p-10 text-center text-slate-500 border border-dashed border-slate-700 rounded-lg">
            No admin groups visible for role <b>{role ?? 'none'}</b>.
          </div>
        ) : (
          visibleGroups.map((group) => (
            <section key={group.id} id={`group-${group.id}`} className="mt-10">
              <div className="flex items-baseline gap-4 mb-3">
                <h2 className="uppercase tracking-[0.18em] text-cyan-300 font-bold">{group.title}</h2>
                <span className="text-slate-500 text-sm">{group.desc}</span>
                <span className="ml-auto font-mono text-xs text-slate-500">
                  {group.items.length} panel{group.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                {group.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="relative block p-4 rounded-lg border border-slate-700/60 bg-slate-900/60 hover:border-cyan-400/40 hover:bg-cyan-400/5 hover:-translate-y-px transition-all min-h-[96px]"
                  >
                    {item.role === 'superadmin' && (
                      <span className="absolute top-2 right-2 font-mono text-[0.6rem] tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">
                        SUPER
                      </span>
                    )}
                    <div className="text-slate-100 font-semibold">{item.label}</div>
                    {item.desc && <div className="text-slate-400 text-xs mt-1 leading-snug">{item.desc}</div>}
                    <div className="mt-2 font-mono text-[0.7rem] text-sky-400">{item.href}</div>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}

        <footer className="mt-16 pt-5 border-t border-slate-700/50 flex flex-wrap justify-between gap-3 text-xs text-slate-500">
          <div>
            Codegen'd from <code className="text-sky-400">public/nav-routes.js</code> — single source of truth.
          </div>
          <div className="flex gap-4">
            <a className="text-sky-400 hover:text-cyan-300" href="/app">← App</a>
            <a className="text-sky-400 hover:text-cyan-300" href="/admin-hub">Vanilla Hub</a>
            <a className="text-sky-400 hover:text-cyan-300" href="/docs">Docs</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
