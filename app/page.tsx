import { LatticeScene } from "@/components/graph/LatticeScene";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { GraphLegend } from "@/components/ui/GraphLegend";
import { SearchBar } from "@/components/ui/SearchBar";
import { OnboardingHints } from "@/components/ui/OnboardingHints";
import { OraclePanel } from "@/components/ui/OraclePanel";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { NavigationHints } from "@/components/ui/NavigationHints";
import { MobileGate } from "@/components/ui/MobileGate";

export default function Home() {
  return (
    <MobileGate>
      <LatticeScene />
      <GraphLegend />
      <SearchBar />
      <ModeToggle />
      <OraclePanel />
      <NavigationHints />
      <OnboardingHints />
      <LoadingScreen />
      {/* Bottom-right links */}
      <div className="fixed bottom-5 right-5 z-20 flex items-center gap-6">
        <a
          href="/docs/integrations/mcp-server"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 font-mono text-[13px] text-[#7A9AAA]
            hover:text-[#E8A030] tracking-wider uppercase transition-colors group"
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" className="opacity-80 group-hover:opacity-100 transition-opacity">
            <circle cx="3" cy="7" r="1.5" fill="currentColor" />
            <circle cx="11" cy="4" r="1.5" fill="currentColor" />
            <circle cx="11" cy="10" r="1.5" fill="currentColor" />
            <path d="M4.5 6.5L9.5 4.5M4.5 7.5L9.5 9.5" stroke="currentColor" strokeWidth="0.8" />
          </svg>
          MCP
        </a>
        <span className="text-[#4A6070]">&middot;</span>
        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[13px] text-[#7A9AAA]
            hover:text-[#8CB4CC] tracking-wider uppercase transition-colors"
        >
          Docs
        </a>
      </div>
    </MobileGate>
  );
}
