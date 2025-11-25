import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center p-4">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl font-headline">
          Your Blank Slate, Powered by Firebase
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          A clean, minimal, and modern Next.js starter template connected to
          Firebase. Ready for you to build upon.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button asChild size="lg">
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
