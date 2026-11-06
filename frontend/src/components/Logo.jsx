export default function Logo({ dark = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill={dark ? "#1b3563" : "#0c1a33"} />
        <path d="M16 6.5 8 10v5.6c0 4.9 3.4 9.3 8 10.4 4.6-1.1 8-5.5 8-10.4V10l-8-3.5Z" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" />
        <path d="m12.5 16 2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="leading-tight">
        <span className={`block text-[15px] font-semibold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>SecureBank</span>
        <span className={`block text-[11px] ${dark ? "text-slate-400" : "text-slate-500"}`}>Blockchain Banking · A3</span>
      </span>
    </span>
  );
}
