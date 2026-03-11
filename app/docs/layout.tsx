"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const NAV = [
  { label: "Introduction", href: "/docs" },
  {
    label: "The Graph",
    children: [
      { label: "Mental Models", href: "/docs/the-graph/mental-models" },
      { label: "Connections", href: "/docs/the-graph/connections" },
      { label: "Embeddings", href: "/docs/the-graph/embeddings" },
    ],
  },
  {
    label: "Explorer",
    children: [
      { label: "Navigation", href: "/docs/explorer/navigation" },
      { label: "Disciplines", href: "/docs/explorer/disciplines" },
      { label: "Synapse Mode", href: "/docs/explorer/synapse-mode" },
      { label: "Visual System", href: "/docs/explorer/visual-system" },
    ],
  },
  {
    label: "Oracle",
    children: [
      { label: "Overview", href: "/docs/oracle/overview" },
      { label: "API Key Setup", href: "/docs/oracle/api-key-setup" },
      { label: "How Results Work", href: "/docs/oracle/how-results-work" },
      { label: "Follow-Ups", href: "/docs/oracle/follow-ups" },
    ],
  },
  {
    label: "Self-Hosting",
    children: [
      { label: "Quickstart", href: "/docs/self-hosting/quickstart" },
      { label: "Configuration", href: "/docs/self-hosting/configuration" },
      { label: "Deployment", href: "/docs/self-hosting/deployment" },
    ],
  },
  {
    label: "Integrations",
    children: [
      { label: "MCP Server", href: "/docs/integrations/mcp-server" },
    ],
  },
  {
    label: "Architecture",
    children: [
      { label: "Overview", href: "/docs/architecture/overview" },
      { label: "Rendering", href: "/docs/architecture/rendering" },
      { label: "State", href: "/docs/architecture/state" },
    ],
  },
];

function NavSection({
  item,
  pathname,
}: {
  item: (typeof NAV)[number];
  pathname: string;
}) {
  const hasChildren = "children" in item && item.children;
  const isActive = hasChildren
    ? item.children?.some((c) => pathname === c.href)
    : pathname === ("href" in item ? item.href : "");
  const [open, setOpen] = useState(isActive);

  useEffect(() => {
    if (hasChildren && item.children?.some((c) => pathname === c.href)) {
      setOpen(true);
    }
  }, [pathname, hasChildren, item]);

  if (!hasChildren && "href" in item) {
    return (
      <Link
        href={item.href as string}
        className={`block px-3 py-1.5 rounded-md text-[13px] transition-colors ${
          pathname === item.href
            ? "text-[#c89b3c] bg-[#c89b3c]/10 font-medium"
            : "text-[#999] hover:text-[#ccc] hover:bg-white/[0.03]"
        }`}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div className="mt-3 first:mt-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-[13px] font-semibold text-[#ccc] hover:text-white transition-colors cursor-pointer uppercase tracking-wider"
      >
        {item.label}
      </button>
      {open && hasChildren && (
        <div className="mt-0.5 ml-3 border-l border-[#222] pl-0">
          {item.children?.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={`block px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                pathname === child.href
                  ? "text-[#c89b3c] bg-[#c89b3c]/10 font-medium"
                  : "text-[#777] hover:text-[#bbb] hover:bg-white/[0.03]"
              }`}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#111] text-[#e0e0e0]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[#222] bg-[#111]/95 backdrop-blur-md">
        <div className="max-w-[90rem] mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-8">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1.5 text-[#888] hover:text-white cursor-pointer"
              aria-label="Toggle sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            </button>
            <Link
              href="/"
              className="font-mono font-bold text-[15px] tracking-[0.15em] text-white hover:text-[#c89b3c] transition-colors"
            >
              FRAMEWERK
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/docs"
                className="text-[13px] text-[#888] hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/[0.04]"
              >
                Documentation
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/depose28/framewerk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#666] hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/[0.04]"
              aria-label="GitHub"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-[90rem] mx-auto flex">
        {/* Sidebar - desktop */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto py-8 pr-4 pl-6">
          <nav className="flex flex-col">
            {NAV.map((item) => (
              <NavSection key={item.label} item={item} pathname={pathname} />
            ))}
          </nav>
        </aside>

        {/* Sidebar - mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <aside
              className="w-72 h-full bg-[#111] border-r border-[#222] py-8 px-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <nav className="flex flex-col">
                {NAV.map((item) => (
                  <NavSection key={item.label} item={item} pathname={pathname} />
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 px-8 py-12 lg:px-16 lg:py-16 lg:border-l lg:border-[#222]">
          <article className="docs-content prose prose-invert max-w-3xl
            prose-headings:font-semibold prose-headings:tracking-tight
            prose-h1:text-3xl prose-h1:mb-4 prose-h1:mt-0 prose-h1:text-white prose-h1:font-bold
            prose-h2:text-[22px] prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-white prose-h2:border-b prose-h2:border-[#222] prose-h2:pb-3
            prose-h3:text-[17px] prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-[#ddd]
            prose-p:text-[15px] prose-p:leading-7 prose-p:text-[#aaa] prose-p:my-4
            prose-a:text-[#c89b3c] prose-a:no-underline hover:prose-a:underline prose-a:font-medium
            prose-strong:text-[#ddd] prose-strong:font-semibold
            prose-code:text-[#c89b3c] prose-code:bg-[#1a1a1a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-normal prose-code:border prose-code:border-[#2a2a2a]
            prose-pre:bg-[#0d0d0d] prose-pre:border prose-pre:border-[#2a2a2a] prose-pre:rounded-lg prose-pre:my-6
            prose-li:text-[15px] prose-li:text-[#aaa] prose-li:leading-7 prose-li:my-1
            prose-ol:my-4 prose-ul:my-4
            prose-table:text-[14px] prose-table:my-6
            prose-th:text-[#ccc] prose-th:font-semibold prose-th:border-b prose-th:border-[#333] prose-th:py-3 prose-th:px-4 prose-th:text-left
            prose-td:text-[#999] prose-td:border-b prose-td:border-[#1a1a1a] prose-td:py-2.5 prose-td:px-4
            prose-hr:border-[#222] prose-hr:my-10
            prose-blockquote:border-l-2 prose-blockquote:border-[#c89b3c]/40 prose-blockquote:text-[#999] prose-blockquote:italic prose-blockquote:pl-6
            prose-img:rounded-lg
          ">
            {children}
          </article>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#222] py-12 px-6 text-center">
        <p className="text-[13px] text-[#555]">Framewerk Documentation</p>
      </footer>
    </div>
  );
}
