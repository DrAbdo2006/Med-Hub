// ===========================================================================
// TopProgressBar — ultra-thin, fixed top-edge loading indicator (Med Hub).
//
// Usage in App.jsx / your root layout:
//   import TopProgressBar from "./TopProgressBar";
//   const [isLoading, setIsLoading] = useState(true);
//   return (<><TopProgressBar loading={isLoading} />{/* ...app... */}</>);
//
// Drive `loading` from real events later: setIsLoading(true) before a route
// change or fetch, setIsLoading(false) when it resolves.
//
// Self-contained: ships its own keyframes so it works without touching
// tailwind.config.js. Primary color comes from --med-primary (#1B98E0),
// with a hardcoded fallback if the CSS variable isn't defined.
// ===========================================================================
export default function TopProgressBar({ loading = false }) {
  if (!loading) return null;
  return (
    <>
      <style>{`
        @keyframes medbar-indeterminate {
          0%   { transform: translateX(-100%) scaleX(.6); }
          50%  { transform: translateX(80%)   scaleX(1);  }
          100% { transform: translateX(250%)  scaleX(.6); }
        }
      `}</style>
      <div
        role="progressbar"
        aria-busy="true"
        aria-label="Loading"
        className="fixed left-0 top-0 z-[9999] h-[2px] w-full overflow-hidden bg-transparent"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="absolute left-0 top-0 h-full w-2/5 rounded-r-full"
          style={{
            background: "var(--med-primary, #1B98E0)",
            // soft outer glow + tight inner glow → modern neon edge
            boxShadow:
              "0 0 10px 1px rgba(27,152,224,0.75), 0 0 4px 0 rgba(27,152,224,0.95)",
            animation: "medbar-indeterminate 1.1s cubic-bezier(.65,.05,.36,1) infinite",
          }}
        >
          {/* bright blurred head at the leading edge */}
          <span
            className="absolute -top-px right-0 h-1 w-6 rounded-full"
            style={{ background: "#fff", opacity: 0.65, filter: "blur(3px)" }}
          />
        </div>
      </div>
    </>
  );
}
