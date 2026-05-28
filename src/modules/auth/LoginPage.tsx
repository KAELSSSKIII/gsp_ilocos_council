import { CSSProperties, FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  User,
  Loader2,
} from "lucide-react";
import { authApi } from "@/lib/api";
import { selectLoading, selectProfile, useSessionStore } from "@/store/sessionStore";
import { appendAuditEntry } from "@/utils/auditTrail";

const styles = {
  page: {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
    background:
      "radial-gradient(ellipse 80% 60% at 20% 50%, rgba(45,107,64,.35) 0%, transparent 60%), radial-gradient(ellipse 50% 80% at 80% 20%, rgba(11,30,18,.8) 0%, transparent 50%), radial-gradient(ellipse 40% 40% at 60% 80%, rgba(36,85,52,.2) 0%, transparent 50%), #112918",
    color: "#fff",
  } satisfies CSSProperties,
  pattern: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg%20width='60'%20height='60'%20viewBox='0%200%2060%2060'%20xmlns='http://www.w3.org/2000/svg'%3E%3Cg%20fill='none'%20fill-rule='evenodd'%3E%3Cg%20fill='%23ffffff'%20fill-opacity='0.018'%3E%3Cpath%20d='M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
    pointerEvents: "none",
  } satisfies CSSProperties,
  shell: {
    position: "relative",
    zIndex: 1,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 16px",
  } satisfies CSSProperties,
  wrap: {
    width: "100%",
    maxWidth: "440px",
  } satisfies CSSProperties,
  logoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    marginBottom: "32px",
  } satisfies CSSProperties,
  logoMark: {
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,.2)",
    background: "rgba(255,255,255,.06)",
  } satisfies CSSProperties,
  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "22px",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.05)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    padding: "36px 36px 28px",
    boxShadow: "0 24px 60px rgba(0,0,0,.22)",
  } satisfies CSSProperties,
  cardTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "1px",
    background: "linear-gradient(to right, transparent, rgba(255,255,255,.3), transparent)",
  } satisfies CSSProperties,
  input: {
    width: "100%",
    height: "45px",
    borderRadius: "11px",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.07)",
    color: "#fff",
    outline: "none",
    fontSize: "13px",
    padding: "12px 14px 12px 40px",
  } satisfies CSSProperties,
  primaryButton: {
    position: "relative",
    width: "100%",
    height: "50px",
    borderRadius: "11px",
    border: "1px solid rgba(255,255,255,.15)",
    background: "linear-gradient(135deg, #245534 0%, #1D4429 100%)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: ".04em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "9px",
    boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  } satisfies CSSProperties,
} as const;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore(selectProfile);
  const loadingProfile = useSessionStore(selectLoading);
  const fetchProfile = useSessionStore((s) => s.fetchProfile);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const from = (location.state as { from?: string } | undefined)?.from ?? "/";

  if (!loadingProfile && profile) return <Navigate to={from} replace />;

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();

    if (!username.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await authApi.login(username.trim(), password);
      const currentProfile = await fetchProfile();
      if (!currentProfile) {
        throw new Error("Login succeeded but the session could not be loaded. Please try again.");
      }
      appendAuditEntry({
        action: "login",
        actorName: currentProfile.full_name || currentProfile.username,
        actorEmail: currentProfile.username,
        actorRole: currentProfile.role,
        summary: "Signed in to the workspace.",
      });
      setSignedIn(true);
      window.setTimeout(() => {
        navigate(from, { replace: true });
      }, 700);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 500 || status === 502 || status === 503) {
        setError("Server is unavailable. Make sure the backend server is running and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Incorrect username or password. Please try again.");
      }
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.pattern} />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        style={styles.shell}
      >
        <div style={styles.wrap}>
          <div style={styles.logoRow}>
            <div style={styles.logoMark}>
              <img src="/favicon.ico" alt="Girl Scout Suite logo" className="h-6 w-6 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.12em] text-[#8DB89E]">Ilocos Sur Council</span>
              <span className="text-sm font-medium text-white">Girl Scout Suite</span>
            </div>
          </div>

          <div style={{ ...styles.card, ...(signedIn ? { pointerEvents: "none" } : null) }}>
            <div style={styles.cardTopLine} />

            {!signedIn ? (
              <>
                <div className="mb-7 text-center">
                  <div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[#C9A84C]">
                    <span className="h-px w-4 bg-[#C9A84C]/60" />
                    Workspace access
                    <span className="h-px w-4 bg-[#C9A84C]/60" />
                  </div>
                  <h2 className="font-['DM_Serif_Display'] text-[26px] leading-tight text-white">Welcome back</h2>
                </div>

                {error && (
                  <div className="mb-4 flex items-center gap-2 rounded-[9px] border border-[#D64545]/25 bg-[#D64545]/10 px-3 py-[9px] text-xs text-[#F9B5B5]">
                    <AlertCircle className="h-[13px] w-[13px] flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
                      Username
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        autoComplete="username"
                        placeholder="your username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="placeholder:text-white/25"
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-white/30" />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="placeholder:text-white/25"
                        style={{ ...styles.input, paddingRight: "40px" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center text-white/35 transition hover:text-white/65"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="disabled:cursor-not-allowed disabled:opacity-80"
                    style={styles.primaryButton}
                  >
                    <span
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(135deg, rgba(255,255,255,.06) 0%, transparent 100%)" }}
                    />
                    {submitting ? (
                      <>
                        <Loader2 className="relative z-10 h-4 w-4 animate-spin" />
                        <span className="relative z-10">Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span className="relative z-10">Sign in to workspace</span>
                        <ArrowRight className="relative z-10 h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-[11px] leading-7 text-white/30">
                    Having trouble?{" "}
                    <a href="#" className="text-[#8DB89E] transition hover:text-[#E8D5A3]">
                      Contact your administrator
                    </a>{" "}
                    or{" "}
                    <a href="mailto:ilocossur@gsp.org.ph" className="text-[#8DB89E] transition hover:text-[#E8D5A3]">
                      ilocossur@gsp.org.ph
                    </a>
                  </p>
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-[#4A8A5C] bg-[#4A8A5C]/20">
                  <Check className="h-[22px] w-[22px] text-[#C5DFD0]" />
                </div>
                <div className="mb-1 text-[15px] font-medium text-white">Signed in!</div>
                <div className="text-xs text-white/40">Redirecting to your workspace...</div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
