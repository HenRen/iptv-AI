import { ConnectFlow } from '@/components/onboarding/ConnectFlow';

export default function WelcomePage() {
  return (
    <main className="h-dvh overflow-y-auto bg-ground">
      {/* A quiet cinematic wash — enough depth to read as a TV product,
          not so much that it competes with the three connection cards. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, rgba(47,125,255,0.16), transparent 62%), radial-gradient(80% 60% at 90% 110%, rgba(47,125,255,0.08), transparent 60%)',
        }}
      />
      <div className="relative min-h-full">
        <ConnectFlow />
      </div>
    </main>
  );
}
