import { FormEvent, useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useSessionStore, selectProfile, selectLoading } from "@/store/sessionStore";
import { Loader2, ShieldCheck, Eye, EyeOff, Sparkles } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSessionStore(selectProfile);
  const loadingProfile = useSessionStore(selectLoading);
  const fetchProfile = useSessionStore((state) => state.fetchProfile);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);

  const from = (location.state as { from?: string } | undefined)?.from ?? "/";

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Card className="max-w-md w-full border-border">
          <CardHeader>
            <CardTitle className="text-2xl text-card-foreground">Supabase Not Configured</CardTitle>
            <CardDescription>
              Provide <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in your
              <code>.env.local</code> file to enable authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>The application is running in demo mode. All routes are accessible without signing in.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!loadingProfile && profile) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      await fetchProfile();
      if (trustedDevice) {
        localStorage.setItem("gs-trusted-device", "1");
      } else {
        localStorage.removeItem("gs-trusted-device");
      }
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0F5132]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F5132] via-[#146C43] to-[#198754]" />
      <div className="absolute -left-24 top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute right-[-15%] bottom-[-10%] h-[26rem] w-[26rem] rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="absolute left-1/2 top-0 hidden h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/10 blur-3xl lg:block" />

      <div className="relative flex min-h-screen w-full flex-col lg:flex-row">
        <section className="hidden w-full flex-col justify-between px-12 py-16 text-emerald-50 lg:flex lg:w-[55%]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-12"
          >
            <div className="flex items-center gap-3 text-emerald-50/90">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-wide">Girl Scout Unified Business Suite</p>
                <p className="text-sm text-emerald-100/70">Secure portal for sales, accounting, and troop operations.</p>
              </div>
            </div>

            <div className="space-y-6">
              <h1 className="text-4xl font-bold leading-snug text-white">
                Empower your council with real-time visibility across POS, inventory, and finance.
              </h1>
              <motion.ul
                className="space-y-4 text-base text-emerald-50/80"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
              >
                {[
                  "Role-based access for Admin, Accountant, Cashier, HR, and Inventory Clerk.",
                  "Encrypted authentication, automatic session refresh, and device trust indicators.",
                  "Direct integration with Supabase storage, RLS policies, and audit trail logging.",
                ].map((item) => (
                  <motion.li key={item} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}>
                    • {item}
                  </motion.li>
                ))}
              </motion.ul>

              <motion.div
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="inline-flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm text-emerald-50 backdrop-blur-xl shadow-lg"
              >
                <Sparkles className="h-5 w-5 text-emerald-100" />
                <div className="leading-tight">
                  Trusted by councils for unified sales, payroll, and troop operations.
                </div>
              </motion.div>
            </div>
          </motion.div>

          <p className="text-xs text-emerald-100/60">© {new Date().getFullYear()} Girl Scout Council. Internal use only.</p>
        </section>

        <section className="flex w-full flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            <Card className="w-full border-white/20 bg-white/80 shadow-[0_25px_70px_-30px_rgba(9,63,40,0.65)] backdrop-blur-xl">
              <CardHeader className="space-y-6">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#0F5132] to-[#198754] text-white shadow-lg">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                  <div>
                    <CardTitle className="text-3xl font-semibold text-card-foreground">Welcome back</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      Secure access for Girl Scout councils. Sign in with your council-issued credentials.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTitle>Authentication failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-card-foreground">
                      Work Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@council.org"
                      className="h-11 border-white/50 bg-white/70 focus-visible:border-emerald-400 focus-visible:ring-emerald-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-card-foreground">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        className="h-11 border-white/50 bg-white/70 pr-11 focus-visible:border-emerald-400 focus-visible:ring-emerald-400"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground transition hover:text-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      id="trusted-device"
                      checked={trustedDevice}
                      onCheckedChange={(value) => setTrustedDevice(Boolean(value))}
                    />
                    Trust this device
                  </label>

                  <Button
                    type="submit"
                    className="h-11 w-full rounded-full bg-gradient-to-r from-[#0F5132] via-[#157347] to-[#198754] font-semibold text-white shadow-lg transition hover:from-[#0d442a] hover:to-[#16794b]"
                    disabled={submitting || !isSupabaseConfigured}
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Securing session…
                      </span>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Having trouble accessing your account? Email
                  <a
                    href="mailto:it@girlscouts.council"
                    className="font-medium text-emerald-700 transition hover:text-emerald-800"
                  >
                    {" "}
                    it@girlscouts.council
                  </a>{" "}
                  or contact the council administrator.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>
    </div>
  );
}

